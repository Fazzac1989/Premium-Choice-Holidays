-- Premium Staycations — Phase 1
-- 11. Dormant tables
--
-- lpos and supplier_confirmations belong to the Holidays purchase-order flow,
-- where a supplier is emailed an order and confirms out of band. Staycations
-- has no such path: every component confirms instantly or the booking rolls
-- back.
--
-- They are created now so that the Holidays build is a migration forward
-- rather than a schema fork. Nothing in this phase may write to them, and a
-- trigger enforces that rather than trusting a code review.

create table lpos (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references bookings(id),
  supplier_id   uuid references suppliers(id),
  lpo_number    text unique not null,
  status        text not null default 'generated',
  total_cost    numeric not null,
  payment_terms text,
  line_items    jsonb not null,
  pdf_url       text,
  generated_by  text default 'agent:reservations',
  issued_by     uuid references profiles(id),      -- HUMAN ONLY
  issued_at     timestamptz,
  created_at    timestamptz not null default now()
);

create table supplier_confirmations (
  id            uuid primary key default gen_random_uuid(),
  lpo_id        uuid references lpos(id),
  booking_id    uuid references bookings(id),
  supplier_ref  text not null,
  received_at   timestamptz not null,
  source        text,
  raw_document  text,
  parsed_by     text default 'agent:reservations',
  verified_by   uuid references profiles(id),
  discrepancies jsonb,
  created_at    timestamptz not null default now()
);

comment on table lpos is
  'DORMANT IN PHASE 1. Local purchase orders for the Holidays out-of-band '
  'supplier flow. Staycations confirms every component instantly and never '
  'issues an LPO. Writes are blocked by trigger. Do not build UI against this.';

comment on table supplier_confirmations is
  'DORMANT IN PHASE 1. Parsed supplier confirmations for the Holidays flow. '
  'The Staycations equivalent is external_bookings. Writes are blocked by '
  'trigger. Do not build UI against this.';

-- ---------------------------------------------------------------------------

create or replace function reject_dormant_table_write()
returns trigger
language plpgsql
as $$
begin
  raise exception
    '% is dormant in Phase 1 and must not be written to. Staycations confirms '
    'every component instantly; the equivalent record is external_bookings.',
    tg_table_name
    using errcode = '0A000';   -- feature_not_supported
end;
$$;

create trigger lpos_dormant
  before insert or update or delete on lpos
  for each statement execute function reject_dormant_table_write();

create trigger supplier_confirmations_dormant
  before insert or update or delete on supplier_confirmations
  for each statement execute function reject_dormant_table_write();

comment on function reject_dormant_table_write() is
  'Statement-level block on the Holidays-only tables. Drop these triggers when '
  'the LPO flow is built, not before.';
