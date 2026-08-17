'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { t, type Locale } from '@/lib/i18n';
import { settleMockPayment } from './actions';

export function PayButtons({ locale, bookingId }: { locale: Locale; bookingId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [declined, setDeclined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pay() {
    startTransition(async () => {
      setError(null);
      setDeclined(false);
      const result = await settleMockPayment(bookingId);
      if (result.ok) router.push(`/${locale}/confirmation/${bookingId}`);
      else setError(result.error);
    });
  }

  return (
    <div className="space-y-3">
      {declined && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {t(locale, 'payment_declined')}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button className="w-full" size="lg" onClick={pay} disabled={pending}>
        {pending ? t(locale, 'processing') : t(locale, 'pay_now')}
      </Button>
      <Button
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() => setDeclined(true)}
      >
        {t(locale, 'decline_payment')}
      </Button>
    </div>
  );
}
