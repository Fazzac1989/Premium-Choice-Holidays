-- Premium Staycations — Phase 1
-- 05. Cached supplier property content and the local override layer
--
-- NOT IN THE SOURCE DOCUMENTS. Added because three specified features cannot
-- be built without it:
--   * star_rating drives the Tourism Dirham amount (migration 07)
--   * emirate and area drive extra eligibility (migration 06)
--   * check_in_time drives the lead-time exclusion, which is an acceptance
--     criterion and is untestable against a brand-wide default alone
--
-- Supplier content is cached and never edited. Our own copy lives in the
-- override table so that a content refresh cannot silently discard it.

create table properties (
  id                   uuid primary key default gen_random_uuid(),
  adapter              text not null,               -- 'webbeds' | 'mock'
  external_property_id text not null,

  name                 text not null,
  emirate              emirate not null,
  area                 text,
  star_rating          int,

  check_in_time        time,
  check_out_time       time,

  latitude             numeric,
  longitude            numeric,

  content              jsonb,                       -- raw adapter payload
  cached_at            timestamptz not null default now(),
  created_at           timestamptz not null default now(),

  constraint properties_star_rating_range
    check (star_rating is null or star_rating between 1 and 5),

  unique (adapter, external_property_id)
);

create index properties_emirate_idx on properties (emirate);
create index properties_area_idx on properties (area) where area is not null;

comment on table properties is
  'Read-only cache of supplier property content. Refreshed by the adapter; '
  'never edited by hand. Local copy belongs in property_overrides.';

comment on column properties.check_in_time is
  'Property check-in time where the supplier provides one. Falls back to '
  'brands.default_check_in_time. Some UAE resorts run 16:00.';

-- ---------------------------------------------------------------------------

create table property_overrides (
  property_id    uuid primary key references properties(id) on delete cascade,
  name_ar        text,
  description    text,
  description_ar text,
  notes          text,
  updated_by     uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger property_overrides_set_updated_at
  before update on property_overrides
  for each row execute function set_updated_at();

comment on table property_overrides is
  'Our Arabic names and our own copy. Survives a supplier content refresh.';

-- Effective check-in time for a property, in the brand timezone.
create or replace function property_check_in_time(p_property_id uuid, p_brand_id uuid)
returns time
language sql
stable
as $$
  select coalesce(
    (select p.check_in_time from properties p where p.id = p_property_id),
    (select b.default_check_in_time from brands b where b.id = p_brand_id)
  );
$$;
