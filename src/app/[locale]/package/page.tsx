import { notFound } from 'next/navigation';
import { assembleFunnelPackage, priceAllExtras } from '@/lib/funnel';
import { getString } from '@/lib/catalog';
import { fillTemplate, isLocale, t, type Locale } from '@/lib/i18n';
import { formatAED } from '@/lib/format';
import { PackageConfigurator } from './package-configurator';
import { EnquiryForm } from './enquiry-form';

export default async function PackagePage({
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

  if (!result.ok) {
    if (result.reason === 'not_found') notFound();
    return (
      <p className="py-12 text-center text-muted-foreground">
        {locale === 'ar'
          ? 'لا تتوفر إقامة بهذه المواصفات. جرّب تواريخ أخرى.'
          : 'Nothing is available for that stay. Try different dates.'}
      </p>
    );
  }

  const { property, stay, package: pkg } = result.value;

  // The pricing engine refused — missing fee rules, unknown tax treatment.
  // The customer never sees a number that might be wrong; they see a promise
  // that a human will price it, and an enquiries row carries the request.
  if (!pkg.sellable) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-8 text-center">
        <h1 className="text-2xl font-semibold">{t(locale, 'not_bookable_online')}</h1>
        <p className="text-muted-foreground">{t(locale, 'enquiry_pitch')}</p>
        <EnquiryForm locale={locale} query={query} propertyName={property.name} />
      </div>
    );
  }

  const notice = await getString('booking.payable_at_property.notice');
  const noticeText =
    notice &&
    fillTemplate(
      (locale === 'ar' && notice.ar ? notice.ar : notice.en),
      { amount: pkg.payableAtProperty },
    );

  const extras = await priceAllExtras({ ...query, rateIds: undefined });

  const nightsLabel = stay.nights === 1 ? t(locale, 'night') : t(locale, 'nights');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {locale === 'ar' && result.value.property.name ? property.name : property.name}
        </h1>
        <p className="text-muted-foreground">
          {stay.checkIn} → {stay.checkOut} · {stay.nights} {nightsLabel} ·{' '}
          {stay.rooms} {t(locale, 'rooms').toLowerCase()} · {stay.roomDescription}
        </p>
      </div>

      <PackageConfigurator
        locale={locale}
        query={query as Record<string, string>}
        roomSell={pkg.components[0].unitSell}
        roundingIncrement={result.value.brand.rounding_increment}
        extras={extras}
        payableAtProperty={pkg.payableAtProperty}
      />

      {noticeText && (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium">
            {t(locale, 'payable_at_hotel')} — {formatAED(pkg.payableAtProperty)}
          </p>
          <p className="mt-1 text-muted-foreground">{noticeText}</p>
        </div>
      )}
    </div>
  );
}
