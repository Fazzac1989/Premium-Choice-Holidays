'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createBookingFromQuote } from '../../bookings/actions';

export function CreateBookingButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    startTransition(async () => {
      const result = await createBookingFromQuote(quoteId);
      if (result.ok) router.push(`/bookings/${result.bookingId}`);
      else setError(result.error);
    });
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-sm text-destructive">{error}</span>}
      <Button onClick={run} disabled={pending}>
        {pending ? 'Creating…' : 'Create booking'}
      </Button>
    </span>
  );
}
