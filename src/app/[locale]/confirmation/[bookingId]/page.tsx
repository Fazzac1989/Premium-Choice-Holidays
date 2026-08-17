import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { getString } from '@/lib/catalog';
import { fillTemplate, isLocale, t, type Locale } from '@/lib/i18n';
import { formatAED, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';

interface PayableLine {
  description: string;
  descriptionAr: string;
  amount: number;
}

const REFUND_DAYS = 10;

export default async function ConfirmationPage({
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
    .select(
      `reference, status, check_in, check_out, total_sell, amount_paid,
       payable_at_property, payable_at_property_breakdown,
       booking_guests(full_name, is_lead),
       vouchers(code, redemption_method, superseded_at),
       quotes(quote_items(description, description_ar, sourcing, unit_sell))`,
    )
    .eq('id', bookingId)
    .maybeSingle();
  if (!booking) notFound();
  if (!['confirmed', 'failed_rollback'].includes(booking.status)) notFound();

  // ------------------------------------------------------- the rollback path
  // Money was taken and the booking could not be completed. The wording is
  // the LOCKED string: initiated, never completed. A customer on this page
  // owes nothing and does nothing; the refund task is already in the queue.
  if (booking.status === 'failed_rollback') {
    const template = await getString('booking.failed_rollback.email_body');
    const message = template
      ? fillTemplate(locale === 'ar' && template.ar ? template.ar : template.en, {
          amount: booking.amount_paid,
          refund_days: REFUND_DAYS,
        })
      : null;

    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <h1 className="text-2xl font-semibold">{t(locale, 'booking_failed_title')}</h1>
        {message && <p className="text-start leading-relaxed">{message}</p>}
        <p className="text-sm text-muted-foreground">
          {t(locale, 'booking_reference')}:{' '}
          <span className="font-mono">{booking.reference}</span>
        </p>
        <Link href={`/${locale}`} className="inline-block underline underline-offset-4">
          {t(locale, 'back_home')}
        </Link>
      </div>
    );
  }

  // ------------------------------------------------------------ confirmed
  const payable = (booking.payable_at_property_breakdown ?? []) as unknown as PayableLine[];
  const items = booking.quotes?.quote_items ?? [];
  const activeVouchers = booking.vouchers.filter((v) => v.superseded_at === null);

  return (
    <div className="mx-auto max-w-lg space-y-6 py-6">
      <div className="space-y-1 text-center">
        <h1 className="text-3xl font-semibold">{t(locale, 'booking_confirmed')}</h1>
        <p className="text-muted-foreground">
          {t(locale, 'booking_reference')}:{' '}
          <span className="font-mono text-foreground">{booking.reference}</span>
        </p>
        <p className="text-muted-foreground">
          {formatDate(booking.check_in)} → {formatDate(booking.check_out)}
        </p>
      </div>

      <div className="rounded-xl border p-4">
        {items.map((item, index) => (
          <div key={index} className="flex items-baseline justify-between py-1">
            <span>
              {locale === 'ar' && item.description_ar ? item.description_ar : item.description}
            </span>
            <span className="text-sm">{formatAED(item.unit_sell)}</span>
          </div>
        ))}
        <div className="mt-2 flex items-baseline justify-between border-t pt-2 font-semibold">
          <span>{t(locale, 'amount_paid')}</span>
          <span>{formatAED(booking.amount_paid)}</span>
        </div>
      </div>

      {payable.length > 0 && (
        <div className="rounded-xl border bg-muted/30 p-4 text-sm">
          <p className="mb-1 font-medium">
            {t(locale, 'payable_at_hotel')} — {formatAED(booking.payable_at_property)}
          </p>
          {payable.map((line, index) => (
            <p key={index} className="text-muted-foreground">
              {locale === 'ar' ? line.descriptionAr : line.description}
            </p>
          ))}
        </div>
      )}

      {activeVouchers.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-medium">{t(locale, 'your_vouchers')}</h2>
          {activeVouchers.map((voucher) => (
            <div
              key={voucher.code}
              className="flex items-center justify-between rounded-xl border p-4"
            >
              <div>
                <p className="text-xs text-muted-foreground">{t(locale, 'voucher_code')}</p>
                <p className="font-mono text-lg">{voucher.code}</p>
              </div>
              <Badge variant="outline">{voucher.redemption_method}</Badge>
            </div>
          ))}
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        <p className="font-medium">{t(locale, 'guests_label')}:</p>
        <p>
          {booking.booking_guests
            .map((guest) => guest.full_name)
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>

      <p className="text-center">
        <Link href={`/${locale}`} className="underline underline-offset-4">
          {t(locale, 'back_home')}
        </Link>
      </p>
    </div>
  );
}
