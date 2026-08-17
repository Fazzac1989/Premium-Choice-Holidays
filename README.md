# Premium Staycations — Phase 1

Admin platform and system of record for premiumstaycations.com. UAE hotel
staycations sold to UAE residents in English and Arabic.

Phase 1 builds the database, the admin UI, the supplier abstraction and the
package assembly service. It builds no agents and no customer-facing site.

**The property the whole design rests on:** every component of every booking
confirms instantly. Nothing here may compromise that.

## Status

| Session | Scope | State |
|---|---|---|
| 1 | Plan | done |
| 2 | Migrations | applied and inspected |
| 3 | Auth and RLS | **awaiting apply and inspect** |
| 4 | Supplier adapter + mock | not started |
| 5 | Package assembly service | not started |
| 6 | Admin UI | not started |

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

## Reference documents

`staycations-phase1-claude-code-prompt.md` is the instruction.
`ai-workforce-data-model.md` and `ai-front-end-spec.md` are references — where
they describe golf, LPOs, on-request sourcing or supplier confirmations, that
scope is out. `ai-workforce-phase1-claude-code-prompt.md` is superseded.
