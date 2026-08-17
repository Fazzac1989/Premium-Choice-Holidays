/**
 * Premium Staycations — Phase 2a
 * Payment completion — the seam a real gateway webhook will call.
 *
 * Today the mock pay page invokes this through a server action. When a real
 * gateway lands, its signature-verified webhook route calls THIS function
 * with the gateway's reference; nothing downstream changes. That is the same
 * pattern as the supplier layer: the integration is a caller, the behaviour
 * lives behind the seam.
 *
 * Idempotent by gateway reference: replaying a webhook cannot record the
 * payment twice or run the supplier booking twice (the orchestrator's
 * derived idempotency keys make the second run reconcile, not rebook).
 */

import 'server-only';

import { executeSupplierBooking } from '@/lib/assembly';
import { SupabaseBookingStore } from '@/lib/assembly/booking/store.supabase';
import { createSupplierAdapter, type Guest, type StayQuote } from '@/lib/suppliers';
import { createServiceClient } from '@/lib/supabase/service';
import type { ApiComponent, BookingOutcome, ContractedComponent } from '@/lib/assembly';

export type PaymentCompletionResult =
  | { ok: true; outcome: BookingOutcome['outcome'] }
  | { ok: false; error: string };

export async function completePayment(
  bookingId: string,
  gatewayRef: string,
): Promise<PaymentCompletionResult> {
  const service = createServiceClient();

  // Replay guard: this gateway reference has already been processed.
  const { data: existing } = await service
    .from('payments')
    .select('id')
    .eq('gateway_ref', gatewayRef)
    .maybeSingle();
  if (existing) {
    const { data: bk } = await service
      .from('bookings')
      .select('status')
      .eq('id', bookingId)
      .single();
    return { ok: true, outcome: bk?.status === 'confirmed' ? 'confirmed' : 'failed_rollback' };
  }

  const { data: booking, error } = await service
    .from('bookings')
    .select('*, quotes(quote_items(*)), booking_guests(*)')
    .eq('id', bookingId)
    .single();
  if (error) return { ok: false, error: 'Unknown booking.' };
  if (booking.status !== 'payment_pending') {
    return { ok: false, error: `Booking is ${booking.status}, not awaiting payment.` };
  }

  // Money in: the payment row, then the transition the state machine expects.
  const { error: paymentError } = await service.from('payments').insert({
    booking_id: booking.id,
    direction: 'in',
    method: 'link',
    amount: booking.total_sell,
    gateway_ref: gatewayRef,
    received_at: new Date().toISOString(),
  });
  if (paymentError) return { ok: false, error: 'Could not record the payment.' };

  const { error: transitionError } = await service
    .from('bookings')
    .update({ status: 'payment_received', amount_paid: booking.total_sell })
    .eq('id', booking.id);
  if (transitionError) return { ok: false, error: 'Could not advance the booking.' };

  // The supplier run — the Phase 1 orchestrator, unchanged.
  const items = booking.quotes?.quote_items ?? [];

  const apiComponents: ApiComponent[] = [];
  for (const item of items.filter((i) => i.sourcing === 'api')) {
    const detail = (item.pricing_detail ?? {}) as { supplierQuote?: StayQuote };
    if (!detail.supplierQuote) {
      return { ok: false, error: 'The booking carries no supplier offer.' };
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
      amountPaid: booking.total_sell,
      guests,
      apiComponents,
      contractedComponents,
    },
  );

  return { ok: true, outcome: outcome.outcome };
}
