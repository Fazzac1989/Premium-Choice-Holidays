import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listPublicProperties } from '@/lib/catalog';
import { emirateName, isLocale, t, type Locale } from '@/lib/i18n';
import { Badge } from '@/components/ui/badge';

// Placeholder art until supplier imagery lands with certification: a stable
// gradient per emirate, honest about being a placeholder rather than a stock
// photo of the wrong hotel.
const EMIRATE_TONES: Record<string, string> = {
  dubai: 'from-amber-200 to-rose-300 dark:from-amber-800 dark:to-rose-900',
  abu_dhabi: 'from-sky-200 to-indigo-300 dark:from-sky-800 dark:to-indigo-900',
  rak: 'from-emerald-200 to-teal-300 dark:from-emerald-800 dark:to-teal-900',
};

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const properties = await listPublicProperties();
  const emirates = [...new Set(properties.map((p) => p.emirate))];

  return (
    <div className="space-y-10">
      <section className="space-y-2 py-6 text-center">
        <h1 className="text-3xl font-semibold sm:text-4xl">{t(locale, 'tagline')}</h1>
        <p className="text-muted-foreground">
          {locale === 'ar'
            ? 'الإقامة والتجارب في باقة واحدة، وكل رسم إضافي معلن قبل الدفع.'
            : 'Stay and experiences in one package, every extra fee declared before you pay.'}
        </p>
      </section>

      {emirates.map((emirate) => (
        <section key={emirate} className="space-y-4">
          <h2 className="text-xl font-semibold">{emirateName(locale, emirate)}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {properties
              .filter((property) => property.emirate === emirate)
              .map((property) => (
                <Link
                  key={property.id}
                  href={`/${locale}/properties/${property.id}`}
                  className="group overflow-hidden rounded-xl border transition-shadow hover:shadow-md"
                >
                  <div
                    className={`h-28 bg-gradient-to-br ${EMIRATE_TONES[property.emirate] ?? 'from-muted to-muted'}`}
                  />
                  <div className="space-y-1 p-4">
                    <p className="font-medium group-hover:underline">
                      {locale === 'ar' && property.nameAr ? property.nameAr : property.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {property.area ?? emirateName(locale, property.emirate)}
                      {property.starRating && (
                        <Badge variant="outline" className="ms-2">
                          {property.starRating}★
                        </Badge>
                      )}
                    </p>
                  </div>
                </Link>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
