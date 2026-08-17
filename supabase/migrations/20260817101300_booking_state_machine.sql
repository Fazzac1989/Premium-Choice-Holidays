-- Premium Staycations — Phase 1
-- 13. The booking state machine
--
--   draft → payment_pending → payment_received → supplier_booking
--         → confirmed → travelling → completed
--                             ↓
--                 failed_rollback | cancelled | refunded
--
-- Guarded in Postgres, not in the prompt. An agent cannot reach confirmed by
-- being persuasive.

create or replace function booking_transition_allowed(
  p_from booking_status,
  p_to   booking_status
)
returns boolean
language sql
immutable
as $$
  select case p_from
    when 'draft'            then p_to in ('payment_pending', 'cancelled')
    when 'payment_pending'  then p_to in ('payment_received', 'cancelled')
    when 'payment_received' then p_to in ('supplier_booking', 'failed_rollback')
    when 'supplier_booking' then p_to in ('confirmed', 'failed_rollback')
    when 'confirmed'        then p_to in ('travelling', 'cancelled')
    when 'travelling'       then p_to in ('completed', 'cancelled')
    when 'completed'        then false
    when 'failed_rollback'  then p_to in ('refunded', 'cancelled')
    when 'cancelled'        then p_to in ('refunded')
    when 'refunded'         then false
  end;
$$;

comment on function booking_transition_allowed(booking_status, booking_status) is
  'The whole legal transition set. There is no path from payment_received to '
  'confirmed that skips supplier_booking.';

-- ---------------------------------------------------------------------------

create or replace function guard_booking_status()
returns trigger
language plpgsql
as $$
declare
  v_api_items      int;
  v_api_confirmed  int;
  v_contracted     int;
  v_vouchers       int;
  v_any_confirmed  int;
  v_refund_rows    int;
  v_open_tasks     int;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not booking_transition_allowed(old.status, new.status) then
    raise exception
      'Illegal booking transition % -> % on booking %',
      old.status, new.status, old.reference
      using errcode = '23514',
            hint = 'See booking_transition_allowed() for the legal set.';
  end if;

  -- ---------------------------------------------------------------- confirmed
  if new.status = 'confirmed' then

    -- Without a quote there are no components to check, and every count below
    -- would pass vacuously.
    if new.quote_id is null then
      raise exception
        'Booking % cannot be confirmed without a quote', new.reference
        using errcode = '23514';
    end if;

    -- Every component of every booking confirms instantly. That property is
    -- the whole design, so confirmation is proved against supplier records
    -- rather than asserted.
    select count(*) into v_any_confirmed
    from external_bookings eb
    where eb.booking_id = new.id and eb.status = 'confirmed';

    if v_any_confirmed = 0 then
      raise exception
        'Booking % cannot be confirmed: no confirmed external_bookings row exists',
        new.reference
        using errcode = '23514';
    end if;

    -- Count components rather than rows, so two confirmations for the same
    -- component cannot stand in for a second component that never booked.
    select count(*) into v_api_items
    from quote_items qi
    where qi.quote_id = new.quote_id and qi.sourcing = 'api';

    select count(distinct eb.quote_item_id) into v_api_confirmed
    from external_bookings eb
    where eb.booking_id = new.id
      and eb.status = 'confirmed'
      and eb.quote_item_id is not null;

    if v_api_confirmed < v_api_items then
      raise exception
        'Booking % cannot be confirmed: % of % API components have a confirmed '
        'supplier record',
        new.reference, v_api_confirmed, v_api_items
        using errcode = '23514';
    end if;

    -- No voucher, no confirmation.
    select count(*) into v_contracted
    from quote_items qi
    where qi.quote_id = new.quote_id and qi.sourcing = 'contracted';

    select count(distinct v.quote_item_id) into v_vouchers
    from vouchers v
    where v.booking_id = new.id
      and v.quote_item_id is not null
      and v.superseded_at is null;

    if v_vouchers < v_contracted then
      raise exception
        'Booking % cannot be confirmed: % of % contracted extras have an issued '
        'voucher',
        new.reference, v_vouchers, v_contracted
        using errcode = '23514',
              hint = 'Insert vouchers in the same transaction as the status change.';
    end if;

    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;

  -- ---------------------------------------------------------- failed_rollback
  -- Payment succeeded, the supplier booking did not. A booking may never sit
  -- here without both the money record and the human queue item that make it
  -- recoverable — enforcing it means the acceptance test cannot pass by
  -- accident and production cannot fail silently.
  if new.status = 'failed_rollback' then

    if new.amount_paid > 0 then
      select count(*) into v_refund_rows
      from payments p
      where p.booking_id = new.id
        and p.direction = 'out'
        and p.method = 'refund';

      if v_refund_rows = 0 then
        raise exception
          'Booking % cannot enter failed_rollback: % was paid and no refund '
          'payments row exists',
          new.reference, new.amount_paid
          using errcode = '23514',
                hint = 'Record the refund row first, in the same transaction.';
      end if;
    end if;

    select count(*) into v_open_tasks
    from tasks t
    where t.booking_id = new.id
      and t.status = 'open'
      and t.priority = 'urgent';

    if v_open_tasks = 0 then
      raise exception
        'Booking % cannot enter failed_rollback without an open urgent task',
        new.reference
        using errcode = '23514',
              hint = 'Raise the task in the same transaction as the status change.';
    end if;
  end if;

  -- ---------------------------------------------------------------- cancelled
  if new.status in ('cancelled', 'refunded') then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  end if;

  return new;
end;
$$;

create trigger bookings_guard_status
  before update on bookings
  for each row execute function guard_booking_status();

-- ---------------------------------------------------------------------------
-- Every booking starts at draft, including seeded ones. Seeding through the
-- real transitions costs a little more to write and exercises every guard
-- above for free.

create or replace function guard_booking_insert()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'draft' then
    raise exception
      'Bookings must be created in draft (got %). Transition through the state '
      'machine rather than inserting a later state.',
      new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger bookings_guard_insert
  before insert on bookings
  for each row execute function guard_booking_insert();
