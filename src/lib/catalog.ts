/**
 * Premium Staycations — Phase 2a
 * The public catalogue read layer.
 *
 * The ONLY place the customer site reads the database, and it reads through
 * the service client because `anon` holds no grants — the Phase 1 rule that
 * the public has no direct database surface survives the public site. Every
 * function here selects named, published fields; nothing returns a raw row.
 *
 * Scenario properties (SCN-*) exist so staff can reproduce failures on
 * demand. They must never be sold to a customer, so exclusion happens here,
 * in one place, and a test pins it.
 */

import 'server-only';

import { createServiceClient } from '@/lib/supabase/service';
import { isPublicProperty } from './catalog-rules';
import type { Emirate } from '@/lib/suppliers';

export interface PublicProperty {
  id: string;
  externalPropertyId: string;
  name: string;
  nameAr: string | null;
  emirate: Emirate;
  area: string | null;
  starRating: number | null;
  description: string | null;
  descriptionAr: string | null;
}

export async function listPublicProperties(): Promise<PublicProperty[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from('properties')
    .select(
      'id, external_property_id, name, emirate, area, star_rating, property_overrides(name_ar, description, description_ar)',
    )
    .order('emirate')
    .order('star_rating', { ascending: false });
  if (error) throw new Error(`catalogue read failed: ${error.message}`);

  return data
    .filter((row) => isPublicProperty(row.external_property_id))
    .map((row) => ({
      id: row.id,
      externalPropertyId: row.external_property_id,
      name: row.name,
      nameAr: row.property_overrides?.name_ar ?? null,
      emirate: row.emirate,
      area: row.area,
      starRating: row.star_rating,
      description: row.property_overrides?.description ?? null,
      descriptionAr: row.property_overrides?.description_ar ?? null,
    }));
}

export async function getPublicProperty(id: string): Promise<PublicProperty | null> {
  const all = await listPublicProperties();
  return all.find((property) => property.id === id) ?? null;
}

/** A strings-table row, for locked legal copy on public pages. */
export async function getString(
  key: string,
): Promise<{ en: string; ar: string | null } | null> {
  const service = createServiceClient();
  const { data } = await service
    .from('strings')
    .select('en, ar')
    .eq('key', key)
    .maybeSingle();
  return data;
}
