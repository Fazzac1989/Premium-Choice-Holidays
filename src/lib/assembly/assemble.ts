/**
 * Premium Staycations — Phase 1
 * Package assembly.
 *
 * Rows in, a priced package out. Nothing here touches a database or a network;
 * the caller loads the rule rows and persists the result, both in one
 * transaction with any tasks this raises.
 *
 * The order of operations is the price's audit trail:
 *
 *   1. the room at net, plus absorbed taxes where the rate is tax-exclusive
 *   2. markup on the room
 *   3. extras — eligibility, lead time, validity, then per-guest pricing
 *   4. payable-at-property fees, which never enter the headline price
 *   5. one rounding, UP, at the package total; the delta retained as margin
 *
 * Anything unpriceable raises a task and marks the package unsellable rather
 * than guessing. The guesses this refuses to make: a markup where no rule
 * matches, a fee where no rule matches, a tax treatment the supplier did not
 * state, a child price for a child whose age we cannot compute.
 */

import { computeFees } from './fees';
import {
  commercialPriority,
  isEligible,
  isWithinLeadTime,
  pricePerPersonExtra,
} from './extras';
import { applyMarkup, resolveMarkupPct, round2 } from './markup';
import type {
  AssembledPackage,
  AssemblyRequest,
  AssemblyTaskRequest,
  ExcludedExtra,
  MarkupRuleRow,
  PackageComponent,
  PropertyFeeRow,
} from './types';

export interface AssemblyRules {
  markupRules: MarkupRuleRow[];
  feeRules: PropertyFeeRow[];
}

export function assemblePackage(
  request: AssemblyRequest,
  rules: AssemblyRules,
): AssembledPackage {
  const { brand, property, stay, guests, extras, assembledAt } = request;
  const tasks: AssemblyTaskRequest[] = [];
  const components: PackageComponent[] = [];
  const excludedExtras: ExcludedExtra[] = [];
  let sellable = true;

  // ------------------------------------------------------------------ the room
  const fees = computeFees(rules.feeRules, property, {
    checkIn: stay.checkIn,
    nights: stay.nights,
    rooms: stay.rooms,
    netCost: stay.netCost,
    netRateTaxInclusive: stay.netRateTaxInclusive,
    currency: stay.currency,
  });
  tasks.push(...fees.tasks);
  if (!fees.complete) sellable = false;

  // Absorbed taxes are OUR cost — the customer sees one price, we pay the tax.
  const roomCost = round2(stay.netCost + fees.absorbedTaxes);

  const roomMarkupPct = resolveMarkupPct(
    rules.markupRules,
    brand.id,
    'api',
    'accommodation',
    stay.checkIn,
  );

  let roomSell = 0;
  if (roomMarkupPct === null) {
    sellable = false;
    tasks.push({
      type: 'other',
      priority: 'urgent',
      summary:
        `No markup rule covers api/accommodation for brand ${brand.slug} ` +
        `on ${stay.checkIn}. The room cannot be priced.`,
      context: { brandId: brand.id, sourcing: 'api', productType: 'accommodation' },
    });
  } else {
    roomSell = applyMarkup(roomCost, roomMarkupPct);
  }

  components.push({
    productId: null,
    rateId: null,
    propertyId: property.id,
    description:
      `${stay.propertyName} — ${stay.roomDescription}, ${stay.nights} night${stay.nights === 1 ? '' : 's'}, ` +
      `${boardBasisEn(stay.boardBasis)}`,
    descriptionAr: null, // property Arabic names live in property_overrides; the loader supplies them in Session 6
    dateFrom: stay.checkIn,
    dateTo: stay.checkOut,
    quantity: 1,
    unitCost: roomCost,
    unitSell: roomSell,
    sourcing: 'api',
    pricingDetail: {
      basis: 'per_stay',
      supplierNetCost: stay.netCost,
      absorbedTaxes: fees.absorbedTaxes,
      netRateTaxInclusive: stay.netRateTaxInclusive,
      markupPctApplied: roomMarkupPct,
      offerId: stay.offerId,
      quotedAt: stay.quotedAt,
    },
    isRefundable: stay.isRefundable,
    freeCancelUntil: stay.freeCancelUntil,
  });

  // ------------------------------------------------------------------- extras
  // Stable commercial ordering: highest matching priority first. Which extra
  // leads is a commercial decision expressed in eligibility priority, and the
  // quote presents them in that order.
  const ordered = [...extras].sort(
    (a, b) =>
      commercialPriority(b.eligibility, property, stay.checkIn) -
      commercialPriority(a.eligibility, property, stay.checkIn),
  );

  for (const selection of ordered) {
    const { product, rate } = selection;

    if (!product.active) {
      excludedExtras.push({
        productId: product.id,
        productName: product.name,
        reason: 'inactive',
        detail: `${product.name} is not active`,
      });
      continue;
    }

    if (!isEligible(selection.eligibility, property, stay.checkIn)) {
      excludedExtras.push({
        productId: product.id,
        productName: product.name,
        reason: 'not_eligible',
        detail:
          `${product.name} is not eligible at ${property.name} ` +
          `(${property.emirate}${property.area ? `, ${property.area}` : ''})`,
      });
      continue;
    }

    if (stay.checkIn < rate.valid_from || stay.checkIn > rate.valid_to) {
      excludedExtras.push({
        productId: product.id,
        productName: product.name,
        reason: 'outside_rate_validity',
        detail:
          `The rate for ${product.name} is valid ${rate.valid_from} to ${rate.valid_to}; ` +
          `check-in is ${stay.checkIn}`,
      });
      continue;
    }

    if (
      !isWithinLeadTime(product.min_lead_time_hours, stay.checkIn, property, brand, assembledAt)
    ) {
      excludedExtras.push({
        productId: product.id,
        productName: product.name,
        reason: 'lead_time',
        detail:
          `${product.name} needs ${product.min_lead_time_hours}h before check-in; ` +
          'the window has closed',
      });
      continue;
    }

    const markupPct = resolveMarkupPct(
      rules.markupRules,
      brand.id,
      product.sourcing,
      product.type,
      stay.checkIn,
    );

    const pricing = pricePerPersonExtra(selection, guests, stay.checkIn, markupPct);

    if (pricing.incomplete) {
      sellable = false;
      tasks.push({
        type: 'other',
        priority: 'urgent',
        summary:
          `${product.name} cannot be priced: no explicit sell price and no ` +
          `markup rule for ${product.sourcing}/${product.type} on ${stay.checkIn}.`,
        context: { productId: product.id, rateId: rate.id },
      });
    }

    components.push({
      productId: product.id,
      rateId: rate.id,
      propertyId: null,
      description: product.name,
      descriptionAr: product.name_ar,
      dateFrom: stay.checkIn,
      dateTo: stay.checkOut,
      quantity: selection.quantity,
      unitCost: pricing.totalCost,
      unitSell: pricing.totalSell,
      sourcing: product.sourcing,
      pricingDetail: pricing.detail,
      isRefundable: null,
      freeCancelUntil: null,
    });

    // Bilingual output is a Phase 1 requirement; a missing translation is an
    // operator queue item, not a blocker.
    if (product.name_ar === null) {
      tasks.push({
        type: 'missing_arabic',
        priority: 'low',
        summary: `${product.name} has no Arabic name and is being quoted.`,
        context: { productId: product.id },
      });
    }
  }

  // ------------------------------------------------------------------- totals
  const totalCost = round2(components.reduce((sum, c) => sum + c.unitCost, 0));
  const totalSellExact = round2(components.reduce((sum, c) => sum + c.unitSell, 0));

  const { rounded: totalSell, delta: roundingDelta } = roundUpToIncrement(
    totalSellExact,
    brand.rounding_increment,
  );

  const marginPct =
    totalSell > 0 ? round2(((totalSell - totalCost) / totalSell) * 100) : null;
  const belowMarginFloor = marginPct !== null && marginPct < brand.margin_floor_pct;

  if (belowMarginFloor && sellable) {
    tasks.push({
      type: 'approve_quote',
      priority: 'normal',
      summary:
        `Margin ${marginPct}% is below the ${brand.margin_floor_pct}% floor for ` +
        `${brand.slug}. Needs approval before sending.`,
      context: { marginPct, floor: brand.margin_floor_pct, totalSell, totalCost },
    });
  }

  return {
    sellable,
    components,
    totalCost,
    totalSellExact,
    totalSell,
    roundingDelta,
    marginPct,
    belowMarginFloor,
    payableAtProperty: fees.payableAtProperty,
    payableAtPropertyBreakdown: fees.payableAtPropertyBreakdown,
    excludedExtras,
    tasks,
  };
}

/**
 * The one rounding in the engine. UP, to the brand increment, delta retained.
 *
 * Cent-safe: work in integer fils to dodge float artefacts — 664.05 * 100 is
 * 66404.99999… in IEEE754, and Math.ceil on that would invent a fils.
 */
export function roundUpToIncrement(
  exact: number,
  increment: number,
): { rounded: number; delta: number } {
  const exactFils = Math.round(exact * 100);
  const incrementFils = Math.round(increment * 100);
  const roundedFils = Math.ceil(exactFils / incrementFils) * incrementFils;
  return {
    rounded: roundedFils / 100,
    delta: round2((roundedFils - exactFils) / 100),
  };
}

function boardBasisEn(boardBasis: string): string {
  switch (boardBasis) {
    case 'room_only':         return 'room only';
    case 'bed_and_breakfast': return 'bed & breakfast';
    case 'half_board':        return 'half board';
    case 'full_board':        return 'full board';
    case 'all_inclusive':     return 'all inclusive';
    default:                  return boardBasis;
  }
}
