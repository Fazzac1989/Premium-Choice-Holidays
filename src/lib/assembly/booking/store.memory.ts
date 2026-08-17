/**
 * Premium Staycations — Phase 1
 * In-memory BookingStore, for the orchestrator tests.
 *
 * It records what it is told and enforces the two state-machine guards the
 * tests exist to prove — the refund-and-task precondition on failed_rollback
 * and the voucher precondition on confirmed. A store that accepted anything
 * would let the orchestrator pass tests the database would fail.
 */

import type { ExternalBooking } from '@/lib/suppliers';
import type { BookingStore, BookingTransition } from './orchestrator';
import type { TaskPriority, TaskType } from '../types';

export interface RecordedTask {
  bookingId: string;
  type: TaskType;
  priority: TaskPriority;
  summary: string;
  context: Record<string, unknown>;
}

export class InMemoryBookingStore implements BookingStore {
  externalBookings: { bookingId: string; quoteItemId: string; record: ExternalBooking }[] = [];
  vouchers: { bookingId: string; quoteItemId: string; productId: string }[] = [];
  refunds: { bookingId: string; amount: number; note: string }[] = [];
  tasks: RecordedTask[] = [];
  transitions: { bookingId: string; to: BookingTransition }[] = [];

  constructor(
    private readonly guards: {
      /** Contracted components the confirmed-guard expects vouchers for. */
      expectedVouchers?: number;
      /** bookings.amount_paid, which the refund guard compares against. */
      amountPaid?: number;
    } = {},
  ) {}

  async recordExternalBooking(
    bookingId: string,
    quoteItemId: string,
    record: ExternalBooking,
  ): Promise<void> {
    this.externalBookings.push({ bookingId, quoteItemId, record });
  }

  async issueVoucher(bookingId: string, quoteItemId: string, productId: string): Promise<void> {
    this.vouchers.push({ bookingId, quoteItemId, productId });
  }

  async recordRefund(bookingId: string, amount: number, note: string): Promise<void> {
    this.refunds.push({ bookingId, amount, note });
  }

  async raiseTask(task: RecordedTask): Promise<void> {
    this.tasks.push(task);
  }

  async transition(bookingId: string, to: BookingTransition): Promise<void> {
    // The same preconditions guard_booking_status() enforces, so the tests
    // fail here the way production would fail there.
    if (to === 'confirmed') {
      const confirmedRecords = this.externalBookings.filter(
        (row) => row.bookingId === bookingId && row.record.status === 'confirmed',
      );
      if (confirmedRecords.length === 0) {
        throw new Error(
          'guard: cannot confirm with no confirmed external_bookings row',
        );
      }
      const expected = this.guards.expectedVouchers ?? 0;
      const issued = this.vouchers.filter((row) => row.bookingId === bookingId).length;
      if (issued < expected) {
        throw new Error(
          `guard: ${issued} of ${expected} contracted extras have vouchers`,
        );
      }
    }

    if (to === 'failed_rollback') {
      if ((this.guards.amountPaid ?? 0) > 0) {
        const refund = this.refunds.find((row) => row.bookingId === bookingId);
        if (!refund) {
          throw new Error('guard: failed_rollback with money taken and no refund row');
        }
      }
      const hasUrgentTask = this.tasks.some(
        (task) => task.bookingId === bookingId && task.priority === 'urgent',
      );
      if (!hasUrgentTask) {
        throw new Error('guard: failed_rollback without an open urgent task');
      }
    }

    this.transitions.push({ bookingId, to });
  }
}
