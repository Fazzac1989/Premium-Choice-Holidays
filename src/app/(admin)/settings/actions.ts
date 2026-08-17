'use server';

/**
 * Premium Staycations — Phase 1
 * Settings: brands, markup rules, locked strings.
 *
 * All through the user-session client — these are admin-writable tables and
 * RLS is the enforcement. Markup rules follow the supersede discipline from
 * migration 03: never edited in place, closed off and succeeded, so "what
 * markup did we apply on 3 June" stays answerable.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createUserClient } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

const brandSchema = z.object({
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  domain: z.string().min(1),
  fromEmail: z.string().email(),
});

export async function createBrand(
  input: z.infer<typeof brandSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid brand input.' };

  const supabase = await createUserClient();
  const { error } = await supabase.from('brands').insert({
    slug: parsed.data.slug,
    name: parsed.data.name,
    domain: parsed.data.domain,
    from_email: parsed.data.fromEmail,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Markup rules — supersede, never edit
// ---------------------------------------------------------------------------

const markupSchema = z.object({
  brandId: z.string().uuid(),
  sourcing: z.enum(['api', 'contracted']),
  productType: z
    .enum(['accommodation', 'attraction', 'dining', 'experience', 'wellness', 'transfer'])
    .nullable(),
  markupPct: z.number().min(0).max(499),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function createMarkupRule(
  input: z.infer<typeof markupSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = markupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid markup rule input.' };
  const rule = parsed.data;

  const supabase = await createUserClient();

  // Close the incumbent the day before the successor starts. The exclusion
  // constraint would reject the overlap anyway; closing it here makes the
  // supersede explicit instead of an error.
  const incumbentQuery = supabase
    .from('markup_rules')
    .select('id, effective_from')
    .eq('brand_id', rule.brandId)
    .eq('sourcing', rule.sourcing)
    .is('effective_to', null);
  const { data: incumbents, error: findError } =
    rule.productType === null
      ? await incumbentQuery.is('product_type', null)
      : await incumbentQuery.eq('product_type', rule.productType);
  if (findError) return { ok: false, error: findError.message };

  for (const incumbent of incumbents ?? []) {
    if (incumbent.effective_from >= rule.effectiveFrom) {
      return {
        ok: false,
        error:
          'The new rule starts on or before the incumbent does. Pick a later ' +
          'effective date; history is never rewritten.',
      };
    }
    const closeOn = dayBefore(rule.effectiveFrom);
    const { error } = await supabase
      .from('markup_rules')
      .update({ effective_to: closeOn })
      .eq('id', incumbent.id);
    if (error) return { ok: false, error: error.message };
  }

  const { error: insertError } = await supabase.from('markup_rules').insert({
    brand_id: rule.brandId,
    sourcing: rule.sourcing,
    product_type: rule.productType,
    markup_pct: rule.markupPct,
    effective_from: rule.effectiveFrom,
  });
  if (insertError) return { ok: false, error: insertError.message };

  revalidatePath('/settings');
  return { ok: true };
}

function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Date(date.getTime() - 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Strings — locked copy goes through the RPC, nothing else will work
// ---------------------------------------------------------------------------

export async function updateString(
  key: string,
  en: string,
  ar: string | null,
  locked: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createUserClient();

  if (locked) {
    // admin_update_locked_string() is the only sanctioned path. It checks the
    // caller's role itself and records the edit in agent_actions.
    const { error } = await supabase.rpc('admin_update_locked_string', {
      p_key: key,
      p_en: en,
      p_ar: ar ?? undefined,
    });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from('strings')
      .update({ en, ar })
      .eq('key', key);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/settings');
  return { ok: true };
}
