/**
 * Premium Staycations — Phase 1
 * The supplier layer's front door.
 *
 * Callers import from here and receive whichever adapter SUPPLIER_ADAPTER
 * names. Nothing outside this directory imports a concrete adapter class —
 * that is the discipline that keeps WebBeds swappable for the mock in every
 * test and every environment.
 */

import type { SupplierAdapter } from './adapter';
import { MockAdapter } from './mock/adapter';
import { WebBedsAdapter } from './webbeds/adapter';

export type { SupplierAdapter } from './adapter';
export * from './errors';
export * from './types';
export { propertyContentGaps, isSellable } from './content';
export type { ContentGapSeverity, PropertyContentGap } from './content';
export { MockAdapter, MOCK_ADAPTER_NAME } from './mock/adapter';
export { SCENARIO_IDS } from './mock/scenarios';
export {
  WebBedsAdapter,
  WebBedsNotCertifiedError,
  WEBBEDS_ADAPTER_NAME,
} from './webbeds/adapter';

/**
 * Construct the adapter the environment names.
 *
 * An unrecognised or missing value throws rather than defaulting to the mock.
 * The nightmare misconfiguration is production quietly serving mock inventory
 * — bookings against rooms that do not exist, sold to real customers — and a
 * loud crash at startup is cheap insurance against it.
 */
export function createSupplierAdapter(
  env: Record<string, string | undefined> = process.env,
): SupplierAdapter {
  const which = env.SUPPLIER_ADAPTER;

  switch (which) {
    case 'mock':
      return new MockAdapter();

    case 'webbeds':
      return new WebBedsAdapter({
        apiUrl: env.WEBBEDS_API_URL ?? '',
        username: env.WEBBEDS_USERNAME ?? '',
        password: env.WEBBEDS_PASSWORD ?? '',
      });

    case undefined:
    case '':
      throw new Error(
        'SUPPLIER_ADAPTER is not set. Set it to "mock" or "webbeds" in ' +
          '.env.local — see .env.local.example.',
      );

    default:
      throw new Error(
        `SUPPLIER_ADAPTER is "${which}", which is not an adapter. ` +
          'Valid values: "mock", "webbeds".',
      );
  }
}
