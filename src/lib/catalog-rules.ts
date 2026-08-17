/**
 * Premium Staycations — Phase 2a
 * Pure catalogue rules, split from the loader so they can be tested without
 * a server context.
 */

/**
 * Scenario properties are staff tooling — bookable from the admin UI to
 * reproduce supplier failures, never sellable to the public. If this test
 * ever fails, a customer can book "Scenario Hotel — Times Out".
 */
export function isPublicProperty(externalPropertyId: string): boolean {
  return !externalPropertyId.startsWith('SCN-');
}
