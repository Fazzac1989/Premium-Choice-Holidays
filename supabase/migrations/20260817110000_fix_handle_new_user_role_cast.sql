-- Premium Staycations — Phase 1
-- 16a. Repair: handle_new_user() could not insert a profile
--
-- The version in migration 02 read:
--
--   case when exists (select 1 from profiles) then 'operator' else 'admin' end
--
-- Both branches are untyped literals, so the CASE resolves to text, and
-- Postgres has no implicit cast from text to an enum. Every insert into
-- auth.users therefore failed with:
--
--   column "role" is of type user_role but expression is of type text
--
-- which meant no user could be created at all — the trigger is AFTER INSERT on
-- auth.users, so its failure aborts the signup.
--
-- Repaired as a separate migration rather than by editing 02, so that a
-- database which has already applied 02 is fixed by moving forward, and a
-- fresh apply reaches the same state.

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
    case
      when exists (select 1 from profiles) then 'operator'::user_role
      else 'admin'::user_role
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function handle_new_user() is
  'Mints a profile on signup. First user in an empty table is admin; everyone '
  'after is an operator and must be promoted deliberately.';
