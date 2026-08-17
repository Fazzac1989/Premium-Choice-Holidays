-- Premium Staycations — Phase 1
-- 08. Customers, enquiries, quotes
--
-- Phase 1 builds no agents and no customer site, so nothing writes to
-- enquiries yet. The tables exist because quotes are the artefact both the AI
-- front end and a human reservations flow produce, and bookings reference
-- them. Nothing new gets invented downstream.

create table customers (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands(id),
  full_name       text,
  email           text,
  phone           text,
  country         text default 'AE',
  preferred_language text not null default 'en',
  marketing_optin boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint customers_language_supported check (preferred_language in ('en', 'ar')),
  unique (brand_id, email)
);

create trigger customers_set_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------

create table enquiries (
  id              uuid primary key default gen_random_uuid(),
  brand_id        uuid not null references brands(id),
  customer_id     uuid references customers(id),
  source          text,
  status          enquiry_status not null default 'new',
  emirate         emirate,
  travel_start    date,
  travel_end      date,
  flexible_dates  boolean not null default false,
  adults          int,
  children        int,
  rooms           int,
  budget_total    numeric,
  requirements    text,
  lead_score      int,
  owner           text default 'agent:reservations',
  created_at      timestamptz not null default now(),
  last_contact_at timestamptz,

  constraint enquiries_dates_ordered
    check (travel_end is null or travel_start is null or travel_end >= travel_start)
);

create index enquiries_status_idx on enquiries (brand_id, status);

-- ---------------------------------------------------------------------------

create table quotes (
  id             uuid primary key default gen_random_uuid(),
  enquiry_id     uuid references enquiries(id),
  brand_id       uuid not null references brands(id),
  version        int not null default 1,
  status         quote_status not null default 'draft',
  currency       text not null default 'AED',

  total_cost     numeric,
  total_sell     numeric,

  -- The package total rounds up to brands.rounding_increment. The delta is
  -- retained as margin and recorded here so the breakdown shown to the
  -- customer reconciles against the total charged.
  rounding_delta numeric not null default 0,

  -- Payable at the property and therefore excluded from total_sell. Carried on
  -- the quote so the figure the customer was shown is the figure we can prove.
  payable_at_property numeric not null default 0,
  payable_at_property_breakdown jsonb,

  margin_pct     numeric generated always as (
                   case when total_sell > 0
                        then round(((total_sell - total_cost) / total_sell) * 100, 2)
                        else null end
                 ) stored,

  valid_until    date not null,
  approved_by    uuid references profiles(id),
  approved_at    timestamptz,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint quotes_rounding_delta_sane check (rounding_delta >= 0),
  unique (enquiry_id, version)
);

create trigger quotes_set_updated_at
  before update on quotes
  for each row execute function set_updated_at();

create index quotes_brand_status_idx on quotes (brand_id, status);

comment on column quotes.rounding_delta is
  'Amount added by rounding the total up to the brand increment. Counts as '
  'margin. Components are never individually rounded.';

-- ---------------------------------------------------------------------------

create table quote_items (
  id                 uuid primary key default gen_random_uuid(),
  quote_id           uuid not null references quotes(id) on delete cascade,
  product_id         uuid references products(id),
  rate_id            uuid references product_rates(id),
  supplier_id        uuid references suppliers(id),
  property_id        uuid references properties(id),

  description        text not null,
  description_ar     text,

  date_from          date,
  date_to            date,
  quantity           numeric not null default 1,
  unit_cost          numeric not null,
  unit_sell          numeric not null,

  sourcing           sourcing_type not null default 'contracted',

  -- Per-guest band resolution, nights, pricing basis applied. Kept so a price
  -- can be explained months later without re-deriving it from rates that may
  -- since have been superseded.
  pricing_detail     jsonb,

  -- Drives the ordering strategy seam: a refundable component could be booked
  -- before payment is taken. Phase 1 always takes payment first.
  is_refundable      boolean,
  free_cancel_until  timestamptz,

  created_at         timestamptz not null default now(),

  constraint quote_items_dates_ordered
    check (date_to is null or date_from is null or date_to >= date_from),
  constraint quote_items_quantity_positive check (quantity > 0)
);

create index quote_items_quote_idx on quote_items (quote_id);
create index quote_items_sourcing_idx on quote_items (quote_id, sourcing);

comment on column quote_items.sourcing is
  'api = WebBeds room, contracted = self-loaded extra. There is no on_request '
  'value in this phase.';
