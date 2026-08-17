-- Premium Staycations — Phase 1
-- 01. Extensions and enumerated types
--
-- Every constrained vocabulary in this schema is a Postgres enum, not a text
-- column with a comment. Adding a value later is `alter type ... add value`;
-- typos are rejected at write time rather than discovered in a report.

create extension if not exists "pgcrypto";     -- gen_random_uuid()
create extension if not exists "btree_gist";   -- overlap exclusion on child age bands

-- ---------------------------------------------------------------- people ---
create type user_role as enum ('admin', 'operator');

-- ------------------------------------------------------------- catalogue ---
-- 'on_request' is deliberately absent. This phase has no on-request path and
-- every component of every booking confirms instantly.
create type sourcing_type as enum ('api', 'contracted');

create type pricing_basis as enum (
  'per_person',
  'per_booking',
  'per_night',
  'per_unit',
  'per_room_night'
);

create type product_type as enum (
  'accommodation',
  'attraction',
  'dining',
  'experience',
  'wellness',
  'transfer',
  'room_extra',
  'package'
);

create type supplier_type as enum (
  'hotel',
  'attraction',
  'dining',
  'experience',
  'wellness',
  'transfer',
  'dmc'
);

create type emirate as enum (
  'dubai',
  'abu_dhabi',
  'sharjah',
  'ajman',
  'umm_al_quwain',
  'rak',
  'fujairah'
);

create type eligibility_scope as enum ('emirate', 'area', 'property', 'any');

create type redemption_method as enum ('voucher_code', 'name_list', 'qr');

-- ------------------------------------------------------------------ fees ---
create type fee_type as enum ('tourism_dirham', 'municipality', 'service', 'vat');
create type fee_basis as enum ('per_room_night', 'pct_of_bill');

-- ------------------------------------------------------------- commercial ---
create type enquiry_status as enum (
  'new', 'qualifying', 'quoting', 'quoted', 'negotiating', 'won', 'lost', 'expired'
);

create type quote_status as enum (
  'draft', 'pending_approval', 'approved', 'auto_approved', 'sent', 'expired'
);

-- Phase 1 booking state machine. The lpo_generated / lpo_issued /
-- supplier_confirmed transitions from ai-workforce-data-model.md are absent by
-- design — see migration 11 for the dormant tables they belonged to.
create type booking_status as enum (
  'draft',
  'payment_pending',
  'payment_received',
  'supplier_booking',
  'confirmed',
  'travelling',
  'completed',
  'failed_rollback',
  'cancelled',
  'refunded'
);

-- The ordering seam. Only 'payment_first' is implemented in Phase 1.
-- 'booking_first' exists so that free-cancellation rates can invert the order
-- once a payment gateway is live, without a schema migration at that point.
create type booking_order_strategy as enum ('payment_first', 'booking_first');

create type external_booking_status as enum ('confirmed', 'cancelled', 'failed');

create type payment_direction as enum ('in', 'out');
create type payment_method as enum ('card', 'bank_transfer', 'link', 'refund');

-- ------------------------------------------------------------- operations ---
create type task_status as enum ('open', 'done', 'dismissed');
create type task_priority as enum ('urgent', 'normal', 'low');
create type message_direction as enum ('inbound', 'outbound');
create type message_channel as enum ('email', 'whatsapp', 'web_chat');

-- ---------------------------------------------------------------- helpers ---
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function set_updated_at() is
  'Generic updated_at maintenance trigger.';
