'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { resolveTask } from './actions';

export function ResolveTaskButtons({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<'done' | 'dismissed'>('done');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openAs(next: 'done' | 'dismissed') {
    setOutcome(next);
    setOpen(true);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <span className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => openAs('done')}>
          Resolve
        </Button>
        <Button variant="ghost" size="sm" onClick={() => openAs('dismissed')}>
          Dismiss
        </Button>
      </span>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {outcome === 'done' ? 'Resolve task' : 'Dismiss task'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="note">Note</Label>
          <Textarea
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              outcome === 'done'
                ? 'What was done…'
                : 'Why this needs no action…'
            }
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            disabled={pending || note.trim() === ''}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const result = await resolveTask(taskId, outcome, note);
                if (!result.ok) setError(result.error);
                else {
                  setOpen(false);
                  setNote('');
                  router.refresh();
                }
              })
            }
          >
            {pending ? 'Saving…' : outcome === 'done' ? 'Resolve' : 'Dismiss'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
