import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { isLocale, t, type Locale } from '@/lib/i18n';
import { formatAED } from '@/lib/format';
import { PayButtons } from './pay-buttons';

/**
 * The mock hosted-gateway page. Deliberately styled unlike the rest of the
 * site — a real integration redirects to the gateway's own page, and this
 * stands in for it. The Pay button drives the same completePayment() seam a
 * real webhook will call.
 */
export default async function PayPage({
  params,
}: {
  params: Promise<{ locale: string; bookingId: string }>;
}) {
  const { locale: raw, bookingId } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const service = createServiceClient();
  const { data: booking } = await service
    .from('bookings')
    .select('id, reference, status, total_sell')
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking || booking.status !== 'payment_pending') notFound();

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="rounded-2xl border-2 border-dashed bg-muted/20 p-6">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          MockPay · sandbox
        </p>
        <h1 className="text-xl font-semibold">{t(locale, 'payment_title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(locale, 'payment_note')}{' '}
          <span className="font-mono">{booking.reference}</span>
        </p>
        <p className="my-6 text-center text-3xl font-semibold">
          {formatAED(booking.total_sell)}
        </p>
        <PayButtons locale={locale} bookingId={booking.id} />
      </div>
    </div>
  );
}
