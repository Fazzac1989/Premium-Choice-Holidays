/**
 * Premium Staycations — Phase 1
 * Government and property fees, computed from property_fees rows.
 *
 * Mirrors fees_for_property() in migration 07 and then applies what that
 * function only selects. Two rules carried over from the schema comments:
 *
 *   - No applicable Tourism Dirham rule — Abu Dhabi today, or any property
 *     without a star rating — raises missing_fee_rules and blocks sale.
 *     Never price the fee at zero: it is collected by the hotel at checkout,
 *     and a customer told "one price" who meets a surprise fee at the desk is
 *     the failure mode that kills the proposition.
 *
 *   - Percentage fees are applied only when the component's tax treatment is
 *     known to be EXCLUSIVE. Unknown is not exclusive and it is not inclusive:
 *     it raises tax_treatment_unknown and blocks sale until an operator
 *     confirms the contract.
 */

import { round2 } from './markup';
import type {
  AssemblyTaskRequest,
  IsoDate,
  PayableAtPropertyLine,
  PropertyFacts,
  PropertyFeeRow,
} from './types';

/** The subset of the stay the fee rules read. */
export interface FeeBasis {
  checkIn: IsoDate;
  nights: number;
  rooms: number;
  netCost: number;
  /** From the supplier response. Null = the contract did not say. */
  netRateTaxInclusive: boolean | null;
  currency: string;
}

export interface FeeComputation {
  /** Collected by the hotel; excluded from the headline price. */
  payableAtProperty: number;
  payableAtPropertyBreakdown: PayableAtPropertyLine[];
  /** Added to our cost where the net rate is tax-exclusive. */
  absorbedTaxes: number;
  tasks: AssemblyTaskRequest[];
  /** False when a gap was found that money depends on. */
  complete: boolean;
}

/** fees_for_property(), over rows. Star matches exactly or the rule is rating-agnostic. */
export function feesForProperty(
  rules: PropertyFeeRow[],
  property: Pick<PropertyFacts, 'emirate' | 'starRating'>,
  onDate: IsoDate,
): PropertyFeeRow[] {
  return rules.filter(
    (rule) =>
      rule.emirate === property.emirate &&
      (rule.star_rating === null || rule.star_rating === property.starRating) &&
      onDate >= rule.effective_from &&
      (rule.effective_to === null || onDate <= rule.effective_to),
  );
}

export function computeFees(
  rules: PropertyFeeRow[],
  property: PropertyFacts,
  stay: FeeBasis,
): FeeComputation {
  const applicable = feesForProperty(rules, property, stay.checkIn);
  const tasks: AssemblyTaskRequest[] = [];
  const breakdown: PayableAtPropertyLine[] = [];
  let absorbedTaxes = 0;
  let complete = true;

  // ------------------------------------------------------------ per-night fees
  // Tourism Dirham: per room per night, capped at max_nights consecutive
  // nights, collected at the property.
  const perNight = applicable.filter((rule) => rule.basis === 'per_room_night');

  if (perNight.length === 0) {
    complete = false;
    tasks.push({
      type: 'missing_fee_rules',
      priority: 'urgent',
      summary:
        `No per-night fee rule matches ${property.name} ` +
        `(${property.emirate}, ${property.starRating ?? 'no'} star). ` +
        'Confirm the Tourism Dirham treatment and load property_fees before this goes on sale.',
      context: {
        propertyId: property.id,
        emirate: property.emirate,
        starRating: property.starRating,
        checkIn: stay.checkIn,
      },
    });
  }

  for (const rule of perNight) {
    const chargedNights =
      rule.max_nights === null ? stay.nights : Math.min(stay.nights, rule.max_nights);
    const amount = round2(rule.amount * chargedNights * stay.rooms);

    breakdown.push({
      feeType: rule.fee_type,
      description:
        `${feeNameEn(rule.fee_type)} — ${stay.currency} ${rule.amount} per room per night` +
        (chargedNights < stay.nights ? ` (capped at ${chargedNights} nights)` : '') +
        ', collected by the hotel at check-out',
      descriptionAr:
        `${feeNameAr(rule.fee_type)} — ${rule.amount} ${currencyAr(stay.currency)} ` +
        'لكل غرفة عن كل ليلة، تُحصَّل من قبل الفندق عند المغادرة' +
        (chargedNights < stay.nights ? ` (بحد أقصى ${chargedNights} ليلة)` : ''),
      amount,
      currency: stay.currency,
    });
  }

  // ---------------------------------------------------------- percentage fees
  // Part of the room bill. Absorbed into our cost when the net rate is
  // exclusive; already inside it when inclusive; unknown blocks.
  const percentage = applicable.filter((rule) => rule.basis === 'pct_of_bill');

  if (percentage.length > 0) {
    if (stay.netRateTaxInclusive === null) {
      complete = false;
      tasks.push({
        type: 'tax_treatment_unknown',
        priority: 'urgent',
        summary:
          `The supplier did not state whether the net rate for ${property.name} ` +
          'includes taxes. Confirm against the contract before pricing — priced as ' +
          'inclusive it may undercharge, as exclusive it may overcharge.',
        context: {
          propertyId: property.id,
          netCost: stay.netCost,
          applicablePctFees: percentage.map((rule) => ({
            type: rule.fee_type,
            pct: rule.amount,
          })),
        },
      });
    } else if (stay.netRateTaxInclusive === false) {
      for (const rule of percentage) {
        absorbedTaxes = round2(absorbedTaxes + round2(stay.netCost * (rule.amount / 100)));
      }
    }
    // Inclusive: the figures are already inside netCost. Nothing to add.
  }

  const payableAtProperty = round2(
    breakdown.reduce((sum, line) => sum + line.amount, 0),
  );

  return { payableAtProperty, payableAtPropertyBreakdown: breakdown, absorbedTaxes, tasks, complete };
}

// ---------------------------------------------------------------------------

function feeNameEn(feeType: PropertyFeeRow['fee_type']): string {
  switch (feeType) {
    case 'tourism_dirham': return 'Tourism Dirham';
    case 'municipality':   return 'Municipality fee';
    case 'service':        return 'Service charge';
    case 'vat':            return 'VAT';
  }
}

function feeNameAr(feeType: PropertyFeeRow['fee_type']): string {
  switch (feeType) {
    case 'tourism_dirham': return 'درهم السياحة';
    case 'municipality':   return 'رسوم البلدية';
    case 'service':        return 'رسوم الخدمة';
    case 'vat':            return 'ضريبة القيمة المضافة';
  }
}

function currencyAr(currency: string): string {
  return currency === 'AED' ? 'درهم' : currency;
}
