-- Premium Staycations — Phase 1
-- 16. Row level security: grants, helpers, and enabling
--
-- The model in three sentences:
--
--   Supabase gives every logged-in user the same database role, `authenticated`.
--   Table grants therefore cannot tell an admin from an operator — they can
--   only describe what the application is allowed to attempt at all.
--   The admin/operator distinction lives in `profiles` and is enforced by RLS.
--
-- So grants are the outer wall and policies are the inner one. `anon` is given
-- nothing, because Phase 1 has no public surface: the customer site is Phase 2
-- and will get its own explicitly scoped policies.

-- ------------------------------------------------------------------ anon ---
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke usage on schema public from anon;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;

-- --------------------------------------------------------- authenticated ---
-- The union of what an admin may attempt. Operators are cut down by policy,
-- not by grant, because both are the same database role.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Supplier-owned records are never written from a user session. They are
-- produced by the adapter and the assembly service, which hold the service
-- key. Removing the grant means a policy mistake cannot expose them.
revoke insert, update, delete on properties from authenticated;
revoke insert, update, delete on external_bookings from authenticated;

-- Vouchers are issued by the confirmation path and reissued through
-- reissue_voucher(). Neither is a direct insert from a user session.
revoke insert, delete on vouchers from authenticated;

-- Append-only in the strictest sense the grant system can express. The trigger
-- in migration 12 catches the rest, including service_role.
revoke update, delete on agent_actions from authenticated;

-- Dormant tables. The triggers in migration 11 already reject every write;
-- this makes the intent visible in \dp as well.
revoke insert, update, delete on lpos from authenticated;
revoke insert, update, delete on supplier_confirmations from authenticated;

-- --------------------------------------------------------------- helpers ---
-- is_admin() already exists from migration 02.

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.active
  );
$$;

comment on function is_staff() is
  'Any active admin or operator. SECURITY DEFINER so policies on profiles do '
  'not recurse. Returns false for anon and for service_role, which has no '
  'auth.uid() — service_role bypasses RLS anyway.';

revoke all on function is_staff() from public, anon;
grant execute on function is_staff() to authenticated;
revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;
revoke all on function has_role(user_role) from public, anon;
grant execute on function has_role(user_role) to authenticated;
revoke all on function admin_update_locked_string(text, text, text, text, text) from public, anon;
grant execute on function admin_update_locked_string(text, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------- enable ---
-- Every table in public, with no exceptions and no list to fall out of date.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end;
$$;

-- Prove it, rather than trusting the loop.
do $$
declare v_unprotected text[];
begin
  select array_agg(c.relname order by c.relname) into v_unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v_unprotected is not null then
    raise exception 'RLS is not enabled on: %', v_unprotected;
  end if;
end;
$$;
