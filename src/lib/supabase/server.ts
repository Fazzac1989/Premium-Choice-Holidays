/**
 * Premium Staycations — Phase 1
 * The user-session Supabase client, for server components and actions.
 *
 * This client carries the signed-in user's JWT, so RLS decides what every
 * query may see and write. The admin UI goes through THIS client for
 * everything the access model grants to staff — using the service client for
 * convenience would silently bypass the policies Session 3 exists to enforce.
 */

import 'server-only';

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type UserClient = SupabaseClient<Database>;

export async function createUserClient(): Promise<UserClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Fine: the middleware refreshes sessions.
          }
        },
      },
    },
  );
}

export interface CurrentProfile {
  id: string;
  email: string | null;
  fullName: string | null;
  role: Database['public']['Enums']['user_role'];
  active: boolean;
}

/** The signed-in staff member, or null when there is no usable session. */
export async function currentProfile(): Promise<CurrentProfile | null> {
  const supabase = await createUserClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, active')
    .eq('id', user.id)
    .single();
  if (!profile || !profile.active) return null;

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    role: profile.role,
    active: profile.active,
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. See .env.local.example.`);
  }
  return value;
}
