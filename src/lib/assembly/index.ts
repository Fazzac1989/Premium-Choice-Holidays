/**
 * Premium Staycations — Phase 1
 * The assembly service's front door.
 */

export * from './types';
export { resolveMarkupPct, applyMarkup, round2 } from './markup';
export { computeFees, feesForProperty, type FeeBasis, type FeeComputation } from './fees';
export {
  ageAt,
  checkInMoment,
  commercialPriority,
  eligibilityMatches,
  isEligible,
  isWithinLeadTime,
  leadTimeHoursRemaining,
  pricePerPersonExtra,
  type ExtraPricing,
  type GuestPrice,
} from './extras';
export { assemblePackage, roundUpToIncrement, type AssemblyRules } from './assemble';
export {
  executeSupplierBooking,
  idempotencyKeyFor,
  type ApiComponent,
  type BookingOutcome,
  type BookingRun,
  type BookingStore,
  type BookingTransition,
  type ContractedComponent,
  type OrchestratorOptions,
} from './booking/orchestrator';
export { InMemoryBookingStore, type RecordedTask } from './booking/store.memory';
