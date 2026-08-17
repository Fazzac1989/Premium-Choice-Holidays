/**
 * Premium Staycations — Phase 1
 * The loaders: the only place assembly meets the database on the read side.
 *
 * Everything returns rows for the pure engine. Reads go through the caller's
 * client — pass the user-session client so RLS applies; the rule tables are
 * staff-readable, so both roles can price a package, and only what the access
 * model grants can be written back.
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { AssemblyRules } from './assemble';
import type { ExtraSelection, PropertyFacts } from './types';

type Client = SupabaseClient<Database>;

export async function loadAssemblyRules(supabase: Client): Promise<AssemblyRules> {
  const [markup, fees] = await Promise.all([
    supabase.from('markup_rules').select('*'),
    supabase.from('property_fees').select('*'),
  ]);
  if (markup.error) throw new Error(`markup_rules load failed: ${markup.error.message}`);
  if (fees.error) throw new Error(`property_fees load failed: ${fees.error.message}`);
  return { markupRules: markup.data, feeRules: fees.data };
}

export async function loadPropertyFacts(
  supabase: Client,
  propertyId: string,
): Promise<PropertyFacts | null> {
  const { data, error } = await supabase
    .from('properties')
    .select('id, external_property_id, name, emirate, area, star_rating, check_in_time')
    .eq('id', propertyId)
    .maybeSingle();
  if (error) throw new Error(`property load failed: ${error.message}`);
  if (!data) return null;

  return {
    id: data.id,
    externalPropertyId: data.external_property_id,
    name: data.name,
    emirate: data.emirate,
    area: data.area,
    starRating: data.star_rating,
    checkInTime: data.check_in_time?.slice(0, 5) ?? null,
  };
}

/**
 * Every active product with its rates, bands and eligibility, ready for
 * selection. Assembly itself decides eligibility and validity — the loader
 * does not pre-filter, so the quote builder can show WHY an extra was
 * excluded rather than silently not offering it.
 */
export async function loadExtraSelections(supabase: Client): Promise<ExtraSelection[]> {
  const { data: products, error } = await supabase
    .from('products')
    .select('*, product_rates(*, product_rate_child_bands(*)), extra_eligibility(*)')
    .eq('active', true)
    .neq('type', 'accommodation');
  if (error) throw new Error(`products load failed: ${error.message}`);

  const selections: ExtraSelection[] = [];
  for (const product of products) {
    const { product_rates, extra_eligibility, ...productRow } = product;
    // One selection per rate row; assembly checks validity windows itself.
    for (const rate of product_rates) {
      const { product_rate_child_bands, ...rateRow } = rate;
      selections.push({
        product: productRow,
        rate: rateRow,
        childBands: product_rate_child_bands,
        eligibility: extra_eligibility,
        quantity: 1,
      });
    }
  }
  return selections;
}
