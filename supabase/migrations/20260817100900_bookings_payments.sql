-- Premium Staycations — Phase 1
-- 09. Bookings, guests, payments

create sequence booking_reference_seq start 1;

-- PST-YYMM-NNNN. The sequence is global rather than per-month; the month
-- segment is a readability aid, not a key. Collisions are impossible either
-- way and a per-month reset would need a lock we do not want on the hot path.
create or replace function generate_booking_reference()
returns text
language sql
volatile
as $$
  select 'PST-'
      || to_char(now() at time zone 'Asia/Dubai', 'YYMM')
      || '-'
      || lpad(nextval('booking_reference_seq')::text, 4, '0');
$$;

create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  reference           text unique not null default generate_booking_reference(),
  brand_id            uuid not null references brands(id),
  quote_id            uuid references quotes(id),
  customer_id         uuid references customers(id),
  property_id         uuid references properties(id),

  status              booking_status not null default 'draft',

  -- Which ordering was used. Only 'payment_first' is implemented in Phase 1;
  -- the column exists so that when free-cancel rates invert the order once a
  -- gateway is live, historic bookings remain interpretable.
  order_strategy      booking_order_strategy not null default 'payment_first',

  check_in            date,
  check_out           date,

  total_sell          numeric not null,
  total_cost          numeric not null,
  rounding_delta      numeric not null default 0,
  amount_paid         numeric not null default 0,
  balance_due_date    date,

  -- Fees the hotel collects at checkout. Excluded from total_sell, shown
  -- explicitly on the quote, the confirmation and the voucher in both
  -- languages. A surprise fee at check-in is the failure mode that kills a
  -- one-price proposition.
  payable_at_property numeric not null default 0,
  payable_at_property_breakdown jsonb,

  -- Copied from the earliest component deadline by trigger, so the finance
  -- agent can flag approaching deadlines without joining out.
  free_cancel_until   timestamptz,

  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  cancellation_reason text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint bookings_reference_format
    check (reference ~ '^PST-[0-9]{4}-[0-9]{4,}$'),
  constraint bookings_dates_ordered
    check (check_out is null or check_in is null or check_out > check_in),
  constraint bookings_totals_positive
    check (total_sell >= 0 and total_cost >= 0),
  constraint bookings_payable_at_property_positive
    check (payable_at_property >= 0)
);

create trigger bookings_set_updated_at
  before update on bookings
  for each row execute function set_updated_at();

create index bookings_status_idx on bookings (brand_id, status);
create index bookings_check_in_idx on bookings (check_in);
create index bookings_free_cancel_idx on bookings (free_cancel_until)
  where free_cancel_until is not null;

-- Partial index for the watchdog in migration 15. Anything sitting in
-- payment_received is by definition a small set, and this keeps the
-- once-a-minute scan off the main index.
create index bookings_awaiting_supplier_idx on bookings (updated_at)
  where status = 'payment_received';

comment on column bookings.order_strategy is
  'Phase 1 implements payment_first only. booking_first is the seam for '
  'free-cancellation rates once a payment gateway exists.';

comment on column bookings.payable_at_property is
  'Tourism Dirham and anything else the property collects directly. Never '
  'included in total_sell.';

-- ---------------------------------------------------------------------------
-- Guests
--
-- Date of birth rather than age. A child who is 2 at booking and 3 on arrival
-- is charged by the hotel on arrival age, and the infant-free rule is exactly
-- where that bites. age_at_check_in is generated so band selection cannot
-- accidentally be done against the booking date.

create table booking_guests (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id) on delete cascade,
  full_name       text,
  date_of_birth   date,
  is_lead         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index booking_guests_booking_idx on booking_guests (booking_id);

-- One lead guest per booking.
create unique index booking_guests_one_lead_idx
  on booking_guests (booking_id) where is_lead;

comment on table booking_guests is
  'Date of birth is captured so child bands resolve against the check-in date, '
  'not the booking date. See guest_age_at().';

-- Age of each guest on the booking check-in date.
create or replace function booking_guest_ages(p_booking_id uuid)
returns table (guest_id uuid, full_name text, age int)
language sql
stable
as $$
  select g.id, g.full_name, guest_age_at(g.date_of_birth, b.check_in)
  from booking_guests g
  join bookings b on b.id = g.booking_id
  where g.booking_id = p_booking_id;
$$;

-- ---------------------------------------------------------------------------
-- Payments
--
-- Money is read-only to agents. Rows are recorded and reconciled here; nothing
-- in this phase moves funds. A refund is an unreconciled outbound row plus an
-- urgent task, and the customer is told the refund has been initiated.

create table payments (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references bookings(id),
  direction     payment_direction not null,
  method        payment_method not null,
  amount        numeric not null,
  currency      text not null default 'AED',
  gateway_ref   text,
  bank_ref      text,
  received_at   timestamptz,
  reconciled    boolean not null default false,
  reconciled_by text,
  reconciled_at timestamptz,
  notes         text,
  created_at    timestamptz not null default now(),

  constraint payments_amount_positive check (amount > 0),
  constraint payments_refund_is_outbound
    check (method <> 'refund' or direction = 'out'),
  constraint payments_reconciled_has_actor
    check (not reconciled or reconciled_by is not null)
);

create index payments_booking_idx on payments (booking_id);
create index payments_unreconciled_idx on payments (reconciled) where not reconciled;

comment on constraint payments_refund_is_outbound on payments is
  'A refund is always direction = out. Guards against a refund being recorded '
  'as money received.';
