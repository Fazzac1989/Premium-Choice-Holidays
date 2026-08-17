-- Premium Staycations — Session 2 verification
--
-- Paste into the Supabase SQL editor and run whole. Everything happens inside
-- a transaction that rolls back at the end, so it leaves no data behind.
--
-- Each block prints either a PASS line or raises. A raise means the schema is
-- wrong; stop and fix it before Session 3.

begin;

-- ===========================================================================
-- 1. Enums are Postgres types, not text columns
-- ===========================================================================
do $$
declare
  v_missing text[];
  v_expected text[] := array[
    'user_role','sourcing_type','pricing_basis','product_type','supplier_type',
    'emirate','eligibility_scope','redemption_method','fee_type','fee_basis',
    'enquiry_status','quote_status','booking_status','booking_order_strategy',
    'external_booking_status','payment_direction','payment_method',
    'task_status','task_priority','task_type','message_direction',
    'message_channel','supplier_failure_class'
  ];
begin
  select array_agg(e) into v_missing
  from unnest(v_expected) e
  where not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = e and t.typtype = 'e' and n.nspname = 'public'
  );

  if v_missing is not null then
    raise exception 'FAIL: these enums do not exist as Postgres types: %', v_missing;
  end if;
  raise notice 'PASS: all % enums exist as Postgres types', array_length(v_expected, 1);
end;
$$;

-- on_request must not exist anywhere in the sourcing vocabulary.
do $$
begin
  if exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'sourcing_type' and e.enumlabel = 'on_request'
  ) then
    raise exception 'FAIL: sourcing_type still contains on_request';
  end if;
  raise notice 'PASS: sourcing_type is api | contracted only';
end;
$$;

-- ===========================================================================
-- 2. Dormant tables exist, are commented, and reject writes
-- ===========================================================================
do $$
declare v_comment text;
begin
  foreach v_comment in array array['lpos','supplier_confirmations'] loop
    if obj_description(v_comment::regclass, 'pg_class') is null
       or obj_description(v_comment::regclass, 'pg_class') not like '%DORMANT%' then
      raise exception 'FAIL: % has no DORMANT table comment', v_comment;
    end if;
  end loop;
  raise notice 'PASS: lpos and supplier_confirmations exist and are commented dormant';
end;
$$;

do $$
begin
  begin
    insert into lpos (lpo_number, total_cost, line_items)
    values ('TEST-1', 100, '[]'::jsonb);
    raise exception 'FAIL: a write to lpos succeeded';
  exception when feature_not_supported then
    raise notice 'PASS: writes to lpos are rejected';
  end;
end;
$$;

-- ===========================================================================
-- 3. The booking status trigger
-- ===========================================================================
do $$
declare
  v_brand   uuid;
  v_booking uuid;
begin
  insert into brands (slug, name, domain, from_email)
  values ('verify-tmp', 'Verify', 'example.test', 'v@example.test')
  returning id into v_brand;

  -- Bookings must start in draft
  begin
    insert into bookings (brand_id, status, total_sell, total_cost)
    values (v_brand, 'confirmed', 100, 80);
    raise exception 'FAIL: a booking was inserted directly as confirmed';
  exception when check_violation then
    raise notice 'PASS: bookings cannot be inserted in a non-draft state';
  end;

  insert into bookings (brand_id, total_sell, total_cost)
  values (v_brand, 1000, 700)
  returning id into v_booking;

  -- Illegal transition
  begin
    update bookings set status = 'confirmed' where id = v_booking;
    raise exception 'FAIL: draft -> confirmed was allowed';
  exception when check_violation then
    raise notice 'PASS: draft -> confirmed is rejected';
  end;

  -- Walk the legal path to supplier_booking
  update bookings set status = 'payment_pending' where id = v_booking;
  update bookings set status = 'payment_received', amount_paid = 1000 where id = v_booking;
  update bookings set status = 'supplier_booking' where id = v_booking;

  -- THE CHECK FROM THE RUN GUIDE: confirmed without an external_bookings row
  begin
    update bookings set status = 'confirmed' where id = v_booking;
    raise exception 'FAIL: confirmed was allowed with no external_bookings row';
  exception when check_violation then
    raise notice 'PASS: confirmed is rejected without a confirmed external_bookings row';
  end;

  -- failed_rollback without a refund record
  begin
    update bookings set status = 'failed_rollback' where id = v_booking;
    raise exception 'FAIL: failed_rollback was allowed with money taken and no refund row';
  exception when check_violation then
    raise notice 'PASS: failed_rollback requires a refund payments row and an urgent task';
  end;

  -- Now do it properly: refund row + urgent task, same transaction
  insert into payments (booking_id, direction, method, amount)
  values (v_booking, 'out', 'refund', 1000);

  insert into tasks (type, priority, booking_id, summary, raised_by)
  values ('refund', 'urgent', v_booking, 'Verify script', 'system:verify');

  update bookings set status = 'failed_rollback' where id = v_booking;
  raise notice 'PASS: failed_rollback succeeds once the refund row and urgent task exist';
end;
$$;

-- ===========================================================================
-- 4. Locked strings resist a service key
-- ===========================================================================
do $$
begin
  begin
    update strings set en = 'tampered'
    where key = 'booking.failed_rollback.email_body';
    raise exception 'FAIL: locked legal copy was editable';
  exception when feature_not_supported then
    raise notice 'PASS: locked strings reject a direct update (this session is postgres, '
                 'which bypasses RLS — the trigger held anyway)';
  end;

  begin
    update strings set locked = false
    where key = 'booking.failed_rollback.email_body';
    raise exception 'FAIL: a locked string was unlocked directly';
  exception when feature_not_supported then
    raise notice 'PASS: locked strings cannot be unlocked directly';
  end;
end;
$$;

-- ===========================================================================
-- 5. Child bands cannot overlap, and the infant-free case fits
-- ===========================================================================
do $$
declare
  v_brand uuid; v_prod uuid; v_rate uuid;
begin
  insert into brands (slug, name, domain, from_email)
  values ('verify-tmp-2', 'Verify', 'example.test', 'v@example.test')
  returning id into v_brand;

  insert into products (brand_id, type, name, sourcing, redemption_method)
  values (v_brand, 'attraction', 'Verify Waterpark', 'contracted', 'voucher_code')
  returning id into v_prod;

  insert into product_rates (product_id, valid_from, valid_to, pricing_basis, cost_net, sell_price)
  values (v_prod, current_date, current_date + 365, 'per_person', 185, 299)
  returning id into v_rate;

  -- The case the single child_price column could not express
  insert into product_rate_child_bands (rate_id, label, age_min, age_max, cost_net, sell_price)
  values (v_rate, 'Infant', 0, 2, 0, 0),
         (v_rate, 'Child',  3, 11, 150, 239);
  raise notice 'PASS: infant-free and child bands coexist on one rate row';

  begin
    insert into product_rate_child_bands (rate_id, age_min, age_max, cost_net, sell_price)
    values (v_rate, 10, 14, 150, 239);
    raise exception 'FAIL: overlapping child bands were accepted';
  exception when exclusion_violation then
    raise notice 'PASS: overlapping child bands are rejected';
  end;

  -- Freesale-only
  begin
    insert into products (brand_id, type, name, sourcing, redemption_method, freesale)
    values (v_brand, 'transfer', 'Verify Transfer', 'contracted', 'voucher_code', false);
    raise exception 'FAIL: a non-freesale contracted product was accepted';
  exception when check_violation then
    raise notice 'PASS: non-freesale contracted products are rejected';
  end;
end;
$$;

-- ===========================================================================
-- 6. Eligibility scope fields, and the Dubai/Abu Dhabi separation
-- ===========================================================================
do $$
declare v_brand uuid; v_prod uuid;
begin
  select id into v_brand from brands where slug = 'verify-tmp-2';
  select id into v_prod from products where name = 'Verify Waterpark';

  begin
    insert into extra_eligibility (product_id, scope) values (v_prod, 'emirate');
    raise exception 'FAIL: an emirate-scoped rule with no emirate was accepted';
  exception when check_violation then
    raise notice 'PASS: eligibility rows must carry the field their scope needs';
  end;

  insert into extra_eligibility (product_id, scope, emirate, priority)
  values (v_prod, 'emirate', 'dubai', 10);
  raise notice 'PASS: Dubai-scoped eligibility with explicit priority accepted';
end;
$$;

-- ===========================================================================
-- 7. Fee rules — Dubai loaded, Abu Dhabi deliberately absent
-- ===========================================================================
do $$
declare v_dubai int; v_ad int;
begin
  select count(*) into v_dubai from property_fees
   where emirate = 'dubai' and fee_type = 'tourism_dirham';
  select count(*) into v_ad from property_fees where emirate = 'abu_dhabi';

  if v_dubai < 5 then
    raise exception 'FAIL: Dubai Tourism Dirham bands are incomplete (% rows)', v_dubai;
  end if;
  raise notice 'PASS: Dubai Tourism Dirham loaded for all five star ratings';

  if v_ad > 0 then
    raise notice 'NOTE: Abu Dhabi fee rules are now present — confirm they were '
                 'verified against WebBeds certification before selling AD inventory';
  else
    raise notice 'PASS (expected): Abu Dhabi has no fee rules yet. '
                 'fees_for_property() returns nothing and assembly must raise a task.';
  end if;
end;
$$;

-- ===========================================================================
-- 8. The watchdog is scheduled
-- ===========================================================================
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'TODO: pg_cron is not enabled. Enable it in Supabase → Database → '
                 'Extensions, then run migration 15 again.';
  elsif not exists (select 1 from cron.job where jobname = 'escalate-stuck-bookings') then
    raise notice 'TODO: pg_cron is enabled but the job is not scheduled. Run: '
                 'select cron.schedule(''escalate-stuck-bookings'', ''* * * * *'', '
                 '''select escalate_stuck_bookings(10)'');';
  else
    raise notice 'PASS: the stuck-booking watchdog is scheduled every minute';
  end if;
end;
$$;

-- ===========================================================================
-- 9. The happy path — confirmed must be reachable, not merely well guarded
-- ===========================================================================
do $$
declare
  v_brand uuid; v_prop uuid; v_quote uuid; v_bk uuid;
  v_room uuid; v_extra_item uuid; v_prod uuid;
  v_deadline timestamptz := now() + interval '3 days';
begin
  insert into brands (slug, name, domain, from_email)
  values ('verify-tmp-3', 'Verify', 'example.test', 'v@example.test')
  returning id into v_brand;

  insert into properties (adapter, external_property_id, name, emirate, star_rating, check_in_time)
  values ('mock', 'VERIFY-1', 'Verify Beach Resort', 'dubai', 5, '15:00')
  returning id into v_prop;

  insert into products (brand_id, type, name, sourcing, redemption_method)
  values (v_brand, 'attraction', 'Verify Day Pass', 'contracted', 'voucher_code')
  returning id into v_prod;

  insert into quotes (brand_id, total_cost, total_sell, valid_until)
  values (v_brand, 700, 1000, current_date + 7)
  returning id into v_quote;

  insert into quote_items (quote_id, description, unit_cost, unit_sell, sourcing, property_id)
  values (v_quote, 'Deluxe room, 2 nights', 500, 750, 'api', v_prop)
  returning id into v_room;

  insert into quote_items (quote_id, product_id, description, unit_cost, unit_sell, sourcing)
  values (v_quote, v_prod, 'Day pass x2', 200, 250, 'contracted')
  returning id into v_extra_item;

  insert into bookings (brand_id, quote_id, property_id, total_sell, total_cost, check_in, check_out)
  values (v_brand, v_quote, v_prop, 1000, 700, current_date + 10, current_date + 12)
  returning id into v_bk;

  update bookings set status = 'payment_pending' where id = v_bk;
  update bookings set status = 'payment_received', amount_paid = 1000 where id = v_bk;
  update bookings set status = 'supplier_booking' where id = v_bk;

  insert into external_bookings
    (booking_id, quote_item_id, adapter, supplier_ref, status, idempotency_key,
     net_cost, free_cancel_until, net_rate_tax_inclusive)
  values (v_bk, v_room, 'mock', 'VERIFY-REF-1', 'confirmed', 'verify-idem-1',
          500, v_deadline, true);

  -- Room confirmed, extra not yet vouchered.
  begin
    update bookings set status = 'confirmed' where id = v_bk;
    raise exception 'FAIL: confirmed with no voucher for the contracted extra';
  exception when check_violation then
    raise notice 'PASS: no voucher, no confirmation';
  end;

  insert into vouchers (booking_id, product_id, quote_item_id, redemption_method)
  values (v_bk, v_prod, v_extra_item, 'voucher_code');

  update bookings set status = 'confirmed' where id = v_bk;
  raise notice 'PASS: confirmed is reachable once every component is proved';

  if (select confirmed_at from bookings where id = v_bk) is null then
    raise exception 'FAIL: confirmed_at was not stamped';
  end if;
  raise notice 'PASS: confirmed_at stamped by the trigger';

  if (select free_cancel_until from bookings where id = v_bk) is distinct from v_deadline then
    raise exception 'FAIL: free_cancel_until was not copied onto the booking';
  end if;
  raise notice 'PASS: free_cancel_until copied from the earliest component deadline';

  raise notice 'Booking reference format: %', (select reference from bookings where id = v_bk);
end;
$$;

rollback;
