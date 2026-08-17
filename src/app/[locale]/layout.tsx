import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dirOf, isLocale, t } from '@/lib/i18n';

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const other = locale === 'en' ? 'ar' : 'en';

  return (
    <div lang={locale} dir={dirOf(locale)} className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <Link href={`/${locale}`} className="text-lg font-semibold">
            {t(locale, 'brand_name')}
          </Link>
          <Link
            href={`/${other}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          >
            {other === 'ar' ? 'العربية' : 'English'}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 sm:p-6">{children}</main>
      <footer className="border-t">
        <div className="mx-auto max-w-5xl p-4 text-sm text-muted-foreground">
          {t(locale, 'brand_name')} · premiumstaycations.com
        </div>
      </footer>
    </div>
  );
}
