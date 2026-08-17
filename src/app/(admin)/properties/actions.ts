'use server';

/**
 * Premium Staycations — Phase 1
 * Properties cache sync.
 *
 * The cache is service-key territory — no staff role holds a write policy on
 * `properties`, so this is one of the two sanctioned service-client paths.
 * The service key bypasses RLS, which is exactly why the action re-checks the
 * caller's role itself before touching anything.
 */

import { revalidatePath } from 'next/cache';

import { createSupplierAdapter } from '@/lib/suppliers';
import { createServiceClient } from '@/lib/supabase/service';
import { currentProfile } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export async function syncProperties(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  const profile = await currentProfile();
  if (!profile || profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin may refresh the properties cache.' };
  }

  const adapter = createSupplierAdapter();
  const properties = await adapter.listProperties();

  type Json = Database['public']['Tables']['properties']['Row']['content'];
  const service = createServiceClient();

  // Upsert on (adapter, external_property_id): supplier content is refreshed
  // in place, and property_overrides survives untouched by design.
  const { error } = await service.from('properties').upsert(
    properties.map((p) => ({
      adapter: adapter.name,
      external_property_id: p.externalPropertyId,
      name: p.name,
      emirate: p.emirate,
      area: p.area,
      star_rating: p.starRating,
      check_in_time: p.checkInTime,
      check_out_time: p.checkOutTime,
      latitude: p.latitude,
      longitude: p.longitude,
      content: p.raw as Json,
      cached_at: new Date().toISOString(),
    })),
    { onConflict: 'adapter,external_property_id' },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath('/properties');
  return { ok: true, count: properties.length };
}
