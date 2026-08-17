-- Premium Staycations — Phase 1
-- 03. Brands, suppliers, markup rules
--
-- Multi-brand by column, not by instance. brand_id is never hardcoded in
-- application code; it is resolved from the brands table by slug.

create table brands (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,          -- 'staycations' | 'holidays' | 'golf'
  name                  text not null,
  domain                text not null,
  from_email            text not null,
  currency              text not null default 'AED',
  terms_url             text,
  margin_floor_pct      numeric not null default 12,

  -- Operational defaults for this brand's market. Lead-time exclusion and
  -- "checking in tomorrow" are meaningless without both of these.
  timezone              text not null default 'Asia/Dubai',
  default_check_in_time time not null default '15:00',

  -- Package totals round UP to this increment; the delta is retained as
  -- margin. Components are computed exactly and rounded once, at the total —
  -- rounding each component then summing produces a total that does not
  -- reconcile against the breakdown shown to the customer.
  rounding_increment    numeric not null default 5,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint brands_rounding_increment_positive check (rounding_increment > 0)
);

create trigger brands_set_updated_at
  before update on brands
  for each row execute function set_updated_at();

comment on column brands.default_check_in_time is
  'Fallback check-in time when cached property content does not carry one. '
  'Evaluated in brands.timezone. Some UAE resorts run 16:00, so the cached '
  'property value wins wherever it exists.';

comment on column brands.rounding_increment is
  'Round the package total up to this multiple. Never round components.';

-- ---------------------------------------------------------------------------

create table suppliers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  type                supplier_type not null,
  country             text default 'AE',
  city                text,
  contact_email       text not null,
  contact_phone       text,
  payment_terms       text,
  cancellation_policy text,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger suppliers_set_updated_at
  before update on suppliers
  for each row execute function set_updated_at();

create index suppliers_active_idx on suppliers (active) where active;

-- ---------------------------------------------------------------------------
-- Markup rules
--
-- Never hardcode a percentage. Rooms and extras carry different margins by
-- design and will be tuned separately and often.
--
-- Auditability is by effective dating rather than a shadow audit table: a rule
-- is never edited in place, it is closed off with effective_to and a successor
-- is inserted. That makes "what markup did we apply on 3 June" answerable from
-- the same table the Settings screen edits.

create table markup_rules (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references brands(id) on delete cascade,
  sourcing       sourcing_type not null,
  product_type   product_type,                 -- null = all types for this sourcing
  markup_pct     numeric not null,
  min_margin_pct numeric,
  effective_from date not null default current_date,
  effective_to   date,
  created_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),

  constraint markup_rules_pct_sane
    check (markup_pct >= 0 and markup_pct < 500),
  constraint markup_rules_dates_ordered
    check (effective_to is null or effective_to >= effective_from)
);

-- One live rule per brand + sourcing + product_type at any given date.
-- daterange is half-open: effective_to is the last day the rule applies.
create index markup_rules_lookup_idx
  on markup_rules (brand_id, sourcing, product_type, effective_from desc);

-- Two constraints rather than one over coalesce(product_type, '*'): an
-- enum-to-text cast is only STABLE, because enum labels live in the catalogue,
-- and an index expression has to be IMMUTABLE. Comparing the enum directly is
-- immutable and btree_gist handles enum equality, so the null and non-null
-- cases are split instead.
alter table markup_rules add constraint markup_rules_no_overlap_typed
  exclude using gist (
    brand_id with =,
    sourcing with =,
    product_type with =,
    daterange(effective_from, effective_to, '[]') with &&
  ) where (product_type is not null);

alter table markup_rules add constraint markup_rules_no_overlap_catchall
  exclude using gist (
    brand_id with =,
    sourcing with =,
    daterange(effective_from, effective_to, '[]') with &&
  ) where (product_type is null);

comment on table markup_rules is
  'Effective-dated markup by brand and sourcing type. Supersede a rule by '
  'setting effective_to and inserting a successor; never update in place.';

comment on column markup_rules.product_type is
  'Null means the rule covers every product type for this sourcing. A rule '
  'naming a specific type takes precedence over the catch-all.';

-- Resolve the applicable markup for a component on a given date. Most
-- specific rule wins: an exact product_type match beats the catch-all.
create or replace function resolve_markup_pct(
  p_brand_id     uuid,
  p_sourcing     sourcing_type,
  p_product_type product_type,
  p_on_date      date default current_date
)
returns numeric
language sql
stable
as $$
  select mr.markup_pct
  from markup_rules mr
  where mr.brand_id = p_brand_id
    and mr.sourcing = p_sourcing
    and (mr.product_type = p_product_type or mr.product_type is null)
    and p_on_date >= mr.effective_from
    and (mr.effective_to is null or p_on_date <= mr.effective_to)
  order by (mr.product_type is not null) desc, mr.effective_from desc
  limit 1;
$$;
