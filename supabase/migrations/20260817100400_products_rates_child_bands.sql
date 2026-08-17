-- Premium Staycations — Phase 1
-- 04. Products, rates and child age bands
--
-- Bilingual from the schema up. Every customer-visible name or description has
-- an _ar sibling — Arabic is a first-class output, not a later column.

create table products (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references brands(id),
  supplier_id        uuid references suppliers(id),
  type               product_type not null,

  name               text not null,
  name_ar            text,
  description        text,
  description_ar     text,

  images             jsonb,
  inclusions         jsonb,

  sourcing           sourcing_type not null default 'contracted',
  redemption_method  redemption_method,
  min_lead_time_hours int not null default 24,
  freesale           boolean not null default true,

  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint products_lead_time_sane
    check (min_lead_time_hours >= 0 and min_lead_time_hours <= 24 * 60),

  -- Phase 1 loads freesale contracts only. If a supplier will not give
  -- freesale terms we do not load them, so a contracted product that is not
  -- freesale is a data error rather than a state to model. The Extras screen
  -- blocks this in the UI with an explanation; this constraint means it also
  -- cannot arrive by CSV import, seed script or SQL editor.
  -- Drop this constraint when allocation returns for Holidays.
  constraint products_freesale_only_phase1
    check (sourcing <> 'contracted' or freesale),

  -- A contracted extra is redeemed at the supplier, so it needs a method.
  -- API-sourced rooms are not.
  constraint products_contracted_needs_redemption
    check (sourcing <> 'contracted' or type = 'accommodation' or redemption_method is not null)
);

create trigger products_set_updated_at
  before update on products
  for each row execute function set_updated_at();

create index products_brand_active_idx on products (brand_id, active) where active;
create index products_supplier_idx on products (supplier_id);
create index products_type_idx on products (type);

comment on column products.min_lead_time_hours is
  'Hours before check-in by which the extra must be booked. Evaluated against '
  'the property check-in time in the brand timezone, not against midnight.';

comment on column products.freesale is
  'Phase 1 is freesale only — see constraint products_freesale_only_phase1.';

-- ---------------------------------------------------------------------------

create table product_rates (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  season_name     text,
  valid_from      date not null,
  valid_to        date not null,

  pricing_basis   pricing_basis not null default 'per_person',

  cost_net        numeric not null,             -- what we pay the supplier
  sell_price      numeric,                      -- null = apply the brand markup rule

  min_nights      int,
  blackout_dates  daterange[],
  notes           text,

  -- Dormant. In ai-workforce-data-model.md a null allocation routes an item to
  -- the live sourcing path. Phase 1 is freesale only, so every extra would
  -- have a null allocation and that rule must be explicitly dead. Nothing in
  -- this phase reads these two columns.
  allocation      int,
  allocation_used int not null default 0,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint product_rates_dates_ordered check (valid_to >= valid_from),
  constraint product_rates_cost_positive check (cost_net >= 0),
  constraint product_rates_sell_positive check (sell_price is null or sell_price >= 0)
);

create trigger product_rates_set_updated_at
  before update on product_rates
  for each row execute function set_updated_at();

create index product_rates_product_validity_idx
  on product_rates (product_id, valid_from, valid_to);

comment on column product_rates.allocation is
  'DORMANT in Phase 1. Freesale only — never read this column. Returns for '
  'Holidays, where a null allocation routes to the live sourcing path.';

comment on column product_rates.sell_price is
  'Null means derive from markup_rules at assembly time.';

-- ---------------------------------------------------------------------------
-- Child age bands
--
-- One rate row carries several bands. A single child_price column cannot
-- express the ordinary UAE case of infants under 3 free AND children 3-11 at a
-- reduced rate, which is the shape of nearly every attraction contract.
--
-- cost_net sits alongside sell_price because margin on a family booking is a
-- column on the Extras list screen, and a sell price with no cost makes it
-- uncomputable.
--
-- Age is evaluated at CHECK-IN, not at booking. A child who is 2 when booking
-- and 3 on arrival is charged as a 3-year-old by the hotel, and if we priced
-- them as an infant we absorb the difference. See booking_guests.date_of_birth
-- and guest_age_at().

create table product_rate_child_bands (
  id          uuid primary key default gen_random_uuid(),
  rate_id     uuid not null references product_rates(id) on delete cascade,
  label       text,                             -- 'Infant', 'Child'
  age_min     int not null,
  age_max     int not null,
  cost_net    numeric not null default 0,
  sell_price  numeric,                          -- 0 is meaningful: free of charge
  created_at  timestamptz not null default now(),

  constraint child_bands_ages_ordered check (age_min <= age_max),
  constraint child_bands_ages_in_range check (age_min >= 0 and age_max <= 17),
  constraint child_bands_cost_positive check (cost_net >= 0),
  constraint child_bands_sell_positive check (sell_price is null or sell_price >= 0)
);

-- Bands on the same rate row may not overlap. Without this, a 4-year-old can
-- match two bands and the price depends on row order.
alter table product_rate_child_bands add constraint child_bands_no_overlap
  exclude using gist (
    rate_id with =,
    int4range(age_min, age_max, '[]') with &&
  );

create index child_bands_rate_idx on product_rate_child_bands (rate_id);

comment on table product_rate_child_bands is
  'Multiple child price bands per rate row, evaluated against age at check-in. '
  'An infant-free rule is a band with sell_price 0, not a separate rate row.';

-- Age at a given date, in whole years. Used for band selection at check-in.
create or replace function guest_age_at(p_date_of_birth date, p_on_date date)
returns int
language sql
immutable
as $$
  select case
    when p_date_of_birth is null then null
    else extract(year from age(p_on_date, p_date_of_birth))::int
  end;
$$;

comment on function guest_age_at(date, date) is
  'Whole years old on p_on_date. Always call with the check-in date — a guest '
  'can cross a band boundary between booking and travel.';
