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
| 3 | Auth and RLS | migrations applied; **live verification outstanding** |
| — | Next.js scaffold | done |
| 4 | Supplier adapter + mock | not started |
| 5 | Package assembly service | not started |
| 6 | Admin UI | not started |

## Outstanding right now

1. **Run `supabase/tests/verify_session3.sql`** against the live project. It
   needs two users to exist first (Authentication → Users → Add user, twice —
   first becomes admin, second operator). Confirm with
   `select email, role from profiles;`. This is the check the run guide calls
   the foundation: if an operator can write to `product_rates`, everything
   after is built on sand. The script passed 25 assertions in Docker against a
   stubbed auth schema, but has not run against real Supabase Auth.
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

## Session 4, when it starts

Supplier adapter layer. Interface with `MockAdapter` and `WebBedsAdapter`
behind a feature flag, per `SUPPLIER_ADAPTER` in `.env.local`. The interface
takes the agreed change:

```ts
book(quote: StayQuote, guests: Guest[], idempotencyKey: string): Promise<ExternalBooking>;
findByReference(idempotencyKey: string): Promise<ExternalBooking | null>;
```

Mock fixtures cover 30 UAE properties across Dubai, Abu Dhabi and RAK, plus the
failure cases: sold out between quote and book, price moved, timeout, partial
content, and the timeout-that-actually-succeeded.
