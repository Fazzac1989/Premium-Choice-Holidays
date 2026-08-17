/**
 * Premium Staycations — Phase 1
 * The vocabulary the supplier layer speaks.
 *
 * Enums are derived from the generated database types rather than restated,
 * so a migration that adds an emirate or a booking status cannot leave this
 * file quietly disagreeing with the schema.
 *
 * Dates that Postgres stores as `date` are carried as 'YYYY-MM-DD' strings and
 * timestamps as ISO-8601. A stay is a pair of calendar dates in Asia/Dubai, not
 * an instant, and passing Date objects around invites a UTC round-trip to move
 * a check-in over a midnight boundary.
 */

import type { Database } from '@/types/database';

type Enums = Database['public']['Enums'];

export type Emirate = Enums['emirate'];
export type ExternalBookingStatus = Enums['external_booking_status'];
export type SupplierFailureClass = Enums['supplier_failure_class'];

/** 'YYYY-MM-DD'. */
export type IsoDate = string;
/** ISO-8601 with offset. */
export type IsoTimestamp = string;

// ---------------------------------------------------------------------------
// Property content
// ---------------------------------------------------------------------------

/**
 * One property as the supplier describes it. Maps onto a `properties` row.
 *
 * Every field the supplier may omit is nullable here, deliberately. The
 * temptation is to default a missing star rating to 3 or a missing check-in
 * time to 15:00 so the type is easier to consume, but star_rating selects the
 * Tourism Dirham band and check_in_time drives the lead-time exclusion. A
 * default here would price a booking wrongly and leave no trace of why.
 */
export interface PropertyContent {
  externalPropertyId: string;
  name: string;
  emirate: Emirate;
  area: string | null;
  starRating: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Raw adapter payload, stored verbatim in properties.content. */
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

export interface StaySearch {
  checkIn: IsoDate;
  checkOut: IsoDate;
  rooms: number;
  adults: number;
  /**
   * Ages on the check-in date, not on the date of the search. A child who is 2
   * today and 3 on arrival is a 3-year-old to the supplier and to us.
   */
  childAges?: number[];
  emirate?: Emirate;
  externalPropertyId?: string;
}

export interface TaxLine {
  name: string;
  amount: number;
  currency: string;
}

/**
 * A bookable offer. This is the artefact `book()` consumes, so it carries
 * everything needed to detect that the world moved underneath it.
 */
export interface StayQuote {
  adapter: string;
  /** The supplier's bookable token. Opaque to us; never parsed. */
  offerId: string;

  externalPropertyId: string;
  propertyName: string;
  emirate: Emirate;

  roomDescription: string;
  boardBasis: string;

  checkIn: IsoDate;
  checkOut: IsoDate;
  nights: number;
  rooms: number;

  /** What we owe the supplier. Sell price is computed elsewhere. */
  netCost: number;
  currency: string;

  /**
   * Null means the supplier did not say. Unknown is not a synonym for either
   * value: an unknown tax treatment raises a task rather than being priced.
   */
  netRateTaxInclusive: boolean | null;
  taxesIncluded: TaxLine[] | null;

  freeCancelUntil: IsoTimestamp | null;
  isRefundable: boolean;

  /** When this price was seen. A price-moved failure is only meaningful against it. */
  quotedAt: IsoTimestamp;

  raw: unknown;
}

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export interface Guest {
  fullName: string;
  /**
   * Child age bands resolve against the check-in date, so the date of birth is
   * carried rather than an age. See booking_guests.date_of_birth.
   */
  dateOfBirth: IsoDate | null;
  isLead: boolean;
}

/**
 * A supplier-side booking record, shaped to drop onto an `external_bookings`
 * row.
 *
 * It carries no booking_id and no quote_item_id. Those are ours — which
 * component of which booking this satisfies is a fact about our records, not
 * the supplier's, and the adapter is not given the chance to get it wrong.
 */
export interface ExternalBooking {
  adapter: string;
  supplierRef: string;
  status: ExternalBookingStatus;

  idempotencyKey: string;
  attempt: number;

  failureClass: SupplierFailureClass | null;
  failureDetail: string | null;

  freeCancelUntil: IsoTimestamp | null;
  netCost: number;
  currency: string;

  netRateTaxInclusive: boolean | null;
  taxesIncluded: TaxLine[] | null;

  raw: unknown;
}
