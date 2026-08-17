/**
 * Premium Staycations — Phase 1
 * Row builders for the assembly tests.
 *
 * Not exported from the package index and imported only by *.test.ts. The
 * defaults mirror the seeded reference data — the fee rows are the Dubai and
 * RAK rules from migration 07, so a test that disagrees with the seed is a
 * test that would disagree with production.
 */

import type {
  BrandRow,
  ChildBandRow,
  EligibilityRow,
  GuestSpec,
  MarkupRuleRow,
  ProductRateRow,
  ProductRow,
  PropertyFacts,
  PropertyFeeRow,
} from './types';

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export function makeBrand(overrides: Partial<BrandRow> = {}): BrandRow {
  return {
    id: 'brand-staycations',
    slug: 'staycations',
    name: 'Premium Staycations',
    domain: 'premiumstaycations.com',
    from_email: 'hello@premiumstaycations.com',
    currency: 'AED',
    terms_url: null,
    margin_floor_pct: 12,
    timezone: 'Asia/Dubai',
    default_check_in_time: '15:00:00',
    rounding_increment: 5,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeMarkupRule(overrides: Partial<MarkupRuleRow> = {}): MarkupRuleRow {
  return {
    id: nextId('markup'),
    brand_id: 'brand-staycations',
    sourcing: 'api',
    product_type: null,
    markup_pct: 20,
    min_margin_pct: null,
    effective_from: '2026-01-01',
    effective_to: null,
    created_by: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeProperty(overrides: Partial<PropertyFacts> = {}): PropertyFacts {
  return {
    id: nextId('prop'),
    externalPropertyId: 'DXB-002',
    name: 'Jumeirah Beach Hotel',
    emirate: 'dubai',
    area: 'Umm Suqeim',
    starRating: 5,
    checkInTime: '15:00',
    ...overrides,
  };
}

/** The migration 07 seed, verbatim: Dubai and RAK. Abu Dhabi deliberately absent. */
export function seededFeeRules(): PropertyFeeRow[] {
  const base = {
    prepayable: false,
    max_nights: 30,
    effective_from: '2024-01-01',
    effective_to: null,
    source_note: 'seed',
    created_at: '2026-01-01T00:00:00Z',
  };
  const pct = { ...base, prepayable: true, max_nights: null };

  const rules: PropertyFeeRow[] = [];
  for (const emirate of ['dubai', 'rak'] as const) {
    rules.push(
      { ...base, id: nextId('fee'), emirate, star_rating: 5, fee_type: 'tourism_dirham', basis: 'per_room_night', amount: 20 },
      { ...base, id: nextId('fee'), emirate, star_rating: 4, fee_type: 'tourism_dirham', basis: 'per_room_night', amount: 15 },
      { ...base, id: nextId('fee'), emirate, star_rating: 3, fee_type: 'tourism_dirham', basis: 'per_room_night', amount: 10 },
      { ...base, id: nextId('fee'), emirate, star_rating: 2, fee_type: 'tourism_dirham', basis: 'per_room_night', amount: 7 },
      { ...base, id: nextId('fee'), emirate, star_rating: 1, fee_type: 'tourism_dirham', basis: 'per_room_night', amount: 7 },
      { ...pct,  id: nextId('fee'), emirate, star_rating: null, fee_type: 'municipality', basis: 'pct_of_bill', amount: 7 },
      { ...pct,  id: nextId('fee'), emirate, star_rating: null, fee_type: 'service', basis: 'pct_of_bill', amount: 10 },
      { ...pct,  id: nextId('fee'), emirate, star_rating: null, fee_type: 'vat', basis: 'pct_of_bill', amount: 5 },
    );
  }
  return rules;
}

export function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: nextId('product'),
    brand_id: 'brand-staycations',
    supplier_id: null,
    type: 'attraction',
    name: 'Desert Safari',
    name_ar: 'رحلة سفاري صحراوية',
    description: null,
    description_ar: null,
    images: null,
    inclusions: null,
    sourcing: 'contracted',
    redemption_method: 'voucher_code',
    min_lead_time_hours: 24,
    freesale: true,
    active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeRate(
  productId: string,
  overrides: Partial<ProductRateRow> = {},
): ProductRateRow {
  return {
    id: nextId('rate'),
    product_id: productId,
    season_name: null,
    valid_from: '2026-01-01',
    valid_to: '2026-12-31',
    pricing_basis: 'per_person',
    cost_net: 185,
    sell_price: 299,
    min_nights: null,
    blackout_dates: null,
    notes: null,
    allocation: null,
    allocation_used: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeBand(
  rateId: string,
  overrides: Partial<ChildBandRow> = {},
): ChildBandRow {
  return {
    id: nextId('band'),
    rate_id: rateId,
    label: 'Child',
    age_min: 3,
    age_max: 11,
    cost_net: 90,
    sell_price: 149,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export function makeEligibility(
  productId: string,
  overrides: Partial<EligibilityRow> = {},
): EligibilityRow {
  return {
    id: nextId('elig'),
    product_id: productId,
    scope: 'emirate',
    emirate: 'dubai',
    area: null,
    external_property_id: null,
    priority: 0,
    valid_from: null,
    valid_to: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

export const FAMILY: GuestSpec[] = [
  { fullName: 'Aisha Al Mansouri', dateOfBirth: '1990-03-12', isLead: true },
  { fullName: 'Omar Al Mansouri', dateOfBirth: '1988-11-02', isLead: false },
  // Turns 3 on 2026-06-20: an infant for any check-in before that date and a
  // child from that date on. The band-boundary guest.
  { fullName: 'Layla Al Mansouri', dateOfBirth: '2023-06-20', isLead: false },
];
