import { notFound } from 'next/navigation';
import { getPublicProperty } from '@/lib/catalog';
import { emirateName, isLocale, t, type Locale } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';
import { StaySearchForm } from './stay-search-form';

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: raw, id } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const property = await getPublicProperty(id);
  if (!property) notFound();

  const displayName =
    locale === 'ar' && property.nameAr ? property.nameAr : property.name;
  const description =
    locale === 'ar' ? property.descriptionAr : property.description;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">{displayName}</h1>
        <p className="text-muted-foreground">
          {emirateName(locale, property.emirate)}
          {property.area && ` · ${property.area}`}
          {property.starRating && (
            <Badge variant="outline" className="ms-2">
              {property.starRating}★ {t(locale, 'star_hotel')}
            </Badge>
          )}
        </p>
        {description && <p className="max-w-2xl">{description}</p>}
      </div>

      <section className="max-w-xl rounded-xl border p-5">
        <h2 className="mb-4 text-lg font-medium">{t(locale, 'your_stay')}</h2>
        <StaySearchForm locale={locale} propertyId={property.id} />
      </section>
    </div>
  );
}
