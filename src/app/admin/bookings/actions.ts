'use server';

/**
 * Premium Staycations — Phase 1
 * The booking lifecycle, driven from the admin UI.
 *
 * Everything the access model grants to staff goes through the user-session
 * client, so RLS is the enforcement. The one exception is the supplier run:
 * external_bookings and confirmation vouchers are service-key territory, so
 * runSupplierBooking is the second sanctioned service-client path — and
 * verifies the caller's role itself, because the service key will not.
 *
 * No money moves in any of this. Payments are recorded, refunds are
 * initiated; humans move funds and reconcile.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import {
  executeSupplierBooking,
  type ApiComponent,
  type BookingOutcome,
  type ContractedComponent,
} from '@/lib/assembly';
import { SupabaseBookingStore } from '@/lib/assembly/booking/store.supabase';
import { createSupplierAdapter, type Guest, type StayQuote } from '@/lib/suppliers';
import { createServiceClient } from '@/lib/supabase/service';
import { createUserClient, currentProfile } from '@/lib/supabase/server';

// ---------------------------------------------------------------------------
// Create a booking from a quote
// ---------------------------------------------------------------------------

export async function createBookingFromQuote(
  quoteId: string,
): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  const supabase = await createUserClient();

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('*, quote_items(*)')
    .eq('id', quoteId)
    .single();
  if (quoteError) return { ok: false, error: quoteError.message };

  const room = quote.quote_items.find((item) => item.sourcing === 'api');
  if (!room) return { ok: false, error: 'The quote has no room component.' };

  const detail = (room.pricing_detail ?? {}) as {
    supplierQuote?: StayQuote;
    guests?: { fullName: string; dateOfBirth: string | null; isLead: boolean }[];
  };
  if (!detail.supplierQuote || !detail.guests) {
    return { ok: false, error: 'The quote does not carry its supplier offer.' };
  }

  // Draft first, always — the insert guard rejects anything else, and the
  // walk through the states exercises the machine rather than skipping it.
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      brand_id: quote.brand_id,
      quote_id: quote.id,
      property_id: room.property_id,
      status: 'draft',
      check_in: room.date_from,
      check_out: room.date_to,
      total_sell: quote.total_sell ?? 0,
      total_cost: quote.total_cost ?? 0,
      rounding_delta: quote.rounding_delta,
      payable_at_property: quote.payable_at_property,
      payable_at_property_breakdown: quote.payable_at_property_breakdown,
    })
    .select('id')
    .single();
  if (bookingError) return { ok: false, error: bookingError.message };

  for (const guest of detail.guests) {
    const { error } = await supabase.from('booking_guests').insert({
      booking_id: booking.id,
      full_name: guest.fullName,
      date_of_birth: guest.dateOfBirth,
      is_lead: guest.isLead,
    });
    if (error) return { ok: false, error: `Guest insert failed: ${error.message}` };
  }

  const { error: transitionError } = await supabase
    .from('bookings')
    .update({ status: 'payment_pending' })
    .eq('id', booking.id);
  if (transitionError) return { ok: false, error: transitionError.message };

  revalidatePath('/admin/bookings');
  return { ok: true, bookingId: booking.id };
}

// ---------------------------------------------------------------------------
// Record a payment received
// ---------------------------------------------------------------------------

const paymentSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.number().positive(),
  method: z.enum(['bank_transfer', 'card', 'link']),
  reference: z.string().optional(),
});

export async function recordPayment(
  input: z.infer<typeof paymentSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Invalid payment input.' };
  const { bookingId, amount, method, reference } = parsed.data;

  const supabase = await createUserClient();

  const { error: paymentError } = await supabase.from('payments').insert({
    booking_id: bookingId,
    direction: 'in',
    method,
    amount,
    bank_ref: reference ?? null,
    received_at: new Date().toISOString(),
  });
  if (paymentError) return { ok: false, error: paymentError.message };

  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'payment_received', amount_paid: amount })
    .eq('id', bookingId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath(`/admin/bookings/${bookingId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Run the supplier booking
// ---------------------------------------------------------------------------

export async function runSupplierBooking(
  bookingId: string,
): Promise<{ ok: true; outcome: BookingOutcome } | { ok: false; error: string }> {
  const profile = await currentProfile();
  if (!profile || profile.role !== 'admin') {
    return { ok: false, error: 'Only an admin may run the supplier booking.' };
  }

  const service = createServiceClient();

  const { data: booking, error } = await service
    .from('bookings')
    .select('*, quote_items:quotes(quote_items(*)), booking_guests(*)')
    .eq('id', bookingId)
    .single();
  if (error) return { ok: false, error: error.message };
  if (booking.status !== 'payment_received') {
    return {
      ok: false,
      error: `The booking is ${booking.status}; the supplier run starts from payment_received.`,
    };
  }

  const items = booking.quote_items?.quote_items ?? [];

  const apiComponents: ApiComponent[] = [];
  for (const item of items.filter((i) => i.sourcing === 'api')) {
    const detail = (item.pricing_detail ?? {}) as { supplierQuote?: StayQuote };
    if (!detail.supplierQuote) {
      return { ok: false, error: `Quote item ${item.id} carries no supplier offer.` };
    }
    apiComponents.push({ quoteItemId: item.id, quote: detail.supplierQuote });
  }

  const contractedComponents: ContractedComponent[] = items
    .filter((i) => i.sourcing === 'contracted' && i.product_id !== null)
    .map((i) => ({ quoteItemId: i.id, productId: i.product_id! }));

  const guests: Guest[] = booking.booking_guests.map((g) => ({
    fullName: g.full_name ?? '',
    dateOfBirth: g.date_of_birth,
    isLead: g.is_lead,
  }));

  const outcome = await executeSupplierBooking(
    createSupplierAdapter(),
    new SupabaseBookingStore(service),
    {
      bookingId: booking.id,
      reference: booking.reference,
      amountPaid: booking.amount_paid,
      guests,
      apiComponents,
      contractedComponents,
    },
  );

  revalidatePath(`/admin/bookings/${bookingId}`);
  revalidatePath('/admin/bookings');
  revalidatePath('/admin/tasks');
  return { ok: true, outcome };
}

// ---------------------------------------------------------------------------
// Voucher reissue — the operator's one write path to vouchers
// ---------------------------------------------------------------------------

export async function reissueVoucher(
  voucherId: string,
  reason: string,
): Promise<{ ok: true; newCode: string } | { ok: false; error: string }> {
  if (!reason.trim()) return { ok: false, error: 'A reissue needs a reason.' };

  const supabase = await createUserClient();
  const { data, error } = await supabase.rpc('reissue_voucher', {
    p_voucher_id: voucherId,
    p_reason: reason,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/bookings');
  return { ok: true, newCode: (data as { code: string }).code };
}
