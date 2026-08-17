/**
 * Premium Staycations — Phase 1
 * Extras: eligibility, the lead-time exclusion, and per-guest pricing.
 */

import { applyMarkup, round2 } from './markup';
import type {
  BrandRow,
  ChildBandRow,
  EligibilityRow,
  ExtraSelection,
  GuestSpec,
  IsoDate,
  PropertyFacts,
} from './types';

// ---------------------------------------------------------------------------
// Eligibility
//
// Scope semantics from migration 06: emirate, area, property, any. Each row
// carries exactly the field its scope needs (enforced by check constraint).
// A Dubai-scoped extra never attaches to an Abu Dhabi property — this is the
// function the schema comment says the assembly tests must assert.
// ---------------------------------------------------------------------------

export function eligibilityMatches(
  row: EligibilityRow,
  property: PropertyFacts,
  onDate: IsoDate,
): boolean {
  if (row.valid_from !== null && onDate < row.valid_from) return false;
  if (row.valid_to !== null && onDate > row.valid_to) return false;

  switch (row.scope) {
    case 'any':      return true;
    case 'emirate':  return row.emirate === property.emirate;
    case 'area':     return property.area !== null && row.area === property.area;
    case 'property': return row.external_property_id === property.externalPropertyId;
  }
}

/**
 * Is this extra eligible for this stay at all? True when any rule matches.
 * An extra with NO eligibility rows is eligible nowhere — absence of rules is
 * not a wildcard; the 'any' scope exists for that.
 */
export function isEligible(
  eligibility: EligibilityRow[],
  property: PropertyFacts,
  onDate: IsoDate,
): boolean {
  return eligibility.some((row) => eligibilityMatches(row, property, onDate));
}

/**
 * Commercial lead order for a set of eligible extras: highest matching
 * priority first. Which of several eligible extras is offered first is a
 * commercial decision, not a geographic one — priority is data.
 */
export function commercialPriority(
  eligibility: EligibilityRow[],
  property: PropertyFacts,
  onDate: IsoDate,
): number {
  const matching = eligibility.filter((row) =>
    eligibilityMatches(row, property, onDate),
  );
  return matching.length === 0
    ? Number.NEGATIVE_INFINITY
    : Math.max(...matching.map((row) => row.priority));
}

// ---------------------------------------------------------------------------
// Lead time
//
// min_lead_time_hours is measured back from the property's check-in moment in
// the brand timezone — not from midnight. A 24-hour lead on a 16:00 check-in
// closes at 16:00 the day before, which is why the brand-default fallback and
// the cached 16:00 both matter.
// ---------------------------------------------------------------------------

/** The check-in moment as an instant, using the +04:00 Gulf offset (no DST). */
export function checkInMoment(
  checkIn: IsoDate,
  property: PropertyFacts,
  brand: BrandRow,
): Date {
  const time = property.checkInTime ?? brand.default_check_in_time.slice(0, 5);
  return new Date(`${checkIn}T${time}:00+04:00`);
}

export function leadTimeHoursRemaining(
  checkIn: IsoDate,
  property: PropertyFacts,
  brand: BrandRow,
  now: Date,
): number {
  return (checkInMoment(checkIn, property, brand).getTime() - now.getTime()) / 3_600_000;
}

export function isWithinLeadTime(
  minLeadTimeHours: number,
  checkIn: IsoDate,
  property: PropertyFacts,
  brand: BrandRow,
  now: Date,
): boolean {
  return leadTimeHoursRemaining(checkIn, property, brand, now) >= minLeadTimeHours;
}

// ---------------------------------------------------------------------------
// Per-guest pricing with child bands
// ---------------------------------------------------------------------------

export interface GuestPrice {
  fullName: string;
  ageAtCheckIn: number | null;
  band: string;
  unitCost: number;
  unitSell: number;
}

export interface ExtraPricing {
  perGuest: GuestPrice[];
  totalCost: number;
  totalSell: number;
  /** True when a guest could not be priced (child with no DOB, no rule). */
  incomplete: boolean;
  detail: Record<string, unknown>;
}

/** Whole years old on a date. Mirrors guest_age_at(). */
export function ageAt(dateOfBirth: IsoDate, onDate: IsoDate): number {
  const dob = new Date(`${dateOfBirth}T00:00:00Z`);
  const on = new Date(`${onDate}T00:00:00Z`);
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const monthDay =
    (on.getUTCMonth() - dob.getUTCMonth()) * 100 + (on.getUTCDate() - dob.getUTCDate());
  if (monthDay < 0) age -= 1;
  return age;
}

function bandFor(bands: ChildBandRow[], age: number): ChildBandRow | null {
  // Bands cannot overlap (exclusion constraint), so first match is the match.
  return bands.find((band) => age >= band.age_min && age <= band.age_max) ?? null;
}

/**
 * Price one extra for the party, per person, ages resolved at CHECK-IN.
 *
 * An adult (or a guest older than every band) pays the rate row price. A guest
 * inside a band pays the band price — sell_price 0 is meaningful and means
 * free of charge, not unpriced. A null band sell_price derives from the band's
 * own cost via markup, same as the adult rate.
 */
export function pricePerPersonExtra(
  selection: ExtraSelection,
  guests: GuestSpec[],
  checkIn: IsoDate,
  markupPct: number | null,
): ExtraPricing {
  const perGuest: GuestPrice[] = [];
  let incomplete = false;

  const adultCost = selection.rate.cost_net;
  const adultSell = resolveSell(selection.rate.sell_price, adultCost, markupPct);
  if (adultSell === null) incomplete = true;

  for (const guest of guests) {
    const age = guest.dateOfBirth === null ? null : ageAt(guest.dateOfBirth, checkIn);
    const band = age === null ? null : bandFor(selection.childBands, age);

    if (band !== null && age !== null) {
      const bandSell = resolveSell(band.sell_price, band.cost_net, markupPct);
      if (bandSell === null) incomplete = true;
      perGuest.push({
        fullName: guest.fullName,
        ageAtCheckIn: age,
        band: band.label ?? `${band.age_min}-${band.age_max}`,
        unitCost: band.cost_net,
        unitSell: bandSell ?? 0,
      });
    } else {
      perGuest.push({
        fullName: guest.fullName,
        ageAtCheckIn: age,
        band: 'adult',
        unitCost: adultCost,
        unitSell: adultSell ?? 0,
      });
    }
  }

  const totalCost = round2(
    perGuest.reduce((sum, g) => sum + g.unitCost, 0) * selection.quantity,
  );
  const totalSell = round2(
    perGuest.reduce((sum, g) => sum + g.unitSell, 0) * selection.quantity,
  );

  return {
    perGuest,
    totalCost,
    totalSell,
    incomplete,
    detail: {
      basis: 'per_person',
      quantity: selection.quantity,
      rateId: selection.rate.id,
      markupPctApplied: selection.rate.sell_price === null ? markupPct : null,
      agesResolvedAt: checkIn,
      perGuest: perGuest.map((g) => ({
        name: g.fullName,
        age: g.ageAtCheckIn,
        band: g.band,
        cost: g.unitCost,
        sell: g.unitSell,
      })),
    },
  };
}

/**
 * Null when the price cannot be derived: no explicit sell and no markup rule.
 * The caller raises a task; nobody invents a percentage.
 */
function resolveSell(
  explicitSell: number | null,
  costNet: number,
  markupPct: number | null,
): number | null {
  if (explicitSell !== null) return explicitSell;
  if (markupPct === null) return null;
  return applyMarkup(costNet, markupPct);
}
