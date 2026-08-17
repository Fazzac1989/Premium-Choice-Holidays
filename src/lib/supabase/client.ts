/**
 * Premium Staycations — Phase 1
 * The browser Supabase client. Anon key only; the session lives in cookies
 * shared with the server client.
 */

'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
