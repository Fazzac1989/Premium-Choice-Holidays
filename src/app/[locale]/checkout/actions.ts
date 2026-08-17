'use server';

/**
 * Premium Staycations — Phase 2a
 * The booking write — the funnel's biggest public write.
 *
 * Re-assembles the package server-side from the search inputs (the browser's
 * total is presentational), then persists the same artefacts the admin flow
 * persists: customer, quote + items + tasks, booking with guests, walked
 * draft → payment_pending through the real state machine. The room item
 * carries the supplier offer and guest specs in pricing_detail — the same
 * contract the admin runner relies on — so payment completion books the
 * price that was quoted.
 */

import { z } from 'zod';

import type { AssembledPackage, GuestSpec } from '@/lib/assembly';
import { assembleFunnelPackage, staySearchSchema } from '@/lib/funnel';
import type { StayQuote } from '@/lib/suppliers';
import { createServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/types/database';

const checkoutSchema = z.object({
  search: z.record(z.string(), z.string()),
  guests: z
    .array(
      z.object({
        fullName: z.string().min(1).max(200),
        dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
        isLead: z.boolean(),
      }),
    )
    .min(1)
    .max(17),
  email: z.string().email().max(320),
  phone: z.string().max(40).optional(),
  locale: z.enum(['en', 'ar']),
});

type Json = Database['public']['Tables']['quotes']['Row']['payable_at_property_breakdown'];

export async function createFunnelBooking(
  input: z.infer<typeof checkoutSchema>,
): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid checkout details.' };
  const { search, guests, email, phone, locale } = parsed.data;

  // Exactly one lead, and the guest count must match what was priced.
  if (guests.filter((guest) => guest.isLead).length !== 1) {
    return { ok: false, error: 'Exactly one lead guest is required.' };
  }
  const searchParsed = staySearchSchema.safeParse(search);
  if (!searchParsed.success) return { ok: false, error: 'Invalid stay.' };
  const expectedGuests =
    searchParsed.data.adults +
    (searchParsed.data.childDobs ? searchParsed.data.childDobs.split(',').length : 0);
  if (guests.length !== expectedGuests) {
    return { ok: false, error: 'Guest list does not match the stay.' };
  }

  // Re-assemble. The browser sent inputs, not prices.
  const result = await assembleFunnelPackage(search);
  if (!result.ok) return { ok: false, error: 'The stay could not be re-priced.' };
  const { brand, property, stay, package: pkg } = result.value;
  if (!pkg.sellable) {
    return { ok: false, error: 'This stay can no longer be booked online.' };
  }

  const service = createServiceClient();

  // ---------------------------------------------------------------- customer
  const { data: customer, error: customerError } = await service
    .from('customers')
    .upsert(
      {
        brand_id: brand.id,
        email,
        full_name: guests.find((guest) => guest.isLead)!.fullName,
        phone: phone ?? null,
        preferred_language: locale,
      },
      { onConflict: 'brand_id,email' },
    )
    .select('id')
    .single();
  if (customerError) return { ok: false, error: 'Could not record your details.' };

  // ------------------------------------------------------------------- quote
  const quoteId = await persistQuote(service, brand.id, pkg, stay, guests);
  if (typeof quoteId !== 'string') return quoteId;

  // ----------------------------------------------------------------- booking
  const { data: booking, error: bookingError } = await service
    .from('bookings')
    .insert({
      brand_id: brand.id,
      quote_id: quoteId,
      customer_id: customer.id,
      property_id: property.id,
      status: 'draft',
      check_in: stay.checkIn,
      check_out: stay.checkOut,
      total_sell: pkg.totalSell,
      total_cost: pkg.totalCost,
      rounding_delta: pkg.roundingDelta,
      payable_at_property: pkg.payableAtProperty,
      payable_at_property_breakdown: pkg.payableAtPropertyBreakdown as unknown as Json,
    })
    .select('id')
    .single();
  if (bookingError) return { ok: false, error: 'Could not create the booking.' };

  for (const guest of guests) {
    const { error } = await service.from('booking_guests').insert({
      booking_id: booking.id,
      full_name: guest.fullName,
      date_of_birth: guest.dateOfBirth,
      is_lead: guest.isLead,
    });
    if (error) return { ok: false, error: 'Could not record the guests.' };
  }

  const { error: transitionError } = await service
    .from('bookings')
    .update({ status: 'payment_pending' })
    .eq('id', booking.id);
  if (transitionError) return { ok: false, error: 'Could not prepare the booking.' };

  return { ok: true, bookingId: booking.id };
}

async function persistQuote(
  service: ReturnType<typeof createServiceClient>,
  brandId: string,
  pkg: AssembledPackage,
  stay: StayQuote,
  guests: GuestSpec[],
): Promise<string | { ok: false; error: string }> {
  const { data: quote, error: quoteError } = await service
    .from('quotes')
    .insert({
      brand_id: brandId,
      // No human approved this quote and none needed to: it was assembled
      // inside the rules. auto_approved is the enum's name for exactly that.
      status: 'auto_approved',
      total_cost: pkg.totalCost,
      total_sell: pkg.totalSell,
      rounding_delta: pkg.roundingDelta,
      payable_at_property: pkg.payableAtProperty,
      payable_at_property_breakdown: pkg.payableAtPropertyBreakdown as unknown as Json,
      valid_until: stay.checkIn,
    })
    .select('id')
    .single();
  if (quoteError) return { ok: false, error: 'Could not save the quote.' };

  for (const component of pkg.components) {
    const isRoom = component.sourcing === 'api';
    const pricingDetail = isRoom
      ? { ...component.pricingDetail, supplierQuote: stay, guests }
      : component.pricingDetail;

    const { error } = await service.from('quote_items').insert({
      quote_id: quote.id,
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
    if (error) return { ok: false, error: 'Could not save the quote items.' };
  }

  // Tasks the assembly raised persist with the quote (missing Arabic names,
  // margin-floor approvals) — the web channel feeds the same queue.
  for (const task of pkg.tasks) {
    await service.from('tasks').insert({
      quote_id: quote.id,
      type: task.type,
      priority: task.priority,
      summary: task.summary,
      context: task.context as Json,
      raised_by: 'system:web_funnel',
    });
  }

  return quote.id;
}
