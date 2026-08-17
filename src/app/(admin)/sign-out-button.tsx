'use client';

import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await createBrowserSupabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" className="w-full" onClick={signOut}>
      Sign out
    </Button>
  );
}
