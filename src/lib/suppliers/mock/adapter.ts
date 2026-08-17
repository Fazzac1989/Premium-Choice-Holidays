/**
 * Premium Staycations — Phase 1
 * The mock supplier.
 *
 * Everything here is deterministic. There is no Math.random and no wall-clock
 * dependency that a test cannot control: the same search returns the same
 * price on any machine on any day, and supplier references are drawn from a
 * counter rather than generated. A flaky fixture is worse than no fixture,
 * because it teaches the team to re-run the suite instead of reading it.
 *
 * ONE DELIBERATE CRUELTY. This mock does not deduplicate on the idempotency
 * key. Calling book() twice with the same key produces two supplier bookings.
 *
 * That is the pessimistic assumption, taken on purpose. WebBeds certification
 * has not happened, so whether their API honours a replayed key is unknown,
 * and code written against a forgiving mock would be correct only if the
 * optimistic guess turns out right. Written this way, the reconciliation step
 * in the booking path is load-bearing: remove the findByReference call before
 * a retry and the tests fail loudly with two bookings and a customer charged
 * twice, which is exactly what would happen in production.
 *
 * If certification later shows WebBeds does honour the key, this can relax.
 * It must not relax before then.
 */

import type { SupplierAdapter } from '../adapter';
import {
  InvalidGuestError,
  PriceMovedError,
  SoldOutError,
  SupplierTimeoutError,
} from '../errors';
import type {
  ExternalBooking,
  Guest,
  IsoDate,
  IsoTimestamp,
  PropertyContent,
  StayQuote,
  StaySearch,
} from '../types';
import { MOCK_PROPERTIES, type MockProperty } from './fixtures';
import { SCENARIO_PROPERTIES } from './scenarios';

export const MOCK_ADAPTER_NAME = 'mock';
const CURRENCY = 'AED';

/** How far the price moves for the price-moved scenario. */
const PRICE_MOVE_FACTOR = 1.12;

export interface MockAdapterOptions {
  /**
   * Injectable clock. Tests pin it so quotedAt and free-cancel deadlines are
   * reproducible.
   */
  now?: () => Date;
  /**
   * Whether the misbehaving properties appear in the catalogue. On by default —
   * they are reachable by hand from the admin UI, which is how a human
   * exercises the failure paths without writing a test.
   */
  includeScenarios?: boolean;
}

// ---------------------------------------------------------------------------
// Dates
//
// Parsed as UTC and never through the local timezone. `new Date('2026-09-01')`
// is already UTC midnight, but `new Date(2026, 8, 1)` is local midnight, and
// mixing the two moves a check-in across a day boundary for anyone west of
// Greenwich. Everything below goes through these two functions.
// ---------------------------------------------------------------------------

function parseIsoDate(date: IsoDate): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new RangeError(`Expected a YYYY-MM-DD date, received "${date}"`);
  }
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function toIsoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function nightsBetween(checkIn: IsoDate, checkOut: IsoDate): number {
  const from = parseIsoDate(checkIn);
  const to = parseIsoDate(checkOut);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Nightly net rate.
 *
 * Weekend and season, both read off the calendar date, both invented but
 * shaped like the real market: Friday and Saturday carry a premium, the
 * November-to-March season is peak, and high summer is heavily discounted.
 *
 * Components are never rounded to the brand increment here. Rounding is the
 * package total's job, and rounding a component would stop the breakdown
 * reconciling against the total charged.
 */
function nightlyRate(baseNetRate: number, night: Date): number {
  const dayOfWeek = night.getUTCDay(); // 0 Sun … 5 Fri, 6 Sat
  const month = night.getUTCMonth() + 1;

  const weekend = dayOfWeek === 5 || dayOfWeek === 6 ? 1.25 : 1;

  let season = 1;
  if (month >= 11 || month <= 3) {
    season = 1.2;
  } else if (month >= 6 && month <= 8) {
    season = 0.7;
  }

  return round2(baseNetRate * weekend * season);
}

function stayNetCost(property: MockProperty, search: StaySearch): number {
  const nights = nightsBetween(search.checkIn, search.checkOut);
  const from = parseIsoDate(search.checkIn);

  let total = 0;
  for (let n = 0; n < nights; n += 1) {
    total += nightlyRate(property.baseNetRate, addDays(from, n));
  }

  return round2(total * search.rooms);
}

/**
 * Free cancellation deadline: midday Dubai time, the stated number of days
 * before arrival. Written with an explicit +04:00 offset rather than a Z time,
 * because the deadline is a local-business fact and reads wrongly in the admin
 * UI otherwise.
 */
function freeCancelDeadline(
  property: MockProperty,
  checkIn: IsoDate,
): IsoTimestamp | null {
  if (property.freeCancelDays === null) return null;
  const deadline = addDays(parseIsoDate(checkIn), -property.freeCancelDays);
  return `${toIsoDate(deadline)}T12:00:00+04:00`;
}

// ---------------------------------------------------------------------------

export class MockAdapter implements SupplierAdapter {
  readonly name = MOCK_ADAPTER_NAME;

  private readonly properties: Map<string, MockProperty>;
  private readonly now: () => Date;

  /**
   * Supplier-side bookings, keyed by the idempotency key we sent.
   *
   * An array rather than a single record, because this mock lets a blind retry
   * create a duplicate. Two entries under one key is the failure the booking
   * path exists to avoid, and the fixture has to be able to represent it.
   */
  private readonly bookings = new Map<string, ExternalBooking[]>();
  private readonly attempts = new Map<string, number>();
  private sequence = 0;

  constructor(options: MockAdapterOptions = {}) {
    const { now = () => new Date(), includeScenarios = true } = options;
    this.now = now;

    const inventory = includeScenarios
      ? [...MOCK_PROPERTIES, ...SCENARIO_PROPERTIES]
      : [...MOCK_PROPERTIES];

    this.properties = new Map(
      inventory.map((property) => [property.externalPropertyId, property]),
    );
  }

  // -------------------------------------------------------------------------
  // Content
  // -------------------------------------------------------------------------

  async listProperties(): Promise<PropertyContent[]> {
    return [...this.properties.values()].map((property) =>
      this.toPropertyContent(property),
    );
  }

  async getProperty(externalPropertyId: string): Promise<PropertyContent | null> {
    const property = this.properties.get(externalPropertyId);
    return property ? this.toPropertyContent(property) : null;
  }

  private toPropertyContent(property: MockProperty): PropertyContent {
    return {
      externalPropertyId: property.externalPropertyId,
      name: property.name,
      emirate: property.emirate,
      area: property.area,
      starRating: property.starRating,
      checkInTime: property.checkInTime,
      checkOutTime: property.checkOutTime,
      latitude: null,
      longitude: null,
      raw: { ...property },
    };
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  async search(criteria: StaySearch): Promise<StayQuote[]> {
    assertSearchIsCoherent(criteria);

    const nights = nightsBetween(criteria.checkIn, criteria.checkOut);
    const quotedAt = this.now().toISOString();

    return [...this.properties.values()]
      .filter((property) => {
        if (
          criteria.externalPropertyId &&
          property.externalPropertyId !== criteria.externalPropertyId
        ) {
          return false;
        }
        if (criteria.emirate && property.emirate !== criteria.emirate) {
          return false;
        }
        return true;
      })
      .map((property) => ({
        adapter: this.name,
        // Opaque to callers by contract. It is deterministic here only so a
        // failing test prints something a human can identify.
        offerId: [
          'mock',
          property.externalPropertyId,
          criteria.checkIn,
          criteria.checkOut,
          criteria.rooms,
          criteria.adults,
        ].join(':'),

        externalPropertyId: property.externalPropertyId,
        propertyName: property.name,
        emirate: property.emirate,

        roomDescription: `${property.boardBasis === 'room_only' ? 'Standard' : 'Superior'} Room`,
        boardBasis: property.boardBasis,

        checkIn: criteria.checkIn,
        checkOut: criteria.checkOut,
        nights,
        rooms: criteria.rooms,

        netCost: stayNetCost(property, criteria),
        currency: CURRENCY,

        netRateTaxInclusive: property.netRateTaxInclusive,
        taxesIncluded:
          property.netRateTaxInclusive === true
            ? [{ name: 'VAT', amount: 0, currency: CURRENCY }]
            : null,

        freeCancelUntil: freeCancelDeadline(property, criteria.checkIn),
        isRefundable: property.freeCancelDays !== null,

        quotedAt,
        raw: {
          supplier: 'mock',
          propertyId: property.externalPropertyId,
          occupancy: {
            adults: criteria.adults,
            childAges: criteria.childAges ?? [],
          },
        },
      }));
  }

  // -------------------------------------------------------------------------
  // Booking
  // -------------------------------------------------------------------------

  async book(
    quote: StayQuote,
    guests: Guest[],
    idempotencyKey: string,
  ): Promise<ExternalBooking> {
    if (quote.adapter !== this.name) {
      throw new RangeError(
        `Quote belongs to adapter "${quote.adapter}", not "${this.name}"`,
      );
    }
    if (!idempotencyKey) {
      throw new RangeError('An idempotency key is required for every book() call');
    }

    const attempt = (this.attempts.get(idempotencyKey) ?? 0) + 1;
    this.attempts.set(idempotencyKey, attempt);

    const property = this.properties.get(quote.externalPropertyId);
    if (!property) {
      // A quote for a property this adapter no longer carries. Deterministic:
      // retrying cannot bring it back.
      throw new SoldOutError(
        `Property ${quote.externalPropertyId} is no longer available`,
        { adapter: this.name, idempotencyKey },
      );
    }

    assertGuestsAreCoherent(guests, this.name, idempotencyKey);

    switch (property.behaviour) {
      case 'sold_out_on_book':
        throw new SoldOutError(
          `${property.name} sold out between the quote and the booking`,
          { adapter: this.name, idempotencyKey, supplierCode: 'NO_AVAILABILITY' },
        );

      case 'price_moves_on_book': {
        const current = round2(quote.netCost * PRICE_MOVE_FACTOR);
        throw new PriceMovedError(
          `${property.name} is still available at ${current} ${CURRENCY}, not ${quote.netCost}`,
          quote.netCost,
          current,
          CURRENCY,
          { adapter: this.name, idempotencyKey, supplierCode: 'RATE_CHANGED' },
        );
      }

      case 'rejects_guests':
        throw new InvalidGuestError(
          `${property.name} rejected the guest details`,
          { adapter: this.name, idempotencyKey, supplierCode: 'GUEST_REJECTED' },
        );

      case 'timeout_on_book':
        // Nothing is recorded. findByReference will find nothing, which is the
        // evidence that justifies a retry.
        throw new SupplierTimeoutError(
          `Timed out waiting for ${property.name}`,
          { adapter: this.name, idempotencyKey },
        );

      case 'timeout_on_book_but_succeeds':
        // The case this design exists for. The supplier commits, then the
        // socket gives up before the confirmation reaches us. From our side it
        // is indistinguishable from the timeout above; the only way to tell
        // them apart is to ask afterwards.
        this.record(idempotencyKey, this.confirm(property, quote, attempt, idempotencyKey));
        throw new SupplierTimeoutError(
          `Timed out waiting for ${property.name}`,
          { adapter: this.name, idempotencyKey },
        );

      default:
        break;
    }

    const booking = this.confirm(property, quote, attempt, idempotencyKey);
    this.record(idempotencyKey, booking);
    return booking;
  }

  async findByReference(idempotencyKey: string): Promise<ExternalBooking | null> {
    const found = this.bookings.get(idempotencyKey);
    if (!found || found.length === 0) return null;
    // The earliest surviving record. If a blind retry has produced two, this
    // returns the first, and bookingsFor() is how a test proves the second.
    return found[0];
  }

  async cancel(supplierRef: string, reason: string): Promise<ExternalBooking> {
    for (const [key, records] of this.bookings) {
      const index = records.findIndex((r) => r.supplierRef === supplierRef);
      if (index === -1) continue;

      const cancelled: ExternalBooking = {
        ...records[index],
        status: 'cancelled',
        failureDetail: reason,
      };
      records[index] = cancelled;
      this.bookings.set(key, records);
      return cancelled;
    }

    throw new RangeError(`No mock booking with supplier reference "${supplierRef}"`);
  }

  // -------------------------------------------------------------------------
  // Mock-only surface. Not on SupplierAdapter and not used outside tests.
  // -------------------------------------------------------------------------

  /** Every record held under a key, including duplicates from a blind retry. */
  bookingsFor(idempotencyKey: string): ExternalBooking[] {
    return [...(this.bookings.get(idempotencyKey) ?? [])];
  }

  /** How many times book() has been called with a key, successful or not. */
  attemptsFor(idempotencyKey: string): number {
    return this.attempts.get(idempotencyKey) ?? 0;
  }

  reset(): void {
    this.bookings.clear();
    this.attempts.clear();
    this.sequence = 0;
  }

  // -------------------------------------------------------------------------

  private confirm(
    property: MockProperty,
    quote: StayQuote,
    attempt: number,
    idempotencyKey: string,
  ): ExternalBooking {
    this.sequence += 1;
    return {
      adapter: this.name,
      supplierRef: `MOCK-${property.externalPropertyId}-${String(this.sequence).padStart(4, '0')}`,
      status: 'confirmed',
      idempotencyKey,
      attempt,
      failureClass: null,
      failureDetail: null,
      freeCancelUntil: quote.freeCancelUntil,
      netCost: quote.netCost,
      currency: quote.currency,
      netRateTaxInclusive: quote.netRateTaxInclusive,
      taxesIncluded: quote.taxesIncluded,
      raw: {
        supplier: 'mock',
        offerId: quote.offerId,
        confirmedAt: this.now().toISOString(),
      },
    };
  }

  private record(idempotencyKey: string, booking: ExternalBooking): void {
    const existing = this.bookings.get(idempotencyKey) ?? [];
    existing.push(booking);
    this.bookings.set(idempotencyKey, existing);
  }
}

// ---------------------------------------------------------------------------
// Guards
//
// These are RangeErrors rather than SupplierErrors. A malformed search is a
// bug on our side, and dressing it up as a supplier failure would send it
// through the retry machinery, where it would fail identically three more
// times before giving up.
// ---------------------------------------------------------------------------

function assertSearchIsCoherent(search: StaySearch): void {
  const nights = nightsBetween(search.checkIn, search.checkOut);
  if (nights < 1) {
    throw new RangeError(
      `Check-out (${search.checkOut}) must be after check-in (${search.checkIn})`,
    );
  }
  if (search.rooms < 1) {
    throw new RangeError(`A stay needs at least one room, received ${search.rooms}`);
  }
  if (search.adults < 1) {
    throw new RangeError(`A stay needs at least one adult, received ${search.adults}`);
  }
}

/**
 * Guest problems are a supplier-visible, deterministic failure rather than a
 * RangeError: a real supplier rejects these, and the booking path has to route
 * them to failed_rollback without retrying.
 */
function assertGuestsAreCoherent(
  guests: Guest[],
  adapter: string,
  idempotencyKey: string,
): void {
  if (guests.length === 0) {
    throw new InvalidGuestError('A booking needs at least one guest', {
      adapter,
      idempotencyKey,
    });
  }

  const leads = guests.filter((guest) => guest.isLead);
  if (leads.length !== 1) {
    throw new InvalidGuestError(
      `A booking needs exactly one lead guest, received ${leads.length}`,
      { adapter, idempotencyKey },
    );
  }

  const unnamed = guests.filter((guest) => guest.fullName.trim() === '');
  if (unnamed.length > 0) {
    throw new InvalidGuestError(`${unnamed.length} guest(s) have no name`, {
      adapter,
      idempotencyKey,
    });
  }
}
