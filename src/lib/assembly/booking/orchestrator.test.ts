import { beforeEach, describe, expect, it } from 'vitest';

import { MockAdapter, SCENARIO_IDS, type Guest, type StayQuote, type SupplierAdapter } from '@/lib/suppliers';
import { executeSupplierBooking, idempotencyKeyFor, type BookingRun } from './orchestrator';
import { InMemoryBookingStore } from './store.memory';

const FIXED_NOW = new Date('2026-04-14T09:00:00.000Z');
const STAY = { checkIn: '2026-05-05', checkOut: '2026-05-07', rooms: 1, adults: 2 } as const;

const GUESTS: Guest[] = [
  { fullName: 'Aisha Al Mansouri', dateOfBirth: '1990-03-12', isLead: true },
  { fullName: 'Omar Al Mansouri', dateOfBirth: '1988-11-02', isLead: false },
];

// No waiting in tests; backoff calls are counted instead.
let sleeps: number[];
const instantSleep = async (ms: number) => { sleeps.push(ms); };

let adapter: MockAdapter;

beforeEach(() => {
  adapter = new MockAdapter({ now: () => FIXED_NOW });
  sleeps = [];
});

async function quoteFor(externalPropertyId: string): Promise<StayQuote> {
  const quotes = await adapter.search({ ...STAY, externalPropertyId });
  expect(quotes).toHaveLength(1);
  return quotes[0];
}

function makeRun(overrides: Partial<BookingRun> = {}): BookingRun {
  return {
    bookingId: 'bk-1',
    reference: 'PST-2604-0001',
    amountPaid: 7950,
    guests: GUESTS,
    apiComponents: [],
    contractedComponents: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The clean path
// ---------------------------------------------------------------------------

describe('clean confirmation', () => {
  it('books, records, vouchers, confirms — in the guard-satisfying order', async () => {
    const store = new InMemoryBookingStore({ expectedVouchers: 1, amountPaid: 7950 });
    const run = makeRun({
      apiComponents: [{ quoteItemId: 'qi-room', quote: await quoteFor('DXB-002') }],
      contractedComponents: [{ quoteItemId: 'qi-safari', productId: 'product-safari' }],
    });

    const outcome = await executeSupplierBooking(adapter, store, run, { sleep: instantSleep });

    expect(outcome.outcome).toBe('confirmed');
    expect(store.transitions.map((t) => t.to)).toEqual(['supplier_booking', 'confirmed']);
    expect(store.externalBookings).toHaveLength(1);
    expect(store.externalBookings[0].quoteItemId).toBe('qi-room');
    expect(store.externalBookings[0].record.idempotencyKey).toBe('PST-2604-0001:qi-room');
    expect(store.vouchers).toHaveLength(1);
    expect(store.refunds).toHaveLength(0);
    expect(store.tasks).toHaveLength(0);
  });

  it('books multiple components sequentially, each under its own derived key', async () => {
    const store = new InMemoryBookingStore({ amountPaid: 7950 });
    const run = makeRun({
      apiComponents: [
        { quoteItemId: 'qi-room-1', quote: await quoteFor('DXB-002') },
        { quoteItemId: 'qi-room-2', quote: await quoteFor('DXB-005') },
      ],
    });

    const outcome = await executeSupplierBooking(adapter, store, run, { sleep: instantSleep });

    expect(outcome.outcome).toBe('confirmed');
    expect(store.externalBookings.map((b) => b.record.idempotencyKey)).toEqual([
      'PST-2604-0001:qi-room-1',
      'PST-2604-0001:qi-room-2',
    ]);
  });

  it('adopts a booking left by a crashed predecessor run instead of rebooking', async () => {
    // A previous process booked under the derived key, then died before
    // recording anything. The derived key is what makes this recoverable.
    const key = idempotencyKeyFor('PST-2604-0001', 'qi-room');
    const quote = await quoteFor('DXB-002');
    await adapter.book(quote, GUESTS, key);
    expect(adapter.attemptsFor(key)).toBe(1);

    const store = new InMemoryBookingStore({ amountPaid: 7950 });
    const outcome = await executeSupplierBooking(
      adapter,
      store,
      makeRun({ apiComponents: [{ quoteItemId: 'qi-room', quote }] }),
      { sleep: instantSleep },
    );

    expect(outcome.outcome).toBe('confirmed');
    // Reconciled and adopted: no second book() reached the supplier.
    expect(adapter.attemptsFor(key)).toBe(1);
    expect(adapter.bookingsFor(key)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// THE acceptance test: timeout whose booking landed server-side
// ---------------------------------------------------------------------------

describe('the timeout that actually succeeded', () => {
  it('reconciles before the retry, adopts the ghost booking, and confirms with exactly one supplier record', async () => {
    const store = new InMemoryBookingStore({ amountPaid: 7950 });
    const quote = await quoteFor(SCENARIO_IDS.timeoutButSucceeded);
    const key = idempotencyKeyFor('PST-2604-0001', 'qi-room');

    const outcome = await executeSupplierBooking(
      adapter,
      store,
      makeRun({ apiComponents: [{ quoteItemId: 'qi-room', quote }] }),
      { sleep: instantSleep },
    );

    expect(outcome.outcome).toBe('confirmed');

    // book() was called exactly once. The timeout was followed by
    // reconciliation, not by a second book() — the supplier holds ONE booking
    // and the customer pays for ONE booking.
    expect(adapter.attemptsFor(key)).toBe(1);
    expect(adapter.bookingsFor(key)).toHaveLength(1);

    // The adopted record is the supplier's, recorded against our component.
    expect(store.externalBookings).toHaveLength(1);
    expect(store.externalBookings[0].record.status).toBe('confirmed');
    expect(store.externalBookings[0].record.idempotencyKey).toBe(key);

    // No refund, no rollback, no task — the customer never knows it happened.
    expect(store.refunds).toHaveLength(0);
    expect(store.transitions.map((t) => t.to)).toEqual(['supplier_booking', 'confirmed']);
  });
});

// ---------------------------------------------------------------------------
// Indeterminate failure that genuinely failed
// ---------------------------------------------------------------------------

describe('plain timeout — nothing landed', () => {
  it('retries with backoff, reconciling each time, then rolls back with refund and urgent task', async () => {
    const store = new InMemoryBookingStore({ amountPaid: 7950 });
    const quote = await quoteFor(SCENARIO_IDS.timeout);
    const key = idempotencyKeyFor('PST-2604-0001', 'qi-room');

    const outcome = await executeSupplierBooking(
      adapter,
      store,
      makeRun({ apiComponents: [{ quoteItemId: 'qi-room', quote }] }),
      { sleep: instantSleep, maxAttempts: 3 },
    );

    // All three attempts made — the failure was retryable and retried.
    expect(adapter.attemptsFor(key)).toBe(3);
    expect(sleeps).toEqual([1000, 2000]); // backoff between attempts, not after the last

    expect(outcome.outcome).toBe('failed_rollback');
    if (outcome.outcome !== 'failed_rollback') throw new Error('unreachable');
    expect(outcome.failureClass).toBe('indeterminate');

    // The state machine's demands, satisfied in order: refund row (money was
    // taken), urgent task, then the transition.
    expect(store.refunds).toEqual([
      expect.objectContaining({ bookingId: 'bk-1', amount: 7950 }),
    ]);
    expect(store.tasks.some((t) => t.type === 'refund' && t.priority === 'urgent')).toBe(true);
    expect(store.transitions.map((t) => t.to)).toEqual(['supplier_booking', 'failed_rollback']);

    // Customer wording: initiated, never completed.
    const refundTask = store.tasks.find((t) => t.type === 'refund');
    expect(refundTask!.summary).toContain('initiated');
    expect(refundTask!.summary).not.toMatch(/refund(ed| completed)/i);
  });

  it('raises no refund row when no money was taken, but still raises the urgent task', async () => {
    const store = new InMemoryBookingStore({ amountPaid: 0 });
    const quote = await quoteFor(SCENARIO_IDS.timeout);

    const outcome = await executeSupplierBooking(
      adapter,
      store,
      makeRun({ amountPaid: 0, apiComponents: [{ quoteItemId: 'qi-room', quote }] }),
      { sleep: instantSleep, maxAttempts: 2 },
    );

    expect(outcome.outcome).toBe('failed_rollback');
    expect(store.refunds).toHaveLength(0);
    expect(store.tasks.some((t) => t.priority === 'urgent')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Deterministic failures — no retry at all
// ---------------------------------------------------------------------------

describe('deterministic failure', () => {
  it('sold out goes straight to rollback: one attempt, no backoff', async () => {
    const store = new InMemoryBookingStore({ amountPaid: 7950 });
    const quote = await quoteFor(SCENARIO_IDS.soldOut);
    const key = idempotencyKeyFor('PST-2604-0001', 'qi-room');

    const outcome = await executeSupplierBooking(
      adapter,
      store,
      makeRun({ apiComponents: [{ quoteItemId: 'qi-room', quote }] }),
      { sleep: instantSleep },
    );

    expect(adapter.attemptsFor(key)).toBe(1); // the answer will not change
    expect(sleeps).toEqual([]);               // and nobody waited to hear it again
    expect(outcome.outcome).toBe('failed_rollback');
    if (outcome.outcome !== 'failed_rollback') throw new Error('unreachable');
    expect(outcome.failureClass).toBe('deterministic');
  });
});

// ---------------------------------------------------------------------------
// Rollback with confirmed siblings
// ---------------------------------------------------------------------------

describe('rollback of confirmed siblings', () => {
  it('cancels what confirmed before the failure and names it in the outcome', async () => {
    const store = new InMemoryBookingStore({ amountPaid: 7950 });
    const run = makeRun({
      apiComponents: [
        { quoteItemId: 'qi-room-1', quote: await quoteFor('DXB-002') },      // confirms
        { quoteItemId: 'qi-room-2', quote: await quoteFor(SCENARIO_IDS.soldOut) }, // fails
      ],
    });

    const outcome = await executeSupplierBooking(adapter, store, run, { sleep: instantSleep });

    expect(outcome.outcome).toBe('failed_rollback');
    if (outcome.outcome !== 'failed_rollback') throw new Error('unreachable');
    expect(outcome.failedQuoteItemId).toBe('qi-room-2');
    expect(outcome.cancelled).toHaveLength(1);
    expect(outcome.needsManualCancel).toHaveLength(0);

    // The supplier really was told: the first room's record is now cancelled.
    const roomKey = idempotencyKeyFor('PST-2604-0001', 'qi-room-1');
    expect(adapter.bookingsFor(roomKey)[0].status).toBe('cancelled');

    // The refund task's context names what was cancelled, so the operator
    // reconstructs nothing.
    const refundTask = store.tasks.find((t) => t.type === 'refund');
    expect(refundTask!.context.cancelled).toEqual(outcome.cancelled);
  });

  it('raises rollback_manual_cancel naming every ref the supplier would not cancel', async () => {
    // An adapter whose cancel() is down. Everything else works.
    const brokenCancel: SupplierAdapter = new Proxy(adapter, {
      get(target, prop, receiver) {
        if (prop === 'cancel') {
          return async () => { throw new Error('cancellation endpoint unavailable'); };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    const store = new InMemoryBookingStore({ amountPaid: 7950 });
    const run = makeRun({
      apiComponents: [
        { quoteItemId: 'qi-room-1', quote: await quoteFor('DXB-002') },
        { quoteItemId: 'qi-room-2', quote: await quoteFor(SCENARIO_IDS.soldOut) },
      ],
    });

    const outcome = await executeSupplierBooking(brokenCancel, store, run, { sleep: instantSleep });

    expect(outcome.outcome).toBe('failed_rollback');
    if (outcome.outcome !== 'failed_rollback') throw new Error('unreachable');
    expect(outcome.cancelled).toHaveLength(0);
    expect(outcome.needsManualCancel).toHaveLength(1);

    const manualTask = store.tasks.find((t) => t.type === 'rollback_manual_cancel');
    expect(manualTask).toBeDefined();
    expect(manualTask!.priority).toBe('urgent');
    // The task must name the reference — an operator opening it should not
    // have to reconstruct anything.
    expect(manualTask!.summary).toContain(outcome.needsManualCancel[0]);
    expect(manualTask!.context.supplierRefs).toEqual(outcome.needsManualCancel);
  });
});
