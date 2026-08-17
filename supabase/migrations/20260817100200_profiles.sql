-- Premium Staycations — Phase 1
-- 02. Profiles and the role helper
--
-- Schema only. RLS policies land in Session 3; this migration exists now
-- because the locked-strings guard (migration 14) and the markup rule audit
-- both depend on has_role().

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        user_role not null default 'operator',
  full_name   text,
  email       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

comment on table profiles is
  'Staff accounts, keyed to auth.users. Roles are admin and operator only.';

-- has_role() is SECURITY DEFINER on purpose.
--
-- A policy on `profiles` that reads `profiles` to decide access recurses
-- forever. Marking this SECURITY DEFINER and setting an empty search_path
-- lets policies call it without re-entering row-level security.
--
-- It returns false when there is no authenticated user, which is the case for
-- the service_role key. That is deliberate: service_role bypasses RLS, so any
-- protection that must hold against a service key cannot be expressed as a
-- policy and must be a trigger instead (see migration 14).
create or replace function has_role(p_role user_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from profiles p
    where p.id = auth.uid()
      and p.active
      and p.role = p_role
  );
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select has_role('admin');
$$;

comment on function has_role(user_role) is
  'Role check for RLS policies. SECURITY DEFINER to avoid recursive policy '
  'evaluation on profiles. Returns false for service_role (no auth.uid()).';

-- Mint a profile whenever a user is created through Supabase Auth. First user
-- in an empty table becomes admin; everyone after is an operator and must be
-- promoted deliberately.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into profiles (id, email, role)
  values (
    new.id,
    new.email,
    case when exists (select 1 from profiles) then 'operator' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
