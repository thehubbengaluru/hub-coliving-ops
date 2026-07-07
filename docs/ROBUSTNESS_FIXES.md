# The Hub — Robustness Audit & Fix Plan

**Companion to `CUSTOMER_JOURNEY.md`.** That document maps *what the system does*; this one maps *where it breaks* and *how to fix it*. Every finding below was verified against the actual code (file:line cited), not inferred from the spec. Findings are grouped by theme and ordered by severity within each.

---

## ✅ Resolution status (implemented on this branch)

Most findings are **fixed in code** and the project builds clean (`next build` ✓). Summary below; per-finding detail follows in the audit sections (which are kept as the original record).

**Required ops actions before deploy** (the fixes assume these):
1. **Set `CRON_SECRET`** in the environment. The cron now **fails closed** (§2.2) — with no secret it returns 503 and won't run. Set it and configure the Vercel/GitHub cron to send `Authorization: Bearer <CRON_SECRET>`.
2. **Admin login is now Supabase auth.** The admin account (`nocode@thehubco.live`) already exists in Supabase with `profiles.role = 'admin'`, so no provisioning is needed — sign in with its Supabase **password** (reset via Supabase dashboard if unknown). Optional `ADMIN_EMAILS` env (comma-separated) is an additional allowlist fallback.
3. Two Supabase tables were created by migration: **`webhook_events`** (webhook idempotency) and **`dunning_sweeps`** (cron double-run guard). Both are service-role only. `SUPABASE_SECRET_KEY` (already set) powers them.

**Fixed:** §1.1–1.6 (all criticals: signed Supabase admin auth, admin+portal API auth, server-derived booking rate, pay-rent server amount, checkOut/cap validation), §2.1–2.10 (extension cap, fail-closed cron, booking rollback+idempotency, webhook dedupe, capped fee, month-1 detection, reassign phone-only guard, cancel-link-on-redeem, defaulter backstop), §3.1–3.8 (checkin ordering, IST cancellation & early-checkout, escalation rent-month, cron atomicity/double-run/pointer-failure), §3.10 (reassign-onto-serviced-bed), §3.15 (env soft-fail), §4.1–4.4 (timing-safe sig, Notion `res.ok`+429 backoff, leads enum, blockBed incoming-hold), §4.6 (dead routes deleted). Portal `update-info` and `maintenance` were also gated (IDOR) beyond the original list.

**Previously deferred — now also implemented** (see the feature roadmap below): §3.9 (reassign ID-doc ops flag), §3.11 (checkout Alumni-dedup), §3.12 (`gender="Other"` preserved end-to-end), §3.13 (real `availableUntil` from next occupant), §4.5 (bed soft-hold TTL sweep).

---

## 🚀 Feature roadmap — the CUSTOMER_JOURNEY §15 gaps (all implemented)

Beyond the bug fixes, the manual-only ⚠️ paths from the journey doc were built out end-to-end, in priority order.

**Extra ops setup these add:**
- **Two new Supabase tables** (created by migration, service-role only): `payments` (captures every Razorpay payment id so refunds can target it) and `refunds` (the refund/settlement queue). Plus `dunning_sweeps` from the earlier pass.
- **Two optional Notion properties** on the member DB (code warns + continues if absent): **`Deposit Status`** (select: Held / Refunded / Forfeited) and **`Failed Inspections`** (number, for the 3-strike eviction rule).
- No new env vars beyond `CRON_SECRET`.

**P0 — money correctness:**
- **Refund automation + settlement ledger.** Cancellation (50% of total paid) and checkout (deposit − reviewed deductions) now **compute + queue** a refund; a new **admin Refunds page** (`/admin/refunds`) lets ops review and **issue** it, which calls the Razorpay refund API and (best-effort) writes a Zoho credit note. Manual/hub-initiated refunds can be queued too. `depositStatus` is now written (Held/Refunded/Forfeited) — forfeiture on default, refunded on issue. Files: `lib/ledger.ts`, `lib/razorpay.ts:createRefund`, `api/admin/refunds/*`, `api/portal/cancel-booking`, `api/rooms/checkout`.
- **Pet & couple billing wired.** Pet deposit ₹25,000 folds into the deposit link; ₹5,000/mo pet fee folds into the rent schedule + subscription so it's actually debited. Couple premium is a single constant (`COUPLE_PREMIUM_MONTHLY`, ₹0 by design) that switches on the same way. Files: `lib/stay.ts` fees block, `api/bookings/create-payment-links`.
- **Room-move updates the mandate.** Reassign now cancels the old subscription and creates a fresh one at the new rate for the remaining months. File: `api/rooms/reassign`.

**P1 — lifecycle sweeps** (added to the daily cron): abandoned booking (deposit never paid past 7 days → release bed + cancel), no-show (check-in passed, not arrived → flag ops), unpaid upfront rent (deposit paid, no rent in ledger → chase). Mandate-resume after `subscription.halted` is the admin `POST /api/razorpay/subscription` (now accepts stay dates to size the resumed mandate). Files: `api/cron/extend-stay-reminders`, `lib/ledger.ts`.

**P2 — lifecycle completeness:** checkout Alumni-dedup (query-before-create), self-serve **reschedule** (`/api/portal/reschedule`, pre-arrival, preserves duration, flags ops for payment re-alignment), **inspection/key fees** (`/api/admin/fees` — ₹2,500 failed-inspection + strike counter → 3-strike eviction flag; ₹3,000/key), Zoho **credit note** on refund issuance.

**P3 — data integrity:** real `availableUntil` (next-occupant scan) now enforced in the booking window; reassign appends an **ID-doc re-attach** ops note (files can't move — URLs expire); `gender="Other"` is preserved through booking → board → roommate filter (the client already matched exact-or-vacant, so no product decision was needed); the misleading flat ₹25,000 weekly rate is replaced by the **actual 7-day pro-rated** figure.

---

> **Pilot context:** Razorpay is on **test keys** during the pilot (per project memory). The payment-security findings below are *pre-live-cutover* blockers — they must be closed before the live key swap + webhook re-registration, because the moment real money flows, every "client-controlled amount" and "unauthenticated mutation" becomes a live financial exploit.

**Scope of the sweep:** booking flow, payments/webhook/dunning, guest portal & exit paths, admin & infrastructure. Four parallel audits. The doc's own ⚠️ gaps (already known, manual-only) are *not* re-listed here unless the code diverges from what the doc claims — those divergences are flagged inline.

---

## 0. The headline: authentication is missing on the entire API surface

This is the single most important finding and it recurred in three of the four audits independently. **No API route in the app verifies the caller's session.** The middleware proxy (`src/proxy.ts`, `src/lib/supabase/proxy.ts`) only redirects *browser page* navigations under `/admin` and `/portal/dashboard`; it never guards `/api/*`. Route handlers read `email` / `notionPageId` / `amount` / `monthlyRate` straight from the request body and act on them.

Consequence, concretely:
- Anyone with `curl` can cancel, check-out, or extend **any** guest's booking (portal routes).
- Anyone can reassign beds, block rooms, check guests in, and read the full Zoho invoice ledger (admin routes).
- Anyone can wipe a defaulter's dunning tags by paying ₹1 (pay-rent route).
- Anyone can trigger the dunning/vacate-notice cron on demand if `CRON_SECRET` is unset.

Everything in §1 is a facet of this. **Fix the auth layer first** — most individual findings below collapse once routes actually check sessions.

---

## 1. Critical — Authentication, authorization & money integrity

### 1.1 Admin session cookie is a forgeable, unsigned public constant
`src/lib/auth/admin-session.ts:8,18`, `src/lib/supabase/proxy.ts:46`
The admin cookie is `hub_admin = "nocode@thehubco.live"` — a literal email, checked by string equality, with no signing, HMAC, expiry, or password. The value is documented in the repo and in memory. Anyone who can set that cookie value (server-side injection, XSS, or a leaked value) is a full admin.
**Fix:** Replace the static-value cookie with a signed/encrypted token — HMAC of `email + expiry` under a server secret (or a Supabase session) — and verify the signature in both the proxy and a shared server-side `requireAdmin()` used by every admin route. Add a real login credential.

### 1.2 All admin API routes (`/api/rooms/*`, `/api/billing`, `/api/leads/update`) are unauthenticated
`reassign/route.ts:15`, `block/route.ts:9`, `checkin/route.ts:10`, `billing/route.ts:8`, `leads/update/route.ts:7`; gap in `src/lib/supabase/proxy.ts:48-58`
`updateSession` only redirects `/admin/*` and `/portal/dashboard` pages; it never 401s `/api/*`. No handler calls `hasAdminSession()`. `GET /api/billing` leaks the entire Zoho rent/deposit invoice ledger to anonymous callers.
**Fix:** Add `await requireAdmin(req)` at the top of every mutating admin API handler (and `/api/billing`). Alternatively extend `updateSession` to return 401 for unauthenticated `/api/` admin routes — but per-handler guards are safer and explicit.

### 1.3 All portal API routes are unauthenticated → IDOR on every guest action
`api/portal/cancel-booking/route.ts`, `checkout-date/route.ts`, `pay-rent/route.ts`, `extend-stay/route.ts`, `auth/route.ts`
No route under `/api/portal/` reads any cookie or Supabase session — confirmed by grep. Each trusts `email` / `notionPageId` from the body. `auth/route.ts` is a bare email lookup (no OTP, no password) that returns full guest PII + `notionPageId` for any email supplied.
**Scenario:** Knowing guest B's email (enumerable via `/api/portal/auth`), anyone can cancel B's booking, force B into an early checkout, or bind B to a fresh extension contract + payment links.
**Fix:** In each route, resolve the caller via `createServerClient` + `getUser` server-side, and assert the session email equals the target booking's email before mutating. Never accept `email`/`notionPageId` as proof of identity. Gate `/api/portal/auth` behind an authenticated session (or convert it to a real OTP/password flow).

### 1.4 Booking route trusts client-supplied `monthlyRate` → price tampering
`api/bookings/create-payment-links/route.ts:54,315,334`
The rate comes straight from the multipart body and flows into the deposit link, rent link, Notion `Tariff`, and the subscription amount. `rateForTier`/`tierFromRate` (`pricing.ts`) are never called to cross-check. Editing the POST books a ₹50,000 Deluxe Private at `monthlyRate=1`: deposit ₹2,001, subscription ₹1/mo, all the way into Razorpay + Notion.
**Fix:** Resolve the bed from `roomNumber` server-side, derive the canonical rate via `rateForTier(property, tier)`, and 400 if the submitted rate doesn't match. Never trust a client money value.

### 1.5 Pay-rent accepts client-controlled amount + arbitrary page → dunning wipe for ₹1
`api/portal/pay-rent/route.ts:19-46,33` (only guard is `amount > 0`); webhook `razorpay/webhook/route.ts:170-175`
The route mints a `rent`/`pro_rated_rent` link for any positive `amount` against any `notionPageId`. On `payment_link.paid`, the webhook calls `clearRentDunningState` for *any* rent-type link regardless of amount — dropping `Rent Overdue`/`Rent Defaulted`, zeroing the failure counter, clearing the due-link pointer. This is strictly worse than doc §15.4 (which claims a flat `monthlyRate` link): the API allows *arbitrary* amounts on *arbitrary* members. Combined with the missing 4-month cap (§2.1), paying ₹1 also re-enables extensions.
**Fix:** Require the session (per §1.3), resolve the member page from the session email, compute the amount server-side from `Tariff` + current late fee, and in the webhook only clear dunning when the paid amount ≥ the stored `Due Rent Base (₹)`.

### 1.6 Missing/invalid `checkOut` silently creates a 120-month auto-debit mandate
`create-payment-links/route.ts:56,334,359-369`, `rent-schedule.ts:90,130-132`, `razorpay.ts:263`
The server never validates that `checkOut` exists, is after `checkIn`, or is within `MAX_STAY_MONTHS`. `duration` is validated only client-side. Empty/≤`checkIn` → `computeRentSchedule` treats the stay as open-ended (`last=null` → `cycles=null`) → `createRentSubscription` falls back to `total_count: 120`. The guest is put on a **120-month** mandate. An absurd far-future `checkOut` mints a huge fixed cycle count.
**Fix:** Server-side, recompute `checkOut = checkoutForDuration(checkIn, duration)` from a validated `duration` (reject unknown values) and reject stays exceeding `MAX_STAY_MONTHS`. Never let `cycles=null` reach Razorpay from the public route.

---

## 2. High — Broken guards & business-rule enforcement

### 2.1 The 4-month stay cap is not enforced on extensions
`api/portal/extend-stay/route.ts` (no `MAX_STAY_MONTHS` reference anywhere)
Doc §9 says total > 4 months must be blocked and re-applied. The endpoint validates only that `duration ∈ {1w,1m,2m,3m,4m}` and computes `newCheckOut`. No tenancy-length check exists. A guest booked Jan 1→May 1 (the cap) can pick "4m" → Sep 1, an 8-month single contract, repeatable indefinitely. `MAX_STAY_MONTHS` is used only for UI copy.
**Fix:** Compute months from `ctx.checkIn` to `newCheckOut`; if > `MAX_STAY_MONTHS`, 409 with the re-apply instruction.

### 2.2 Cron endpoint is public when `CRON_SECRET` is unset (fail-open)
`api/cron/extend-stay-reminders/route.ts:107-113`
The auth guard runs only `if (secret)`. If the env var is missing, the block is skipped and anyone can `GET` the endpoint — triggering dunning sweeps, late-fee link reissuance, and vacate-notice/finance emails on demand, repeatedly.
**Fix:** Fail closed — return 401/500 when `CRON_SECRET` is unset. Never treat "no secret configured" as "open to all."

### 2.3 Partial failure orphans a Notion page + soft-held bed with no payment links
`create-payment-links/route.ts:262-267` (page created), `320-328`/`340-349` (links) — not wrapped in try/catch
If Razorpay throws at the deposit or rent link step, the route 500s *after* the guest page (`Deposit Pending`) and bed hold already exist. The guest retries → a **second** page + second bed write + second deposit link, possibly a second subscription. No idempotency key, no cleanup.
**Fix:** Wrap link creation so a failure rolls back (archive the page + `revertBedAllotment`), or make the POST idempotent on an `email + checkIn` key so retries reuse the existing page/links.

### 2.4 No duplicate-submission / idempotency guard on the booking mutation
`book/page.tsx:788-869`, `create-payment-links/route.ts`
The only guard is the button's `disabled={paymentLoading}`. A dropped response, back button, or second tab re-POSTs → another Guest page + links + subscription. `assertBedVacant`'s same-guest rule lets the bed write pass, so nothing stops it — duplicate subscriptions mean **double monthly auto-debit**.
**Fix:** Per-wizard idempotency token; persist a marker on first page create and short-circuit repeats; or look up an existing `Deposit Pending` page by `email + checkIn` before creating.

### 2.5 No webhook idempotency / replay protection
`razorpay/webhook/route.ts:103-126` (no event-id dedupe); `notion.ts:754` (`recordRentChargeFailure` increments unconditionally)
Confirms doc §15.8. Razorpay retries deliveries on timeout/non-2xx. Replayed `subscription.pending` → premature escalation (5 counted from 3 real fails + 2 replays). Replayed `payment_link.paid` → re-posts a Zoho payment + re-emails finance. Replayed `subscription.charged` → **duplicate GST invoice** emailed to the guest.
**Fix:** Persist the `x-razorpay-event-id` header (Notion property or KV) and return 200 immediately on duplicates.

### 2.6 Webhook late fee is uncapped → escalation link can exceed the ₹3,500 cap
`razorpay/webhook/route.ts:27-34`: `daysLate = Math.max(0, dayOfMonth - 3)` with no `min(7, …)`
The cron caps the fee (`cron:59`), the webhook does not. With Razorpay's ~5-day retry cadence the 5th failure routinely lands mid-month: escalation on the 18th issues a link for rent + ₹7,500 and emails the guest that amount. Doc appendix says the fee caps at ₹3,500.
**Fix:** Apply `Math.min(7, Math.max(0, day - GRACE_DAY))` in the webhook's `currentLateFee()`, matching the cron.

### 2.7 `subscription.charged` month-1 detection is dead code → duplicate invoice, check-in invoice never paid
`razorpay/webhook/route.ts:235`: `isMonth1 = !!zohoInvId && !sc.subscription?.entity?.current_end`
Razorpay populates `current_end` on every `subscription.charged`, including the first, so `isMonth1` is essentially never true. The first charge takes the months-2+ branch: a fresh invoice is created/paid/emailed while the original check-in invoice stays unpaid in Zoho forever — double revenue recognition for month 1.
**Fix:** Use `paid_count === 1` from the payload, or compare the derived `rentMonth` against the stored month-1 invoice's month.

### 2.8 Reassign skips the vacancy guard for phone-only guests → silent tenant overwrite
`notion.ts:1093`: `if (email) await assertBedVacant(...)`
The one guard against overwriting a live tenant runs only when the *moving* guest has an email. Room-board invites are phone-only, so a phone-only guest can be reassigned onto an occupied bed, overwriting the occupant's name/contact/dates with no 409.
**Fix:** Always call `assertBedVacant` on the destination (pass phone even when email is absent — the guard already matches on phone digits) and error out if the target holds any live guest.

### 2.9 Redemption erases the due-link pointer without cancelling the live link
`razorpay/webhook/route.ts:225-228` → `notion.ts:884-908`
`subscription.charged` → `resetRentChargeFailures` → `clearRentDunningState` blanks `Due Rent Link ID` but never calls `cancelPaymentLink`. The open dunning link (created `reminder_enable: true`, `razorpay.ts:90` — Razorpay keeps nudging the guest to pay it) stays live, and the pointer wipe means neither webhook nor cron can ever find it to cancel. Guest pays both → doc §15.9 confirmed, plus an *un-cancellable orphan* the doc misses. Same for `payment_link.paid` clearing state for a different link than the one paid.
**Fix:** In `clearRentDunningState`, read `Due Rent Link ID` first and best-effort `cancelPaymentLink` before blanking it.

### 2.10 Cron paid-link backstop never runs for defaulted members (doc §8.4 is wrong here)
`cron/extend-stay-reminders/route.ts:215`: `if (m.defaulted) return null` runs *before* the `link.status === "paid"` backstop at 221-224
If a guest pays the day-10 link and the `payment_link.paid` webhook delivery fails, nothing ever clears the `Rent Defaulted` tag/counter/pointer — the member is permanently frozen as a defaulter despite having paid. The doc claims "the cron also has a backstop (sees link paid → clears)" — false on this path.
**Fix:** Move the `dueLinkId`/paid check above the `defaulted` early-return; only skip the *reissue* steps for defaulted members, not the redemption backstop.

---

## 3. Medium — Date/timezone math, ordering, and state consistency

### 3.1 Check-in wires the subscription to a Zoho invoice that doesn't exist yet
`api/rooms/checkin/route.ts:53-70` (step 3) vs `73-78` (step 4)
The subscription is created in step 3 passing `results.zohoInvoiceId`, but that field is only assigned in step 4, which runs afterward. Every mandate is created with `zohoInvoiceId: undefined` — unlinked from its invoice.
**Fix:** Create the Zoho rent invoice before the subscription, or pass the invoice id after step 4.

### 3.2 Cancellation boundary uses UTC "today" instead of IST
`api/portal/cancel-booking/route.ts:34`: `new Date().toISOString().slice(0,10)`
Yields the UTC date, then feeds `canCancelBooking`. The rest of the codebase uses IST (`extend-stay` uses the `Asia/Kolkata` formatter; `stay.ts:70` documents why `toISOString` is wrong). Between 00:00–05:29 IST, UTC is still yesterday — on the exact 31-day cutoff a guest is judged a day early, flipping a 50%-refund cancellation across the deadline.
**Fix:** Compute `todayISO` with the IST formatter used in `extend-stay/route.ts:75`.

### 3.3 Early-checkout notice math ignores IST and re-implements the shared helper with rollover distortion
`api/portal/checkout-date/route.ts:29-31`
Notice is computed inline with `new Date()` (UTC/server-local) + `new Date(y, m+1, getDate())`, bypassing the IST-safe `earliestEarlyCheckoutISO` (`stay.ts:118`). The `setMonth`-style construction hits the §7.4 rollover: notice given Jan 31 demands checkout Mar 3, not Feb 28/Mar 1 — a longer-than-spec window. `requested` parses ISO as UTC midnight while `minNoticeDate` is local midnight, so the `<` comparison is offset-sensitive at the boundary.
**Fix:** Use `earliestEarlyCheckoutISO(istToday)` and compare ISO strings, not mixed `Date` objects.

### 3.4 Escalation stamps `rent_month` as the current IST month → mis-dated cross-boundary debts
`razorpay/webhook/route.ts:54`
The anchor is T−2 before the 1st and retries span ~25 days, so a 5th failure or late `subscription.halted` can fire after the rent month ends (or 1–2 days before it starts). The link's `rent_month` then points at the wrong month; the cron's `dunningDay` either restarts the debt at day-1 grace (₹0 fee) for month-old rent, or returns null and ignores the episode until the 1st.
**Fix:** Derive the rent month from `subscription.entity.current_start + 4 days` (the same heuristic `subscription.charged` uses at webhook:249-251) and pass it into `escalateOverdueRent`.

### 3.5 Cancel-and-reissue is non-atomic; silent `setDueRentLink` failure creates parallel live links
`cron/extend-stay-reminders/route.ts:246-257`; `notion.ts:863-865` (swallows errors)
The cron cancels the old link, creates a fresh one, then stores the id — but if the store fails, Notion keeps the *cancelled* old id; next day's sweep sees status "cancelled" (not "paid") and issues yet another link — yesterday's fresh link is never cancelled and stays payable at the wrong (lower) fee. If `createRentPaymentLink` throws right after the cancel, the guest has no payable link for 24h.
**Fix:** Create the new link *before* cancelling the old one; make `setDueRentLink` failure abort/alert instead of warn-and-continue.

### 3.6 Escalation idempotency marker is best-effort → duplicate escalation + orphaned link
`notion.ts:770-779` (`markRentOverdue` swallows errors), `webhook/route.ts:55,66-71`
The link is created *before* the `Rent Overdue` tag is written. If tagging fails, the next `subscription.pending` sees `alreadyOverdue: false` with `count ≥ 5` and escalates again — second fee email, second link, `setDueRentLink` overwrites the pointer, first link stays live and payable.
**Fix:** Write/verify the `Rent Overdue` tag *first* and abort escalation if it can't persist; cancel any previously stored link before storing a new one.

### 3.7 Missing Notion dunning properties → a new live link every day, forever
`cron/extend-stay-reminders/route.ts:283-307,312-351`
Both branches run whenever `dueLinkId` is null. If the member DB lacks "Due Rent Link ID" (`setDueRentLink` is a no-op then), every daily run creates a fresh link + email and never cancels the prior — N live links accumulate; paying an old one settles a stale amount.
**Fix:** Have `setDueRentLink` return success/failure; skip link creation (and alert finance) when the pointer can't be persisted.

### 3.8 Cron double-run in one day is not idempotent
`cron/extend-stay-reminders/route.ts`
Two runs in a day send duplicate reminders (days 1–3), cancel/reissue twice (days 4–9); day 10 is safe only because of the defaulted freeze.
**Fix:** Stamp a "last swept date" per member and no-op a second same-day run.

### 3.9 Reassign loses the guest's uploaded ID documents (doc §10.1 overstates "every field copied")
`notion.ts:1051-1053`, `copyPropValue:1020-1035` (omits `files`)
`files` are deliberately not copied (Notion URLs expire), so after a reassign the new bed has no KYC/ID document while the old bed keeps them but is relabeled "Vacant".
**Fix:** Copy permanent/external file URLs where present, or write a page note flagging ops to re-attach ID docs; and correct the doc to list files as a non-moving exception.

### 3.10 A guest can be reassigned onto a bed blocked for servicing
`notion.ts:346,355`: `assertBedVacant` treats `isServiced` beds as assignable
`POST /api/rooms/reassign` will move a guest onto a "Vacant — serviced" bed, silently clearing the block. Doc §10.2 covers "block can't displace a guest" but not the reverse.
**Fix:** Reject destination beds whose `Member Name` contains "serviced" (or has an active block callout) in reassign.

### 3.11 Checkout / Alumni-sync is not idempotent and has no status gate
`api/rooms/checkout/route.ts:42-55`, `notion.ts:394-528`
The "archive first, then clear bed" ordering correctly aborts if `syncGuestToAlumni` throws (verified). But if archive succeeds and `checkOutGuest` then fails, the member is in Alumni with the bed still occupied; re-running creates a **second** Alumni record (`pages.create`, no dedupe). `checkout-date` never checks booking status, so it sets a checkout date on already-cancelled/checked-out records.
**Fix:** Query Alumni for an existing record (by email/checkout) and update instead of create; gate `checkout-date` on an active status.

### 3.12 `gender="Other"` is silently coerced to male on the occupancy board
`create-payment-links/route.ts:294`, `notion.ts:376`: `=== "female" ? "female" : "male"`
The wizard offers "Other", so a non-binary guest is recorded as Male on the bed and used as the roommate-gender filter for the sibling bed — corrupting sharing-room matching.
**Fix:** Preserve a real gender value (or neutral sentinel) end-to-end; decide the sharing-room policy for "Other" explicitly.

### 3.13 Bed availability upper bound (`checkInMax`) is never enforced
`api/rooms/availability/route.ts:90` always returns `availableUntil: null`
So the client's `checkInMax` is always `""` and the server guard at `create-payment-links/route.ts:73-75` is dead. The server relies on a client-forwarded bound that is always null. Only `assertBedVacant` (a read-then-write race) backstops at write time.
**Fix:** Compute the real availability window server-side from Notion (next occupant's check-in) and validate `checkIn`/`checkOut` against it authoritatively.

### 3.14 No negative/absurd amount validation on booking
`create-payment-links/route.ts:58,315`
`!monthlyRate` rejects 0/NaN but not negatives. A negative rate yields a negative deposit and negative subscription amount into `Math.round(amount*100)`.
**Fix:** `Number.isInteger(monthlyRate) && monthlyRate > 0` (ideally equal to the canonical tier rate) before any Razorpay/Notion call. Subsumed by §1.4.

### 3.15 Missing critical env vars crash every request (whole-app outage)
`src/lib/supabase/proxy.ts:4-5`: `NEXT_PUBLIC_SUPABASE_URL!` / `..._PUBLISHABLE_KEY!`
The proxy runs on all routes and constructs the Supabase client every request. If either var is unset, every request throws — including `/admin/login` and the public site. `NOTION_DS_PLAZA!`/`NOTION_TOKEN` and `RZP_*`/`ZOHO_*` surface as raw 500s.
**Fix:** Validate required env at startup with a clear error; guard the proxy against missing Supabase config so a config gap doesn't take down login and public pages.

---

## 4. Low — Hardening, hygiene, and dead code

### 4.1 Non-constant-time webhook signature comparison
`razorpay.ts:279-282`: `expected === signature`. Use `crypto.timingSafeEqual` with a length guard. (Fail-closed on missing secret at webhook:107-115 is already correct.)

### 4.2 `queryDatabase` never checks `res.ok` → Notion 429/401 becomes a confusing TypeError
`notion.ts:1389-1401` parses `data.results` without checking status; a 429/401 body has no `results` → `Cannot read properties of undefined`. `queryAll` (notion.ts:116) has no backoff against Notion's ~3 req/s limit.
**Fix:** Check `res.ok`, surface Notion's error body, add basic 429 backoff/retry in the shared helpers.

### 4.3 `leads/update` forwards arbitrary `status`/`leadType` into a Notion select
`api/leads/update/route.ts:14-15` — Notion auto-creates select options, so a malformed value permanently pollutes the Leads DB schema.
**Fix:** Validate against the known enum before writing.

### 4.4 `blockBed` can block a deposit-paid incoming hold
`notion.ts:551`: `liveGuest` requires `!name.startsWith("Vacant")`, but an incoming hold reading "Vacant" with `Deposit Paid ✓` passes and gets blocked, displacing a paid reservation.
**Fix:** Treat `Deposit Paid ✓ === true` (or a future check-in date) as a live occupant in `blockBed`.

### 4.5 Invited bed hold has no TTL and writes `Deposit Amount = 0`
`api/rooms/invite/route.ts:30-39` — confirms doc §3 A2 / §15.5. An invited guest who never completes `/book` holds the bed indefinitely; board shows deposit ₹0.
**Fix (design/ops):** An expiry sweep for stale `Deposit Paid ✓ = false` incoming holds. Same sweep would also address the abandoned-booking soft-hold (doc §5 C3).

### 4.6 Legacy `create-order` and `bookings/confirm` routes are live, unwired, and unvalidated
`api/bookings/create-order/route.ts`, `api/bookings/confirm/route.ts` — confirmed dead (doc §15.16). Both accept client `monthlyRate` with zero validation; `confirm` builds a subscription. `verifyPaymentSignature` (`razorpay.ts:294`) ignores its `property` arg and always uses `RZP_KEY_SECRET_PLAZA`. Separately, `bookings/submit` (still POSTed to by `/book/book/page.tsx`) creates a `Booking confirmed` page with **no** payment/bed hold/schedule — a second inconsistent booking path.
**Fix:** Delete the unwired routes and the stale `/book/book` submit path to remove an unauthenticated, unvalidated money surface.

---

## 5. Suggested fix sequencing

1. **Auth layer (blocks everything).** §1.1 signed admin token + `requireAdmin()`; §1.2/§1.3 session checks on every admin and portal API route; §2.2 fail-closed cron. Once done, §1.5 and much of §2 shrink dramatically.
2. **Money integrity (before live Razorpay cutover).** §1.4 server-derived rate; §1.6 validate `checkOut`/cap; §3.14 amount validation; §2.3/§2.4 booking idempotency + rollback.
3. **Webhook/dunning correctness.** §2.5 event-id dedupe; §2.6 fee cap; §2.7 month-1 detection; §2.9 cancel-on-redeem; §2.10 defaulter backstop; §3.4–§3.8 cron/escalation ordering & IST.
4. **Date/timezone & state consistency.** §3.1 checkin ordering; §3.2/§3.3 IST cancellation & early-checkout; §3.11 checkout idempotency; §2.1 extension cap.
5. **Hardening & cleanup.** §4 items, and delete dead routes (§4.6).

## 6. Doc corrections (`CUSTOMER_JOURNEY.md`)

The audit found four places where the code diverges from what the journey doc asserts — worth patching the doc so it stays a faithful map:
- **§8.4 backstop** — the cron paid-link backstop does *not* run for defaulted members (§2.10 here).
- **§8.2 / appendix late-fee cap** — the *webhook* escalation fee is uncapped; only the cron caps at ₹3,500 (§2.6).
- **§15.4 portal pay-rent** — the amount is not "flat `monthlyRate`"; it is fully client-controlled on an arbitrary page (§1.5).
- **§10.1 reassign** — "every guest-owned field copied" is false: `files` (ID docs) are not moved (§3.9).
