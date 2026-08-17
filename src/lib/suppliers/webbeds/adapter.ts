/**
 * Premium Staycations — Phase 1
 * The WebBeds adapter. A shape, not an implementation.
 *
 * This exists so the seam is real — the factory constructs it, the type
 * checker holds it to the same contract as the mock, and switching
 * SUPPLIER_ADAPTER exercises the whole path up to the first call. It stays
 * this way until WebBeds certification, which is where the open questions get
 * answered, and the biggest one is written into the mock: whether a replayed
 * idempotency key is honoured or double-books. See the MockAdapter header —
 * the mock assumes it double-books, and that assumption is only removable
 * with certification evidence.
 *
 * Every method throws before any network call, so misconfiguration surfaces
 * as one unambiguous error and not as a half-working integration.
 */

import type { SupplierAdapter } from '../adapter';
import type {
  ExternalBooking,
  Guest,
  PropertyContent,
  StayQuote,
  StaySearch,
} from '../types';

export const WEBBEDS_ADAPTER_NAME = 'webbeds';

export interface WebBedsConfig {
  apiUrl: string;
  username: string;
  password: string;
}

export class WebBedsNotCertifiedError extends Error {
  constructor(method: string) {
    super(
      `WebBedsAdapter.${method}: not implemented. WebBeds certification has ` +
        'not been completed. Set SUPPLIER_ADAPTER=mock, or implement this ' +
        'adapter against the certification environment.',
    );
    this.name = 'WebBedsNotCertifiedError';
  }
}

export class WebBedsAdapter implements SupplierAdapter {
  readonly name = WEBBEDS_ADAPTER_NAME;

  constructor(private readonly config: WebBedsConfig) {
    const missing = (['apiUrl', 'username', 'password'] as const).filter(
      (key) => !config[key],
    );
    if (missing.length > 0) {
      throw new Error(
        `WebBedsAdapter is missing configuration: ${missing.join(', ')}. ` +
          'Set WEBBEDS_API_URL, WEBBEDS_USERNAME and WEBBEDS_PASSWORD, or use ' +
          'SUPPLIER_ADAPTER=mock.',
      );
    }
  }

  async listProperties(): Promise<PropertyContent[]> {
    throw new WebBedsNotCertifiedError('listProperties');
  }

  async getProperty(_externalPropertyId: string): Promise<PropertyContent | null> {
    throw new WebBedsNotCertifiedError('getProperty');
  }

  async search(_criteria: StaySearch): Promise<StayQuote[]> {
    throw new WebBedsNotCertifiedError('search');
  }

  async book(
    _quote: StayQuote,
    _guests: Guest[],
    _idempotencyKey: string,
  ): Promise<ExternalBooking> {
    throw new WebBedsNotCertifiedError('book');
  }

  async findByReference(_idempotencyKey: string): Promise<ExternalBooking | null> {
    throw new WebBedsNotCertifiedError('findByReference');
  }

  async cancel(_supplierRef: string, _reason: string): Promise<ExternalBooking> {
    throw new WebBedsNotCertifiedError('cancel');
  }
}
