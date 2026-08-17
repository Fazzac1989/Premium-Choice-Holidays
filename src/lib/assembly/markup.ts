/**
 * Premium Staycations — Phase 1
 * Markup resolution.
 *
 * The same semantics as resolve_markup_pct() in migration 03, over the same
 * rows, kept in lockstep deliberately: the SQL function serves SQL callers and
 * the admin screens, this serves assembly, and if the two ever disagree the
 * price shown in the office differs from the price charged. Any change here
 * must be mirrored there.
 *
 * Selection: the rule must match brand, sourcing and date; a rule naming this
 * product type beats the catch-all (product_type null); among equally specific
 * rules the latest effective_from wins. effective_to is the last day the rule
 * applies, inclusive.
 */

import type { IsoDate, MarkupRuleRow, ProductType, SourcingType } from './types';

export function resolveMarkupPct(
  rules: MarkupRuleRow[],
  brandId: string,
  sourcing: SourcingType,
  productType: ProductType,
  onDate: IsoDate,
): number | null {
  const applicable = rules
    .filter(
      (rule) =>
        rule.brand_id === brandId &&
        rule.sourcing === sourcing &&
        (rule.product_type === productType || rule.product_type === null) &&
        onDate >= rule.effective_from &&
        (rule.effective_to === null || onDate <= rule.effective_to),
    )
    .sort((a, b) => {
      const specificity =
        Number(b.product_type !== null) - Number(a.product_type !== null);
      if (specificity !== 0) return specificity;
      return b.effective_from.localeCompare(a.effective_from);
    });

  return applicable.length > 0 ? applicable[0].markup_pct : null;
}

/**
 * Sell price for a component whose rate holds no explicit sell_price.
 *
 * Null markup is an answer, not an error: it means no rule covers this
 * component today, and the caller raises a task rather than guessing a
 * percentage. Never default a markup.
 */
export function applyMarkup(costNet: number, markupPct: number): number {
  return round2(costNet * (1 + markupPct / 100));
}

/** Exact-to-the-fils arithmetic guard used across the engine. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
