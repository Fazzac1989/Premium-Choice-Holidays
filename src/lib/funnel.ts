/**
 * Premium Staycations — Phase 2a
 * The funnel's assembly step, shared by the package page and checkout.
 *
 * One function turns a customer's search into a priced package, so the page
 * that displays the price and the action that persists it cannot disagree.
 * Prices never round-trip through the browser: checkout re-runs this from
 * the same inputs and saves what IT computes, not what the page showed.
 */

import 'server-only';

import { z } from 'zod';

import { assemblePackage, ageAt } from '@/lib/assembly';
import type { AssembledPackage, ExtraSelection, GuestSpec, PropertyFacts } from '@/lib/assembly';
import {
  loadAssemblyRules,
  loadExtraSelections,
  loadPropertyFacts,
} from '@/lib/assembly/loaders';
import { isPublicProperty } from '@/lib/catalog-rules';
import { createSupplierAdapter, type StayQuote } from '@/lib/suppliers';
import { createServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/types/database';

export const staySearchSchema = z.object({
  propertyId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rooms: z.coerce.number().int().min(1).max(4),
  adults: z.coerce.number().int().min(1).max(8),
  /** Comma-separated YYYY-MM-DD, one per child. */
  childDobs: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(,\d{4}-\d{2}-\d{2})*$/)
    .optional(),
  /** Comma-separated product_rates ids the customer ticked. */
  rateIds: z.string().optional(),
});

export type StaySearchInput = z.infer<typeof staySearchSchema>;

export interface FunnelPackage {
  property: PropertyFacts;
  brand: Database['public']['Tables']['brands']['Row'];
  stay: StayQuote;
  guests: GuestSpec[];
  /** Every catalogue extra, assembled — for display with include flags. */
  package: AssembledPackage;
  /** The selections that were actually included (matched rateIds). */
  chosenRateIds: string[];
}

export type FunnelResult =
  | { ok: true; value: FunnelPackage }
  | { ok: false; reason: 'invalid' | 'not_found' | 'no_availability'; detail?: string };

/**
 * Placeholder guests for pricing. Adults are interchangeable for pricing
 * purposes; children carry their DOB because the band resolves at check-in.
 * Checkout replaces the names, never the shape.
 */
export function guestsFromSearch(input: {
  adults: number;
  childDobs?: string;
  checkIn: string;
}): GuestSpec[] {
  const guests: GuestSpec[] = [];
  for (let i = 1; i <= input.adults; i += 1) {
    guests.push({ fullName: `Adult ${i}`, dateOfBirth: null, isLead: i === 1 });
  }
  const dobs = input.childDobs ? input.childDobs.split(',') : [];
  dobs.forEach((dob, index) => {
    guests.push({ fullName: `Child ${index + 1}`, dateOfBirth: dob, isLead: false });
  });
  return guests;
}

export async function assembleFunnelPackage(
  raw: Record<string, string | undefined>,
): Promise<FunnelResult> {
  const parsed = staySearchSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: 'invalid', detail: parsed.error.issues[0]?.message };
  }
  const input = parsed.data;

  // Sanity on dates before anything reaches the adapter.
  if (input.checkOut <= input.checkIn) {
    return { ok: false, reason: 'invalid', detail: 'check-out before check-in' };
  }
  // Children must actually be children on the check-in date.
  for (const dob of input.childDobs?.split(',') ?? []) {
    if (ageAt(dob, input.checkIn) >= 18 || ageAt(dob, input.checkIn) < 0) {
      return { ok: false, reason: 'invalid', detail: 'child date of birth out of range' };
    }
  }

  const service = createServiceClient();

  const property = await loadPropertyFacts(service, input.propertyId);
  if (!property || !isPublicProperty(property.externalPropertyId)) {
    return { ok: false, reason: 'not_found' };
  }

  const { data: brand } = await service.from('brands').select('*').limit(1).maybeSingle();
  if (!brand) return { ok: false, reason: 'not_found', detail: 'no brand' };

  const guests = guestsFromSearch(input);
  const childAges = guests
    .filter((g) => g.dateOfBirth !== null)
    .map((g) => ageAt(g.dateOfBirth!, input.checkIn));

  const adapter = createSupplierAdapter();
  let stays: StayQuote[];
  try {
    stays = await adapter.search({
      externalPropertyId: property.externalPropertyId,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rooms: input.rooms,
      adults: input.adults,
      childAges,
    });
  } catch {
    return { ok: false, reason: 'no_availability' };
  }
  if (stays.length === 0) return { ok: false, reason: 'no_availability' };
  const stay = stays[0];

  const [rules, allSelections] = await Promise.all([
    loadAssemblyRules(service),
    loadExtraSelections(service),
  ]);

  // The page shows every eligible extra priced; the chosen set is what the
  // package actually includes. Assembly runs over the chosen set so totals,
  // margin and tasks reflect what would be bought.
  const chosenRateIds = input.rateIds ? input.rateIds.split(',') : [];
  const chosen: ExtraSelection[] = allSelections.filter((s) =>
    chosenRateIds.includes(s.rate.id),
  );

  const pkg = assemblePackage(
    { brand, property, stay, guests, extras: chosen, assembledAt: new Date() },
    rules,
  );

  return {
    ok: true,
    value: { property, brand, stay, guests, package: pkg, chosenRateIds },
  };
}

/**
 * Price every catalogue extra against a stay, for the add-ons list. Runs
 * assembly per extra so eligibility, lead time and band pricing all apply;
 * an extra that comes back excluded is simply not offered — the admin sees
 * reasons, the customer sees a shorter list.
 */
export async function priceAllExtras(
  raw: Record<string, string | undefined>,
): Promise<
  {
    rateId: string;
    name: string;
    nameAr: string | null;
    totalSell: number;
    perGuest: { band: string; sell: number }[];
  }[]
> {
  const parsed = staySearchSchema.safeParse(raw);
  if (!parsed.success) return [];
  const input = parsed.data;

  const service = createServiceClient();
  const property = await loadPropertyFacts(service, input.propertyId);
  const { data: brand } = await service.from('brands').select('*').limit(1).maybeSingle();
  if (!property || !brand) return [];

  const guests = guestsFromSearch(input);
  const [rules, allSelections] = await Promise.all([
    loadAssemblyRules(service),
    loadExtraSelections(service),
  ]);

  const adapter = createSupplierAdapter();
  const stays = await adapter.search({
    externalPropertyId: property.externalPropertyId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    rooms: input.rooms,
    adults: input.adults,
  });
  if (stays.length === 0) return [];

  const offers: {
    rateId: string;
    name: string;
    nameAr: string | null;
    totalSell: number;
    perGuest: { band: string; sell: number }[];
  }[] = [];

  for (const selection of allSelections) {
    const pkg = assemblePackage(
      { brand, property, stay: stays[0], guests, extras: [selection], assembledAt: new Date() },
      rules,
    );
    const component = pkg.components.find((c) => c.rateId === selection.rate.id);
    if (!component) continue; // excluded: ineligible, lead time, validity

    const detail = component.pricingDetail as {
      perGuest?: { band: string; sell: number }[];
    };
    offers.push({
      rateId: selection.rate.id,
      name: selection.product.name,
      nameAr: selection.product.name_ar,
      totalSell: component.unitSell,
      perGuest: detail.perGuest ?? [],
    });
  }

  return offers;
}
