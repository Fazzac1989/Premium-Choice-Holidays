/**
 * Premium Staycations — Phase 1
 * The service-role Supabase client.
 *
 * SERVER ONLY. The service key bypasses every RLS policy in the schema — it
 * exists for the adapter, the assembly service and the confirmation path,
 * which write records no user session may write (external_bookings, the
 * properties cache, vouchers at confirmation).
 *
 * 'server-only' makes importing this from a client component a build error
 * rather than a leaked key.
 */

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type ServiceClient = SupabaseClient<Database>;

export function createServiceClient(): ServiceClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set. ' +
        'See .env.local.example.',
    );
  }

  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
