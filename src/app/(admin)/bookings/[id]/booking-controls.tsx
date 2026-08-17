'use client';

/**
 * The lifecycle controls a booking's current status makes available.
 * payment_pending → record the payment; payment_received → run the supplier
 * booking. Anything else is either terminal or driven elsewhere.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { recordPayment, runSupplierBooking } from '../actions';

export function BookingControls({
  bookingId,
  status,
  totalSell,
}: {
  bookingId: string;
  status: string;
  totalSell: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(totalSell);
  const [reference, setReference] = useState('');

  if (status === 'payment_pending') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record payment received</CardTitle>
        </CardHeader>
        <CardContent className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="amount">Amount (AED)</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-36"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="bank-ref">Bank reference</Label>
            <Input
              id="bank-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await recordPayment({
                  bookingId,
                  amount,
                  method: 'bank_transfer',
                  reference: reference || undefined,
                });
                if (!result.ok) setError(result.error);
                else router.refresh();
              })
            }
          >
            {pending ? 'Recording…' : 'Record payment'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  if (status === 'payment_received') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Money is in; the supplier holds nothing yet</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await runSupplierBooking(bookingId);
                if (!result.ok) setError(result.error);
                else router.refresh();
              })
            }
          >
            {pending ? 'Booking with the supplier…' : 'Run supplier booking'}
          </Button>
          <p className="text-sm text-muted-foreground">
            Books every component, reconciling before any retry. A failure rolls
            back with a refund record and an urgent task.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  return null;
}
