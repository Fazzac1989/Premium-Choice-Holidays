import { describe, expect, it } from 'vitest';

import { createSupplierAdapter, MockAdapter, WebBedsAdapter } from './index';
import { WebBedsNotCertifiedError } from './webbeds/adapter';
import { propertyContentGaps, isSellable } from './content';
import type { PropertyContent } from './types';

// Env is passed explicitly rather than mutating process.env, so tests cannot
// leak configuration into each other.

describe('createSupplierAdapter', () => {
  it('builds the mock', () => {
    const adapter = createSupplierAdapter({ SUPPLIER_ADAPTER: 'mock' });
    expect(adapter).toBeInstanceOf(MockAdapter);
    expect(adapter.name).toBe('mock');
  });

  it('builds WebBeds when fully configured', () => {
    const adapter = createSupplierAdapter({
      SUPPLIER_ADAPTER: 'webbeds',
      WEBBEDS_API_URL: 'https://certification.example',
      WEBBEDS_USERNAME: 'u',
      WEBBEDS_PASSWORD: 'p',
    });
    expect(adapter).toBeInstanceOf(WebBedsAdapter);
    expect(adapter.name).toBe('webbeds');
  });

  it('refuses WebBeds with missing credentials, naming them', () => {
    expect(() =>
      createSupplierAdapter({
        SUPPLIER_ADAPTER: 'webbeds',
        WEBBEDS_API_URL: 'https://certification.example',
      }),
    ).toThrow(/username, password/);
  });

  it('refuses to default when SUPPLIER_ADAPTER is unset', () => {
    // The nightmare is production quietly serving mock inventory. Loud crash.
    expect(() => createSupplierAdapter({})).toThrow(
      /SUPPLIER_ADAPTER is not set/,
    );
  });

  it('refuses an unrecognised adapter name', () => {
    expect(() =>
      createSupplierAdapter({ SUPPLIER_ADAPTER: 'webeds' }),
    ).toThrow(/"webeds"/);
  });
});

describe('WebBedsAdapter before certification', () => {
  const adapter = new WebBedsAdapter({
    apiUrl: 'https://certification.example',
    username: 'u',
    password: 'p',
  });

  it('satisfies the interface but refuses every call by name', async () => {
    await expect(adapter.search({
      checkIn: '2026-05-05',
      checkOut: '2026-05-07',
      rooms: 1,
      adults: 2,
    })).rejects.toThrow(WebBedsNotCertifiedError);
    await expect(adapter.findByReference('any')).rejects.toThrow(/findByReference/);
  });
});

describe('content gap classification', () => {
  const complete: PropertyContent = {
    externalPropertyId: 'X-1',
    name: 'Complete Hotel',
    emirate: 'dubai',
    area: 'Downtown Dubai',
    starRating: 5,
    checkInTime: '15:00',
    checkOutTime: '12:00',
    latitude: null,
    longitude: null,
    raw: {},
  };

  it('finds nothing wrong with complete content', () => {
    expect(propertyContentGaps(complete)).toHaveLength(0);
    expect(isSellable(complete)).toBe(true);
  });

  it('blocks sale on a missing star rating, which selects the Tourism Dirham band', () => {
    const gaps = propertyContentGaps({ ...complete, starRating: null });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ field: 'starRating', severity: 'blocking' });
    expect(isSellable({ ...complete, starRating: null })).toBe(false);
  });

  it('degrades but still sells on a missing area or check-in time', () => {
    const degraded = { ...complete, area: null, checkInTime: null };
    const gaps = propertyContentGaps(degraded);
    expect(gaps).toHaveLength(2);
    expect(gaps.every((gap) => gap.severity === 'degraded')).toBe(true);
    expect(isSellable(degraded)).toBe(true);
  });
});
