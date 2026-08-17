# Premium Staycations

Platform and system of record for premiumstaycations.com. UAE hotel
staycations sold to UAE residents in English and Arabic.

Phase 1 built the database, the admin UI (now under `/admin`), the supplier
abstraction and the package assembly service. Phase 2a added the customer
funnel at `/en` and `/ar`: browse → package → checkout → pay (mock gateway)
→ confirmation, running on the same assembly engine and orchestrator as the
admin UI — quotes are the artefact both front ends produce. See
`docs/phase2-customer-front-end.md` for the design and what remains (real
gateway, email, voucher PDFs, imagery, the concierge).

**The property the whole design rests on:** every component of every booking
confirms instantly. Nothing here may compromise that.

## Status

| Session | Scope | State |
|---|---|---|
| 1 | Plan | done |
| 2 | Migrations | applied and inspected |
| 3 | Auth and RLS | applied and verified against live Supabase Auth |
| 4 | Supplier adapter + mock | done |
| 5 | Package assembly service | done |
| 6 | Admin UI | done — catalogue editing deferred, see below |

## Applying the schema

```
supabase init
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase gen types typescript --linked > src/types/database.ts
```

Then paste `supabase/tests/verify_session2.sql` into the Supabase SQL editor and
run it whole. It rolls back at the end and leaves no data behind.

`verify_session3.sql` covers auth and RLS and needs two users to exist first:
Authentication → Users → Add user, twice. The first becomes an admin, the
second an operator. Check with `select email, role from profiles;` before
running it.

It ends in a select rather than notices, because the SQL editor does not
display `raise notice`. The first row of the result is the summary; failures
sort directly beneath it. Assertions record a FAIL row instead of raising, so
one broken policy does not mask the ones behind it — an error from this script
means something unplanned happened, not that an assertion failed.

`pg_cron` may need enabling once from Supabase → Database → Extensions before
migration 15 can schedule the watchdog. Migration 15 says so in a notice rather
than failing.

## Migrations

| # | File | Contains |
|---|---|---|
| 01 | extensions_and_enums | every constrained vocabulary as a Postgres enum |
| 02 | profiles | staff accounts, `has_role()` without policy recursion |
| 03 | brands_suppliers_markup | effective-dated markup by brand and sourcing |
| 04 | products_rates_child_bands | extras, rates, multiple child age bands |
| 05 | properties_cache | cached supplier content + local override layer |
| 06 | extra_eligibility | scope rules with commercial priority |
| 07 | property_fees | Tourism Dirham and percentage fees as data |
| 08 | customers_enquiries_quotes | the quote artefact both front ends produce |
| 09 | bookings_payments | bookings, guests with DOB, payment records |
| 10 | external_bookings_vouchers | supplier records with idempotency keys |
| 11 | dormant_tables | `lpos`, `supplier_confirmations` — writes blocked |
| 12 | operations | messages, tasks, append-only actions, strings |
| 13 | booking_state_machine | the guards |
| 14 | locked_strings_guard | legal copy protected against a service key |
| 15 | watchdog | pg_cron escalation of stranded bookings |
| 16a | fix_handle_new_user_role_cast | repairs a broken enum cast in 02 |
| 16 | rls_grants_and_helpers | `anon` revoked, RLS enabled everywhere |
| 17 | rls_policies | admin/operator separation |
| 18 | voucher_reissue | the only write path operators have to vouchers |

## The access model

Supabase gives every logged-in user the same database role, `authenticated`, so
grants describe what the application may attempt at all and RLS decides who may
actually do it. `anon` holds nothing — Phase 1 has no public surface.

| | Operator | Admin |
|---|---|---|
| Read everything | yes | yes |
| Tasks, messages | write | write |
| Vouchers | reissue only, via RPC | update |
| Catalogue, rates, eligibility, brands | no | write |
| Bookings, payments, quotes | no | write |
| Properties cache, external bookings | no | no — service key only |
| Locked strings | no | via `admin_update_locked_string()` only |

Nothing anywhere uses a blanket `using (true)`; the verification script asserts
it. Deletes are not granted on bookings, payments or vouchers by anyone — a
booking is cancelled through the state machine, never removed.

## Things that are enforced in the database, not in code

- A booking cannot reach `confirmed` without a confirmed supplier record for
  every API component and an issued voucher for every contracted extra.
- A booking cannot enter `failed_rollback` with money taken unless a refund
  record and an open urgent task exist in the same transaction.
- Locked legal strings reject edits from every role, `service_role` included.
- Nothing can be written to `lpos` or `supplier_confirmations`.
- `agent_actions` is append-only.
- Child age bands on a rate row cannot overlap.
- A contracted product cannot be non-freesale.

## The supplier layer

`src/lib/suppliers`. Everything above it imports `createSupplierAdapter()`
from the index and never a concrete adapter; `SUPPLIER_ADAPTER` in `.env.local`
selects `mock` or `webbeds`, and an unset or unrecognised value crashes rather
than defaulting — the nightmare misconfiguration is production quietly serving
mock inventory.

The mock carries thirty real UAE properties (16 Dubai, 7 Abu Dhabi, 7 RAK —
real names, real areas, real star ratings, invented rates) plus six scenario
properties, `SCN-*`, that misbehave on demand: sold out on book, price moved,
timeout, timeout-that-actually-succeeded, partial content, rejected guests.
Failure is fixture data, not a test-only API — the admin UI can reproduce any
of them by booking the right property.

Two properties of the mock are load-bearing:

- **It does not deduplicate on the idempotency key.** Whether WebBeds honours
  a replayed key is unknown until certification, so the mock assumes the worst:
  a blind retry creates a second supplier booking. The reconciliation step
  (`findByReference` before any retry of an indeterminate failure) is therefore
  the only thing standing between a timeout and a double charge, and the test
  suite proves both the disaster and its prevention.
- **It is deterministic.** Same search, same price, any machine, any day.
  Supplier refs come from a counter; the clock is injectable.

`npm test` runs the suite (Vitest).

## The assembly service

`src/lib/assembly`. Pure functions — rule rows in, a priced package out; the
rule row types ARE the generated database Row types, so a migration that
changes a rule table breaks compilation here. The TS engine mirrors the SQL
functions (`resolve_markup_pct`, `fees_for_property`) semantics exactly; a
change to either side must be mirrored in the other.

`assemblePackage()` refuses to guess. No matching markup rule, no matching fee
rule (all of Abu Dhabi), an unstated tax treatment, an unpriceable guest —
each raises the corresponding task (`missing_fee_rules`,
`tax_treatment_unknown`, …) and marks the package unsellable rather than
inventing a number. Components stay exact; the one rounding is UP at the
package total, in integer fils, delta retained as `rounding_delta`. Excluded
extras (ineligible, lead time closed, rate out of validity, inactive) are
reported with reasons, never silently dropped.

`executeSupplierBooking()` in `assembly/booking` is the payment-then-booking
path. Idempotency keys are derived (`bookingRef:quoteItemId`), not random, so
a crashed run reconciles into its own earlier attempt. It reconciles via
`findByReference` before every attempt, retries only indeterminate failures,
sends deterministic ones straight to rollback, cancels confirmed siblings on
the way down (raising `rollback_manual_cancel` naming every ref the supplier
refused), and satisfies the state-machine guards in write order: refund and
urgent task before `failed_rollback`, vouchers before `confirmed`. The
in-memory test store enforces the same guards as the DB trigger, so the tests
fail the way production would.

## The admin UI

Next.js App Router under `src/app`. `/login` is the only public route; the
middleware gates everything else on a verified session, and RLS — not the UI —
is the enforcement: staff actions run through the user-session client
(`lib/supabase/server.ts`), so an operator pressing an admin button receives
the database's refusal.

The service client appears in exactly two server actions, each of which
re-checks the caller's role itself because the service key bypasses RLS:

- **Properties sync** (`properties/actions.ts`) — refreshes the read-only
  supplier cache from the adapter; overrides survive by design.
- **The supplier run** (`bookings/actions.ts`) — `runSupplierBooking` feeds
  the Session 5 orchestrator with `SupabaseBookingStore`.

The working loop: Settings (create brand, markup rules) → Properties (sync)
→ New quote (assemble, preview, save — prices never round-trip through the
browser; saving re-assembles from rows) → quote detail (Create booking) →
booking detail (record payment, run supplier booking) → Tasks (whatever the
run raised). The room quote item carries the supplier offer and guest specs in
`pricing_detail`, which is how the booking runner books the price that was
quoted rather than re-searching.

**Deferred**: catalogue editing (products, rates, bands, eligibility, fee
rules) — the Extras screen is read-only and rows load by SQL for now.
Property overrides editing and customer/enquiry screens are likewise not
built. Everything else in the access model has a surface.

## Reference documents

`staycations-phase1-claude-code-prompt.md` is the instruction.
`ai-workforce-data-model.md` and `ai-front-end-spec.md` are references — where
they describe golf, LPOs, on-request sourcing or supplier confirmations, that
scope is out. `ai-workforce-phase1-claude-code-prompt.md` is superseded.
