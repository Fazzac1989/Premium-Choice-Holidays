-- Premium Staycations — Phase 1
-- 12. Operations layer: messages, tasks, agent actions, strings

create type task_type as enum (
  'approve_quote',
  'refund',                    -- a refund row exists and needs a human to move funds
  'rollback_manual_cancel',    -- components confirmed before a failure, needing cancellation
  'booking_stuck',             -- watchdog escalation out of payment_received
  'discrepancy',
  'unmatched_payment',
  'tax_treatment_unknown',     -- external_bookings.net_rate_tax_inclusive is null
  'missing_fee_rules',         -- no property_fees rows for the emirate or star rating
  'missing_arabic',
  'other'
);

create table messages (
  id                uuid primary key default gen_random_uuid(),
  brand_id          uuid not null references brands(id),
  thread_key        text not null,
  enquiry_id        uuid references enquiries(id),
  booking_id        uuid references bookings(id),
  direction         message_direction not null,
  channel           message_channel not null,
  language          text not null default 'en',
  from_address      text,
  to_address        text,
  subject           text,
  body              text,
  sent_by           text,
  requires_approval boolean not null default false,
  approved_by       uuid references profiles(id),
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),

  constraint messages_language_supported check (language in ('en', 'ar'))
);

create index messages_thread_idx on messages (thread_key, created_at);
create index messages_booking_idx on messages (booking_id);

-- ---------------------------------------------------------------------------
-- Tasks — the entire job description of the one operating human.
-- Target is under fifteen items a day. If it exceeds that, the automatic rules
-- are too tight, not the system too weak.

create table tasks (
  id          uuid primary key default gen_random_uuid(),
  type        task_type not null,
  priority    task_priority not null default 'normal',
  booking_id  uuid references bookings(id),
  quote_id    uuid references quotes(id),
  payment_id  uuid references payments(id),
  summary     text not null,
  context     jsonb,
  raised_by   text,
  status      task_status not null default 'open',
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  resolution_note text,
  due_at      timestamptz,
  created_at  timestamptz not null default now(),

  constraint tasks_resolved_is_stamped
    check (status = 'open' or resolved_at is not null)
);

create index tasks_open_idx on tasks (priority, created_at) where status = 'open';
create index tasks_booking_idx on tasks (booking_id);

comment on column tasks.context is
  'Rendered readably in the operator queue. For rollback_manual_cancel this '
  'must name every supplier reference still needing manual cancellation — an '
  'operator opening the task should not have to reconstruct anything.';

-- ---------------------------------------------------------------------------
-- Agent actions — append only. When something goes wrong you need to see which
-- process did what, on what evidence.

create table agent_actions (
  id          bigserial primary key,
  agent       text not null,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  input       jsonb,
  output      jsonb,
  reasoning   text,
  latency_ms  int,
  autonomous  boolean not null default true,
  created_at  timestamptz not null default now()
);

create index agent_actions_entity_idx on agent_actions (entity_type, entity_id);
create index agent_actions_created_idx on agent_actions (created_at desc);

create or replace function reject_agent_action_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'agent_actions is append-only'
    using errcode = '0A000';
end;
$$;

create trigger agent_actions_append_only
  before update or delete on agent_actions
  for each statement execute function reject_agent_action_mutation();

-- ---------------------------------------------------------------------------
-- Strings — the bilingual system copy table.
--
-- Three content classes live here differently. System strings are ordinary
-- rows. Legal and policy text is locked: cancellation terms, payment terms,
-- package-organiser disclosures. Narration is never stored here at all — it is
-- generated per request.
--
-- Where no approved Arabic exists, ar stays null and the renderer shows
-- English with a note. It never machine-translates.

create table strings (
  key         text primary key,
  en          text not null,
  ar          text,
  context     text,
  locked      boolean not null default false,
  approved_by text,
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger strings_set_updated_at
  before update on strings
  for each row execute function set_updated_at();

create index strings_locked_idx on strings (locked) where locked;
create index strings_missing_ar_idx on strings (key) where ar is null;

comment on table strings is
  'System and legal copy in both languages. Locked rows are legal text and are '
  'protected by trigger, not by policy — see migration 14.';

comment on column strings.ar is
  'Null means no approved Arabic. Show English with a note. Never machine '
  'translate a locked row.';

-- ---------------------------------------------------------------------------
-- Refund wording, seeded now so it cannot drift.
--
-- The refund is INITIATED, never completed — no funds move without a human,
-- and a customer told their money is back when it is not generates the
-- complaint the whole rollback path exists to avoid.

insert into strings (key, en, ar, context, locked) values
(
  'booking.failed_rollback.email_body',
  'We were unable to complete your booking and no reservation has been made. '
  'A full refund of AED {{amount}} has been initiated and will reach your card '
  'within {{refund_days}} working days. Nothing further is required from you. '
  'Our team has been notified and will be in touch if anything is outstanding.',
  'لم نتمكن من إتمام حجزكم ولم يتم إجراء أي حجز. تم بدء إجراءات استرداد كامل '
  'المبلغ وقدره {{amount}} درهم، وسيصل إلى بطاقتكم خلال {{refund_days}} أيام '
  'عمل. لا يلزم اتخاذ أي إجراء من جانبكم. تم إبلاغ فريقنا وسيتواصل معكم إذا '
  'استجد ما يستدعي ذلك.',
  'Sent on failed_rollback. INITIATED, never completed — funds do not move '
  'without a human. Locked.',
  true
),
(
  'booking.payable_at_property.notice',
  'A Tourism Dirham of AED {{amount}} is payable directly to the hotel at '
  'checkout. This is a government fee we cannot collect in advance and is not '
  'included in the price above.',
  'يُدفع رسم درهم السياحة وقدره {{amount}} درهم مباشرةً إلى الفندق عند '
  'المغادرة. هذا رسم حكومي لا يمكننا تحصيله مسبقاً وهو غير مشمول في السعر '
  'المذكور أعلاه.',
  'Shown on the quote, the confirmation and the voucher. Locked.',
  true
);
