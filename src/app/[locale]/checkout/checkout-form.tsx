'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t, type Locale } from '@/lib/i18n';
import { createFunnelBooking } from './actions';

interface GuestSlot {
  placeholder: string;
  dateOfBirth: string | null;
  isLead: boolean;
}

export function CheckoutForm({
  locale,
  query,
  guestSlots,
}: {
  locale: Locale;
  query: Record<string, string>;
  guestSlots: GuestSlot[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>(guestSlots.map(() => ''));
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [accepted, setAccepted] = useState(false);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      setError(null);
      const result = await createFunnelBooking({
        search: query,
        guests: guestSlots.map((slot, index) => ({
          fullName: names[index],
          dateOfBirth: slot.dateOfBirth,
          isLead: slot.isLead,
        })),
        email,
        phone: phone || undefined,
        locale,
      });
      if (result.ok) {
        router.push(`/${locale}/pay/${result.bookingId}`);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {guestSlots.map((slot, index) => (
        <div key={index} className="space-y-1">
          <Label htmlFor={`guest-${index}`}>
            {slot.isLead
              ? t(locale, 'lead_guest')
              : `${t(locale, 'guest')} ${index + 1}`}
            {slot.dateOfBirth && (
              <span className="ms-2 text-xs text-muted-foreground">
                {t(locale, 'date_of_birth')}: {slot.dateOfBirth}
              </span>
            )}
          </Label>
          <Input
            id={`guest-${index}`}
            required
            placeholder={slot.placeholder}
            value={names[index]}
            onChange={(e) =>
              setNames(names.map((n, i) => (i === index ? e.target.value : n)))
            }
          />
        </div>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="email">{t(locale, 'email')}</Label>
          <Input
            id="email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="phone">
            {t(locale, 'phone')} ({t(locale, 'optional')})
          </Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          required
        />
        <span>{t(locale, 'accept_terms')}</span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" size="lg" disabled={pending || !accepted}>
        {pending ? t(locale, 'processing') : t(locale, 'pay_securely')}
      </Button>
    </form>
  );
}
