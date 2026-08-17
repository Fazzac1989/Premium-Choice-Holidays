# Where we are

Handoff note. Written at the end of Session 3, before moving the repo out of
OneDrive. Read this and `git log` to pick up.

## The build

Premium Staycations, Phase 1. Six sessions, run in order, each inspected before
the next starts. The instruction is `staycations-phase1-claude-code-prompt.md`;
`ai-workforce-data-model.md` and `ai-front-end-spec.md` are references. Where
those describe golf, LPOs, on-request sourcing or supplier confirmations, that
scope is out.

| Session | Scope | State |
|---|---|---|
| 1 | Plan | done |
| 2 | Migrations | done, applied, verified |
| 3 | Auth and RLS | applied and verified live |
| — | Next.js scaffold | done |
| 4 | Supplier adapter + mock | done |
| 5 | Package assembly service | done |
| 6 | Admin UI | done; catalogue editing deferred |

## Outstanding right now

1. ~~Run `verify_session3.sql` against the live project.~~ **Done, Session 4.**
   Ran clean against real Supabase Auth with two users created by hand. The
   script has since been rewritten to report through a result set rather than
   notices, which the Supabase SQL editor does not display, and one vacuous
   assertion was fixed — `extra_eligibility` had no fixture row, so the blocked
   update matched nothing whatever the policy said.
2. **No git remote.** The GitHub repo was going to be created by hand. Once it
   exists: `git remote add origin …` then push.
3. **Vercel not set up.** Decision was to deploy the bare scaffold early so the
   pipeline is proven while it is trivial to debug. After deploying, add the
   Vercel domain to Supabase → Authentication → URL Configuration or logins
   work locally and fail deployed.

## Decisions that are not obvious from the code

- **Payment-then-booking.** Retry only on *indeterminate* failures (timeout,
  5xx, reset), and reconcile via `findByReference(idempotencyKey)` before each
  retry, because the supplier may already have created the booking.
  *Deterministic* failures (sold out, price moved, invalid guest) go straight
  to `failed_rollback` with no backoff. The primary acceptance test for this
  path is the fixture where `book()` times out but succeeded server-side.
- **Refunds move no money.** A refund is a `payments` row (`direction='out'`,
  `method='refund'`, unreconciled) plus an urgent task. Customer wording says
  *initiated*, never *completed*. Enforced by the state machine: a booking with
  money taken cannot enter `failed_rollback` without both.
- **Booking-first ordering** is a seam only (`bookings.order_strategy`). Only
  `payment_first` is implemented. It exists so free-cancel rates can invert the
  order once a gateway is live, without a migration at that point.
- **Tourism Dirham is never absorbed.** It is collected by the hotel and shown
  as an explicit payable-at-property line in both languages. Fee rules live in
  `property_fees` as data. Dubai and RAK are loaded; **Abu Dhabi is
  deliberately absent** and must be confirmed against WebBeds certification
  before AD inventory goes on sale — `fees_for_property()` returns nothing for
  it, and assembly must raise a task rather than price zero.
- **Tax inclusivity is per-contract**, read from the API response into
  `external_bookings.net_rate_tax_inclusive`. Null means unknown; unknown
  raises a task rather than being priced either way.
- **Child bands resolve at check-in, not booking.** A child who is 2 at booking
  and 3 on arrival is charged on arrival age. Hence `booking_guests.date_of_birth`
  and `guest_age_at()`.
- **Rounding**: components computed exactly, the package total rounded up to
  `brands.rounding_increment` (AED 5), delta retained as margin in
  `rounding_delta`. Never round components — the breakdown must reconcile.
- **Locked strings are guarded by trigger, not policy**, because `service_role`
  bypasses RLS and Phase 2 agents will hold a service key.
  `admin_update_locked_string()` is the only sanctioned path.
- **Voucher reissue is an RPC**, because "reissue only" cannot be expressed as
  a policy — a policy granting UPDATE would also allow blanking a code.
  Operators hold no write grant on `vouchers` at all.

## Traps found the hard way

- A blocked **UPDATE** under RLS affects zero rows *silently*; a blocked
  **INSERT** raises. Any RLS test must assert on row count and stored value,
  not just on exceptions, or it passes against a wide-open table.
- `npm` runs scripts through `cmd.exe`, where `&` is a command separator. The
  original OneDrive path contained one and broke every `npm run` command. Do
  not put this project back in a path containing `&`.
- A `node_modules` junction does **not** survive `npm install` — npm deletes
  and recreates the directory. That is why the repo left OneDrive.
- Windows PowerShell 5.1 writes UTF-16LE with `>` and UTF-8-with-BOM with
  `Set-Content -Encoding utf8`. Generate types from Git Bash.

## Known and accepted

- `npm audit`: 3 high-severity advisories in `postcss` and `sharp`, both
  transitive under Next 15.5.23. `audit fix --force` changes Next's major
  version; left for a Next patch release.
- `pg_cron` may need enabling once from Supabase → Database → Extensions before
  migration 15 can schedule the stuck-booking watchdog. Section 8 of
  `verify_session2.sql` reports whether it is scheduled.
- shadcn/ui is not installed. Deferred to Session 6, where components are
  actually needed; its init is interactive.

## Session 4 — done

Supplier layer in `src/lib/suppliers`, README section "The supplier layer".
Decisions that are not obvious from the code:

- **The mock does not deduplicate on the idempotency key**, deliberately.
  Whether WebBeds honours a replayed key is unknown until certification, so the
  mock assumes a blind retry double-books. Session 5's booking path MUST
  reconcile via `findByReference` before retrying an indeterminate failure —
  the tests fail with two bookings if it doesn't. Do not make the mock
  forgiving before certification evidence says so.
- **`ExternalBooking` carries no booking_id or quote_item_id.** Which component
  a supplier record satisfies is our fact, not the supplier's; Session 5
  attaches those when writing the row.
- **Unknown-not-false runs through everything**: `netRateTaxInclusive: null`
  (two fixtures, in different emirates), missing star ratings blocking sale via
  `propertyContentGaps()` (star rating selects the Tourism Dirham band), Abu
  Dhabi present in fixtures precisely because `property_fees` has no AD rows.
- **Errors classify themselves** (`failureClass` on `SupplierError`, same enum
  as the schema). `requiresReconciliation()` treats any non-SupplierError as
  indeterminate — "unknown" is not "nothing happened".
- **Guest problems are `InvalidGuestError`** (deterministic, supplier-visible),
  not RangeError — they must route to failed_rollback, not the retry loop.
  Malformed searches ARE RangeError: a caller bug, not a supplier failure.
- Dates are `YYYY-MM-DD` strings end to end, parsed as UTC. Free-cancel
  deadlines are stated with an explicit `+04:00` offset.

## Session 5 — done

Assembly service in `src/lib/assembly`, README section "The assembly service".
Not obvious from the code:

- **The engine is pure and the rule types are the DB Row types.** The loader
  that fetches rule rows from Supabase does not exist yet — Session 6 writes
  it when the admin UI first needs a real quote. `SupabaseBookingStore`
  (`booking/store.supabase.ts`) exists but nothing constructs it yet; it is
  deliberately NOT exported from the assembly index because it imports
  'server-only', which would poison Vitest.
- **resolveMarkupPct/feesForProperty are duplicated in TS by design**, in
  lockstep with the SQL functions of the same names. Change one, change both.
- **Idempotency keys are derived: `bookingRef:quoteItemId`.** A crashed
  orchestrator run re-derives the same key and adopts its own earlier attempt
  (tested). Do not switch to random keys.
- **The orchestrator reconciles before the FIRST attempt too** — one extra
  findByReference call per component, and it is what makes crash recovery
  work.
- **PostgREST has no cross-statement transactions.** The Supabase store relies
  on write ORDER (refund + task before failed_rollback; vouchers before
  confirmed) which the DB guards then verify at transition time. A crash
  mid-sequence leaves supplier_booking with evidence rows present; re-running
  the orchestrator completes it via key reconciliation.
- **The in-memory store enforces the DB guards** (store.memory.ts). If an
  orchestrator change violates the state machine, tests fail the way
  production would. Keep the guards when extending it.
- **Below margin floor is an approval gate (approve_quote task), not a block.**
  Missing fee rules, unknown tax, unpriceable component ARE blocks.

## Session 6 — done

Admin UI, README section "The admin UI". Not obvious from the code:

- **shadcn 4.x generated Base UI components, not Radix.** Composition is via
  `render` props (`<Button render={<Link …/>} />`), not `asChild`. RTL support
  was enabled at init (`--rtl`) for the Arabic-first requirement; use logical
  CSS properties (`ms-`/`me-`/`border-e`) in new UI, not `ml-`/`mr-`.
- **The room quote item carries `supplierQuote` and `guests` inside
  `pricing_detail`.** The booking runner books from that stored offer rather
  than re-searching, so the price booked is the price quoted. Breaking this
  contract breaks createBookingFromQuote and runSupplierBooking.
- **Quote preview and save both re-assemble server-side** from the request;
  prices never round-trip through the browser.
- **The service client appears in exactly two actions** (properties sync,
  supplier run), each re-checking the caller's role because the service key
  bypasses RLS. Keep it that way — everything else goes through the
  user-session client so RLS is the enforcement.
- **Tasks order by enum position**: priority ascending gives urgent first
  because the enum declares urgent before normal before low.

Deferred from Session 6: catalogue editing (products/rates/bands/eligibility/
fee rules — Extras screen is read-only, rows load by SQL), property overrides
editing, customers/enquiries screens.

## First run of the UI

1. `.env.local` from the example: Supabase keys + `SUPPLIER_ADAPTER=mock`.
2. Sign in with one of the two verification users.
3. Settings: create the brand, then markup rules (api/all-types and
   contracted/all-types at minimum — assembly refuses to price without them).
4. Properties: Sync from supplier (admin) — loads the 36 mock properties.
5. New quote → preview → save → create booking → record payment → run
   supplier booking. Book a SCN-* property to watch a failure path: the
   rollback raises the refund row, the urgent task, and lands in
   failed_rollback with the mock's deliberate non-deduplication proving the
   reconcile step.

## Still outstanding (operational, not code)

- Git remote + push.
- Vercel deploy, then the Vercel domain into Supabase → Authentication → URL
  Configuration (logins fail deployed otherwise).
- `pg_cron` enablement check for the watchdog (Session 3 note, still
  unconfirmed).
