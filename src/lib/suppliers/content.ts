/**
 * Premium Staycations — Phase 1
 * What is missing from a property payload, and whether it matters.
 *
 * Supplier content arrives incomplete often enough that "reject it" is not a
 * policy anyone can live with. The question is which absences are survivable.
 *
 * The distinction is the same one the fee rules make: a field that only
 * narrows a choice can be missing, and a field that selects a price cannot.
 * Nothing here throws — it reports, and the caller decides whether to cache
 * the row, raise a task, or both.
 */

import type { PropertyContent } from './types';

export type ContentGapSeverity = 'blocking' | 'degraded';

export interface PropertyContentGap {
  field: keyof PropertyContent;
  severity: ContentGapSeverity;
  reason: string;
}

/**
 * `blocking` means the property must not be priced until the gap is filled.
 * `degraded` means it can be sold, with something working less well.
 */
export function propertyContentGaps(property: PropertyContent): PropertyContentGap[] {
  const gaps: PropertyContentGap[] = [];

  if (property.starRating === null) {
    gaps.push({
      field: 'starRating',
      severity: 'blocking',
      reason:
        'Star rating selects the Tourism Dirham band. Without it the fee cannot ' +
        'be computed, and a fee that is collected by the hotel is never absorbed ' +
        'or priced at zero.',
    });
  }

  if (property.area === null) {
    gaps.push({
      field: 'area',
      severity: 'degraded',
      reason:
        'Area-scoped extras cannot match this property. Emirate-scoped and ' +
        'any-scoped extras still apply, so the stay remains sellable.',
    });
  }

  if (property.checkInTime === null) {
    gaps.push({
      field: 'checkInTime',
      severity: 'degraded',
      reason:
        'Falls back to brands.default_check_in_time via property_check_in_time(). ' +
        'Correct for most properties and wrong for the resorts that check in at ' +
        '16:00, which is what the lead-time exclusion turns on.',
    });
  }

  return gaps;
}

export function isSellable(property: PropertyContent): boolean {
  return !propertyContentGaps(property).some((gap) => gap.severity === 'blocking');
}
