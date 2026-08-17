-- Premium Staycations — Session 3 verification
--
-- PREREQUISITE: two users must exist in Supabase Auth.
--   Authentication → Users → Add user. The first user created becomes admin
--   automatically; the second becomes an operator. Confirm with:
--       select p.email, p.role from profiles p;
--   If both came out the same, fix it before running this:
--       update profiles set role = 'operator' where email = '<the second one>';
--
-- Then paste this whole file into the SQL editor and run it. It rolls back at
-- the end and leaves nothing behind.
--
-- HOW TO READ THE OUTPUT
--   The Supabase SQL editor does not display `raise notice`, so this script
--   records every assertion as a row and ends with a select. Read the first
--   row: it is the summary. Any FAIL rows sort immediately below it, ahead of
--   the passes.
--
--   Assertions record a FAIL row rather than raising, so one broken policy
--   does not hide the twenty behind it — a single run reports everything.
--   The exception is section 0: without an admin and an operator no result
--   here means anything, so that one still aborts.
--
--   A run that errors out has therefore hit something unplanned rather than a
--   failed assertion, and the error text is the finding.
--
-- READ THIS BEFORE TRUSTING A PASS: under RLS a blocked UPDATE affects zero
-- rows silently — it does not raise. A blocked INSERT does raise. So the
-- update assertions below check the row count AND that the stored value did
-- not move; catching exceptions alone would pass against a wide-open table.
--
-- And an assertion needs a row to bite on. `update ... where true` against an
-- empty table passes whatever the policy says. Every negative update here
-- targets a fixture row created in section 1 for that purpose.

begin;

-- ===========================================================================
-- Recording
--
-- Temp rather than a real table so the structural checks at the end, which
-- assert RLS on everything in `public`, do not trip over the scaffolding.
-- The impersonated blocks run as `authenticated`, which owns nothing, so both
-- the table and the helper are granted to public.
-- ===========================================================================
create temp table rls_results (
  section    text        not null,
  actor      text        not null,
  check_name text        not null,
  outcome    text        not null,
  detail     text,
  at         timestamptz not null default clock_timestamp()  -- advances mid-transaction
) on commit drop;

grant select, insert on rls_results to public;

create function pg_temp.note(
  p_section text,
  p_actor   text,
  p_check   text,
  p_ok      boolean,
  p_detail  text default null
) returns void
language plpgsql
as $note$
begin
  insert into pg_temp.rls_results (section, actor, check_name, outcome, detail)
  values (p_section, p_actor, p_check,
          case when p_ok then 'PASS' else 'FAIL' end, p_detail);
end;
$note$;

-- ===========================================================================
-- 0. Locate the two users
-- ===========================================================================
do $$
declare v_admin int; v_operator int;
begin
  select count(*) into v_admin    from profiles where role = 'admin'    and active;
  select count(*) into v_operator from profiles where role = 'operator' and active;

  if v_admin = 0 or v_operator = 0 then
    raise exception
      'Need one active admin and one active operator (found % admin, % operator). '
      'Create them in Authentication → Users first.', v_admin, v_operator;
  end if;

  perform pg_temp.note('0 prereq', '—', 'an active admin and an active operator exist', true,
    format('%s admin, %s operator', v_admin, v_operator));
end;
$$;

-- ===========================================================================
-- 1. Fixtures, created as the table owner so RLS does not apply
-- ===========================================================================
do $$
declare
  v_brand uuid; v_prop uuid; v_prod uuid; v_rate uuid; v_elig uuid;
  v_quote uuid; v_room uuid; v_extra uuid; v_bk uuid; v_vch uuid;
begin
  insert into brands (slug, name, domain, from_email)
  values ('rls-verify', 'RLS Verify', 'rls.test', 'r@rls.test') returning id into v_brand;

  insert into properties (adapter, external_property_id, name, emirate, star_rating)
  values ('mock', 'RLS-1', 'RLS Resort', 'dubai', 5) returning id into v_prop;

  insert into products (brand_id, type, name, sourcing, redemption_method)
  values (v_brand, 'attraction', 'RLS Day Pass', 'contracted', 'voucher_code')
  returning id into v_prod;

  insert into product_rates (product_id, valid_from, valid_to, pricing_basis, cost_net, sell_price)
  values (v_prod, current_date, current_date + 365, 'per_person', 185, 299)
  returning id into v_rate;

  -- An eligibility row, so the operator's blocked update below has a target.
  -- Without it that assertion passes against an empty table.
  insert into extra_eligibility (product_id, scope, emirate, priority)
  values (v_prod, 'emirate', 'dubai', 10)
  returning id into v_elig;

  -- A confirmed booking, so voucher reissue has something real to act on.
  insert into quotes (brand_id, total_cost, total_sell, valid_until)
  values (v_brand, 700, 1000, current_date + 7) returning id into v_quote;
  insert into quote_items (quote_id, description, unit_cost, unit_sell, sourcing, property_id)
  values (v_quote, 'Room', 500, 750, 'api', v_prop) returning id into v_room;
  insert into quote_items (quote_id, product_id, description, unit_cost, unit_sell, sourcing)
  values (v_quote, v_prod, 'Day pass', 200, 250, 'contracted') returning id into v_extra;

  insert into bookings (brand_id, quote_id, property_id, total_sell, total_cost, check_in, check_out)
  values (v_brand, v_quote, v_prop, 1000, 700, current_date + 10, current_date + 12)
  returning id into v_bk;

  update bookings set status = 'payment_pending'  where id = v_bk;
  update bookings set status = 'payment_received', amount_paid = 1000 where id = v_bk;
  update bookings set status = 'supplier_booking' where id = v_bk;

  insert into external_bookings
    (booking_id, quote_item_id, adapter, supplier_ref, status, idempotency_key, net_cost)
  values (v_bk, v_room, 'mock', 'RLS-REF', 'confirmed', 'rls-idem', 500);

  insert into vouchers (booking_id, product_id, quote_item_id, redemption_method)
  values (v_bk, v_prod, v_extra, 'voucher_code') returning id into v_vch;

  update bookings set status = 'confirmed' where id = v_bk;

  -- Stash ids for the impersonated blocks, which cannot see these variables.
  create temp table rls_fixture on commit drop as
  select v_brand as brand_id, v_prod as product_id, v_rate as rate_id,
         v_elig as eligibility_id, v_bk as booking_id, v_vch as voucher_id;

  grant select on rls_fixture to public;

  -- Reaching 'confirmed' at all exercises the state machine: it requires a
  -- confirmed supplier record for the API component and a voucher for the
  -- contracted one.
  perform pg_temp.note('1 fixtures', 'owner', 'booking reached confirmed through the state machine', true,
    'brand, property, product, rate, eligibility, quote, booking, external booking, voucher');
end;
$$;

-- ===========================================================================
-- 2. Become the operator
-- ===========================================================================
select set_config(
  'request.jwt.claims',
  json_build_object('sub', p.id, 'role', 'authenticated')::text,
  true
)
from profiles p
where p.role = 'operator' and p.active
order by p.created_at
limit 1;

set local role authenticated;

do $$
declare
  v_rate uuid; v_elig uuid;
  v_before numeric; v_after numeric;
  v_rows int; v_seen int;
  v_pri_before smallint; v_pri_after smallint;
  v_floor_before numeric; v_floor_after numeric;
  v_leaked boolean;
begin
  select rate_id, eligibility_id into v_rate, v_elig from rls_fixture;
  select sell_price into v_before from product_rates where id = v_rate;

  -- Operators read everything.
  select count(*) into v_seen from product_rates where id = v_rate;
  perform pg_temp.note('2 operator', 'operator', 'can read product_rates', v_seen = 1,
    format('%s row(s) visible', v_seen));

  -- THE TEST. If this one is wrong, everything after it is built on sand.
  update product_rates set sell_price = 1 where id = v_rate;
  get diagnostics v_rows = row_count;
  select sell_price into v_after from product_rates where id = v_rate;

  perform pg_temp.note('2 operator', 'operator',
    'UPDATE on product_rates affects 0 rows AND changes nothing',
    v_rows = 0 and v_after is not distinct from v_before,
    format('%s row(s), sell_price %s -> %s', v_rows, v_before, v_after));

  v_leaked := true;
  begin
    insert into product_rates (product_id, valid_from, valid_to, cost_net)
    select product_id, current_date, current_date + 1, 10 from rls_fixture;
  exception when insufficient_privilege then
    v_leaked := false;
  end;
  perform pg_temp.note('2 operator', 'operator', 'INSERT on product_rates is rejected', not v_leaked,
    case when v_leaked then 'the insert SUCCEEDED' else 'insufficient_privilege' end);

  v_leaked := true;
  begin
    insert into products (brand_id, type, name, sourcing, redemption_method)
    select brand_id, 'dining', 'Sneaky', 'contracted', 'voucher_code' from rls_fixture;
  exception when insufficient_privilege then
    v_leaked := false;
  end;
  perform pg_temp.note('2 operator', 'operator', 'INSERT on products is rejected', not v_leaked,
    case when v_leaked then 'the insert SUCCEEDED' else 'insufficient_privilege' end);

  select margin_floor_pct into v_floor_before from brands where slug = 'rls-verify';
  update brands set margin_floor_pct = 99 where slug = 'rls-verify';
  get diagnostics v_rows = row_count;
  select margin_floor_pct into v_floor_after from brands where slug = 'rls-verify';
  perform pg_temp.note('2 operator', 'operator', 'cannot update brands',
    v_rows = 0 and v_floor_after is not distinct from v_floor_before,
    format('%s row(s), margin_floor_pct %s -> %s', v_rows, v_floor_before, v_floor_after));

  select priority into v_pri_before from extra_eligibility where id = v_elig;
  update extra_eligibility set priority = 99 where id = v_elig;
  get diagnostics v_rows = row_count;
  select priority into v_pri_after from extra_eligibility where id = v_elig;
  perform pg_temp.note('2 operator', 'operator', 'cannot update extra_eligibility',
    v_rows = 0 and v_pri_after is not distinct from v_pri_before,
    format('%s row(s), priority %s -> %s', v_rows, v_pri_before, v_pri_after));
end;
$$;

-- --------------------------------------------------------------------------
-- What the operator IS for
-- --------------------------------------------------------------------------
do $$
declare v_task uuid; v_rows int; v_leaked boolean;
begin
  v_leaked := false;
  begin
    insert into tasks (type, priority, summary, raised_by)
    values ('other', 'normal', 'RLS verify task', 'system:verify')
    returning id into v_task;
  exception when insufficient_privilege then
    v_leaked := true;
  end;
  perform pg_temp.note('2 operator', 'operator', 'can raise a task', not v_leaked,
    case when v_leaked then 'REJECTED — the operator cannot do their job' else 'inserted' end);

  if v_task is not null then
    update tasks set status = 'done', resolved_at = now(), resolution_note = 'ok'
    where id = v_task;
    get diagnostics v_rows = row_count;
    perform pg_temp.note('2 operator', 'operator', 'can resolve a task', v_rows = 1,
      format('%s row(s)', v_rows));
  end if;

  v_leaked := false;
  begin
    insert into messages (brand_id, thread_key, direction, channel, body)
    select brand_id, 'rls-verify', 'outbound', 'email', 'hello' from rls_fixture;
  exception when insufficient_privilege then
    v_leaked := true;
  end;
  perform pg_temp.note('2 operator', 'operator', 'can write a message', not v_leaked,
    case when v_leaked then 'REJECTED — the operator cannot do their job' else 'inserted' end);
end;
$$;

-- --------------------------------------------------------------------------
-- Vouchers: reissue only
-- --------------------------------------------------------------------------
do $$
declare
  v_vch uuid; v_rows int; v_new vouchers; v_leaked boolean;
  v_to_before date; v_to_after date;
begin
  select voucher_id into v_vch from rls_fixture;

  select valid_to into v_to_before from vouchers where id = v_vch;
  update vouchers set valid_to = current_date + 999 where id = v_vch;
  get diagnostics v_rows = row_count;
  select valid_to into v_to_after from vouchers where id = v_vch;
  perform pg_temp.note('2 vouchers', 'operator', 'cannot update a voucher directly',
    v_rows = 0 and v_to_after is not distinct from v_to_before,
    format('%s row(s), valid_to %s -> %s', v_rows, v_to_before, v_to_after));

  v_leaked := true;
  begin
    insert into vouchers (booking_id, product_id, redemption_method)
    select booking_id, product_id, 'voucher_code' from rls_fixture;
  exception when insufficient_privilege then
    v_leaked := false;
  end;
  perform pg_temp.note('2 vouchers', 'operator', 'cannot insert a voucher directly', not v_leaked,
    case when v_leaked then 'the insert SUCCEEDED' else 'insufficient_privilege' end);

  -- The one write path the operator does hold, and it is an RPC because
  -- "reissue only" cannot be expressed as a policy.
  v_new := reissue_voucher(v_vch, 'RLS verification');

  perform pg_temp.note('2 vouchers', 'operator', 'reissue_voucher() links the new code to the original',
    v_new.reissued_from = v_vch,
    format('new code %s, reissued_from %s', v_new.code, v_new.reissued_from));

  perform pg_temp.note('2 vouchers', 'operator', 'reissue supersedes the original code',
    (select superseded_at from vouchers where id = v_vch) is not null,
    format('superseded_at %s', (select superseded_at from vouchers where id = v_vch)));
end;
$$;

-- --------------------------------------------------------------------------
-- Supplier-owned and append-only tables
-- --------------------------------------------------------------------------
do $$
declare
  v_leaked boolean; v_rows int; v_before text; v_after text;
begin
  v_leaked := true;
  begin
    insert into properties (adapter, external_property_id, name, emirate)
    values ('mock', 'RLS-2', 'Forged', 'dubai');
  exception when insufficient_privilege then
    v_leaked := false;
  end;
  perform pg_temp.note('2 supplier-owned', 'operator', 'cannot write to the properties cache', not v_leaked,
    case when v_leaked then 'the insert SUCCEEDED' else 'insufficient_privilege' end);

  v_leaked := true;
  begin
    insert into external_bookings
      (booking_id, adapter, supplier_ref, status, idempotency_key, net_cost)
    select booking_id, 'mock', 'FORGED', 'confirmed', 'forged', 0 from rls_fixture;
  exception when insufficient_privilege then
    v_leaked := false;
  end;
  perform pg_temp.note('2 supplier-owned', 'operator', 'cannot forge an external_bookings row', not v_leaked,
    case when v_leaked then 'the insert SUCCEEDED' else 'insufficient_privilege' end);

  v_leaked := true;
  begin
    update agent_actions set reasoning = 'rewritten' where id > 0;
  exception when insufficient_privilege then
    v_leaked := false;
  end;
  perform pg_temp.note('2 supplier-owned', 'operator', 'cannot rewrite agent_actions', not v_leaked,
    case when v_leaked then 'the update was PERMITTED' else 'insufficient_privilege' end);

  v_leaked := true;
  begin
    insert into lpos (lpo_number, total_cost, line_items)
    values ('RLS-LPO', 1, '[]'::jsonb);
  exception when insufficient_privilege or feature_not_supported then
    v_leaked := false;
  end;
  perform pg_temp.note('2 supplier-owned', 'operator', 'cannot write to lpos (dormant)', not v_leaked,
    case when v_leaked then 'the insert SUCCEEDED' else 'rejected' end);

  -- Note the shape of this one. The operator has no write policy on `strings`
  -- at all, so RLS filters the row out before the lock trigger is reached and
  -- nothing is raised — the update simply matches nothing. Asserting on an
  -- exception here would be asserting on the wrong layer. The trigger is what
  -- stops an ADMIN, and that is tested below.
  select en into v_before from strings where key = 'booking.payable_at_property.notice';

  -- Guard against the vacuous pass: if the seed row is missing there is
  -- nothing for the update to fail to change.
  perform pg_temp.note('2 supplier-owned', '—', 'the locked seed string exists to test against',
    v_before is not null, 'booking.payable_at_property.notice');

  update strings set en = 'tampered' where key = 'booking.payable_at_property.notice';
  get diagnostics v_rows = row_count;
  select en into v_after from strings where key = 'booking.payable_at_property.notice';

  perform pg_temp.note('2 supplier-owned', 'operator',
    'cannot edit locked strings (no policy, 0 rows, unchanged)',
    v_before is not null and v_rows = 0 and v_after is not distinct from v_before,
    format('%s row(s), text %s', v_rows,
           case when v_after is not distinct from v_before then 'unchanged' else 'CHANGED' end));
end;
$$;

-- ===========================================================================
-- 3. Become the admin
-- ===========================================================================
reset role;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', p.id, 'role', 'authenticated')::text,
  true
)
from profiles p
where p.role = 'admin' and p.active
order by p.created_at
limit 1;

set local role authenticated;

do $$
declare v_rate uuid; v_rows int; v_after numeric; v_leaked boolean; v_blocked boolean;
begin
  select rate_id into v_rate from rls_fixture;

  update product_rates set sell_price = 349 where id = v_rate;
  get diagnostics v_rows = row_count;
  select sell_price into v_after from product_rates where id = v_rate;
  perform pg_temp.note('3 admin', 'admin', 'CAN update product_rates',
    v_rows = 1 and v_after = 349,
    format('%s row(s), sell_price now %s', v_rows, v_after));

  v_leaked := false;
  begin
    insert into products (brand_id, type, name, sourcing, redemption_method)
    select brand_id, 'wellness', 'Admin Spa', 'contracted', 'voucher_code' from rls_fixture;
  exception when insufficient_privilege then
    v_leaked := true;
  end;
  perform pg_temp.note('3 admin', 'admin', 'can create a product', not v_leaked,
    case when v_leaked then 'REJECTED — the admin cannot do their job' else 'inserted' end);

  -- Even an admin cannot edit locked copy by hand. This is the trigger, not a
  -- policy — which is the point, because service_role bypasses policies.
  v_blocked := false;
  begin
    update strings set en = 'tampered' where key = 'booking.payable_at_property.notice';
  exception when feature_not_supported then
    v_blocked := true;
  end;
  perform pg_temp.note('3 admin', 'admin', 'cannot edit locked copy directly either', v_blocked,
    case when v_blocked then 'feature_not_supported from the guard trigger'
         else 'the update was PERMITTED' end);

  v_leaked := false;
  begin
    perform admin_update_locked_string(
      'booking.payable_at_property.notice',
      (select en from strings where key = 'booking.payable_at_property.notice')
    );
  exception when others then
    v_leaked := true;
  end;
  perform pg_temp.note('3 admin', 'admin', 'CAN edit locked copy through admin_update_locked_string()',
    not v_leaked,
    case when v_leaked then 'the sanctioned path FAILED' else 'accepted' end);
end;
$$;

reset role;

-- ===========================================================================
-- 4. Structural checks
-- ===========================================================================
do $$
declare v_bad text[];
begin
  -- "No blanket using (true) anywhere."
  select array_agg(schemaname || '.' || tablename || '.' || policyname)
  into v_bad
  from pg_policies
  where schemaname = 'public'
    and (qual = 'true' or with_check = 'true');
  perform pg_temp.note('4 structural', '—', 'no policy uses a blanket true qualifier',
    v_bad is null, array_to_string(v_bad, ', '));

  -- RLS on every table.
  select array_agg(c.relname order by c.relname) into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  perform pg_temp.note('4 structural', '—', 'RLS enabled on every table in public',
    v_bad is null, array_to_string(v_bad, ', '));

  -- Every table reachable by at least one policy.
  select array_agg(c.relname order by c.relname) into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);
  perform pg_temp.note('4 structural', '—', 'every table has at least one policy',
    v_bad is null, array_to_string(v_bad, ', '));

  -- anon holds nothing.
  select array_agg(distinct table_name) into v_bad
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public';
  perform pg_temp.note('4 structural', '—', 'anon has no table grants in public',
    v_bad is null, array_to_string(v_bad, ', '));
end;
$$;

-- ===========================================================================
-- The result. Summary first, then any failures, then the passes in order.
-- ===========================================================================
select outcome, section, actor, check_name, detail
from (
  select
    case when exists (select 1 from rls_results where outcome = 'FAIL')
         then 'FAIL' else 'PASS' end                                as outcome,
    '—'                                                             as section,
    '—'                                                             as actor,
    'SUMMARY: '
      || (select count(*) from rls_results where outcome = 'PASS') || ' passed, '
      || (select count(*) from rls_results where outcome = 'FAIL') || ' failed'
                                                                    as check_name,
    'Read this row first. Any failures are listed directly below it.'
                                                                    as detail,
    -1                                                              as ord,
    '-infinity'::timestamptz                                        as at
  union all
  select outcome, section, actor, check_name, coalesce(detail, ''),
         case when outcome = 'FAIL' then 0 else 1 end, at
  from rls_results
) v
order by ord, at;

rollback;
