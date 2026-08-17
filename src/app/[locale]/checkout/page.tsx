import { notFound } from 'next/navigation';
import { assembleFunnelPackage } from '@/lib/funnel';
import { isLocale, t, type Locale } from '@/lib/i18n';
import { formatAED } from '@/lib/format';
import { CheckoutForm } from './checkout-form';

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ locale: raw }, query] = await Promise.all([params, searchParams]);
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const result = await assembleFunnelPackage(query);
  if (!result.ok || !result.value.package.sellable) notFound();

  const { property, stay, package: pkg, guests } = result.value;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t(locale, 'guest_details')}</h1>
        <p className="text-muted-foreground">
          {property.name} · {stay.checkIn} → {stay.checkOut}
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-baseline justify-between">
          <span>{t(locale, 'package_total')}</span>
          <span className="text-xl font-semibold">{formatAED(pkg.totalSell)}</span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          + {formatAED(pkg.payableAtProperty)} {t(locale, 'payable_at_hotel').toLowerCase()}
        </p>
      </div>

      <CheckoutForm
        locale={locale}
        query={query as Record<string, string>}
        guestSlots={guests.map((guest) => ({
          placeholder: guest.fullName,
          dateOfBirth: guest.dateOfBirth,
          isLead: guest.isLead,
        }))}
      />
    </div>
  );
}
