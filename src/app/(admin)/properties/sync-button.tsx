'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { syncProperties } from './actions';

export function SyncPropertiesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <span className="flex items-center gap-2">
      {message && <span className="text-sm text-muted-foreground">{message}</span>}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await syncProperties();
            setMessage(result.ok ? `Synced ${result.count} properties.` : result.error);
            router.refresh();
          })
        }
      >
        {pending ? 'Syncing…' : 'Sync from supplier'}
      </Button>
    </span>
  );
}
