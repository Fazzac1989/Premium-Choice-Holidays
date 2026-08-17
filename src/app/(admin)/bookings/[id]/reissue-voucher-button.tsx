'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { reissueVoucher } from '../actions';

export function ReissueVoucherButton({ voucherId }: { voucherId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm">Reissue</Button>}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reissue voucher</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The old code is superseded, not deleted — a disputed redemption stays
          traceable. This is the only voucher write an operator holds.
        </p>
        <div className="space-y-1">
          <Label htmlFor="reason">Reason</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Customer lost the code…"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            disabled={pending || reason.trim() === ''}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await reissueVoucher(voucherId, reason);
                if (!result.ok) setError(result.error);
                else {
                  setOpen(false);
                  router.refresh();
                }
              })
            }
          >
            {pending ? 'Reissuing…' : 'Reissue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
