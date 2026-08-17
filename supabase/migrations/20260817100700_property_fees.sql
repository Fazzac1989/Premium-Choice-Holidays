-- Premium Staycations — Phase 1
-- 07. Government and property fees
--
-- Fee rules are data, not code. They change by decree and we are not shipping
-- a release to follow one.
--
-- The product rule: everything prepayable is absorbed into the single headline
-- price. The Tourism Dirham is collected by the hotel at checkout and cannot
-- be prepaid by us, so it is an explicit "payable at the hotel" line on the
-- quote, the confirmation and the voucher, in both languages, with the amount
-- calculated. Never absorbed silently, never omitted.

create table property_fees (
  id             uuid primary key default gen_random_uuid(),
  emirate        emirate not null,
  star_rating    int,                     -- null = applies to all ratings
  fee_type       fee_type not null,
  basis          fee_basis not null,
  amount         numeric not null,
  prepayable     boolean not null,        -- false = payable at the property
  max_nights     int,                     -- Tourism Dirham caps at 30 consecutive
  effective_from date not null,
  effective_to   date,
  source_note    text,                    -- where this figure came from
  created_at     timestamptz not null default now(),

  constraint property_fees_star_range
    check (star_rating is null or star_rating between 1 and 5),
  constraint property_fees_amount_positive
    check (amount >= 0),
  constraint property_fees_dates_ordered
    check (effective_to is null or effective_to >= effective_from),
  constraint property_fees_pct_sane
    check (basis <> 'pct_of_bill' or amount <= 100)
);

create index property_fees_lookup_idx
  on property_fees (emirate, fee_type, effective_from desc);

comment on table property_fees is
  'Effective-dated fee rules by emirate and star rating. Supersede by closing '
  'effective_to and inserting a successor.';

comment on column property_fees.prepayable is
  'False means we cannot collect it — it is shown as payable at the property '
  'and excluded from the headline price.';

comment on column property_fees.max_nights is
  'Tourism Dirham is capped at 30 consecutive nights. Null = uncapped.';

-- Fees applying to a property on a date. Star rating matches exactly or the
-- rule is rating-agnostic.
create or replace function fees_for_property(p_property_id uuid, p_on_date date)
returns setof property_fees
language sql
stable
as $$
  select f.*
  from property_fees f
  join properties p on p.id = p_property_id
  where f.emirate = p.emirate
    and (f.star_rating is null or f.star_rating = p.star_rating)
    and p_on_date >= f.effective_from
    and (f.effective_to is null or p_on_date <= f.effective_to);
$$;

comment on function fees_for_property(uuid, date) is
  'Returns no rows when the emirate has no rules loaded or the property has no '
  'star rating. Assembly must raise a task in that case, never price zero.';

-- ---------------------------------------------------------------------------
-- Verified reference data: Dubai and Ras Al Khaimah.
--
-- Abu Dhabi is DELIBERATELY ABSENT. Its percentages have moved more than once
-- and it charges a flat per-night amount regardless of star rating alongside
-- its own municipal and tourism percentages. Confirm against live WebBeds
-- responses in certification and load before any Abu Dhabi inventory goes on
-- sale. Until then fees_for_property() returns nothing for Abu Dhabi and the
-- assembly service must surface that as a task rather than pricing it at zero.

insert into property_fees
  (emirate, star_rating, fee_type, basis, amount, prepayable, max_nights, effective_from, source_note)
values
  -- Tourism Dirham — per room per night, collected at the property
  ('dubai', 5, 'tourism_dirham', 'per_room_night', 20, false, 30, '2024-01-01', 'Dubai Tourism Dirham, 5-star'),
  ('dubai', 4, 'tourism_dirham', 'per_room_night', 15, false, 30, '2024-01-01', 'Dubai Tourism Dirham, 4-star'),
  ('dubai', 3, 'tourism_dirham', 'per_room_night', 10, false, 30, '2024-01-01', 'Dubai Tourism Dirham, 3-star'),
  ('dubai', 2, 'tourism_dirham', 'per_room_night',  7, false, 30, '2024-01-01', 'Dubai Tourism Dirham, budget / aparthotel'),
  ('dubai', 1, 'tourism_dirham', 'per_room_night',  7, false, 30, '2024-01-01', 'Dubai Tourism Dirham, budget / aparthotel'),

  -- Percentage fees — part of the room bill, absorbed where the net rate is
  -- exclusive. Applied only when external_bookings.net_rate_tax_inclusive is
  -- false; never applied when it is unknown.
  ('dubai', null, 'municipality', 'pct_of_bill',  7, true, null, '2024-01-01', 'Dubai municipality fee'),
  ('dubai', null, 'service',      'pct_of_bill', 10, true, null, '2024-01-01', 'Service charge'),
  ('dubai', null, 'vat',          'pct_of_bill',  5, true, null, '2024-01-01', 'UAE VAT'),

  -- Ras Al Khaimah mirrors the Dubai structure
  ('rak', 5, 'tourism_dirham', 'per_room_night', 20, false, 30, '2024-01-01', 'RAK mirrors Dubai structure'),
  ('rak', 4, 'tourism_dirham', 'per_room_night', 15, false, 30, '2024-01-01', 'RAK mirrors Dubai structure'),
  ('rak', 3, 'tourism_dirham', 'per_room_night', 10, false, 30, '2024-01-01', 'RAK mirrors Dubai structure'),
  ('rak', 2, 'tourism_dirham', 'per_room_night',  7, false, 30, '2024-01-01', 'RAK mirrors Dubai structure'),
  ('rak', 1, 'tourism_dirham', 'per_room_night',  7, false, 30, '2024-01-01', 'RAK mirrors Dubai structure'),
  ('rak', null, 'municipality', 'pct_of_bill',  7, true, null, '2024-01-01', 'RAK municipality fee'),
  ('rak', null, 'service',      'pct_of_bill', 10, true, null, '2024-01-01', 'Service charge'),
  ('rak', null, 'vat',          'pct_of_bill',  5, true, null, '2024-01-01', 'UAE VAT');
