-- Premium Staycations — Phase 1
-- 15. The stuck-booking watchdog
--
-- Never leave a booking in payment_received unattended. The money is taken and
-- the supplier booking has not started or has not returned; ten minutes is
-- already a long time for a customer holding a payment confirmation.
--
-- This runs in pg_cron rather than Vercel Cron: it sits next to the data,
-- needs no external scheduler, and keeps working through a Vercel outage —
-- which is exactly the kind of outage that strands bookings in this state.

create or replace function escalate_stuck_bookings(p_stuck_minutes int default 10)
returns int
language plpgsql
as $$
declare
  v_raised int := 0;
begin
  with stuck as (
    select b.id, b.reference, b.status, b.amount_paid, b.updated_at
    from bookings b
    where b.status in ('payment_received', 'supplier_booking')
      and b.updated_at < now() - make_interval(mins => p_stuck_minutes)
      and not exists (
        select 1 from tasks t
        where t.booking_id = b.id
          and t.type = 'booking_stuck'
          and t.status = 'open'
      )
  )
  insert into tasks (type, priority, booking_id, summary, context, raised_by)
  select
    'booking_stuck',
    'urgent',
    s.id,
    format(
      'Booking %s has been in %s for %s minutes with AED %s taken',
      s.reference,
      s.status,
      round(extract(epoch from (now() - s.updated_at)) / 60)::int,
      s.amount_paid
    ),
    jsonb_build_object(
      'reference',        s.reference,
      'status',           s.status,
      'stuck_since',      s.updated_at,
      'amount_paid',      s.amount_paid,
      'external_bookings', coalesce((
        select jsonb_agg(jsonb_build_object(
          'supplier_ref',  eb.supplier_ref,
          'adapter',       eb.adapter,
          'status',        eb.status,
          'attempt',       eb.attempt,
          'failure_class', eb.failure_class,
          'net_cost',      eb.net_cost
        ))
        from external_bookings eb where eb.booking_id = s.id
      ), '[]'::jsonb)
    ),
    'system:watchdog'
  from stuck s;

  get diagnostics v_raised = row_count;

  if v_raised > 0 then
    insert into agent_actions (agent, action, entity_type, output, autonomous)
    values ('system:watchdog', 'escalate_stuck_bookings', 'bookings',
            jsonb_build_object('tasks_raised', v_raised), true);
  end if;

  return v_raised;
end;
$$;

comment on function escalate_stuck_bookings(int) is
  'Raises one urgent task per stranded booking. Idempotent — re-running while '
  'a task is still open raises nothing. The task context carries the supplier '
  'references so an operator can act without reconstructing anything.';

-- supplier_booking is included alongside payment_received deliberately: if the
-- process dies mid-book() the booking sits in supplier_booking with money
-- taken, which is the same hazard by a different name. Flagged as a small
-- extension of the specified rule.

-- ---------------------------------------------------------------------------
-- Schedule. pg_cron may need enabling once from the Supabase dashboard
-- (Database → Extensions) before this succeeds. The function above is created
-- regardless, so a failure here costs only the schedule, which can be added by
-- hand with the same cron.schedule call.

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      create extension pg_cron;
    exception when others then
      raise notice
        'pg_cron is not enabled and could not be created (%). Enable it in '
        'Supabase → Database → Extensions, then run: '
        'select cron.schedule(''escalate-stuck-bookings'', ''* * * * *'', '
        '''select escalate_stuck_bookings(10)'');', sqlerrm;
      return;
    end;
  end if;

  perform cron.unschedule('escalate-stuck-bookings')
  where exists (
    select 1 from cron.job where jobname = 'escalate-stuck-bookings'
  );

  perform cron.schedule(
    'escalate-stuck-bookings',
    '* * * * *',
    'select escalate_stuck_bookings(10)'
  );
end;
$$;
