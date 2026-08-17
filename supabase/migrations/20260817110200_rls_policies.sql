-- Premium Staycations — Phase 1
-- 17. Row level security: policies
--
-- Rules, from the build prompt:
--   Operators read everything.
--   Operators write to tasks, messages, and vouchers by reissue only.
--   Only admins touch brands, suppliers, products, product_rates,
--     extra_eligibility and locked strings.
--   No blanket `using (true)` anywhere.
--
-- Every policy below is gated on is_staff() or is_admin(). Both return false
-- when there is no auth.uid(), so an unauthenticated request matches nothing
-- rather than everything. The verification script asserts that no policy in
-- this schema has a qualifier of plain `true`.

-- ===========================================================================
-- Read: uniform, and therefore generated rather than transcribed 26 times.
-- "Operators read everything" is one rule; writing it out per table invites a
-- copy-paste slip that quietly widens or narrows one of them.
-- ===========================================================================
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (is_staff())',
      r.tablename || '_staff_read', r.tablename
    );
  end loop;
end;
$$;

-- ===========================================================================
-- Catalogue — admin only. This is the list the build prompt names explicitly,
-- plus the tables that hang off it and would otherwise be a way around it:
-- editing a child band or an eligibility rule is editing the product.
-- ===========================================================================
create policy brands_admin_write on brands
  for all to authenticated using (is_admin()) with check (is_admin());

create policy suppliers_admin_write on suppliers
  for all to authenticated using (is_admin()) with check (is_admin());

create policy markup_rules_admin_write on markup_rules
  for all to authenticated using (is_admin()) with check (is_admin());

create policy products_admin_write on products
  for all to authenticated using (is_admin()) with check (is_admin());

create policy product_rates_admin_write on product_rates
  for all to authenticated using (is_admin()) with check (is_admin());

create policy product_rate_child_bands_admin_write on product_rate_child_bands
  for all to authenticated using (is_admin()) with check (is_admin());

create policy extra_eligibility_admin_write on extra_eligibility
  for all to authenticated using (is_admin()) with check (is_admin());

create policy property_fees_admin_write on property_fees
  for all to authenticated using (is_admin()) with check (is_admin());

create policy property_overrides_admin_write on property_overrides
  for all to authenticated using (is_admin()) with check (is_admin());

-- `properties` gets no write policy at all. It is a cache of supplier content,
-- refreshed by the adapter under the service key. Nothing a human edits by
-- hand — that is what property_overrides is for.

-- ===========================================================================
-- Commercial records — admin writes, nobody deletes.
-- ===========================================================================
create policy customers_admin_insert on customers
  for insert to authenticated with check (is_admin());
create policy customers_admin_update on customers
  for update to authenticated using (is_admin()) with check (is_admin());

create policy enquiries_admin_insert on enquiries
  for insert to authenticated with check (is_admin());
create policy enquiries_admin_update on enquiries
  for update to authenticated using (is_admin()) with check (is_admin());

create policy quotes_admin_insert on quotes
  for insert to authenticated with check (is_admin());
create policy quotes_admin_update on quotes
  for update to authenticated using (is_admin()) with check (is_admin());

create policy quote_items_admin_insert on quote_items
  for insert to authenticated with check (is_admin());
create policy quote_items_admin_update on quote_items
  for update to authenticated using (is_admin()) with check (is_admin());

-- ===========================================================================
-- Bookings and money
--
-- No delete policy anywhere here, deliberately: a booking or a payment is
-- cancelled or refunded through the state machine, never removed. Deleting the
-- record of money taken is not an operation this system should be able to
-- express.
-- ===========================================================================
create policy bookings_admin_insert on bookings
  for insert to authenticated with check (is_admin());
create policy bookings_admin_update on bookings
  for update to authenticated using (is_admin()) with check (is_admin());

create policy booking_guests_admin_insert on booking_guests
  for insert to authenticated with check (is_admin());
create policy booking_guests_admin_update on booking_guests
  for update to authenticated using (is_admin()) with check (is_admin());

create policy payments_admin_insert on payments
  for insert to authenticated with check (is_admin());
create policy payments_admin_update on payments
  for update to authenticated using (is_admin()) with check (is_admin());

-- `external_bookings` gets no write policy. Supplier confirmations are written
-- by the adapter under the service key and are evidence, not data entry.

-- Vouchers: admins may update one (marking it redeemed, correcting validity).
-- Operators reissue through reissue_voucher() and hold no direct write at all
-- — see migration 18. Inserts come from the confirmation path under the
-- service key, and the grant for them was revoked in migration 16.
create policy vouchers_admin_update on vouchers
  for update to authenticated using (is_admin()) with check (is_admin());

-- ===========================================================================
-- Dormant tables — readable so the admin UI can show they are empty, writable
-- by nobody. The triggers in migration 11 reject writes from every role
-- including service_role; the absent policies stop an authenticated session
-- getting far enough to hit them.
-- ===========================================================================

-- ===========================================================================
-- Operations — this is where operators actually work.
-- ===========================================================================

-- The operator queue. Read, take, resolve, dismiss.
create policy tasks_staff_insert on tasks
  for insert to authenticated with check (is_staff());
create policy tasks_staff_update on tasks
  for update to authenticated using (is_staff()) with check (is_staff());

-- Operators correspond; only an admin edits a message after the fact, which is
-- what the approval flow needs.
create policy messages_staff_insert on messages
  for insert to authenticated with check (is_staff());
create policy messages_admin_update on messages
  for update to authenticated using (is_admin()) with check (is_admin());

-- Anything staff do should be attributable. Update and delete were revoked at
-- grant level and are blocked by trigger.
create policy agent_actions_staff_insert on agent_actions
  for insert to authenticated with check (is_staff());

-- Strings: admins write. Locked rows are legal copy and are additionally
-- guarded by the trigger from migration 14, which holds against service_role
-- and can only be lifted through admin_update_locked_string(). The policy
-- deliberately does not exclude locked rows — if it did, the RPC's own update
-- would be blocked by RLS and there would be no sanctioned path at all.
create policy strings_admin_write on strings
  for all to authenticated using (is_admin()) with check (is_admin());

-- ===========================================================================
-- Profiles
-- ===========================================================================
create policy profiles_admin_write on profiles
  for all to authenticated using (is_admin()) with check (is_admin());

-- A user may read their own row even if deactivated, so the UI can say why
-- they are locked out instead of showing an empty screen.
create policy profiles_read_own on profiles
  for select to authenticated using (id = auth.uid());
