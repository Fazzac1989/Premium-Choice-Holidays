import { beforeEach, describe, expect, it } from 'vitest';

import {
  InvalidGuestError,
  PriceMovedError,
  SoldOutError,
  SupplierTimeoutError,
  failureClassOf,
  requiresReconciliation,
} from '../errors';
import type { Guest, StayQuote } from '../types';
import { MockAdapter } from './adapter';
import { MOCK_PROPERTIES } from './fixtures';
import { SCENARIO_IDS } from './scenarios';

// A pinned clock: a Tuesday outside both the peak and summer seasons, so
// asserted prices are plain multiples of the base rate.
const FIXED_NOW = new Date('2026-04-14T09:00:00.000Z');

// Tue 5 May → Thu 7 May 2026: two weekday nights in a neutral season.
const NEUTRAL_STAY = {
  checkIn: '2026-05-05',
  checkOut: '2026-05-07',
  rooms: 1,
  adults: 2,
} as const;

const GUESTS: Guest[] = [
  { fullName: 'Aisha Al Mansouri', dateOfBirth: '1990-03-12', isLead: true },
  { fullName: 'Omar Al Mansouri', dateOfBirth: '1988-11-02', isLead: false },
  // Aged 2 at booking, 3 by a check-in after 2026-06-20 — the band boundary
  // case that date_of_birth exists to carry.
  { fullName: 'Layla Al Mansouri', dateOfBirth: '2023-06-20', isLead: false },
];

let adapter: MockAdapter;

beforeEach(() => {
  adapter = new MockAdapter({ now: () => FIXED_NOW });
});

async function quoteFor(externalPropertyId: string): Promise<StayQuote> {
  const quotes = await adapter.search({ ...NEUTRAL_STAY, externalPropertyId });
  expect(quotes).toHaveLength(1);
  return quotes[0];
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

describe('property content', () => {
  it('serves the thirty real properties plus the six scenario properties', async () => {
    const all = await adapter.listProperties();
    expect(MOCK_PROPERTIES).toHaveLength(30);
    expect(all).toHaveLength(36);
  });

  it('spans the three emirates on sale in Phase 1', async () => {
    const all = await adapter.listProperties();
    const emirates = new Set(all.map((p) => p.emirate));
    expect(emirates).toContain('dubai');
    expect(emirates).toContain('abu_dhabi');
    expect(emirates).toContain('rak');
  });

  it('carries Abu Dhabi inventory, which property_fees deliberately does not cover', async () => {
    // The absence is the point: assembly must hit these properties, find no
    // fee rows, and raise a task. If this fixture set ever loses its Abu Dhabi
    // properties, that path stops being exercised.
    const all = await adapter.listProperties();
    expect(all.filter((p) => p.emirate === 'abu_dhabi').length).toBeGreaterThanOrEqual(7);
  });

  it('can exclude the scenario properties from the catalogue', async () => {
    const clean = new MockAdapter({ now: () => FIXED_NOW, includeScenarios: false });
    const all = await clean.listProperties();
    expect(all).toHaveLength(30);
    expect(all.every((p) => !p.externalPropertyId.startsWith('SCN-'))).toBe(true);
  });

  it('returns null rather than throwing for an unknown property id', async () => {
    expect(await adapter.getProperty('DOES-NOT-EXIST')).toBeNull();
  });

  it('serves the partial-content property with its gaps intact', async () => {
    const partial = await adapter.getProperty(SCENARIO_IDS.partialContent);
    expect(partial).not.toBeNull();
    // Star rating drives the Tourism Dirham band; a mock that quietly filled
    // it in would defeat the fixture's purpose.
    expect(partial!.starRating).toBeNull();
    expect(partial!.area).toBeNull();
    expect(partial!.checkInTime).toBeNull();
  });

  it('reports 16:00 check-ins where the property has one', async () => {
    const atlantis = await adapter.getProperty('DXB-001');
    expect(atlantis!.checkInTime).toBe('16:00');
  });
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

describe('search', () => {
  it('filters by emirate', async () => {
    const quotes = await adapter.search({ ...NEUTRAL_STAY, emirate: 'rak' });
    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes.every((q) => q.emirate === 'rak')).toBe(true);
  });

  it('prices a neutral-season weekday stay at rooms x nights x base rate', async () => {
    // Rove Downtown: base 320. Two weekday nights in May, one room.
    const quote = await quoteFor('DXB-005');
    expect(quote.netCost).toBe(640);
    expect(quote.nights).toBe(2);
    expect(quote.currency).toBe('AED');
  });

  it('applies the weekend premium to Friday and Saturday nights', async () => {
    // Fri 8 May and Sat 9 May 2026: both premium nights. 320 * 1.25 * 2 = 800.
    const quotes = await adapter.search({
      checkIn: '2026-05-08',
      checkOut: '2026-05-10',
      rooms: 1,
      adults: 2,
      externalPropertyId: 'DXB-005',
    });
    expect(quotes[0].netCost).toBe(800);
  });

  it('is deterministic: the same search twice returns the same price', async () => {
    const first = await quoteFor('DXB-001');
    const second = await quoteFor('DXB-001');
    expect(first.netCost).toBe(second.netCost);
    expect(first.offerId).toBe(second.offerId);
  });

  it('scales by room count', async () => {
    const one = await quoteFor('DXB-005');
    const two = await adapter.search({
      ...NEUTRAL_STAY,
      rooms: 2,
      externalPropertyId: 'DXB-005',
    });
    expect(two[0].netCost).toBe(one.netCost * 2);
  });

  it('carries the unknown tax treatment as null, not as either boolean', async () => {
    const quote = await quoteFor('DXB-013');
    expect(quote.netRateTaxInclusive).toBeNull();
    expect(quote.taxesIncluded).toBeNull();
  });

  it('marks the non-refundable property with no cancellation deadline', async () => {
    const quote = await quoteFor('DXB-014');
    expect(quote.isRefundable).toBe(false);
    expect(quote.freeCancelUntil).toBeNull();
  });

  it('states free-cancel deadlines in Gulf time', async () => {
    // DXB-002, 3 days before a 2026-05-05 check-in.
    const quote = await quoteFor('DXB-002');
    expect(quote.freeCancelUntil).toBe('2026-05-02T12:00:00+04:00');
  });

  it('rejects an inverted stay as a caller bug, not a supplier failure', async () => {
    await expect(
      adapter.search({
        checkIn: '2026-05-07',
        checkOut: '2026-05-05',
        rooms: 1,
        adults: 2,
      }),
    ).rejects.toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Booking, the clean path
// ---------------------------------------------------------------------------

describe('book', () => {
  it('confirms a booking shaped for the external_bookings row', async () => {
    const quote = await quoteFor('DXB-002');
    const booking = await adapter.book(quote, GUESTS, 'idem-clean-1');

    expect(booking.status).toBe('confirmed');
    expect(booking.adapter).toBe('mock');
    expect(booking.idempotencyKey).toBe('idem-clean-1');
    expect(booking.attempt).toBe(1);
    expect(booking.failureClass).toBeNull();
    expect(booking.netCost).toBe(quote.netCost);
    expect(booking.freeCancelUntil).toBe(quote.freeCancelUntil);
    expect(booking.supplierRef).toMatch(/^MOCK-DXB-002-/);
  });

  it('is findable by reference immediately after confirming', async () => {
    const quote = await quoteFor('DXB-002');
    const booked = await adapter.book(quote, GUESTS, 'idem-clean-2');
    const found = await adapter.findByReference('idem-clean-2');
    expect(found).not.toBeNull();
    expect(found!.supplierRef).toBe(booked.supplierRef);
  });

  it('returns null from findByReference for a key that never booked', async () => {
    expect(await adapter.findByReference('idem-never-used')).toBeNull();
  });

  it('rejects a quote that belongs to another adapter', async () => {
    const quote = await quoteFor('DXB-002');
    await expect(
      adapter.book({ ...quote, adapter: 'webbeds' }, GUESTS, 'idem-wrong-adapter'),
    ).rejects.toThrow(RangeError);
  });

  it('requires an idempotency key', async () => {
    const quote = await quoteFor('DXB-002');
    await expect(adapter.book(quote, GUESTS, '')).rejects.toThrow(RangeError);
  });

  it('cancels a confirmed booking by supplier reference', async () => {
    const quote = await quoteFor('DXB-002');
    const booked = await adapter.book(quote, GUESTS, 'idem-cancel-1');
    const cancelled = await adapter.cancel(booked.supplierRef, 'rollback: sibling component failed');
    expect(cancelled.status).toBe('cancelled');

    const found = await adapter.findByReference('idem-cancel-1');
    expect(found!.status).toBe('cancelled');
  });
});

// ---------------------------------------------------------------------------
// Deterministic failures — no retry, straight to failed_rollback
// ---------------------------------------------------------------------------

describe('deterministic failures', () => {
  it('sold out between quote and book', async () => {
    const quote = await quoteFor(SCENARIO_IDS.soldOut);
    const attempt = adapter.book(quote, GUESTS, 'idem-soldout-1');

    await expect(attempt).rejects.toThrow(SoldOutError);
    await expect(attempt).rejects.toMatchObject({
      failureClass: 'deterministic',
      supplierCode: 'NO_AVAILABILITY',
    });

    // Deterministic means: do not reconcile, do not retry.
    expect(await adapter.findByReference('idem-soldout-1')).toBeNull();
    await expect(attempt).rejects.toSatisfy(
      (e: unknown) => !requiresReconciliation(e),
    );
  });

  it('price moved, carrying both figures so the margin decision is possible', async () => {
    const quote = await quoteFor(SCENARIO_IDS.priceMoved);
    const attempt = adapter.book(quote, GUESTS, 'idem-price-1');

    await expect(attempt).rejects.toThrow(PriceMovedError);
    await expect(attempt).rejects.toMatchObject({
      failureClass: 'deterministic',
      quotedNetCost: quote.netCost,
      currentNetCost: Math.round(quote.netCost * 1.12 * 100) / 100,
      currency: 'AED',
    });
  });

  it('invalid guests: no lead', async () => {
    const quote = await quoteFor('DXB-002');
    const noLead = GUESTS.map((g) => ({ ...g, isLead: false }));
    await expect(adapter.book(quote, noLead, 'idem-guest-1')).rejects.toThrow(
      InvalidGuestError,
    );
  });

  it('invalid guests: the supplier that rejects them', async () => {
    const quote = await quoteFor(SCENARIO_IDS.rejectsGuests);
    await expect(adapter.book(quote, GUESTS, 'idem-guest-2')).rejects.toMatchObject({
      failureClass: 'deterministic',
      supplierCode: 'GUEST_REJECTED',
    });
  });
});

// ---------------------------------------------------------------------------
// Indeterminate failures — reconcile before any retry
// ---------------------------------------------------------------------------

describe('indeterminate failures', () => {
  it('a plain timeout left nothing behind, so a retry is justified and works', async () => {
    const quote = await quoteFor(SCENARIO_IDS.timeout);
    const attempt = adapter.book(quote, GUESTS, 'idem-timeout-1');

    await expect(attempt).rejects.toThrow(SupplierTimeoutError);
    await expect(attempt).rejects.toSatisfy(requiresReconciliation);

    // The reconciliation step: nothing landed.
    expect(await adapter.findByReference('idem-timeout-1')).toBeNull();
  });

  it('classifies an unrecognised error as indeterminate, because "unknown" is not "nothing happened"', () => {
    expect(failureClassOf(new Error('socket hang up'))).toBe('indeterminate');
    expect(requiresReconciliation(new Error('socket hang up'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE acceptance test: the timeout that actually succeeded server-side.
//
// This is the fixture the handoff note calls the primary acceptance test for
// the payment-then-booking path. The supplier confirmed the booking; our
// socket died before we heard. The correct sequence is throw, reconcile,
// adopt — and the wrong sequence, a blind retry, must be visibly catastrophic
// rather than quietly absorbed.
// ---------------------------------------------------------------------------

describe('the timeout that actually succeeded', () => {
  it('throws indeterminate, and reconciliation then finds the real booking', async () => {
    const quote = await quoteFor(SCENARIO_IDS.timeoutButSucceeded);
    const key = 'idem-ghost-1';

    const attempt = adapter.book(quote, GUESTS, key);
    await expect(attempt).rejects.toThrow(SupplierTimeoutError);
    await expect(attempt).rejects.toSatisfy(requiresReconciliation);

    // From the caller's side this timeout and the plain one are identical.
    // The difference only exists at the supplier, which is why the next call
    // is the load-bearing one.
    const found = await adapter.findByReference(key);
    expect(found).not.toBeNull();
    expect(found!.status).toBe('confirmed');
    expect(found!.idempotencyKey).toBe(key);
    expect(found!.netCost).toBe(quote.netCost);

    // Adopting the found record means exactly one booking exists.
    expect(adapter.bookingsFor(key)).toHaveLength(1);
  });

  it('a blind retry double-books — the disaster the reconciliation step exists to prevent', async () => {
    const quote = await quoteFor(SCENARIO_IDS.timeoutButSucceeded);
    const key = 'idem-ghost-2';

    await expect(adapter.book(quote, GUESTS, key)).rejects.toThrow(SupplierTimeoutError);
    // The retry, WITHOUT calling findByReference first. This is the bug.
    await expect(adapter.book(quote, GUESTS, key)).rejects.toThrow(SupplierTimeoutError);

    // The mock deliberately does not deduplicate on the key (see the adapter
    // header): two attempts, two supplier-side bookings, one customer charged
    // for both. If this assertion ever starts failing because someone made the
    // mock forgiving, the protection this fixture provides is gone.
    expect(adapter.attemptsFor(key)).toBe(2);
    expect(adapter.bookingsFor(key)).toHaveLength(2);
  });

  it('the correct sequence ends with one booking: throw, reconcile, adopt', async () => {
    const quote = await quoteFor(SCENARIO_IDS.timeoutButSucceeded);
    const key = 'idem-ghost-3';

    // This is the shape of the code Session 5 will write around book().
    let booking = null;
    try {
      booking = await adapter.book(quote, GUESTS, key);
    } catch (error) {
      if (requiresReconciliation(error)) {
        booking = await adapter.findByReference(key);
      } else {
        throw error;
      }
    }

    expect(booking).not.toBeNull();
    expect(booking!.status).toBe('confirmed');
    expect(adapter.bookingsFor(key)).toHaveLength(1);
    expect(adapter.attemptsFor(key)).toBe(1);
  });
});
