/**
 * Premium Staycations — Phase 1
 * The Supabase-backed BookingStore.
 *
 * A thin mapping and nothing else — every decision lives in the orchestrator
 * or in the database triggers. Writes go through the service role because no
 * user session may write external_bookings or vouchers; the DB state machine
 * still applies (triggers do not care about roles), so a transition the guard
 * forbids fails here exactly as it would for a user.
 *
 * ORDERING, NOT TRANSACTIONS. PostgREST gives no cross-statement transaction,
 * so the orchestrator's write order is what keeps the guards satisfied:
 * refund and task rows land before the failed_rollback transition, vouchers
 * before confirmed. A crash between writes leaves a booking in
 * supplier_booking with its evidence rows already present — re-running the
 * orchestrator reconciles by idempotency key and completes; the stuck-booking
 * watchdog escalates anything in payment_received that never started.
 */

import type { ExternalBooking } from '@/lib/suppliers';
import type { ServiceClient } from '@/lib/supabase/service';
import type { Database } from '@/types/database';
import type { BookingStore, BookingTransition } from './orchestrator';
import type { TaskPriority, TaskType } from '../types';

type Json = Database['public']['Tables']['external_bookings']['Row']['raw_response'];

export class SupabaseBookingStore implements BookingStore {
  constructor(private readonly db: ServiceClient) {}

  async recordExternalBooking(
    bookingId: string,
    quoteItemId: string,
    record: ExternalBooking,
  ): Promise<void> {
    const { error } = await this.db.from('external_bookings').insert({
      booking_id: bookingId,
      quote_item_id: quoteItemId,
      adapter: record.adapter,
      supplier_ref: record.supplierRef,
      status: record.status,
      idempotency_key: record.idempotencyKey,
      attempt: record.attempt,
      failure_class: record.failureClass,
      failure_detail: record.failureDetail,
      free_cancel_until: record.freeCancelUntil,
      net_cost: record.netCost,
      currency: record.currency,
      net_rate_tax_inclusive: record.netRateTaxInclusive,
      taxes_included: (record.taxesIncluded ?? null) as Json,
      raw_response: (record.raw ?? null) as Json,
    });
    if (error) throw new Error(`external_bookings insert failed: ${error.message}`);
  }

  async issueVoucher(
    bookingId: string,
    quoteItemId: string,
    productId: string,
  ): Promise<void> {
    // Code and validity come from column defaults and the product; the
    // redemption method is the product's own.
    const { data: product, error: productError } = await this.db
      .from('products')
      .select('redemption_method')
      .eq('id', productId)
      .single();
    if (productError) throw new Error(`voucher product lookup failed: ${productError.message}`);
    if (product.redemption_method === null) {
      throw new Error(
        `Product ${productId} has no redemption method; a contracted extra ` +
          'cannot be vouchered without one.',
      );
    }

    const { error } = await this.db.from('vouchers').insert({
      booking_id: bookingId,
      quote_item_id: quoteItemId,
      product_id: productId,
      redemption_method: product.redemption_method,
    });
    if (error) throw new Error(`voucher insert failed: ${error.message}`);
  }

  async recordRefund(bookingId: string, amount: number, note: string): Promise<void> {
    // direction out, method refund, unreconciled: the row states an intent.
    // No money moves here; a human moves it and reconciles.
    const { error } = await this.db.from('payments').insert({
      booking_id: bookingId,
      direction: 'out',
      method: 'refund',
      amount,
      notes: note,
    });
    if (error) throw new Error(`refund payments insert failed: ${error.message}`);
  }

  async raiseTask(task: {
    bookingId: string;
    type: TaskType;
    priority: TaskPriority;
    summary: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.db.from('tasks').insert({
      booking_id: task.bookingId,
      type: task.type,
      priority: task.priority,
      summary: task.summary,
      context: task.context as Json,
      raised_by: 'service:orchestrator',
    });
    if (error) throw new Error(`task insert failed: ${error.message}`);
  }

  async transition(bookingId: string, to: BookingTransition): Promise<void> {
    const { data, error } = await this.db
      .from('bookings')
      .update({ status: to })
      .eq('id', bookingId)
      .select('id');
    if (error) throw new Error(`transition to ${to} failed: ${error.message}`);
    // A guard rejection raises and lands in `error`. Zero rows without an
    // error would mean the booking id itself is wrong — refuse to continue.
    if (!data || data.length === 0) {
      throw new Error(`transition to ${to} matched no booking ${bookingId}`);
    }
  }
}
