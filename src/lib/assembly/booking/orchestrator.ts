/**
 * Premium Staycations — Phase 1
 * The payment-then-booking path.
 *
 * The booking is in payment_received: the customer's money is taken and the
 * supplier holds nothing. This walks it to confirmed, or unwinds it to
 * failed_rollback with everything the state machine demands. The DB trigger
 * enforces the same invariants from the other side — this code satisfies
 * them, it does not rely on being trusted.
 *
 * The retry discipline, from the Session 1 decision record:
 *
 *   - RETRY only indeterminate failures (timeout, 5xx, reset), and reconcile
 *     via findByReference(idempotencyKey) BEFORE each retry, because the
 *     supplier may already have created the booking. A found booking is
 *     adopted, never repeated.
 *   - DETERMINISTIC failures (sold out, price moved, invalid guest) go
 *     straight to rollback with no backoff. The answer will not change.
 *
 * The idempotency key is derived, not generated: bookingRef:quoteItemId. A
 * process that crashes and restarts arrives at the same key and therefore
 * finds its own earlier attempt, which random keys would orphan.
 *
 * Components are booked sequentially, not in parallel. Concurrent book()
 * calls would make rollback ambiguous — with sequential booking, everything
 * before the failed component is confirmed and everything after it was never
 * attempted, and the rollback task can say exactly that.
 */

import type { SupplierAdapter } from '@/lib/suppliers';
import {
  failureClassOf,
  requiresReconciliation,
  type ExternalBooking,
  type Guest,
  type StayQuote,
} from '@/lib/suppliers';
import type { TaskPriority, TaskType } from '../types';

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/**
 * Persistence, as the orchestrator needs it. The Supabase implementation is a
 * thin mapping; the in-memory one makes the whole path testable. Writes are
 * sequential and ordered so the DB guards hold at every step: refund and task
 * BEFORE the failed_rollback transition, vouchers BEFORE confirmed.
 */
export interface BookingStore {
  recordExternalBooking(
    bookingId: string,
    quoteItemId: string,
    record: ExternalBooking,
  ): Promise<void>;
  issueVoucher(bookingId: string, quoteItemId: string, productId: string): Promise<void>;
  recordRefund(bookingId: string, amount: number, note: string): Promise<void>;
  raiseTask(task: {
    bookingId: string;
    type: TaskType;
    priority: TaskPriority;
    summary: string;
    context: Record<string, unknown>;
  }): Promise<void>;
  transition(bookingId: string, to: BookingTransition): Promise<void>;
}

export type BookingTransition = 'supplier_booking' | 'confirmed' | 'failed_rollback';

// ---------------------------------------------------------------------------
// Input and result
// ---------------------------------------------------------------------------

/** An API component to book: the quote item and its supplier quote. */
export interface ApiComponent {
  quoteItemId: string;
  quote: StayQuote;
}

/** A contracted extra needing a voucher at confirmation. */
export interface ContractedComponent {
  quoteItemId: string;
  productId: string;
}

export interface BookingRun {
  bookingId: string;
  reference: string;
  amountPaid: number;
  guests: Guest[];
  apiComponents: ApiComponent[];
  contractedComponents: ContractedComponent[];
}

export interface OrchestratorOptions {
  /** Attempts per component, reconciliation before every retry. */
  maxAttempts?: number;
  /** Backoff between indeterminate retries; injectable so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
  backoffMs?: (attempt: number) => number;
}

export type BookingOutcome =
  | {
      outcome: 'confirmed';
      records: ExternalBooking[];
    }
  | {
      outcome: 'failed_rollback';
      /** The component that brought it down. */
      failedQuoteItemId: string;
      failureClass: 'deterministic' | 'indeterminate';
      reason: string;
      /** Confirmed components successfully cancelled during rollback. */
      cancelled: string[];
      /** Supplier refs that could NOT be cancelled and need a human. */
      needsManualCancel: string[];
    };

// ---------------------------------------------------------------------------

const DEFAULT_MAX_ATTEMPTS = 3;
const defaultBackoffMs = (attempt: number) => 1000 * 2 ** (attempt - 1);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function idempotencyKeyFor(reference: string, quoteItemId: string): string {
  return `${reference}:${quoteItemId}`;
}

export async function executeSupplierBooking(
  adapter: SupplierAdapter,
  store: BookingStore,
  run: BookingRun,
  options: OrchestratorOptions = {},
): Promise<BookingOutcome> {
  const {
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    sleep = defaultSleep,
    backoffMs = defaultBackoffMs,
  } = options;

  await store.transition(run.bookingId, 'supplier_booking');

  const confirmed: { component: ApiComponent; record: ExternalBooking }[] = [];

  for (const component of run.apiComponents) {
    const key = idempotencyKeyFor(run.reference, component.quoteItemId);

    let record: ExternalBooking | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      // Reconcile BEFORE every attempt after the first — and before the first
      // too, which costs one call and catches a crashed predecessor run that
      // booked under this same derived key.
      const existing = await adapter.findByReference(key);
      if (existing && existing.status === 'confirmed') {
        record = existing;
        break;
      }

      try {
        record = await adapter.book(component.quote, run.guests, key);
        break;
      } catch (error) {
        lastError = error;

        if (!requiresReconciliation(error)) {
          // Deterministic. The answer will not change; stop asking.
          break;
        }

        // Indeterminate: the next loop iteration reconciles before retrying.
        if (attempt < maxAttempts) {
          await sleep(backoffMs(attempt));
        }
      }
    }

    if (record === null) {
      // One last reconciliation after the final attempt timed out: that
      // attempt itself may have landed.
      const landed = await adapter.findByReference(key);
      if (landed && landed.status === 'confirmed') {
        record = landed;
      }
    }

    if (record !== null) {
      await store.recordExternalBooking(run.bookingId, component.quoteItemId, record);
      confirmed.push({ component, record });
      continue;
    }

    // This component is unbookable. Everything confirmed so far unwinds.
    return rollback(adapter, store, run, {
      failedComponent: component,
      confirmed,
      error: lastError,
    });
  }

  // Every API component holds a confirmed supplier record. Vouchers before
  // the transition — the DB guard counts them at the moment of the update.
  for (const extra of run.contractedComponents) {
    await store.issueVoucher(run.bookingId, extra.quoteItemId, extra.productId);
  }

  await store.transition(run.bookingId, 'confirmed');

  return { outcome: 'confirmed', records: confirmed.map((c) => c.record) };
}

// ---------------------------------------------------------------------------
// Rollback
//
// The state machine will not let a booking into failed_rollback unless the
// money taken has a refund row and an open urgent task exists. This writes
// them in that order, then transitions. The wording rule for anything
// customer-facing: a refund is INITIATED here, never completed — no money
// moves in Phase 1, a human moves it and reconciles the row.
// ---------------------------------------------------------------------------

async function rollback(
  adapter: SupplierAdapter,
  store: BookingStore,
  run: BookingRun,
  failure: {
    failedComponent: ApiComponent;
    confirmed: { component: ApiComponent; record: ExternalBooking }[];
    error: unknown;
  },
): Promise<BookingOutcome> {
  const failureClass = failureClassOf(failure.error);
  const reason =
    failure.error instanceof Error ? failure.error.message : String(failure.error);

  // Give back every room we confirmed before the failure.
  const cancelled: string[] = [];
  const needsManualCancel: string[] = [];

  for (const { record } of failure.confirmed) {
    try {
      await adapter.cancel(
        record.supplierRef,
        `Rollback of ${run.reference}: sibling component failed (${reason})`,
      );
      cancelled.push(record.supplierRef);
    } catch {
      // The supplier would not take the cancellation. A human must chase it —
      // and the task must name every reference so the operator reconstructs
      // nothing.
      needsManualCancel.push(record.supplierRef);
    }
  }

  if (needsManualCancel.length > 0) {
    await store.raiseTask({
      bookingId: run.bookingId,
      type: 'rollback_manual_cancel',
      priority: 'urgent',
      summary:
        `${run.reference}: ${needsManualCancel.length} supplier booking(s) could not be ` +
        `cancelled during rollback and must be cancelled manually: ${needsManualCancel.join(', ')}`,
      context: {
        supplierRefs: needsManualCancel,
        adapter: adapter.name,
        failedComponent: failure.failedComponent.quoteItemId,
      },
    });
  }

  // Money first, then the task, then the transition — the guard's order.
  if (run.amountPaid > 0) {
    await store.recordRefund(
      run.bookingId,
      run.amountPaid,
      `Refund initiated: supplier booking failed (${reason})`,
    );
  }

  await store.raiseTask({
    bookingId: run.bookingId,
    type: run.amountPaid > 0 ? 'refund' : 'other',
    priority: 'urgent',
    summary:
      run.amountPaid > 0
        ? `${run.reference}: ${run.amountPaid} AED was taken and the supplier booking ` +
          `failed (${reason}). Refund initiated — a human must move the funds and ` +
          'reconcile the payment row.'
        : `${run.reference}: supplier booking failed before payment (${reason}).`,
    context: {
      failedQuoteItemId: failure.failedComponent.quoteItemId,
      failureClass,
      reason,
      cancelled,
      needsManualCancel,
    },
  });

  await store.transition(run.bookingId, 'failed_rollback');

  return {
    outcome: 'failed_rollback',
    failedQuoteItemId: failure.failedComponent.quoteItemId,
    failureClass,
    reason,
    cancelled,
    needsManualCancel,
  };
}
