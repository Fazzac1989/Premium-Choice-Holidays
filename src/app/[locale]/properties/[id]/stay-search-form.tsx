'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { t, type Locale } from '@/lib/i18n';

export function StaySearchForm({
  locale,
  propertyId,
}: {
  locale: Locale;
  propertyId: string;
}) {
  const router = useRouter();
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [rooms, setRooms] = useState(1);
  const [adults, setAdults] = useState(2);
  const [childDobs, setChildDobs] = useState<string[]>([]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const query = new URLSearchParams({
      propertyId,
      checkIn,
      checkOut,
      rooms: String(rooms),
      adults: String(adults),
    });
    const dobs = childDobs.filter((dob) => dob !== '');
    if (dobs.length > 0) query.set('childDobs', dobs.join(','));
    router.push(`/${locale}/package?${query.toString()}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="check-in">{t(locale, 'check_in')}</Label>
          <Input
            id="check-in" type="date" required value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="check-out">{t(locale, 'check_out')}</Label>
          <Input
            id="check-out" type="date" required value={checkOut}
            onChange={(e) => setCheckOut(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rooms">{t(locale, 'rooms')}</Label>
          <Input
            id="rooms" type="number" min={1} max={4} value={rooms}
            onChange={(e) => setRooms(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="adults">{t(locale, 'adults')}</Label>
          <Input
            id="adults" type="number" min={1} max={8} value={adults}
            onChange={(e) => setAdults(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>{t(locale, 'children')}</Label>
          <Button
            type="button" variant="outline" size="sm"
            onClick={() => setChildDobs([...childDobs, ''])}
          >
            {t(locale, 'add_child')}
          </Button>
        </div>
        {childDobs.length > 0 && (
          <p className="text-xs text-muted-foreground">{t(locale, 'child_dob_note')}</p>
        )}
        {childDobs.map((dob, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              type="date"
              aria-label={t(locale, 'child_dob')}
              required
              value={dob}
              onChange={(e) =>
                setChildDobs(childDobs.map((d, i) => (i === index ? e.target.value : d)))
              }
            />
            <Button
              type="button" variant="ghost" size="sm"
              onClick={() => setChildDobs(childDobs.filter((_, i) => i !== index))}
            >
              ✕
            </Button>
          </div>
        ))}
      </div>

      <Button type="submit" className="w-full">
        {t(locale, 'see_package')}
      </Button>
    </form>
  );
}
