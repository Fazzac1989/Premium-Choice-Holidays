/**
 * Premium Staycations — Phase 1
 * Supplier failures, classified.
 *
 * The classification matters more than any individual error type, because it
 * decides what the booking path does next:
 *
 *   deterministic   — sold out, price moved, invalid guest. Retrying cannot
 *                     change the answer. Go straight to failed_rollback with
 *                     no backoff.
 *
 *   indeterminate   — timeout, 5xx, connection reset. We do not know whether
 *                     the supplier created a booking. Never retry blind:
 *                     reconcile with findByReference(idempotencyKey) first,
 *                     because the attempt may have succeeded server-side after
 *                     our socket gave up.
 *
 * Getting this backwards is expensive in both directions. Treating an
 * indeterminate failure as deterministic strands a real supplier booking that
 * nobody is watching; treating a deterministic one as indeterminate burns the
 * retry budget on an answer that will not change while the customer waits.
 *
 * The class is the enum from the schema, so an error can be written straight
 * to external_bookings.failure_class.
 */

import type { SupplierFailureClass } from './types';

export interface SupplierErrorContext {
  adapter: string;
  /** Present whenever the failure happened during a book() attempt. */
  idempotencyKey?: string;
  /** The supplier's own error code, where it gave one. */
  supplierCode?: string;
  raw?: unknown;
}

export abstract class SupplierError extends Error {
  abstract readonly failureClass: SupplierFailureClass;

  readonly adapter: string;
  readonly idempotencyKey?: string;
  readonly supplierCode?: string;
  readonly raw?: unknown;

  constructor(message: string, context: SupplierErrorContext) {
    super(message);
    this.name = new.target.name;
    this.adapter = context.adapter;
    this.idempotencyKey = context.idempotencyKey;
    this.supplierCode = context.supplierCode;
    this.raw = context.raw;
  }
}

// ---------------------------------------------------------------------------
// Deterministic — the answer will not change on retry
// ---------------------------------------------------------------------------

/** The room went between quote and book. Someone else took the last one. */
export class SoldOutError extends SupplierError {
  readonly failureClass = 'deterministic' as const;
}

/**
 * The supplier will still sell the room, at a different price.
 *
 * Both figures are carried because the decision is commercial, not technical:
 * a small rise inside the brand's margin floor may be absorbable, a large one
 * is a re-quote. Neither this class nor the adapter makes that call.
 */
export class PriceMovedError extends SupplierError {
  readonly failureClass = 'deterministic' as const;

  constructor(
    message: string,
    readonly quotedNetCost: number,
    readonly currentNetCost: number,
    readonly currency: string,
    context: SupplierErrorContext,
  ) {
    super(message, context);
  }
}

/** The supplier rejected the guest details — missing lead name, bad DOB, and so on. */
export class InvalidGuestError extends SupplierError {
  readonly failureClass = 'deterministic' as const;
}

// ---------------------------------------------------------------------------
// Indeterminate — the booking may or may not exist at the supplier
// ---------------------------------------------------------------------------

/**
 * We stopped waiting. That is all this means.
 *
 * It carries no information about whether the supplier acted, which is exactly
 * why the reconciliation step exists.
 */
export class SupplierTimeoutError extends SupplierError {
  readonly failureClass = 'indeterminate' as const;
}

/** 5xx, connection reset, DNS failure — the request may have been processed. */
export class SupplierUnavailableError extends SupplierError {
  readonly failureClass = 'indeterminate' as const;

  constructor(
    message: string,
    context: SupplierErrorContext & { httpStatus?: number },
  ) {
    super(message, context);
    this.httpStatus = context.httpStatus;
  }

  readonly httpStatus?: number;
}

// ---------------------------------------------------------------------------

/**
 * True when the caller must reconcile before retrying.
 *
 * Anything that is not a SupplierError is treated as indeterminate. An
 * unrecognised failure is not evidence that nothing happened, and the safe
 * reading of "we do not know" is to go and look.
 */
export function requiresReconciliation(error: unknown): boolean {
  if (error instanceof SupplierError) {
    return error.failureClass === 'indeterminate';
  }
  return true;
}

export function failureClassOf(error: unknown): SupplierFailureClass {
  return error instanceof SupplierError ? error.failureClass : 'indeterminate';
}
