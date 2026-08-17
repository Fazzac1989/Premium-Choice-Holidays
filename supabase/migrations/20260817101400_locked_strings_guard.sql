-- Premium Staycations — Phase 1
-- 14. Locked strings
--
-- service_role bypasses RLS entirely, so a policy cannot protect legal text
-- from a process holding a service key — and Phase 2 agents will hold one.
-- Cancellation, payment and package-organiser copy is therefore guarded by a
-- trigger, which applies to every role including service_role and postgres.
--
-- The unlock path is explicit and narrow: an admin calls
-- admin_update_locked_string(), which checks the caller's role through
-- has_role() and sets a transaction-local flag the trigger looks for.
-- has_role() returns false when there is no auth.uid(), so a service key
-- cannot take this path either.

create or replace function guard_locked_strings()
returns trigger
language plpgsql
as $$
declare
  v_unlocked boolean := coalesce(
    current_setting('app.strings_unlocked', true) = 'on', false
  );
begin
  if tg_op = 'DELETE' then
    if old.locked and not v_unlocked then
      raise exception
        'String "%" is locked legal copy and cannot be deleted', old.key
        using errcode = '0A000';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Editing locked copy.
    if old.locked and not v_unlocked then
      raise exception
        'String "%" is locked legal copy. Edit it through '
        'admin_update_locked_string() as an admin.', old.key
        using errcode = '0A000',
              hint = 'Locked rows are cancellation, payment and organiser text.';
    end if;

    -- Unlocking, which is the same act by another route.
    if old.locked and not new.locked and not v_unlocked then
      raise exception
        'String "%" cannot be unlocked directly', old.key
        using errcode = '0A000';
    end if;
  end if;

  return new;
end;
$$;

create trigger strings_guard_locked
  before update or delete on strings
  for each row execute function guard_locked_strings();

comment on function guard_locked_strings() is
  'Applies to every role, service_role included. This is deliberate — a policy '
  'would not, and Phase 2 agents hold a service key.';

-- ---------------------------------------------------------------------------
-- The one sanctioned way to change locked copy.
--
-- SECURITY INVOKER, not DEFINER: the caller must genuinely be an admin, and
-- has_role() must see their auth.uid(). Making this DEFINER would hand the
-- same power to anyone who could call it.

create or replace function admin_update_locked_string(
  p_key         text,
  p_en          text,
  p_ar          text default null,
  p_context     text default null,
  p_approved_by text default null
)
returns strings
language plpgsql
as $$
declare
  v_row strings;
begin
  if not is_admin() then
    raise exception 'Only an admin may edit locked strings'
      using errcode = '42501';
  end if;

  -- Transaction-local: resets automatically, so the window cannot leak into
  -- another statement on the same connection.
  perform set_config('app.strings_unlocked', 'on', true);

  update strings
  set en          = p_en,
      ar          = coalesce(p_ar, ar),
      context     = coalesce(p_context, context),
      approved_by = coalesce(p_approved_by, approved_by),
      approved_at = now()
  where key = p_key
  returning * into v_row;

  if not found then
    raise exception 'No string with key "%"', p_key
      using errcode = 'P0002';
  end if;

  perform set_config('app.strings_unlocked', 'off', true);

  insert into agent_actions (agent, action, entity_type, input, autonomous)
  values ('human:admin', 'update_locked_string', 'strings',
          jsonb_build_object('key', p_key), false);

  return v_row;
end;
$$;

comment on function admin_update_locked_string(text, text, text, text, text) is
  'The only sanctioned path for editing locked legal copy. Admin session '
  'required; a service key cannot use it because has_role() needs auth.uid().';
