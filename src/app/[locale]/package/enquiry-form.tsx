'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t, type Locale } from '@/lib/i18n';
import { submitEnquiry } from './actions';

export function EnquiryForm({
  locale,
  query,
  propertyName,
}: {
  locale: Locale;
  query: Record<string, string | undefined>;
  propertyName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  if (sent) {
    return <p className="rounded-lg border bg-muted/30 p-4">{t(locale, 'enquiry_sent')}</p>;
  }

  return (
    <form
      className="space-y-3 text-start"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          setError(null);
          const result = await submitEnquiry({
            fullName: name,
            email,
            phone: phone || undefined,
            propertyId: query.propertyId ?? '',
            checkIn: query.checkIn ?? '',
            checkOut: query.checkOut ?? '',
            adults: Number(query.adults ?? 1),
            children: query.childDobs ? query.childDobs.split(',').length : 0,
            rooms: Number(query.rooms ?? 1),
            propertyName,
          });
          if (result.ok) setSent(true);
          else setError(result.error);
        });
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="enq-name">{t(locale, 'full_name')}</Label>
        <Input id="enq-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="enq-email">{t(locale, 'email')}</Label>
        <Input
          id="enq-email" type="email" required value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="enq-phone">
          {t(locale, 'phone')} ({t(locale, 'optional')})
        </Label>
        <Input id="enq-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t(locale, 'processing') : t(locale, 'send_enquiry')}
      </Button>
    </form>
  );
}
