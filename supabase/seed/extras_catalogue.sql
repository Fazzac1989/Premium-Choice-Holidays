-- Premium Staycations — Phase 1
-- Extras catalogue seed. Eight real UAE extras with invented rates.
--
-- Paste the whole file into the Supabase SQL editor and run it. Safe to
-- re-run: each product is skipped if one with the same name already exists
-- for the brand. Requires the 'staycations' brand to exist (Settings screen).
--
-- The names are real attractions and the child-age policies are shaped like
-- the real ones, because age bands and eligibility scopes drive real
-- behaviour. Every price is invented; nothing here came from a supplier.
--
-- Deliberate spread, so every engine path has data:
--   - emirate, area and property scopes are all represented
--   - Wild Wadi is area-scoped to Umm Suqeim: it attaches at Jumeirah Beach
--     Hotel and Burj Al Arab, and is excluded (not_eligible) anywhere else
--   - Aquaventure is property-scoped to Atlantis (DXB-001) at high priority
--     AND emirate-scoped to Dubai at low priority — same extra, different
--     commercial lead depending on where the stay is
--   - Aquaventure's sell prices are NULL: priced through the contracted
--     markup rule, so it breaks visibly if that rule is missing
--   - The Louvre's single band 0-17 is entirely free — sell_price 0 is a
--     price, not an absence
--   - Jais Flight has no child bands (minimum-age activity) and a 48h lead,
--     the longest in the set
--   - Ferrari World and the Louvre are Abu Dhabi extras: they attach to AD
--     stays, which are themselves blocked by missing fee rules until AD is
--     confirmed — the extras being ready is deliberate

do $$
declare
  v_brand uuid;
  v_prod  uuid;
  v_rate  uuid;
begin
  select id into v_brand from brands where slug = 'staycations';
  if v_brand is null then
    raise exception
      'No brand with slug ''staycations''. Create it in Settings first.';
  end if;

  -- =========================================================================
  -- 1. Desert Safari with BBQ Dinner — Dubai, the lead offer
  -- =========================================================================
  if not exists (select 1 from products where brand_id = v_brand
                 and name = 'Desert Safari with BBQ Dinner') then
    insert into products (brand_id, type, name, name_ar, description, description_ar,
                          sourcing, redemption_method, min_lead_time_hours)
    values (v_brand, 'experience',
            'Desert Safari with BBQ Dinner',
            'رحلة سفاري صحراوية مع عشاء شواء',
            'Dune bashing, camel ride, live entertainment and BBQ dinner at a desert camp. Hotel pickup included.',
            'تطعيس بين الكثبان، ركوب الجمال، عروض حية وعشاء شواء في مخيم صحراوي. يشمل النقل من الفندق.',
            'contracted', 'voucher_code', 24)
    returning id into v_prod;

    insert into product_rates (product_id, valid_from, valid_to, pricing_basis, cost_net, sell_price)
    values (v_prod, '2026-01-01', '2027-03-31', 'per_person', 185, 299)
    returning id into v_rate;

    insert into product_rate_child_bands (rate_id, label, age_min, age_max, cost_net, sell_price) values
      (v_rate, 'Infant', 0, 2, 0, 0),
      (v_rate, 'Child',  3, 11, 90, 149);

    insert into extra_eligibility (product_id, scope, emirate, priority)
    values (v_prod, 'emirate', 'dubai', 10);
  end if;

  -- =========================================================================
  -- 2. Burj Khalifa — At the Top (Levels 124/125) — Dubai
  -- =========================================================================
  if not exists (select 1 from products where brand_id = v_brand
                 and name = 'Burj Khalifa — At the Top') then
    insert into products (brand_id, type, name, name_ar, description, description_ar,
                          sourcing, redemption_method, min_lead_time_hours)
    values (v_brand, 'attraction',
            'Burj Khalifa — At the Top',
            'برج خليفة — في القمة',
            'Observation decks on levels 124 and 125 of the world''s tallest building. Timed entry.',
            'منصتا المشاهدة في الطابقين 124 و125 من أطول برج في العالم. دخول بموعد محدد.',
            'contracted', 'qr', 12)
    returning id into v_prod;

    insert into product_rates (product_id, valid_from, valid_to, pricing_basis, cost_net, sell_price)
    values (v_prod, '2026-01-01', '2027-03-31', 'per_person', 105, 169)
    returning id into v_rate;

    insert into product_rate_child_bands (rate_id, label, age_min, age_max, cost_net, sell_price) values
      (v_rate, 'Infant', 0, 3, 0, 0),
      (v_rate, 'Child',  4, 12, 65, 109);

    insert into extra_eligibility (product_id, scope, emirate, priority)
    values (v_prod, 'emirate', 'dubai', 8);
  end if;

  -- =========================================================================
  -- 3. Dubai Marina Dhow Dinner Cruise — Dubai
  -- =========================================================================
  if not exists (select 1 from products where brand_id = v_brand
                 and name = 'Dubai Marina Dhow Dinner Cruise') then
    insert into products (brand_id, type, name, name_ar, description, description_ar,
                          sourcing, redemption_method, min_lead_time_hours)
    values (v_brand, 'dining',
            'Dubai Marina Dhow Dinner Cruise',
            'رحلة عشاء بحرية على سفينة داو في مرسى دبي',
            'Two-hour cruise on a traditional dhow with international buffet dinner and live music.',
            'رحلة بحرية لمدة ساعتين على سفينة داو تقليدية مع بوفيه عشاء عالمي وموسيقى حية.',
            'contracted', 'name_list', 24)
    returning id into v_prod;

    insert into product_rates (product_id, valid_from, valid_to, pricing_basis, cost_net, sell_price)
    values (v_prod, '2026-01-01', '2027-03-31', 'per_person', 150, 249)
    returning id into v_rate;

    insert into product_rate_child_bands (rate_id, label, age_min, age_max, cost_net, sell_price) values
      (v_rate, 'Infant', 0, 2, 0, 0),
      (v_rate, 'Child',  3, 10, 95, 159);

    insert into extra_eligibility (product_id, scope, emirate, priority)
    values (v_prod, 'emirate', 'dubai', 6);
  end if;

  -- =========================================================================
  -- 4. Aquaventure Waterpark — property-scoped lead at Atlantis, emirate
  --    fallback elsewhere in Dubai. Sell prices NULL: markup-rule priced.
  -- =========================================================================
  if not exists (select 1 from products where brand_id = v_brand
                 and name = 'Aquaventure Waterpark') then
    insert into products (brand_id, type, name, name_ar, description, description_ar,
                          sourcing, redemption_method, min_lead_time_hours)
    values (v_brand, 'attraction',
            'Aquaventure Waterpark',
            'حديقة أكوافنتشر المائية',
            'Full-day access to the waterpark at Atlantis The Palm, including private beach.',
            'دخول ليوم كامل إلى الحديقة المائية في أتلانتس النخلة، شاملاً الشاطئ الخاص.',
            'contracted', 'voucher_code', 12)
    returning id into v_prod;

    insert into product_rates (product_id, valid_from, valid_to, pricing_basis, cost_net, sell_price)
    values (v_prod, '2026-01-01', '2027-03-31', 'per_person', 210, null)
    returning id into v_rate;

    insert into product_rate_child_bands (rate_id, label, age_min, age_max, cost_net, sell_price) values
      (v_rate, 'Infant', 0, 2, 0, 0),
      (v_rate, 'Child',  3, 11, 165, null);

    insert into extra_eligibility (product_id, scope, emirate, area, external_property_id, priority) values
      (v_prod, 'property', null, null, 'DXB-001', 9),
      (v_prod, 'emirate', 'dubai', null, null, 5);
  end if;

  -- =========================================================================
  -- 5. Wild Wadi Waterpark — area-scoped: Umm Suqeim only
  -- =========================================================================
  if not exists (select 1 from products where brand_id = v_brand
                 and name = 'Wild Wadi Waterpark') then
    insert into products (brand_id, type, name, name_ar, description, description_ar,
                          sourcing, redemption_method, min_lead_time_hours)
    values (v_brand, 'attraction',
            'Wild Wadi Waterpark',
            'حديقة وايلد وادي المائية',
            'Waterpark beside Burj Al Arab. Complimentary-adjacent for Jumeirah stays; sold here for others.',
            'حديقة مائية بجوار برج العرب.',
            'contracted', 'voucher_code', 12)
    returning id into v_prod;

    insert into product_rates (product_id, valid_from, valid_to, pricing_basis, cost_net, sell_price)
    values (v_prod, '2026-01-01', '2027-03-31', 'per_person', 140, 229)
    returning id into v_rate;

    insert into product_rate_child_bands (rate_id, label, age_min, age_max, cost_net, sell_price) values
      (v_rate, 'Infant', 0, 2, 0, 0),
      (v_rate, 'Child',  3, 11, 110, 179);

    insert into extra_eligibility (product_id, scope, area, priority)
    values (v_prod, 'area', 'Umm Suqeim', 9);
  end if;

  -- =========================================================================
  -- 6. Ferrari World — Abu Dhabi (stays there are blocked until fee rules
  --    are confirmed; the extra being ready is deliberate)
  -- =========================================================================
  if not exists (select 1 from products where brand_id = v_brand
                 and name = 'Ferrari World Abu Dhabi') then
    insert into products (brand_id, type, name, name_ar, description, description_ar,
                          sourcing, redemption_method, min_lead_time_hours)
    values (v_brand, 'attraction',
            'Ferrari World Abu Dhabi',
            'عالم فيراري أبوظبي',
            'Indoor theme park on Yas Island, home of Formula Rossa, the world''s fastest roller coaster.',
            'مدينة ألعاب مغطاة في جزيرة ياس، موطن فورمولا روسا، أسرع أفعوانية في العالم.',
            'contracted', 'qr', 12)
    returning id into v_prod;

    insert into product_rates (product_id, valid_from, valid_to, pricing_basis, cost_net, sell_price)
    values (v_prod, '2026-01-01', '2027-03-31', 'per_person', 195, 319)
    returning id into v_rate;

    insert into product_rate_child_bands (rate_id, label, age_min, age_max, cost_net, sell_price) values
      (v_rate, 'Infant', 0, 2, 0, 0),
      (v_rate, 'Child',  3, 12, 150, 245);

    insert into extra_eligibility (product_id, scope, emirate, priority)
    values (v_prod, 'emirate', 'abu_dhabi', 8);
  end if;

  -- =========================================================================
  -- 7. Louvre Abu Dhabi — under-18s free: one band, 0-17, sell 0
  -- =========================================================================
  if not exists (select 1 from products where brand_id = v_brand
                 and name = 'Louvre Abu Dhabi') then
    insert into products (brand_id, type, name, name_ar, description, description_ar,
                          sourcing, redemption_method, min_lead_time_hours)
    values (v_brand, 'attraction',
            'Louvre Abu Dhabi',
            'متحف اللوفر أبوظبي',
            'General admission to the museum on Saadiyat Island. Under-18s enter free.',
            'دخول عام إلى المتحف في جزيرة السعديات. الدخول مجاني لمن هم دون 18 عاماً.',
            'contracted', 'qr', 12)
    returning id into v_prod;

    insert into product_rates (product_id, valid_from, valid_to, pricing_basis, cost_net, sell_price)
    values (v_prod, '2026-01-01', '2027-03-31', 'per_person', 40, 69)
    returning id into v_rate;

    insert into product_rate_child_bands (rate_id, label, age_min, age_max, cost_net, sell_price)
    values (v_rate, 'Under 18', 0, 17, 0, 0);

    insert into extra_eligibility (product_id, scope, emirate, priority)
    values (v_prod, 'emirate', 'abu_dhabi', 6);
  end if;

  -- =========================================================================
  -- 8. Jais Flight — RAK. No child bands (minimum-age activity), 48h lead.
  -- =========================================================================
  if not exists (select 1 from products where brand_id = v_brand
                 and name = 'Jais Flight Zipline') then
    insert into products (brand_id, type, name, name_ar, description, description_ar,
                          sourcing, redemption_method, min_lead_time_hours)
    values (v_brand, 'experience',
            'Jais Flight Zipline',
            'جيس فلايت — المسار الانزلاقي',
            'The world''s longest zipline, 2.8km at up to 150km/h from the summit of Jebel Jais. Ages 12+.',
            'أطول مسار انزلاقي في العالم، 2.8 كم بسرعة تصل إلى 150 كم/س من قمة جبل جيس. للأعمار 12+.',
            'contracted', 'name_list', 48)
    returning id into v_prod;

    insert into product_rates (product_id, valid_from, valid_to, pricing_basis, cost_net, sell_price)
    values (v_prod, '2026-01-01', '2027-03-31', 'per_person', 480, 699)
    returning id into v_rate;

    insert into extra_eligibility (product_id, scope, emirate, priority)
    values (v_prod, 'emirate', 'rak', 9);
  end if;

  raise notice 'Extras catalogue seeded.';
end;
$$;

-- What just landed. The SQL editor shows this result grid.
select p.name, p.name_ar, p.type,
       r.cost_net, coalesce(r.sell_price::text, 'markup rule') as sell,
       (select count(*) from product_rate_child_bands b where b.rate_id = r.id) as child_bands,
       (select string_agg(
                 case e.scope
                   when 'any' then 'anywhere'
                   when 'emirate' then 'emirate: ' || e.emirate
                   when 'area' then 'area: ' || e.area
                   when 'property' then 'property: ' || e.external_property_id
                 end || ' (p' || e.priority || ')', ' · ')
        from extra_eligibility e where e.product_id = p.id) as eligibility
from products p
join product_rates r on r.product_id = p.id
where p.sourcing = 'contracted'
order by p.name;
