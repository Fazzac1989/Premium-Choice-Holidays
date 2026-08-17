'use server';

/**
 * Premium Staycations — Phase 2a
 * The mock gateway's "webhook". A real gateway replaces this action with a
 * signature-verified route handler calling the same completePayment().
 */

import { completePayment } from '@/lib/payments/complete';

export async function settleMockPayment(
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // A real gateway supplies its own reference; the mock derives one from the
  // booking so replays (double-clicks included) hit the idempotency guard.
  const result = await completePayment(bookingId, `MOCKPAY-${bookingId}`);
  if (!result.ok) return result;
  // Both outcomes land on the confirmation page, which renders by status —
  // a failed_rollback shows the refund-initiated wording, not an error page.
  return { ok: true };
}
