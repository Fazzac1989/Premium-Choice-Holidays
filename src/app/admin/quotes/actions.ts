'use server';

/**
 * Premium Staycations — Phase 1
 * Quote building.
 *
 * previewQuote and saveQuote run the same assembly; the client only ever
 * sends the request (property, dates, party, extras) and only ever receives
 * the result. Prices never round-trip through the browser — a tampered
 * preview changes nothing because saving re-assembles from rows.
 *
 * Writes go through the user-session client: quotes are admin-writable by
 * policy, so an operator pressing Save gets the database's refusal, not a
 * UI simulation of it.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { assemblePackage } from '@/lib/assembly';
import {
  loadAssemblyRules,
  loadExtraSelections,
  loadPropertyFacts,
} from '@/lib/assembly/loaders';
import type { AssembledPackage, GuestSpec } from '@/lib/assembly';
import { ageAt } from '@/lib/assembly';
import { createSupplierAdapter, type StayQuote } from '@/lib/suppliers';
import { createUserClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

const guestSchema = z.object({
  fullName: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  isLead: z.boolean(),
});

const quoteRequestSchema = z.object({
  propertyId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rooms: z.number().int().min(1).max(9),
  guests: z.array(guestSchema).min(1),
  /** product_rates ids ticked in the builder. */
  rateIds: z.array(z.string().uuid()),
});

export type QuoteRequestInput = z.infer<typeof quoteRequestSchema>;

export interface QuotePreview {
  ok: true;
  package: AssembledPackage;
  stay: StayQuote;
}

export interface QuoteFailure {
  ok: false;
  error: string;
}

async function assembleFromInput(
  input: QuoteRequestInput,
): Promise<QuotePreview | QuoteFailure> {
  const parsed = quoteRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' };
  }
  const request = parsed.data;

  const supabase = await createUserClient();

  const property = await loadPropertyFacts(supabase, request.propertyId);
  if (!property) return { ok: false, error: 'Property not found in the cache.' };

  const { data: brand } = await supabase.from('brands').select('*').limit(1).maybeSingle();
  if (!brand) {
    return { ok: false, error: 'No brand exists yet. Create one under Settings first.' };
  }

  const guests: GuestSpec[] = request.guests;
  const adults = guests.filter(
    (g) => g.dateOfBirth === null || ageAt(g.dateOfBirth, request.checkIn) >= 18,
  );
  const childAges = guests
    .filter((g) => g.dateOfBirth !== null && ageAt(g.dateOfBirth, request.checkIn) < 18)
    .map((g) => ageAt(g.dateOfBirth!, request.checkIn));

  const adapter = createSupplierAdapter();
  let stays: StayQuote[];
  try {
    stays = await adapter.search({
      externalPropertyId: property.externalPropertyId,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      rooms: request.rooms,
      adults: Math.max(adults.length, 1),
      childAges,
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  if (stays.length === 0) {
    return { ok: false, error: 'The supplier returned no availability for this stay.' };
  }
  const stay = stays[0];

  const [rules, allSelections] = await Promise.all([
    loadAssemblyRules(supabase),
    loadExtraSelections(supabase),
  ]);
  const extras = allSelections.filter((s) => request.rateIds.includes(s.rate.id));

  const pkg = assemblePackage(
    {
      brand,
      property,
      stay,
      guests,
      extras,
      assembledAt: new Date(),
    },
    rules,
  );

  return { ok: true, package: pkg, stay };
}

export async function previewQuote(
  input: QuoteRequestInput,
): Promise<QuotePreview | QuoteFailure> {
  return assembleFromInput(input);
}

export async function saveQuote(
  input: QuoteRequestInput,
): Promise<{ ok: true; quoteId: string } | QuoteFailure> {
  const result = await assembleFromInput(input);
  if (!result.ok) return result;
  const { package: pkg, stay } = result;

  const supabase = await createUserClient();
  const { data: brand } = await supabase.from('brands').select('id').limit(1).single();

  type Json = Database['public']['Tables']['quotes']['Row']['payable_at_property_breakdown'];

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert({
      brand_id: brand!.id,
      status: 'draft',
      total_cost: pkg.totalCost,
      total_sell: pkg.totalSell,
      rounding_delta: pkg.roundingDelta,
      payable_at_property: pkg.payableAtProperty,
      payable_at_property_breakdown: pkg.payableAtPropertyBreakdown as unknown as Json,
      valid_until: validUntil(),
    })
    .select('id')
    .single();
  if (quoteError) {
    return { ok: false, error: `Could not save the quote: ${quoteError.message}` };
  }

  const itemsError = await insertItems(supabase, quote.id, pkg, stay, input.guests);
  if (itemsError) return { ok: false, error: itemsError };

  // The tasks assembly raised persist with the quote — an unsellable package
  // is saved AND flagged, not silently dropped.
  for (const task of pkg.tasks) {
    const { error } = await supabase.from('tasks').insert({
      quote_id: quote.id,
      type: task.type,
      priority: task.priority,
      summary: task.summary,
      context: task.context as Json,
      raised_by: 'human:quote_builder',
    });
    if (error) return { ok: false, error: `Task insert failed: ${error.message}` };
  }

  revalidatePath('/admin/quotes');
  return { ok: true, quoteId: quote.id };
}

async function insertItems(
  supabase: Awaited<ReturnType<typeof createUserClient>>,
  quoteId: string,
  pkg: AssembledPackage,
  stay: StayQuote,
  guests: GuestSpec[],
): Promise<string | null> {
  type Json = Database['public']['Tables']['quote_items']['Row']['pricing_detail'];

  for (const component of pkg.components) {
    const isRoom = component.sourcing === 'api';
    const pricingDetail = isRoom
      ? // The room item carries the full supplier quote and the guest specs:
        // the booking runner re-derives its book() call from these rather
        // than re-searching, so the price booked is the price quoted.
        { ...component.pricingDetail, supplierQuote: stay, guests }
      : component.pricingDetail;

    const { error } = await supabase.from('quote_items').insert({
      quote_id: quoteId,
      product_id: component.productId,
      rate_id: component.rateId,
      property_id: component.propertyId,
      description: component.description,
      description_ar: component.descriptionAr,
      date_from: component.dateFrom,
      date_to: component.dateTo,
      quantity: component.quantity,
      unit_cost: component.unitCost,
      unit_sell: component.unitSell,
      sourcing: component.sourcing,
      pricing_detail: pricingDetail as unknown as Json,
      is_refundable: component.isRefundable,
      free_cancel_until: component.freeCancelUntil,
    });
    if (error) return `Quote item insert failed: ${error.message}`;
  }
  return null;
}

function validUntil(): string {
  const date = new Date(Date.now() + 7 * 86_400_000);
  return date.toISOString().slice(0, 10);
}
