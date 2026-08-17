import { describe, expect, it } from 'vitest';

import type { StayQuote } from '@/lib/suppliers';
import { assemblePackage, roundUpToIncrement } from './assemble';
import { computeFees } from './fees';
import { ageAt } from './extras';
import { resolveMarkupPct } from './markup';
import type { AssemblyRequest } from './types';
import {
  FAMILY,
  makeBand,
  makeBrand,
  makeEligibility,
  makeMarkupRule,
  makeProduct,
  makeProperty,
  makeRate,
  seededFeeRules,
} from './testing';

const BRAND = makeBrand();
const RULES = {
  markupRules: [
    makeMarkupRule({ sourcing: 'api', product_type: null, markup_pct: 20 }),
    makeMarkupRule({ sourcing: 'contracted', product_type: null, markup_pct: 40 }),
  ],
  feeRules: seededFeeRules(),
};

function makeStay(overrides: Partial<StayQuote> = {}): StayQuote {
  return {
    adapter: 'mock',
    offerId: 'offer-1',
    externalPropertyId: 'DXB-002',
    propertyName: 'Jumeirah Beach Hotel',
    emirate: 'dubai',
    roomDescription: 'Superior Room',
    boardBasis: 'bed_and_breakfast',
    checkIn: '2026-09-01',
    checkOut: '2026-09-04',
    nights: 3,
    rooms: 2,
    netCost: 6000,
    currency: 'AED',
    netRateTaxInclusive: true,
    taxesIncluded: [{ name: 'VAT', amount: 0, currency: 'AED' }],
    freeCancelUntil: '2026-08-29T12:00:00+04:00',
    isRefundable: true,
    quotedAt: '2026-08-17T09:00:00Z',
    raw: {},
    ...overrides,
  };
}

function makeRequest(overrides: Partial<AssemblyRequest> = {}): AssemblyRequest {
  return {
    brand: BRAND,
    property: makeProperty(),
    stay: makeStay(),
    guests: FAMILY,
    extras: [],
    assembledAt: new Date('2026-08-17T09:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

describe('fees', () => {
  it('prices the Tourism Dirham per room per night as payable at the property', () => {
    // 5-star Dubai: AED 20 × 2 rooms × 3 nights = 120, collected by the hotel.
    const pkg = assemblePackage(makeRequest(), RULES);
    expect(pkg.payableAtProperty).toBe(120);
    expect(pkg.payableAtPropertyBreakdown).toHaveLength(1);
    expect(pkg.payableAtPropertyBreakdown[0].feeType).toBe('tourism_dirham');
    // Bilingual by construction, not by later translation.
    expect(pkg.payableAtPropertyBreakdown[0].descriptionAr).toContain('درهم السياحة');
  });

  it('caps the Tourism Dirham at 30 consecutive nights', () => {
    const fees = computeFees(RULES.feeRules, makeProperty(), {
      checkIn: '2026-09-01',
      nights: 35,
      rooms: 1,
      netCost: 10000,
      netRateTaxInclusive: true,
      currency: 'AED',
    });
    expect(fees.payableAtProperty).toBe(600); // 20 × 30, not 20 × 35
    expect(fees.payableAtPropertyBreakdown[0].description).toContain('capped at 30');
  });

  it('never enters the headline price', () => {
    const pkg = assemblePackage(makeRequest(), RULES);
    // 6000 net, tax-inclusive, 20% markup → sell 7200 exact; 120 Dirham on top
    // would be 7320-something. The Dirham must be nowhere in totalSell.
    expect(pkg.totalSellExact).toBe(7200);
    expect(pkg.totalSell).toBe(7200); // already on the 5-increment
  });

  it('raises missing_fee_rules for Abu Dhabi and blocks sale — never prices zero', () => {
    const pkg = assemblePackage(
      makeRequest({
        property: makeProperty({
          externalPropertyId: 'AUH-003',
          name: 'W Abu Dhabi Yas Island',
          emirate: 'abu_dhabi',
          area: 'Yas Island',
        }),
        stay: makeStay({ externalPropertyId: 'AUH-003', emirate: 'abu_dhabi' }),
      }),
      RULES,
    );
    expect(pkg.sellable).toBe(false);
    expect(pkg.payableAtPropertyBreakdown).toHaveLength(0);
    const task = pkg.tasks.find((t) => t.type === 'missing_fee_rules');
    expect(task).toBeDefined();
    expect(task!.priority).toBe('urgent');
  });

  it('raises missing_fee_rules for a property with no star rating', () => {
    // Star-specific Dirham rules cannot match a rating-less property; pricing
    // the fee at zero because the data is bad is exactly the forbidden move.
    const pkg = assemblePackage(
      makeRequest({ property: makeProperty({ starRating: null }) }),
      RULES,
    );
    expect(pkg.sellable).toBe(false);
    expect(pkg.tasks.some((t) => t.type === 'missing_fee_rules')).toBe(true);
  });

  it('absorbs percentage fees into cost when the net rate is tax-EXCLUSIVE', () => {
    const pkg = assemblePackage(
      makeRequest({ stay: makeStay({ netRateTaxInclusive: false }) }),
      RULES,
    );
    // 7% + 10% + 5% of 6000 = 1320 absorbed. Cost 7320, sell 7320 × 1.2 = 8784.
    expect(pkg.components[0].unitCost).toBe(7320);
    expect(pkg.totalCost).toBe(7320);
    expect(pkg.sellable).toBe(true);
    // The customer still sees one price; the absorption is ours.
    expect(pkg.components[0].pricingDetail.absorbedTaxes).toBe(1320);
  });

  it('raises tax_treatment_unknown when the supplier did not say, and blocks', () => {
    const pkg = assemblePackage(
      makeRequest({ stay: makeStay({ netRateTaxInclusive: null }) }),
      RULES,
    );
    expect(pkg.sellable).toBe(false);
    const task = pkg.tasks.find((t) => t.type === 'tax_treatment_unknown');
    expect(task).toBeDefined();
    expect(task!.priority).toBe('urgent');
    // And it must not have been priced either way.
    expect(pkg.components[0].unitCost).toBe(6000); // no absorption
  });
});

// ---------------------------------------------------------------------------
// Markup
// ---------------------------------------------------------------------------

describe('markup resolution', () => {
  const brandId = BRAND.id;

  it('an exact product_type rule beats the catch-all', () => {
    const rules = [
      makeMarkupRule({ sourcing: 'contracted', product_type: null, markup_pct: 40 }),
      makeMarkupRule({ sourcing: 'contracted', product_type: 'attraction', markup_pct: 55 }),
    ];
    expect(resolveMarkupPct(rules, brandId, 'contracted', 'attraction', '2026-09-01')).toBe(55);
    expect(resolveMarkupPct(rules, brandId, 'contracted', 'dining', '2026-09-01')).toBe(40);
  });

  it('respects effective dating, inclusive of the end date', () => {
    const rules = [
      makeMarkupRule({ markup_pct: 20, effective_from: '2026-01-01', effective_to: '2026-08-31' }),
      makeMarkupRule({ markup_pct: 25, effective_from: '2026-09-01', effective_to: null }),
    ];
    expect(resolveMarkupPct(rules, brandId, 'api', 'accommodation', '2026-08-31')).toBe(20);
    expect(resolveMarkupPct(rules, brandId, 'api', 'accommodation', '2026-09-01')).toBe(25);
  });

  it('returns null when nothing matches — never a default percentage', () => {
    expect(resolveMarkupPct([], brandId, 'api', 'accommodation', '2026-09-01')).toBeNull();
  });

  it('an unpriceable room raises an urgent task and blocks sale', () => {
    const pkg = assemblePackage(makeRequest(), {
      markupRules: [],
      feeRules: seededFeeRules(),
    });
    expect(pkg.sellable).toBe(false);
    expect(pkg.tasks.some((t) => t.priority === 'urgent' && /markup/i.test(t.summary))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Extras: eligibility, child bands, lead time
// ---------------------------------------------------------------------------

describe('extras', () => {
  function safariSelection(overrides: {
    eligibility?: Parameters<typeof makeEligibility>[1][];
    leadTimeHours?: number;
  } = {}) {
    const product = makeProduct({
      min_lead_time_hours: overrides.leadTimeHours ?? 24,
    });
    const rate = makeRate(product.id, { cost_net: 185, sell_price: 299 });
    const bands = [
      makeBand(rate.id, { label: 'Infant', age_min: 0, age_max: 2, cost_net: 0, sell_price: 0 }),
      makeBand(rate.id, { label: 'Child', age_min: 3, age_max: 11, cost_net: 90, sell_price: 149 }),
    ];
    const eligibility = (overrides.eligibility ?? [{}]).map((e) =>
      makeEligibility(product.id, e),
    );
    return { product, rate, childBands: bands, eligibility, quantity: 1 };
  }

  it('a Dubai-scoped extra never attaches to an Abu Dhabi stay', () => {
    // The assertion the schema comment in migration 06 demands.
    const pkg = assemblePackage(
      makeRequest({
        property: makeProperty({ emirate: 'abu_dhabi', area: 'Yas Island' }),
        stay: makeStay({ emirate: 'abu_dhabi' }),
        extras: [safariSelection({ eligibility: [{ scope: 'emirate', emirate: 'dubai' }] })],
      }),
      RULES,
    );
    expect(pkg.components).toHaveLength(1); // the room only
    expect(pkg.excludedExtras).toHaveLength(1);
    expect(pkg.excludedExtras[0].reason).toBe('not_eligible');
  });

  it('an extra with no eligibility rows attaches nowhere', () => {
    const pkg = assemblePackage(
      makeRequest({ extras: [safariSelection({ eligibility: [] })] }),
      RULES,
    );
    expect(pkg.excludedExtras.map((e) => e.reason)).toEqual(['not_eligible']);
  });

  it('area scope matches the property area exactly', () => {
    const palm = safariSelection({ eligibility: [{ scope: 'area', emirate: null, area: 'Palm Jumeirah' }] });
    const pkg = assemblePackage(makeRequest({ extras: [palm] }), RULES);
    // Property is in Umm Suqeim.
    expect(pkg.excludedExtras).toHaveLength(1);
  });

  it('charges the band for the age at CHECK-IN, not at booking', () => {
    // Layla is 2 on the assembly date (2026-06-01) and 3 on check-in
    // (2026-09-01). The hotel will charge her as a 3-year-old; so do we.
    const pkg = assemblePackage(
      makeRequest({
        assembledAt: new Date('2026-06-01T09:00:00Z'),
        extras: [safariSelection()],
      }),
      RULES,
    );
    const extra = pkg.components[1];
    const perGuest = (extra.pricingDetail as { perGuest: { name: string; band: string; sell: number }[] }).perGuest;
    const layla = perGuest.find((g) => g.name.startsWith('Layla'));
    expect(layla!.band).toBe('Child'); // NOT Infant
    expect(layla!.sell).toBe(149);
    // Two adults at 299 + one child at 149.
    expect(extra.unitSell).toBe(747);
  });

  it('a check-in before the third birthday keeps the infant band, free of charge', () => {
    const pkg = assemblePackage(
      makeRequest({
        stay: makeStay({ checkIn: '2026-06-10', checkOut: '2026-06-13' }),
        assembledAt: new Date('2026-06-01T09:00:00Z'),
        extras: [safariSelection()],
      }),
      RULES,
    );
    const perGuest = (pkg.components[1].pricingDetail as { perGuest: { name: string; band: string; sell: number }[] }).perGuest;
    const layla = perGuest.find((g) => g.name.startsWith('Layla'));
    expect(layla!.band).toBe('Infant');
    expect(layla!.sell).toBe(0); // 0 is a price, not an absence
  });

  it('excludes an extra whose lead time has closed, against the 16:00 check-in', () => {
    // Check-in 2026-09-01 at 16:00 Gulf. A 48h lead closes 2026-08-30T16:00+04.
    const pkg = assemblePackage(
      makeRequest({
        property: makeProperty({ checkInTime: '16:00' }),
        assembledAt: new Date('2026-08-30T13:00:00Z'), // 17:00 Gulf — 47h left
        extras: [safariSelection({ leadTimeHours: 48 })],
      }),
      RULES,
    );
    expect(pkg.excludedExtras.map((e) => e.reason)).toEqual(['lead_time']);
  });

  it('falls back to the brand default check-in when the property has none', () => {
    // Brand default 15:00. 2026-08-30T11:30Z is 15:30 Gulf — 47.5h before a
    // 15:00 check-in on 09-01, so a 48h lead has closed. With the property's
    // own 16:00 it would still be open. The fallback must bite.
    const pkg = assemblePackage(
      makeRequest({
        property: makeProperty({ checkInTime: null }),
        assembledAt: new Date('2026-08-30T11:30:00Z'),
        extras: [safariSelection({ leadTimeHours: 48 })],
      }),
      RULES,
    );
    expect(pkg.excludedExtras.map((e) => e.reason)).toEqual(['lead_time']);
  });

  it('orders eligible extras by commercial priority, highest first', () => {
    const lowPriority = safariSelection({ eligibility: [{ priority: 1 }] });
    lowPriority.product = { ...lowPriority.product, name: 'Low Priority Pass' };
    const highPriority = safariSelection({ eligibility: [{ priority: 9 }] });
    highPriority.product = { ...highPriority.product, name: 'Lead Offer' };

    const pkg = assemblePackage(
      makeRequest({ extras: [lowPriority, highPriority] }),
      RULES,
    );
    expect(pkg.components[1].description).toBe('Lead Offer');
    expect(pkg.components[2].description).toBe('Low Priority Pass');
  });
});

// ---------------------------------------------------------------------------
// Rounding and totals
// ---------------------------------------------------------------------------

describe('rounding', () => {
  it('rounds the total UP to the brand increment and retains the delta', () => {
    // Room 6000 → sell 7200. Extra: family 747. Exact 7947 → 7950 on AED 5.
    const product = makeProduct();
    const rate = makeRate(product.id);
    const pkg = assemblePackage(
      makeRequest({
        extras: [{
          product,
          rate,
          childBands: [
            makeBand(rate.id, { label: 'Infant', age_min: 0, age_max: 2, cost_net: 0, sell_price: 0 }),
            makeBand(rate.id, { label: 'Child', age_min: 3, age_max: 11, cost_net: 90, sell_price: 149 }),
          ],
          eligibility: [makeEligibility(product.id)],
          quantity: 1,
        }],
      }),
      RULES,
    );
    expect(pkg.totalSellExact).toBe(7947);
    expect(pkg.totalSell).toBe(7950);
    expect(pkg.roundingDelta).toBe(3);
    // The breakdown reconciles: components + delta = total charged.
    const componentSum = pkg.components.reduce((sum, c) => sum + c.unitSell, 0);
    expect(componentSum + pkg.roundingDelta).toBe(pkg.totalSell);
  });

  it('a total already on the increment keeps a zero delta', () => {
    expect(roundUpToIncrement(7200, 5)).toEqual({ rounded: 7200, delta: 0 });
  });

  it('never rounds down', () => {
    expect(roundUpToIncrement(7200.01, 5)).toEqual({ rounded: 7205, delta: 4.99 });
  });

  it('survives IEEE754 — 664.05 does not invent a fils', () => {
    // 664.05 * 100 = 66404.999… in floats; naive ceil would produce 665→670.
    expect(roundUpToIncrement(664.05, 5)).toEqual({ rounded: 665, delta: 0.95 });
    expect(roundUpToIncrement(665, 5)).toEqual({ rounded: 665, delta: 0 });
  });

  it('flags a package below the margin floor for approval', () => {
    const pkg = assemblePackage(
      makeRequest(),
      {
        // 5% markup → margin ≈ 4.76%, floor is 12.
        markupRules: [makeMarkupRule({ sourcing: 'api', markup_pct: 5 })],
        feeRules: seededFeeRules(),
      },
    );
    expect(pkg.belowMarginFloor).toBe(true);
    expect(pkg.tasks.some((t) => t.type === 'approve_quote')).toBe(true);
    // Below floor is an approval gate, not a block.
    expect(pkg.sellable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ageAt mirrors guest_age_at()
// ---------------------------------------------------------------------------

describe('ageAt', () => {
  it('computes whole years, birthday not yet reached', () => {
    expect(ageAt('2023-06-20', '2026-06-19')).toBe(2);
    expect(ageAt('2023-06-20', '2026-06-20')).toBe(3);
    expect(ageAt('2023-06-20', '2026-06-21')).toBe(3);
  });

  it('handles a leap-day birth', () => {
    expect(ageAt('2024-02-29', '2026-02-28')).toBe(1);
    expect(ageAt('2024-02-29', '2026-03-01')).toBe(2);
  });
});
