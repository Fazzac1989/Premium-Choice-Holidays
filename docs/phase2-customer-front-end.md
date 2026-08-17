# Phase 2 sketch: the customer front end

A sketch, not an instruction. Written after Phase 1 was verified live, while
the shape of what exists is fresh. The governing fact: **quotes are the
artefact both front ends produce.** The customer site does not get its own
pricing, its own fee logic or its own booking path — it is a second producer
of the same `quotes` row, priced by the same `assemblePackage()`, confirmed by
the same orchestrator the admin UI drives today. If the site ever needs a
price the engine will not produce, the engine is where that conversation
happens.

## What it is

premiumstaycations.com: browse UAE staycations, search real availability,
see one honest package price, pay, receive confirmation and vouchers.
English and Arabic as equals — not an English site with a translate button.

## The funnel

```
Home ─ destination pages ─ property page
                              │
                    stay search (dates, rooms, party w/ DOBs)
                              │
                    package page  ←  adapter.search() + assemblePackage()
                    (room + lead extras by commercial priority,
                     Tourism Dirham shown payable-at-property, both languages)
                              │
                    checkout: guests, lead contact, T&Cs (locked strings)
                              │
                    pay — hosted gateway page
                              │
              webhook: payments row + payment_received
                              │
              executeSupplierBooking()          ← already built, already tested
                              │
                    confirmation + vouchers + email
```

Two deliberate properties of this funnel:

- **The package page is a quote in draft.** Rendering it runs the same
  assembly the admin builder runs; proceeding to checkout persists it as a
  `quotes` row with `quote_items`, exactly as the admin flow does. Abandoned
  checkouts are therefore quotes with status draft — free follow-up material
  for the reservations flow, no new modelling.
- **An unsellable package never renders a price.** Where assembly blocks
  (missing fee rules, unknown tax), the site shows an enquiry form instead of
  a number, writing an `enquiries` row. The customer-facing failure mode of
  the pricing engine is "talk to us", never a wrong figure.

## Access model: anon stays at zero

Phase 1 revoked everything from `anon`, and Phase 2 keeps it that way. The
public site reads and writes **only through the Next.js server** (server
components and route handlers). The browser gets HTML and a session cookie,
never a database connection:

- Catalogue reads (properties, overrides, products, rates) go through the
  service client inside server code, wrapped in narrow read functions that
  select only published fields. No RLS surface for the public means no public
  policy to get wrong.
- Writes are exactly three, all server-side: create quote, create
  booking+guests, create enquiry. Each validates with zod, rate-limits, and
  writes what the access model already defines.
- The one genuinely new trust boundary is the **payment webhook** — verified
  by gateway signature, idempotent (gateway refs are unique), and the only
  path that moves a booking to `payment_received` from outside the admin.

## Payments

A UAE-capable gateway (Telr, Checkout.com, Network International, Tap —
commercial choice, not architectural). Hosted payment page, not card fields
on our site. The flow lands on machinery that already exists: webhook records
the `payments` row, transitions to `payment_received`, and the orchestrator
takes it from there — including `failed_rollback` with refund-initiated
wording if the supplier fails after money is taken. The `order_strategy`
seam (`booking_first`) becomes real here for free-cancel rates: book the
refundable room first, then take payment, per the Session 1 decision.

## Bilingual and RTL

- Route-level locale: `/en/…` and `/ar/…`, `dir="rtl"` on the Arabic tree.
  The shadcn install is already RTL-enabled; the admin habit of logical
  properties (`ms-`/`me-`) is the rule on the public site too.
- Content: `property_overrides` carries Arabic property names and our own
  copy; products carry `name_ar`/`description_ar`; legal and payment wording
  comes from `strings`, where locked rows are already trigger-protected.
  A missing Arabic string on a public page raises `missing_arabic` — same
  task queue, new producer.

## The AI concierge (2b, behind the funnel)

`ai-front-end-spec.md` describes a conversational front end. It slots in as
a third producer of the same artefacts: chat gathers what the search form
gathers (dates, party, budget, preferences), writes an `enquiries` row,
proposes packages by calling the same assembly, and hands a human-approved
quote back into the same funnel at the payment step. The guardrails it needs
are the ones Phase 1 built for exactly this: locked strings it cannot edit,
a state machine it cannot talk its way past, an append-only `agent_actions`
log, and money it can read but never move.

## What has to be built new

1. Public route group + middleware split (public tree no longer redirects to
   /login).
2. Catalogue read layer with published-field views; property media handling
   (the cache has no images today — a `property_overrides` extension or an
   images table, fed by supplier content post-certification).
3. Search → package page (thin composition over adapter + assembly).
4. Checkout + customer identity (email-first, no accounts in 2a; `customers`
   table already exists).
5. Gateway integration + webhook.
6. Transactional email (per-brand `from_email` exists) and voucher PDF
   rendering (`vouchers.pdf_url` is waiting).
7. i18n scaffolding and the Arabic content pass.
8. SEO/marketing surface: destination pages, sitemap, structured data.

## What must NOT be built

- A second pricing path. If the site needs a price, assembly grows a
  capability and the admin UI gets it too.
- Public database access. `anon` keeps zero grants.
- Card handling on our origin. Hosted gateway pages only.
- Golf, LPOs, on-request sourcing, supplier confirmations — still out, same
  as Phase 1.

## Sequencing inside Phase 2

**2a** funnel (browse → pay → confirm) · **2b** concierge chat producing the
same quotes · **2c** customer account area (bookings, vouchers, cancellation
requests). WebBeds certification gates real inventory for all of it, and
remains the critical path — the funnel can be built and demoed end-to-end
against the mock exactly as the admin UI was.
