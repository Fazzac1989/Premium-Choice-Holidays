/**
 * Premium Staycations — Phase 1
 * The failure fixtures.
 *
 * These sit alongside the thirty real properties rather than inside them, so
 * "give me everything in Dubai" returns a sane catalogue and a test that wants
 * a timeout has to ask for one by name.
 *
 * Each is a property that misbehaves in exactly one way. Booking
 * SCN-TIMEOUT-OK is how you reproduce the case this whole design exists for:
 * the call times out, and the supplier made the booking anyway.
 */

import type { MockProperty } from './fixtures';

export const SCENARIO_IDS = {
  /** Available at search, gone by the time we book. */
  soldOut: 'SCN-SOLDOUT',
  /** Still bookable, at a higher net rate than we were quoted. */
  priceMoved: 'SCN-PRICEMOVE',
  /** book() never returns, and nothing was created at the supplier. */
  timeout: 'SCN-TIMEOUT',
  /**
   * book() never returns, and the supplier created the booking anyway.
   *
   * The primary acceptance test for the payment-then-booking path. A retry
   * without reconciliation double-books this property and double-charges the
   * customer for a component they already hold.
   */
  timeoutButSucceeded: 'SCN-TIMEOUT-OK',
  /** Content arrives with the fields that drive pricing missing. */
  partialContent: 'SCN-PARTIAL',
  /** The supplier refuses the guest details. */
  rejectsGuests: 'SCN-BADGUEST',
} as const;

export const SCENARIO_PROPERTIES: MockProperty[] = [
  {
    externalPropertyId: SCENARIO_IDS.soldOut,
    name: 'Scenario Hotel — Sold Out On Book',
    emirate: 'dubai',
    area: 'Downtown Dubai',
    starRating: 4,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 500,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: 2,
    behaviour: 'sold_out_on_book',
  },
  {
    externalPropertyId: SCENARIO_IDS.priceMoved,
    name: 'Scenario Hotel — Price Moves On Book',
    emirate: 'dubai',
    area: 'Business Bay',
    starRating: 4,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 500,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: 2,
    behaviour: 'price_moves_on_book',
  },
  {
    externalPropertyId: SCENARIO_IDS.timeout,
    name: 'Scenario Hotel — Times Out',
    emirate: 'dubai',
    area: 'Deira',
    starRating: 4,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 500,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: 2,
    behaviour: 'timeout_on_book',
  },
  {
    externalPropertyId: SCENARIO_IDS.timeoutButSucceeded,
    name: 'Scenario Hotel — Times Out But Succeeds',
    emirate: 'dubai',
    area: 'Dubai Marina',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 500,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: 2,
    behaviour: 'timeout_on_book_but_succeeds',
  },
  {
    externalPropertyId: SCENARIO_IDS.partialContent,
    name: 'Scenario Hotel — Partial Content',
    emirate: 'dubai',
    // Star rating absent, so the Tourism Dirham band cannot be selected.
    // Area absent, so area-scoped extras cannot match.
    // Check-in time absent, so the brand default has to carry it.
    //
    // The emirate is present because it has to be: properties.emirate is NOT
    // NULL, and a supplier payload without one cannot be cached at all. That
    // is a different failure — a rejected refresh, not a degraded row — and it
    // belongs to the content pipeline rather than here.
    area: null,
    starRating: null,
    checkInTime: null,
    checkOutTime: null,
    baseNetRate: 500,
    boardBasis: 'room_only',
    netRateTaxInclusive: null,
    freeCancelDays: null,
  },
  {
    externalPropertyId: SCENARIO_IDS.rejectsGuests,
    name: 'Scenario Hotel — Rejects Guests',
    emirate: 'dubai',
    area: 'Al Barsha',
    starRating: 3,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    baseNetRate: 500,
    boardBasis: 'room_only',
    netRateTaxInclusive: true,
    freeCancelDays: 2,
    behaviour: 'rejects_guests',
  },
];
