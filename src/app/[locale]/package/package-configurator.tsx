'use client';

/**
 * Extras selection and the running total. The math here is PRESENTATIONAL —
 * checkout re-assembles server-side from the same inputs and persists what it
 * computes. A tampered total in this component buys nothing.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { t, type Locale } from '@/lib/i18n';
import { formatAED } from '@/lib/format';

interface ExtraOffer {
  rateId: string;
  name: string;
  nameAr: string | null;
  totalSell: number;
  perGuest: { band: string; sell: number }[];
}

export function PackageConfigurator({
  locale,
  query,
  roomSell,
  roundingIncrement,
  extras,
  payableAtProperty,
}: {
  locale: Locale;
  query: Record<string, string>;
  roomSell: number;
  roundingIncrement: number;
  extras: ExtraOffer[];
  payableAtProperty: number;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>([]);

  const total = useMemo(() => {
    const exact =
      roomSell +
      extras
        .filter((extra) => chosen.includes(extra.rateId))
        .reduce((sum, extra) => sum + extra.totalSell, 0);
    // Mirror of roundUpToIncrement, display only.
    const incrementFils = Math.round(roundingIncrement * 100);
    const exactFils = Math.round(exact * 100);
    return (Math.ceil(exactFils / incrementFils) * incrementFils) / 100;
  }, [roomSell, extras, chosen, roundingIncrement]);

  function continueToCheckout() {
    const params = new URLSearchParams(query);
    if (chosen.length > 0) params.set('rateIds', chosen.join(','));
    else params.delete('rateIds');
    router.push(`/${locale}/checkout?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between rounded-lg border p-4">
        <span>{t(locale, 'your_stay')}</span>
        <span className="text-lg font-medium">{formatAED(roomSell)}</span>
      </div>

      {extras.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">{t(locale, 'add_ons')}</h2>
          {extras.map((extra) => (
            <label
              key={extra.rateId}
              className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 has-[:checked]:border-primary"
            >
              <input
                type="checkbox"
                checked={chosen.includes(extra.rateId)}
                onChange={(e) =>
                  setChosen(
                    e.target.checked
                      ? [...chosen, extra.rateId]
                      : chosen.filter((id) => id !== extra.rateId),
                  )
                }
              />
              <span className="flex-1">
                <span className="block font-medium">
                  {locale === 'ar' && extra.nameAr ? extra.nameAr : extra.name}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {summarisePerGuest(locale, extra.perGuest)}
                </span>
              </span>
              <span className="font-medium">{formatAED(extra.totalSell)}</span>
            </label>
          ))}
        </section>
      )}

      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
        <div>
          <p className="font-medium">{t(locale, 'package_total')}</p>
          <p className="text-sm text-muted-foreground">
            + {formatAED(payableAtProperty)} {t(locale, 'payable_at_hotel').toLowerCase()}
          </p>
        </div>
        <span className="text-2xl font-semibold">{formatAED(total)}</span>
      </div>

      <Button className="w-full" size="lg" onClick={continueToCheckout}>
        {t(locale, 'continue_to_checkout')}
      </Button>
    </div>
  );
}

function summarisePerGuest(
  locale: Locale,
  perGuest: { band: string; sell: number }[],
): string {
  const adult = perGuest.find((g) => g.band === 'adult');
  const child = perGuest.find((g) => g.band !== 'adult' && g.sell > 0);
  const freeInfant = perGuest.some((g) => g.band !== 'adult' && g.sell === 0);

  const parts: string[] = [];
  if (adult) parts.push(`${formatAED(adult.sell)} ${t(locale, 'per_adult')}`);
  if (child) parts.push(`${formatAED(child.sell)} ${t(locale, 'per_child')}`);
  if (freeInfant) parts.push(t(locale, 'free_for_infants'));
  return parts.join(' · ');
}
