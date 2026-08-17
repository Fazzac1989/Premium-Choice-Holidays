-- Premium Staycations — Phase 1
-- 06. Which extras may attach to which stays
--
-- The rule that a Dubai-scoped extra never attaches to an Abu Dhabi property
-- is enforced here in data and asserted by the assembly service tests. The
-- scope column is an enum so an unrecognised scope cannot be written at all.

create table extra_eligibility (
  id                   uuid primary key default gen_random_uuid(),
  product_id           uuid not null references products(id) on delete cascade,
  scope                eligibility_scope not null,

  emirate              emirate,
  area                 text,
  external_property_id text,                 -- adapter property id, for property scope

  -- Commercial ordering. Scope specificity alone is not enough: three
  -- Dubai-eligible extras all need an order for the curated-set bundle, and
  -- which one leads is a commercial decision, not a geographic one.
  -- Higher wins.
  priority             smallint not null default 0,

  valid_from           date,
  valid_to             date,
  created_at           timestamptz not null default now(),

  constraint extra_eligibility_dates_ordered
    check (valid_to is null or valid_from is null or valid_to >= valid_from),

  -- Each scope requires exactly the field that gives it meaning. Without this
  -- a row can claim scope 'emirate' with a null emirate and silently match
  -- nothing, or match everything, depending on how the query is written.
  constraint extra_eligibility_scope_fields check (
    case scope
      when 'emirate'  then emirate is not null and area is null and external_property_id is null
      when 'area'     then area is not null and external_property_id is null
      when 'property' then external_property_id is not null
      when 'any'      then emirate is null and area is null and external_property_id is null
    end
  )
);

create index extra_eligibility_product_idx on extra_eligibility (product_id);
create index extra_eligibility_emirate_idx on extra_eligibility (emirate) where emirate is not null;
create index extra_eligibility_property_idx
  on extra_eligibility (external_property_id) where external_property_id is not null;
create index extra_eligibility_priority_idx on extra_eligibility (priority desc);

comment on column extra_eligibility.priority is
  'Commercial lead order within a scope. Higher wins. Used by the curated-set '
  'bundle to decide which of several eligible extras is offered first.';

comment on column extra_eligibility.area is
  'Matched against properties.area — e.g. Palm Jumeirah, Yas Island.';
