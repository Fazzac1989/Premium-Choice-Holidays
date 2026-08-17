/**
 * Premium Staycations — Phase 1
 * The assembly service's vocabulary.
 *
 * The rule shapes are the database Row types, not restatements of them. The
 * engine is pure — rows in, a priced package out — and the only Supabase code
 * is a loader at the edge. That is what lets the Tourism Dirham cap or a
 * band-boundary child be tested without a database, and it means a migration
 * that changes a rule table breaks compilation here rather than behaviour in
 * production.
 *
 * Money is `number` throughout, in AED. Components are computed exactly and
 * never rounded; only the package total rounds, once, at the end. See
 * rounding.ts.
 */

import type { Database } from '@/types/database';
import type { Emirate, StayQuote } from '@/lib/suppliers';

type Tables = Database['public']['Tables'];
type Enums = Database['public']['Enums'];

// Rule rows, straight from the schema.
export type MarkupRuleRow = Tables['markup_rules']['Row'];
export type PropertyFeeRow = Tables['property_fees']['Row'];
export type ProductRow = Tables['products']['Row'];
export type ProductRateRow = Tables['product_rates']['Row'];
export type ChildBandRow = Tables['product_rate_child_bands']['Row'];
export type EligibilityRow = Tables['extra_eligibility']['Row'];
export type BrandRow = Tables['brands']['Row'];

export type SourcingType = Enums['sourcing_type'];
export type ProductType = Enums['product_type'];
export type TaskType = Enums['task_type'];
export type TaskPriority = Enums['task_priority'];

/** 'YYYY-MM-DD' — same convention as the supplier layer. */
export type IsoDate = string;

// ---------------------------------------------------------------------------
// What assembly is asked for
// ---------------------------------------------------------------------------

export interface GuestSpec {
  fullName: string;
  /** Null for an adult whose DOB we do not hold. Required for children. */
  dateOfBirth: IsoDate | null;
  isLead: boolean;
}

/**
 * The property facts assembly needs, as cached in `properties` — already
 * through the supplier layer's content-gap check by the time it gets here.
 */
export interface PropertyFacts {
  id: string;
  externalPropertyId: string;
  name: string;
  emirate: Emirate;
  area: string | null;
  starRating: number | null;
  /** 'HH:MM' or null; brand default applies when null. */
  checkInTime: string | null;
}

export interface AssemblyRequest {
  brand: BrandRow;
  property: PropertyFacts;
  /** The room, already quoted by the supplier adapter. */
  stay: StayQuote;
  guests: GuestSpec[];
  /** Extras the customer picked, by product id. */
  extras: ExtraSelection[];
  /** When the package is being assembled — "now" for the lead-time rule. */
  assembledAt: Date;
}

export interface ExtraSelection {
  product: ProductRow;
  rate: ProductRateRow;
  childBands: ChildBandRow[];
  eligibility: EligibilityRow[];
  quantity: number;
}

// ---------------------------------------------------------------------------
// What assembly produces
// ---------------------------------------------------------------------------

/**
 * A line in the package, shaped to become a quote_items row.
 * unitCost/unitSell are exact — never rounded.
 */
export interface PackageComponent {
  productId: string | null;
  rateId: string | null;
  propertyId: string | null;
  description: string;
  descriptionAr: string | null;
  dateFrom: IsoDate | null;
  dateTo: IsoDate | null;
  quantity: number;
  unitCost: number;
  unitSell: number;
  sourcing: SourcingType;
  /**
   * How the price was derived — band per guest, markup applied, nights.
   * Written to quote_items.pricing_detail so the price can be explained
   * months later against rates that may since have been superseded.
   */
  pricingDetail: Record<string, unknown>;
  isRefundable: boolean | null;
  freeCancelUntil: string | null;
}

/** One "payable at the property" line, bilingual by construction. */
export interface PayableAtPropertyLine {
  feeType: Enums['fee_type'];
  description: string;
  descriptionAr: string;
  amount: number;
  currency: string;
}

/**
 * A task assembly wants raised. Assembly itself writes nothing — the caller
 * persists these alongside the quote in the same transaction.
 */
export interface AssemblyTaskRequest {
  type: TaskType;
  priority: TaskPriority;
  summary: string;
  context: Record<string, unknown>;
}

/**
 * The finished package. Maps onto a quotes row plus its quote_items.
 *
 * `sellable` is false when a blocking gap was found (missing fee rules,
 * unknown tax treatment on a component that needs it priced). A non-sellable
 * package still carries its components and tasks — the operator queue needs
 * to show what was attempted and why it stopped.
 */
export interface AssembledPackage {
  sellable: boolean;

  components: PackageComponent[];

  /** Exact sums before rounding. */
  totalCost: number;
  totalSellExact: number;

  /** total_sell as charged: exact, rounded UP to the brand increment. */
  totalSell: number;
  /** totalSell - totalSellExact. Retained as margin; >= 0 always. */
  roundingDelta: number;

  marginPct: number | null;
  /** True when marginPct fell below brands.margin_floor_pct. */
  belowMarginFloor: boolean;

  payableAtProperty: number;
  payableAtPropertyBreakdown: PayableAtPropertyLine[];

  /**
   * Extras that were asked for and refused, with the reason. Never silently
   * dropped — the front end asked for them because the customer did.
   */
  excludedExtras: ExcludedExtra[];

  tasks: AssemblyTaskRequest[];
}

export interface ExcludedExtra {
  productId: string;
  productName: string;
  reason: 'not_eligible' | 'lead_time' | 'outside_rate_validity' | 'inactive';
  detail: string;
}
