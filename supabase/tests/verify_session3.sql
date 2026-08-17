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
-- READ THIS BEFORE TRUSTING A PASS: under RLS a blocked UPDATE affects zero
-- rows silently — it does not raise. A blocked INSERT does raise. So the
-- update assertions below check the row count AND that the stored value did
-- not move; catching exceptions alone would pass against a wide-open table.

begin;

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
  raise notice 'Found % admin and % operator profile(s)', v_admin, v_operator;
end;
$$;

-- ===========================================================================
-- 1. Fixtures, created as the table owner so RLS does not apply
-- ===========================================================================
do $$
declare
  v_brand uuid; v_prop uuid; v_prod uuid; v_rate uuid;
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
  -- Temp rather than a real table so the structural checks at the end, which
  -- assert RLS on everything in `public`, do not trip over the scaffolding.
  create temp table rls_fixture on commit drop as
  select v_brand as brand_id, v_prod as product_id, v_rate as rate_id,
         v_bk as booking_id, v_vch as voucher_id;

  -- The impersonated blocks run as `authenticated`, which owns nothing.
  grant select on rls_fixture to public;

  raise notice 'Fixtures created';
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
  v_rate uuid; v_before numeric; v_after numeric; v_rows int; v_seen int;
begin
  select rate_id into v_rate from rls_fixture;
  select sell_price into v_before from product_rates where id = v_rate;

  -- Operators read everything.
  select count(*) into v_seen from product_rates where id = v_rate;
  if v_seen <> 1 then
    raise exception 'FAIL: operator cannot read product_rates';
  end if;
  raise notice 'PASS: operator can read product_rates';

  -- THE TEST. If this one is wrong, everything after it is built on sand.
  update product_rates set sell_price = 1 where id = v_rate;
  get diagnostics v_rows = row_count;
  select sell_price into v_after from product_rates where id = v_rate;

  if v_rows <> 0 or v_after is distinct from v_before then
    raise exception
      'FAIL: operator updated product_rates (% rows, % -> %)', v_rows, v_before, v_after;
  end if;
  raise notice 'PASS: operator UPDATE on product_rates affected 0 rows and changed nothing';

  begin
    insert into product_rates (product_id, valid_from, valid_to, cost_net)
    select product_id, current_date, current_date + 1, 10 from rls_fixture;
    raise exception 'FAIL: operator inserted into product_rates';
  exception when insufficient_privilege then
    raise notice 'PASS: operator INSERT on product_rates is rejected';
  end;

  begin
    insert into products (brand_id, type, name, sourcing, redemption_method)
    select brand_id, 'dining', 'Sneaky', 'contracted', 'voucher_code' from rls_fixture;
    raise exception 'FAIL: operator inserted a product';
  exception when insufficient_privilege then
    raise notice 'PASS: operator INSERT on products is rejected';
  end;

  update brands set margin_floor_pct = 99 where slug = 'rls-verify';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL: operator updated brands'; end if;
  raise notice 'PASS: operator cannot update brands';

  update extra_eligibility set priority = 99 where true;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL: operator updated extra_eligibility'; end if;
  raise notice 'PASS: operator cannot update extra_eligibility';
end;
$$;

-- --------------------------------------------------------------------------
-- What the operator IS for
-- --------------------------------------------------------------------------
do $$
declare v_task uuid; v_rows int;
begin
  insert into tasks (type, priority, summary, raised_by)
  values ('other', 'normal', 'RLS verify task', 'system:verify')
  returning id into v_task;
  raise notice 'PASS: operator can raise a task';

  update tasks set status = 'done', resolved_at = now(), resolution_note = 'ok'
  where id = v_task;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'FAIL: operator could not resolve a task'; end if;
  raise notice 'PASS: operator can resolve a task';

  insert into messages (brand_id, thread_key, direction, channel, body)
  select brand_id, 'rls-verify', 'outbound', 'email', 'hello' from rls_fixture;
  raise notice 'PASS: operator can write a message';
end;
$$;

-- --------------------------------------------------------------------------
-- Vouchers: reissue only
-- --------------------------------------------------------------------------
do $$
declare v_vch uuid; v_rows int; v_new vouchers;
begin
  select voucher_id into v_vch from rls_fixture;

  update vouchers set valid_to = current_date + 999 where id = v_vch;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FAIL: operator updated a voucher directly'; end if;
  raise notice 'PASS: operator cannot update a voucher directly';

  begin
    insert into vouchers (booking_id, product_id, redemption_method)
    select booking_id, product_id, 'voucher_code' from rls_fixture;
    raise exception 'FAIL: operator inserted a voucher directly';
  exception when insufficient_privilege then
    raise notice 'PASS: operator cannot insert a voucher directly';
  end;

  v_new := reissue_voucher(v_vch, 'RLS verification');
  if v_new.reissued_from <> v_vch then
    raise exception 'FAIL: reissue did not link to the original';
  end if;
  if (select superseded_at from vouchers where id = v_vch) is null then
    raise exception 'FAIL: the original voucher was not superseded';
  end if;
  raise notice 'PASS: operator can reissue through reissue_voucher(), old code superseded, new code %',
    v_new.code;
end;
$$;

-- --------------------------------------------------------------------------
-- Supplier-owned and append-only tables
-- --------------------------------------------------------------------------
do $$
begin
  begin
    insert into properties (adapter, external_property_id, name, emirate)
    values ('mock', 'RLS-2', 'Forged', 'dubai');
    raise exception 'FAIL: operator wrote to properties';
  exception when insufficient_privilege then
    raise notice 'PASS: operator cannot write to the properties cache';
  end;

  begin
    insert into external_bookings
      (booking_id, adapter, supplier_ref, status, idempotency_key, net_cost)
    select booking_id, 'mock', 'FORGED', 'confirmed', 'forged', 0 from rls_fixture;
    raise exception 'FAIL: operator forged an external booking';
  exception when insufficient_privilege then
    raise notice 'PASS: operator cannot forge an external_bookings row';
  end;

  begin
    update agent_actions set reasoning = 'rewritten' where id > 0;
    raise exception 'FAIL: operator rewrote the audit log';
  exception when insufficient_privilege then
    raise notice 'PASS: operator cannot rewrite agent_actions';
  end;

  begin
    insert into lpos (lpo_number, total_cost, line_items)
    values ('RLS-LPO', 1, '[]'::jsonb);
    raise exception 'FAIL: operator wrote to a dormant table';
  exception when insufficient_privilege or feature_not_supported then
    raise notice 'PASS: operator cannot write to lpos';
  end;

  -- Note the shape of this one. The operator has no write policy on `strings`
  -- at all, so RLS filters the row out before the lock trigger is reached and
  -- nothing is raised — the update simply matches nothing. Asserting on an
  -- exception here would be asserting on the wrong layer. The trigger is what
  -- stops an ADMIN, and that is tested below.
  declare v_rows int; v_before text; v_after text;
  begin
    select en into v_before from strings where key = 'booking.payable_at_property.notice';
    update strings set en = 'tampered' where key = 'booking.payable_at_property.notice';
    get diagnostics v_rows = row_count;
    select en into v_after from strings where key = 'booking.payable_at_property.notice';

    if v_rows <> 0 or v_after is distinct from v_before then
      raise exception 'FAIL: operator edited locked legal copy (% rows)', v_rows;
    end if;
    raise notice 'PASS: operator cannot edit locked strings (no policy, 0 rows, unchanged)';
  end;
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
declare v_rate uuid; v_rows int; v_after numeric;
begin
  select rate_id into v_rate from rls_fixture;

  update product_rates set sell_price = 349 where id = v_rate;
  get diagnostics v_rows = row_count;
  select sell_price into v_after from product_rates where id = v_rate;

  if v_rows <> 1 or v_after <> 349 then
    raise exception 'FAIL: admin could not update product_rates (% rows, now %)', v_rows, v_after;
  end if;
  raise notice 'PASS: admin CAN update product_rates';

  insert into products (brand_id, type, name, sourcing, redemption_method)
  select brand_id, 'wellness', 'Admin Spa', 'contracted', 'voucher_code' from rls_fixture;
  raise notice 'PASS: admin can create a product';

  -- Even an admin cannot edit locked copy by hand.
  begin
    update strings set en = 'tampered' where key = 'booking.payable_at_property.notice';
    raise exception 'FAIL: admin edited locked copy directly';
  exception when feature_not_supported then
    raise notice 'PASS: admin cannot edit locked copy directly either';
  end;

  perform admin_update_locked_string(
    'booking.payable_at_property.notice',
    (select en from strings where key = 'booking.payable_at_property.notice')
  );
  raise notice 'PASS: admin CAN edit locked copy through admin_update_locked_string()';
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

  if v_bad is not null then
    raise exception 'FAIL: blanket policies found: %', v_bad;
  end if;
  raise notice 'PASS: no policy uses a blanket true qualifier';

  -- RLS on every table.
  select array_agg(c.relname order by c.relname) into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v_bad is not null then
    raise exception 'FAIL: RLS not enabled on %', v_bad;
  end if;
  raise notice 'PASS: RLS enabled on every table in public';

  -- Every table reachable by at least one policy.
  select array_agg(c.relname order by c.relname) into v_bad
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

  if v_bad is not null then
    raise exception 'FAIL: tables with RLS on and no policy at all: %', v_bad;
  end if;
  raise notice 'PASS: every table has at least one policy';

  -- anon holds nothing.
  select array_agg(distinct table_name) into v_bad
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public';

  if v_bad is not null then
    raise exception 'FAIL: anon still holds grants on %', v_bad;
  end if;
  raise notice 'PASS: anon has no table grants in public';
end;
$$;

rollback;
