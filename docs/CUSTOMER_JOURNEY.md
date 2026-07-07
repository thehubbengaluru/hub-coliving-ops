# The Hub (Safina Plaza) — The Complete Customer Journey

**Every permutation, combination and failure mode of a guest's lifecycle, from first click to final refund, over a maximum horizon of 1 year.**

Grounded in the actual code as of 6 July 2026. Every number, status name, email trigger and rule below is taken from the implementation (file references throughout). Where the system has *no* automated behaviour and the outcome is manual/undefined, it is explicitly flagged with ⚠️ — those are listed together in §15.

---

## 0. How to read this document

A literal enumeration of every journey is infinite (365 check-in dates × 5 durations × extension chains × per-day payment outcomes × pets × moves × …). But the system is deterministic, so the journey space collapses into **orthogonal dimensions** with a small number of **equivalence classes** each. Two journeys that fall in the same class of every dimension are treated identically by the system.

This document therefore:

1. Defines every moving part and every dimension of variation (§1–§2).
2. Walks each lifecycle **stage** and enumerates *every* branch at that stage, including all failure branches (§3–§12).
3. Gives the **exact day-by-day payment/late-fee/dunning calendar** — what happens if a guest pays or fails on the 1st, 2nd, 3rd, … 10th, 15th of any month, including redemption after each (§8).
4. Shows how the dimensions compose into full 1-year journeys, with worked end-to-end timelines (§13).
5. Lists every email/notification trigger in one table (§14) and every gap/manual-only path (§15).
6. Ends with the full constants table (Appendix).

> **Cross-product rule:** unless a section says otherwise, every branch documented in one section combines freely with every branch in every other section. E.g. "pet parent" × "pays 6 days late in month 3" × "extends by 2 months" × "shifts bed in month 4" is a valid journey, and its behaviour is exactly the union of the four sections' behaviours — the dimensions do not interact except where explicitly noted (e.g. *open dues block extensions*, §9).

---

## 1. The moving parts

| Part | Role | Where |
|---|---|---|
| **Notion — Guest Info DB** | Source of truth for the guest/booking record (`Status`, KYC, tariff, dates, tags, dunning state) | `src/lib/notion.ts` |
| **Notion — Plaza room board** | Beds. Occupancy encoded in `Member Name` + `Deposit Paid ✓` + dates (no Status field) | `src/lib/notion.ts` |
| **Notion — Leads DB** | Pre-booking leads (`Yet to confirm` / `Won` / `Lost`; `Co-living` / `Residency`) | `src/app/api/leads/update` |
| **Notion — Alumni DB** | Checked-out guests archive (created at checkout, before the bed is cleared) | `syncGuestToAlumni` |
| **Razorpay** | Payment links (deposit, upfront rent, final stub, dunning) + monthly auto-debit subscription (mandate) + webhooks | `src/lib/razorpay.ts`, `src/app/api/razorpay/webhook/route.ts` |
| **Zoho Books** | GST invoices (HSN 9963/996311), deposit retainer invoices, payment records | `src/lib/zoho.ts` |
| **Supabase** | Auth/sessions only (portal + admin login), KYC document archive | `src/app/api/portal/auth` |
| **Daily cron** | ONE endpoint, two jobs: extension reminders (14d/10d) + rent dunning sweep + final-month stub links | `src/app/api/cron/extend-stay-reminders/route.ts` |
| **Guest portal** | Self-serve: extend, early checkout date, cancel, one-off rent pay, maintenance, edit info | `src/app/portal/dashboard` |
| **Admin console** | Check-in/out, invite, block/unblock, reassign, payments, billing, special bookings | `src/app/admin/(protected)/…` |
| **Email** | All guest & finance notifications (see §14) | throughout |
| **Ops (humans)** | Everything marked ⚠️: refund payouts, deposit forfeiture, eviction, deferred bed assignment, pet billing | — |

**Billing model in one line:** rent is **calendar-month billed, in advance**, not check-in-anniversary billed. The check-in month is pro-rated per day; full months auto-debit on a Razorpay mandate anchored 2 days before the 1st; a partial final month is collected by a payment link issued ~3 days before that month; grace to the 3rd; ₹500/day late fee from the 4th; default on the 10th.

---

## 2. The dimensions of variation

Every possible journey is a point in this space:

| # | Dimension | Values / classes |
|---|---|---|
| D1 | **Stream** | Co-living (via `/book`) · Residency (tag `Residencies`, fixed 4-month cycles, re-apply at cycle end) · Special booking (airbnb / owner's-guest / team-discounted / team-complimentary — approval flow, not the wizard) |
| D2 | **Room tier** | Standard Sharing ₹21,500 · Deluxe Sharing ₹25,000 · Standard Private ₹43,500 · Deluxe Private ₹50,000 (per bed / month, GST-incl). Rooms 200–299 = Deluxe ("Premium"), 300+ = Standard |
| D3 | **Guest count** | 1 · 2 (couples — Private rooms only, single billing under primary, guest 2 = KYC only, ⚠️ no extra charge wired) |
| D4 | **Pet** | No · Yes (₹25,000 one-time deposit + ₹5,000/month — ⚠️ policy text only, billed manually) |
| D5 | **Check-in date** | Any day 1–31 of any month. Collapses to 3 classes per month length (§7): **day 1** (clean month) · **day 2 … (L−10)** (long stub, no bundle) · **day (L−9) … L** (short stub ≤ 10 days → next month bundled upfront). L = 28/29/30/31 |
| D6 | **Initial duration** | 1w (7 days) · 1m · 2m · 3m · 4m. Hard cap 4 months per tenancy (`MAX_STAY_MONTHS`) |
| D7 | **Extension chain** | At each checkout: don't extend · extend by 1w/1m/2m/3m/4m (same room or new room), repeatable, ≤ 4 months per contract; beyond cap → **re-apply** (fresh contract, deposit carries forward). Blocked while dues open |
| D8 | **Per-month payment outcome** (independent each cycle) | Auto-debit success on anchor · success after 1–4 failed attempts · 5th failure → link episode, paid on day 1/2/3 (no fee) / 4/5/6/7/8/9 (₹500–₹3,000) / ≥10 (₹3,500 + defaulted, then redeemed) · never pays (default → vacate notice, forfeiture) · manual portal pay (flat rate ⚠️) |
| D9 | **Mid-stay events** | none · bed shift (upgrade/downgrade, pro-rata credit/owed + deposit delta) · room blocked for service · maintenance tickets · info edits |
| D10 | **Exit path** | Natural checkout on booked date · early checkout (≥1 calendar month notice; shortfall charged) · cancellation ≥31 days pre-check-in (50% refund) · cancellation attempt <31 days (blocked, no refund) · no-show (no refund) · default/eviction (deposit forfeited) · hub-initiated (full deposit + fee refund) · abandonment |
| D11 | **Refund outcome** | Paid on time (≤7 working days) · delayed ⚠️ · reduced by deductions · forfeited · disputed (30-day window) — all payouts manual |
| D12 | **Booking-flow outcome** | completes + pays · completes + never pays (abandonment — ⚠️ bed soft-held with no expiry) · deposit paid but upfront rent unpaid past 7 days · payment fails · payment refunded |

Journeys are sequences over these dimensions with two absorbing states: **Checked-out (Alumni)** and **Cancelled**. "Defaulted" is *nearly* absorbing — payment still redeems the tags, but settlement is manual.

---

## 3. Stage A — Lead & discovery

**States:** `Yet to confirm` → `Won` | `Lost`; `Lead Type` ∈ {Co-living, Residency}. (Mock-only stages: captured → viewing-scheduled → viewed → deposit-paid → checked-in → dropped-off.)

Branches:

| Branch | What happens |
|---|---|
| A1. Organic — guest opens `/book` directly | No lead record needed; auth gate first (see B0) |
| A2. Admin **invite** (`POST /api/rooms/invite`) | Name/phone/email collected; bed **soft-held immediately** via `checkInGuest` (today's date, `Deposit Paid ✓ = false`); guest emailed a `/book` link. Refused with 409 if bed occupied |
| A3. Lead worked manually, marked Won/Lost | `/api/leads/update` sets status/type; no automation follows |
| A4. Residency lead | Marketed via THP, tagged `Residencies`, fixed 4-month cycles; same backend/board from here on but re-apply (not self-extend) at cycle end |
| A5. Special booking | airbnb / owner's-guest / team-discounted / team-complimentary; requires approval (Azaan emailed for every one); bed shows `special` on the board; **not** bookable via wizard |

⚠️ An invited guest who never completes the form leaves the bed soft-held **indefinitely** — no expiry job exists.

---

## 4. Stage B — Booking wizard (`/book`, 6 steps)

**B0 — auth gate:** no `portal_profile`/`portal_guest` → redirect `/auth?next=/book`. Guest can register (password ≥ 8 chars), sign in, or Google OAuth.

**Steps:** 1 Personal Info → 2 Stay Details → 3 Professional → 4 ID & Emergency (+ pet, + guest 2) → 5 Rules & Sign → 6 Payment.

Branches at each step:

| Branch | Outcome |
|---|---|
| B1. Abandons at step 1–5 | **Nothing exists anywhere.** No Notion record is created until step 6's single POST. Zero cleanup needed |
| B2. Stay details: picks duration | 1w/1m/2m/3m/4m; checkout auto-computed = check-in + duration (`checkoutForDuration`). ⚠️ Month-end rollover: check-in Jan 31 + 1m → "Feb 31" → **Mar 3** (see §7.4) |
| B3. Check-in date out of bed's window | Clamped client-side to bed's `availableFrom`/`availableUntil`; re-validated server-side (past dates and out-of-window rejected) |
| B4. Sharing room, gender mismatch with existing roommate | Bed not offered at all (roommate-gender filter) |
| B5. Private room + 2 guests | Allowed; full KYC for guest 2; recorded as page-content block "👥 Second Guest (single billing under primary)". ⚠️ No extra billing |
| B6. Sharing room + 2 guests | Not allowed (guest 2 only for Private) |
| B7. Pet parent = Yes | Required: type/name/photo/age/breed/gender/vaccinated/neutered/health/trained. `Pet Parent` tag set. Fees (₹25,000 + ₹5,000/mo) recorded as page-content text only ⚠️ |
| B8. Step 6 — "Confirm & get payment links" | The single mutation. See sequence below |
| B9. Two guests race for the same bed | No lock. Guard = `assertBedVacant` (read-then-write). Loser gets `BedOccupiedError` → **booking + payment kept**, `bedAssignmentDeferred = true`, ops assigns a bed later ⚠️ |
| B10. Same guest re-submits | Same email/phone matches → `assertBedVacant` passes (same-guest rule); no error |

**B8 sequence (`create-payment-links`):**
1. Server re-validates check-in window.
2. Uploads photo / ID / signature (+ pet photo, + guest-2 ID) to Notion; archives KYC to Supabase.
3. Creates Guest Info page — **`Status = "Deposit Pending"`**, `Tariff = monthlyRate`, room, dates, rules acceptance.
4. Marks the bed: `Member Name`, gender, dates, contact, `Deposit Amount (₹)`, **`Deposit Paid ✓ = false`** ("incoming" soft hold).
5. **Deposit link** = 1 month's tariff + ₹2,000 maintenance (`type: security_deposit`).
6. **Upfront rent link** (`type: pro_rated_rent`) per the schedule in §7.
7. **Subscription** created now if the schedule has fully-covered months (failure logged, non-fatal).
8. Links returned; client polls `payment-status` every 8s.

---

## 5. Stage C — Pre-arrival payment window

Deadlines (stated terms): upfront rent due within **7 days** of deposit (`SECOND_PAYMENT_DUE_DAYS`) to secure the room; house rules say deposit + maintenance 24h before arrival.

Complete outcome matrix:

| # | Deposit link | Upfront rent link | System result |
|---|---|---|---|
| C1 | Paid | Paid | Bed `Deposit Paid ✓ = true` → status `incoming`→`Occupied` path armed; guest `Status = "Booking confirmed"`; finance emailed; Zoho retainer marked received; rent link paid → `clearRentDunningState`. **Golden path** |
| C2 | Paid | Unpaid at day 7 | ⚠️ **No automated enforcement** — no code cancels the booking or releases the bed at day 7. Ops chases manually |
| C3 | Unpaid (abandoned) | — | Guest page stays `Deposit Pending`; bed stays soft-held (`Deposit Paid ✓ = false`) **with no TTL** ⚠️ — released only by a `payment.failed`/refund webhook or ops |
| C4 | Payment **fails** (webhook `payment.failed`, link type) | — | `revertBedAllotment` → bed back to Vacant (same-guest guard; never evicts another tenant); booking page remains `Deposit Pending` |
| C5 | Paid, then **refunded** (`refund.created`/`refund.processed`) | — | Bed reverted to Vacant. No other state change; no Zoho credit note ⚠️ |
| C6 | Paid | Payment fails | Rent-link `payment.failed` → bed reverted ⚠️ (even though deposit was paid — same revert path) |
| C7 | Subscription creation fails at booking (step 8) | — | Caught & logged, non-fatal; ops must recreate the mandate manually ⚠️ or month-1+ auto-debits never happen |

**Pre-arrival changes (Stage D):**

| Branch | Rule | Result |
|---|---|---|
| D1. Cancel ≥ 31 days before check-in | `today ≤ check-in − 31d` | `Status = "Cancelled"`, bed reverted to Vacant, message promises **50% of total paid** (deposit + ₹2,000 + upfront rent) **within 7 working days**; other 50% = cancellation fee. ⚠️ Payout is manual — no Razorpay refund call exists |
| D2. Cancel < 31 days before check-in | Blocked | 400, non-refundable; portal button disabled; bed stays held |
| D3. Cancel after check-in | Blocked | Cancel tab hidden (status/date gates) |
| D4. Already cancelled | — | 400 |
| D5. **No-show** | Treated as within-31-days cancellation | No refund; ⚠️ no automated no-show detection — bed stays "incoming" until ops clears it |
| D6. **Hub-initiated** cancellation | Policy | Full deposit + maintenance fee refunded within 7 working days (manual) |
| D7. Reschedule check-in date | ⚠️ No self-serve path — ops edits Notion manually |

---

## 6. Stage E — Check-in day

- **Portal admin check-in** (`/api/rooms/checkin`): optional deposit link, subscription (only if full months remain, else `subscriptionSkipped`), Zoho rent invoice created + emailed, Zoho deposit retainer; 409 on occupied bed.
- Guest arrives → form `Status` moves through `pre-check in + arrival` → `checked in ( welcome chit sheet)` → `Done` (ops-driven selects).
- Alumni-facing fields (notice dates, refund due) are computed later at checkout, not here.
- ⚠️ There is no "guest didn't arrive on the day" automation (see D5).

---

## 7. Check-in date × duration — the complete money permutation table

The payment plan for any stay is fully determined by `computeRentSchedule(checkIn, checkOut, rate)` (`src/lib/rent-schedule.ts`). Rules:

- Stay covers nights **[check-in, check-out)** — the check-out day itself is never charged.
- Pro-ration: `round((monthlyRate / daysInThatMonth) × days)` — uses the **actual** month length (28/29/30/31).
- **Upfront link** = check-in month portion; **plus the next month bundled** when check-in is after the 1st AND the stub is ≤ 10 days AND the stay reaches the next month (`PRORATE_BUNDLE_THRESHOLD_DAYS = 10`). The bundled month is clipped to the last charged night, so it may itself be partial.
- **Subscription** = every calendar month *fully* covered after the last upfront month; `total_count` fixed at creation (open-ended → cap 120). Anchor: `start_at` = 1st of first auto-debit month **− 2 days** (fallbacks: the 1st itself; else now + 1h).
- **Final partial month** (mid-month checkout beyond upfront coverage) = payment link issued by the daily cron **~3 days before that month starts**. Never auto-debited.

### 7.1 Check-in-day classes (per month length L)

| L (days) | Class 1: clean | Class 2: long stub (no bundle) | Class 3: short stub ≤10d (bundle) |
|---|---|---|---|
| 31 | day 1 | days 2–21 | days 22–31 |
| 30 | day 1 | days 2–20 | days 21–30 |
| 29 | day 1 | days 2–19 | days 20–29 |
| 28 | day 1 | days 2–18 | days 19–28 |

So "check-in on the 1st vs 2nd vs 3rd vs …": days 2 through (L−10) all behave identically except for the stub amount, which shrinks by `rate/L` per day; from day (L−9) onward the bundle kicks in.

### 7.2 Duration × class → which instruments fire

Let D = check-in day-of-month, X = months. Month-duration checkout lands on the **same day-of-month D** (subject to §7.4 rollover), so the final partial month always has **D−1 charged nights**.

| Duration | D = 1 (class 1) | Class 2 (long stub) | Class 3 (short stub) |
|---|---|---|---|
| **1w** (fits in month, D ≤ L−7) | 7-day stub upfront. No subscription, no final link | same | — (a short-stub start ≥ L−9 with 7 days can still fit when L−D+1 > 7… if it fits, same) |
| **1w** (spans month boundary, D ≥ L−6) | — | — | Stub (≤7d) **+ next-month partial bundled** → **one upfront link covers the whole week**. No subscription, no final link |
| **1m** | 1 full month upfront. Nothing else | Stub upfront; **final link** for next month days 1–(D−1) | Stub **+ next-month partial (1–(D−1)) bundled** → one upfront link covers everything |
| **2m** | Month 1 upfront; **subscription 1 cycle** (month 2). Clean end | Stub upfront; subscription 1 cycle (month 2); final link days 1–(D−1) of month 3 | Stub + month 2 **full** bundled; **no subscription**; final link days 1–(D−1) of month 3 |
| **3m** | Month 1 upfront; subscription **2 cycles**; clean end | Stub; subscription 2 cycles; final link (D−1 days) | Stub + month 2 bundled; subscription **1 cycle** (month 3); final link (D−1 days) |
| **4m** | Month 1 upfront; subscription **3 cycles**; clean end | Stub; subscription 3 cycles; final link (D−1 days) | Stub + month 2 bundled; subscription **2 cycles**; final link (D−1 days) |

**Worked examples (Standard Sharing, ₹21,500/mo):**

| Check-in | Duration | Checkout | Upfront link | Subscription | Final link (cron, ~3 days before month) |
|---|---|---|---|---|---|
| Mar 1 | 2m | May 1 | March full ₹21,500 | April ×1 | none (checkout on the 1st = clean) |
| Mar 15 | 1m | Apr 15 | Mar 15–31 (17d) ₹11,790 | none | Apr 1–14 (14d) ₹10,033 |
| Mar 15 | 2m | May 15 | Mar 15–31 ₹11,790 | April ×1 | May 1–14 ₹9,710 |
| Mar 25 | 1m | Apr 25 | Mar 25–31 (7d) ₹4,855 **+ Apr 1–24 (24d) ₹17,200 bundled** = ₹22,055 | none | none |
| Mar 25 | 4m | Jul 25 | Mar stub ₹4,855 + April full ₹21,500 = ₹26,355 | May, June ×2 | Jul 1–24 ₹16,645 |
| Mar 28 | 1w | Apr 4 | Mar 28–31 (4d) ₹2,774 + Apr 1–3 (3d) ₹2,150 = ₹4,924 | none | none |
| Feb 10 | 1w | Feb 17 | Feb 10–16 (7d) ₹5,375 (28-day Feb: rate/28×7) | none | none |

Plus, in **every** case: deposit link = 1 month's tariff + ₹2,000 maintenance, before check-in. Deposit is never usable against rent.

### 7.3 The 12 months of the year

Month length only changes (a) the per-day pro-ration denominator, (b) the class-3 boundary (§7.1), (c) February's short length making week-stays relatively pricier per the 28-day denominator. February 29 (leap) behaves as L=29. Otherwise all 12 months are the same machine.

### 7.4 ⚠️ Month-end rollover quirk

`checkoutForDuration` uses JS `setMonth`, so day-of-month overflows roll forward:
- Check-in **Jan 31 + 1m** → "Feb 31" → **checkout Mar 3** → final link Mar 1–2 (2 nights).
- Check-in **Jan 30 + 1m** (non-leap) → **Mar 2**; Jan 29 → Mar 1 (clean!).
- Check-in **Aug 31 + 1m** → "Sep 31" → **Oct 1** → clean end, Sep fully charged.

Guests checking in on the 29th/30th/31st can get a checkout **and billing** slightly longer than "one month". This applies equally to extension end-dates.

---

## 8. Stage F — The monthly rent cycle: complete day-by-day machine

This is the heart of the permutation space. Each fully-covered month is one **cycle**; cycles are independent (state resets on every successful payment). All day math is **IST**.

### 8.1 The happy path

- **T−2 days before the 1st:** Razorpay attempts the auto-debit (`subscription.charged` on success).
- On success: `resetRentChargeFailures` (counter → 0, `Rent Overdue` tag dropped); Zoho invoice — month 1 marks the check-in invoice paid; months 2+ create + mark paid + **email the GST invoice PDF** to the guest. Guest notices nothing else. Cycle over.

### 8.2 Auto-debit failure ladder (webhook-driven, attempt-based not day-based)

Razorpay owns the retry cadence (~5-day cycle). The app counts attempts via `subscription.pending`:

| Attempt | Guest email | State |
|---|---|---|
| Fail 1 | "Rent auto-debit failed — we'll retry (attempt 1 of 5)" | `Rent Failure Count = 1` |
| Fail 2–4 | same, attempt N of 5 | counter increments |
| **Fail 5** (or `subscription.halted` at any point) | "Action required — rent overdue, late fee accruing" + finance email | **Escalation** (once per episode, idempotent via `Rent Overdue` tag): tag added, one-off **payment link = rent + late-fee-as-of-today**, episode handed to the daily cron |
| Success at any attempt ≤ 4 | GST invoice; counter reset | **No late fee is ever charged on this path** ⚠️ — even if the success lands on the 20th, auto-debit collects the flat rate |

So "failed 2 days then worked the 3rd day" (≈ failed twice, succeeded on retry): guest pays exactly ₹rate, gets 2 warning emails, then the invoice. Counter back to 0. **Fully redeemed, zero fee.**

`subscription.halted` additionally means future months won't auto-charge until the mandate is resumed/recreated ⚠️ (manual) — finance is always emailed.

### 8.3 The dunning calendar (link-episode, calendar-day-based)

Applies whenever a **due rent link** exists: after 5th-failure escalation, or the **final-month stub link** the cron issues 3 days before a partial last month. Fee formula: `min(7, max(0, day − 3)) × ₹500`, computed against the month the rent is *for*.

| IST day of month | Tone | Late fee (total) | Link amount | What happens | Guest email |
|---|---|---|---|---|---|
| 1st | due | ₹0 | rate | daily reminder | "Rent payment pending — {Month}" |
| 2nd | due | ₹0 | rate | daily reminder | same |
| 3rd | due (last grace day) | ₹0 | rate | daily reminder | same |
| 4th | late | **₹500** | rate + 500 | yesterday's link **cancelled & reissued** with fee | "Rent overdue — late fee accruing" |
| 5th | late | ₹1,000 | rate + 1,000 | cancel + reissue | same |
| 6th | late | ₹1,500 | rate + 1,500 | cancel + reissue | same |
| 7th | late | ₹2,000 | rate + 2,000 | cancel + reissue | same |
| 8th | **final-warning** | ₹2,500 | rate + 2,500 | cancel + reissue | "FINAL WARNING — rent unpaid, vacate notice on the 10th" (deposit forfeiture warned) |
| 9th | final-warning | ₹3,000 | rate + 3,000 | cancel + reissue | same |
| **10th** | **default** | **₹3,500 (cap — never grows further)** | rate + 3,500 | `Rent Defaulted` tag; **episode frozen** (cron never touches this member again) | "Notice to vacate — rent default": vacate **today**, deposit **forfeited**, full amount still payable. Finance: "RENT DEFAULT — {name} — vacate notice sent" |
| 11th … end of month | default | ₹3,500 | (last link stands) | nothing further automated | none |
| Month fully passed unpaid | default | ₹3,500 | — | a missed/late cron run **pins to day 10** (catch-up, never skip) | — |

### 8.4 Redemption — "what if they pay on day N?" (every day)

Paying the active link fires `payment_link.paid` (type `rent`/`pro_rated_rent`) → **`clearRentDunningState`**: failure counter → 0, `Rent Overdue` + `Rent Defaulted` tags dropped, `Due Rent Link ID` / `Due Rent Base (₹)` cleared. The cron also has a backstop (sees link `paid` → clears). Full matrix:

| Pays on | Total paid | Emails received by then | After paying |
|---|---|---|---|
| Anchor (auto-debit) | rate | invoice only | clean |
| Day 1 | rate | 1 reminder | clean |
| Day 2 | rate | 2 reminders | clean |
| Day 3 | rate | 3 reminders | clean — **grace fully redeems** |
| Day 4 | rate + 500 | 3 reminders + 1 overdue | clean |
| Day 5 | rate + 1,000 | + 2 overdue | clean |
| Day 6 | rate + 1,500 | + 3 overdue | clean |
| Day 7 | rate + 2,000 | + 4 overdue | clean |
| Day 8 | rate + 2,500 | + 1 final-warning | clean |
| Day 9 | rate + 3,000 | + 2 final-warnings | clean |
| Day 10 | rate + 3,500 | + vacate notice | tags cleared by webhook, **but** vacate notice already sent & finance told deposit forfeited — ⚠️ un-forfeiting is a human decision; nothing in code ever wrote a forfeiture, so nothing needs un-writing |
| Day 11+ | rate + 3,500 (capped) | same | same as day 10 — redemption is possible **any day**; ops settles |
| Never | ₹0 | full ladder | Defaulted, frozen; deposit forfeited per policy (⚠️ manual); ops evicts & settles at checkout. `types.ts` has `depositStatus: held/refunded/forfeited` but the dunning flow never sets it |

**Interleaving permutations** (the "failed or paid every day till the 10th" cases):

| Sequence | Outcome |
|---|---|
| F,F,S (2 failures then success) | 2 warning emails, flat rate collected, counter reset. No fee |
| F×4, S | 4 warnings, flat rate, reset. No fee ⚠️ (even if late in the month) |
| F×5 on day 2 → pays link day 3 | Escalation email + link at rate+0 (grace); pays flat rate; cleared |
| F×5 on day 6 → pays day 9 | Link issued at rate+1,500; reissued daily; pays rate+3,000; cleared |
| F×5 → never pays → day 10 | Default ladder as §8.3 |
| Halted on day 1 (bank cancelled mandate) | Same as 5th failure: immediate escalation; **and** all future months need a new mandate ⚠️ |
| Link open + a Razorpay retry ALSO succeeds | ⚠️ **Double payment possible** — `subscription.charged` clears the counter but the open link isn't cancelled by the webhook; if the guest also pays the link, both settle. No reconciliation in code |
| Guest uses portal "Pay this month's rent" instead | ⚠️ That button creates a link for **flat `monthlyRate` — no late fee** regardless of the day; paying it clears dunning state. A knowing guest can dodge every fee |
| Two months unpaid back-to-back | Month 1 episode freezes at default; month 2's charge also fails → its own pending/halted path. In practice ops has already received the vacate notice for month 1 |

### 8.5 The final-month stub cycle

The pro-rated last month (§7.2) is a **link from day one** (no mandate), issued ~3 days before the month. It rides the *identical* §8.3/§8.4 calendar: free through the 3rd, ₹500/day from the 4th, default on the 10th. So even a guest whose every auto-debit succeeded can enter dunning purely on their final stub.

---

## 9. Stage G — Extension decision tree

**Reminders (cron, exact-match — a missed cron day silently skips that wave ⚠️):**
- **T−14 days** before checkout: wave 1. Co-living → "extend from your portal, confirm by T−10". Residency → "re-apply" (renewal subject to availability + repricing; deposit carries forward).
- **T−10 days:** wave 2, same split.

**Window:** self-serve extension opens at ≤14 days out and **stays open even after the checkout date passes** (a guest who missed it isn't locked out). Before T−14: UI says "Extensions open 14 days before your check-out."

**Guards (every extension attempt):**

| Guard | Result |
|---|---|
| No end date on record / rate ≤ 0 | 422 |
| `Rent Overdue` or `Rent Defaulted` tag, or a live `Due Rent Link ID` | **409 — open dues block extension** ("clear it before extending"). Paying the dues un-blocks immediately (tags drop on payment) |
| Total would exceed 4 months on this tenancy | Blocked — must **re-apply** (fresh application; deposit carries forward) |

**Choices when allowed:** duration ∈ {1w, 1m, 2m, 3m, 4m}; new checkout = `checkoutForDuration(oldCheckout, duration)` (rollover quirk §7.4 applies). Room:

| Room branch | Behaviour |
|---|---|
| Same room, free in the window | Checkout simply pushed out ⚠️ (**before** payment is collected — a guest who extends and never pays the links has already got the later checkout date on record) |
| Same room conflicts (someone else booked it) | Alternative vacant beds listed (gender-filtered for sharing, blocked excluded) |
| New room, pricier | **Deposit top-up link** = newRate − currentRate (difference only; deposit carries forward) |
| New room, cheaper | No top-up; ⚠️ no automatic deposit-difference refund at extension time (settled at final checkout) |
| New room | New bed held via `checkInGuest` from old checkout date; deferred if occupied |

**Money:** an extension is a **fresh contract** for `[oldCheckout, newCheckout)` run through the same `computeRentSchedule` — so all of §7 applies with D = old checkout's day-of-month: upfront link (due now), possibly a new subscription, possibly a final stub. **An uncollected final-month stub of the original tenancy is folded into the extension's upfront link** (no double links). All links emailed.

**Repeat chains:** extensions repeat freely within the 4-month cap; beyond it, re-apply resets the contract (deposit rolls). Month-composition chains that fit one ≤4-month contract (1-week blocks can substitute/append while under cap):

`1w · 1m · 2m · 3m · 4m · 1+1 · 1+2 · 2+1 · 1+3 · 3+1 · 2+2 · 1+1+1 · 1+1+2 · 1+2+1 · 2+1+1 · 1+1+1+1` (15 month-compositions + week variants)

**Non-extension:** guest ignores both reminders → nothing punitive; checkout proceeds; final stub link still collected by cron; deposit refund at checkout.

**Residency stream:** no self-extension — fixed 4-month cycles, re-apply at cycle end; Hub decides renewal and price. Three back-to-back cycles = a full year.

---

## 10. Stage H — Mid-stay events (each may occur in any month, any combination)

### 10.1 Bed shift / room reassignment (admin `POST /api/rooms/reassign`)

- New bed must pass `assertBedVacant`; every guest-owned field copied (schema-shared fields only), old bed wiped to Vacant, form page Room label updated. Structural fields (Room/Floor/Type/tariff) never move.
- **Financials** (`computeRoomMoveFinancials`) for the move month (guest already paid full month at old rate):
  - Old rate × days 1–(moveDay−1) + new rate × days moveDay–end, pro-rata vs what was paid → **credit** (downgrade) or **owed** (upgrade).
  - Deposit delta = |old − new| rate: **top-up link** (Razorpay, optional `sendDepositDiff`) if upgrading; **refund due 7 working days from move date** if downgrading (⚠️ payout manual).
  - New billing rate from move month forward = new tier's rate. ⚠️ The existing subscription still debits the **old** amount — no code updates the mandate; ops must fix the subscription manually.
- Permutations: upgrade / downgrade / same-rate lateral × move on day 1 / mid-month / month-end × guest pays top-up promptly / late / never (no dunning wiring on deposit-top-up links ⚠️).

### 10.2 Room blocked for servicing

`POST /api/rooms/block`: only **vacant** beds (live guest → 409). Member Name → "Vacant — serviced" + reason/from/until callout. `DELETE` restores. A guest can never be displaced by a block; a planned block around a guest requires a reassign first.

### 10.3 Pets acquired mid-stay

⚠️ No flow. Policy: approved Pet Parents only; ₹25,000 deposit + ₹5,000/mo billed alongside rent — all manual (tag + page note by ops). Not in shared rooms without co-occupant consent; never in common/dining areas.

### 10.4 Maintenance tickets

Portal → categories Electrical / Plumbing / Furniture / Housekeeping / Internet / AC / Other, optional photo. No SLA automation. Inspection regime (house rules): failed inspection ₹2,500; **3 failed inspections → eviction** (text-only ⚠️). Key replacement ₹3,000/key.

### 10.5 Info edits

Contact, org/college, occupation, work address, emergency contact — self-serve any time.

---

## 11. Stage I — Exit paths (exhaustive)

| # | Path | Trigger & rules | Money consequence |
|---|---|---|---|
| I1 | **Natural checkout** on booked date | Ops runs checkout (checklist must be 100% ticked, else 400). **Alumni sync first** (aborts if the member page is unreadable — the guest is never lost), then bed cleared to Vacant | Deposit − deductions refunded within **7 working days** (Mon–Fri minus Indian holidays) after the **later** of actual checkout / notice-period end |
| I2 | **Early checkout** | Portal date-picker: requested date ≥ today + **1 calendar month** (notice), and ≤ booked checkout (can only move **earlier**; "extend" via this form → 400). "Notice period begins today." Updates form page + bed | If leaving **before** the notice completes: shortfall = (days short) × (monthly tariff ÷ 30), **deducted from deposit**; excess over deposit is payable. Rent already paid for unused days: refundable pro-rata **only if full notice served** (final settlement) |
| I3 | **Cancellation** (pre-check-in) | §5/D1–D7 | 50% / 0% / 100% per branch |
| I4 | **No-show** | = within-31-days cancellation | No refund |
| I5 | **Rent default / eviction** | Day-10 vacate notice (§8.3); misconduct eviction; 3 failed inspections | **Deposit forfeited** (policy; ⚠️ no code writes it), rent + ₹3,500 still payable; settlement manual |
| I6 | **Abandonment** (guest disappears mid-stay) | ⚠️ No detection — rent simply fails → §8 ladder → default at day 10 → I5 | Deposit forfeited per policy |
| I7 | **Hub-initiated** termination | Policy | Full deposit + maintenance fee refunded, 7 working days |
| I8 | **Max-stay exit** | 4-month cap reached, no re-application | Normal I1 |
| I9 | **Residency cycle end** | Re-apply declined / not renewed | Normal I1; deposit carries forward only if renewed |

**Checkout mechanics (I1/I2/I8/I9):** Alumni page gets Status "Checked-Out", copies identity/stay fields, computes Length of Stay (`floor(days/30)` months), `Notice Period Last Date`, **`Deposit Refund Due`**, `Checked Out By`, checkout checklist + damages appended as content. Guest data also syncs to the Alumni DB (per commit history).

---

## 12. Stage J — Refunds & final settlement

**Cardinal fact: there is NO programmatic refund anywhere.** No Razorpay refund API call exists. Every payout below is a human doing NEFT/IMPS; the system only computes *amounts* and *due dates* and reacts to inbound `refund.*` webhooks (bed revert only).

| Refund type | Amount | Due | Failure mode |
|---|---|---|---|
| Deposit at checkout | 1 month's tariff − damages − missing items − unpaid/pro-rated rent − notice shortfall − extraordinary cleaning | 7 working days (excl. weekends + Indian holidays list in `dates.ts`) after later of checkout / notice end | ⚠️ If ops misses the date: nothing happens automatically. Guest recourse: dispute within **30 days** |
| Cancellation (≥31d) | 50% of everything paid | 7 working days | ⚠️ manual |
| Hub-initiated | 100% deposit + ₹2,000 fee | 7 working days | ⚠️ manual |
| Room-move (downgrade) | rent credit + deposit delta | 7 working days from move | ⚠️ manual |
| Maintenance fee ₹2,000 | **Never refunded, in any scenario** | — | — |
| Late fees | Never refunded | — | — |
| Rent | Non-refundable, except pro-rated unused days with full notice served | final settlement | ⚠️ manual |
| Pet deposit ₹25,000 | ⚠️ entirely outside the system | — | — |
| Deposit on eviction/abandonment/criminal activity | **Forfeited** | — | ⚠️ tag/email only, no ledger write |
| Razorpay-side refund appears (webhook) | — | — | Bed reverted to Vacant (same-guest guard); **no** Zoho credit note, no guest-page status change ⚠️ |

---

## 13. Composing a full year — the permutation frame + worked journeys

**Frame:** a 1-year journey = up to 3 contract segments (4-month cap each, chained by extension-within-cap or re-apply) × per-month payment outcome (alphabet of §8: success / F×k-then-success / link-paid-day-1…10+ / default) × optional mid-stay events × one exit path. Any month's outcome is independent of the others (state resets on payment), **except**: open dues block extension (§9), and default is journey-ending unless ops relents.

### J1 — Golden maximal year (clean 12 months)
Check-in **Jan 1**, 4m. Deposit ₹21,500 + ₹2,000 paid; upfront = Jan full; subscription Feb–Apr (3 cycles). Every auto-debit succeeds on T−2; GST invoice emailed monthly. Apr 17: 14-day reminder; Apr 21: 10-day reminder → cap reached → **re-applies**; deposit carries. New contract May 1, 4m → same shape; re-applies again Sep 1, 4m → checkout **Jan 1 next year** (clean, no final stub any segment since D=1). Ops checkout, checklist ticked, Alumni synced, deposit − ₹0 refunded within 7 working days.

### J2 — Mid-month, one wobble, one extension
Check-in **Mar 15**, 2m (checkout May 15). Upfront Mar 15–31; subscription April ×1. April's debit fails twice ("attempt 1/2 of 5" emails), succeeds on retry — flat rate, no fee. May 1: 14-day reminder → extends **2m in the same room** (free) → new contract May 15–Jul 15: upfront = May 15–31 **+ the original May 1–14 stub folded in** (one link), subscription June ×1, final stub Jul 1–14 by cron ~Jun 28. Pays stub on **Jul 5** → ₹500×2 = ₹1,000 late fee. Early-checkout not used; ops checkout Jul 15; full deposit back.

### J3 — Late-month check-in, pet, habitual late payer
Check-in **Mar 25** (class 3), 4m, Deluxe Private ₹50,000, pet. Deposit link ₹52,000; upfront = Mar stub ₹11,290 + April full bundled. Pet ₹25,000 + ₹5,000/mo — invoiced by ops by hand ⚠️. May: mandate has insufficient funds 5 times → escalation link; pays **May 9** → +₹3,000. June: fails 5× again, ignores everything → **June 10: defaulted, vacate notice, deposit forfeited (policy)**. Pays June 12 (rate + ₹3,500) → tags clear; ops decides to let him stay ⚠️ (human call). July stub 1–24 paid on the 2nd (grace). Checkout Jul 25. Settlement manual: deposit minus pet damages, minus anything ops records.

### J4 — One-week taster, spans month boundary
Check-in **Mar 28**, 1w → Apr 4. Single upfront link ₹4,924 covers Mar 28–Apr 3 (bundle rule); deposit + ₹2,000 alongside. No subscription, no cron stub, no dunning surface at all unless the links go unpaid. Extends **1m** on Apr 2 (window open since stay < 14 days) → fresh contract Apr 4–May 4 → upfront Apr 4–30, final stub May 1–3 by cron ~Apr 28. Checks out May 4.

### J5 — Couple, upgrade mid-stay, early exit with shortfall
Couple (Private only), check-in **Feb 1**, 4m, Standard Private ₹43,500 → checkout Jun 1. Guest 2 = KYC only. In April they upgrade to Deluxe Private ₹50,000, move **Apr 16**: owed = (50,000−43,500)/30×15 ≈ ₹3,250 for Apr 16–30; deposit top-up link ₹6,500; ⚠️ subscription still debits ₹43,500 — ops edits the mandate. May 10 they give notice via portal for **Jun 10**… blocked (> booked checkout). They instead set early checkout **May 20** on Apr 18 (≥1 month notice ✓). Leaving May 20 with notice served Apr 18–May 18: full notice ✓ → unused May 20–31 rent pro-rata refundable in settlement. Deposit − dues refunded 7 working days after May 20.

### J6 — Cancellation trio
(a) Books Jun 20 for **Aug 15** check-in; cancels Jul 10 (cutoff Jul 15) → allowed: 50% of (deposit + 2,000 + upfront) promised in 7 working days ⚠️ manual; bed → Vacant. (b) Same booking, tries to cancel **Jul 20** → 400, non-refundable, bed stays his. (c) Never shows up Aug 15 → no refund, bed stays "incoming" until ops notices ⚠️.

### J7 — The defaulter's full arc (worst case)
Check-in **Sep 2**, 3m. Pays deposit + upfront. October auto-debit: bank mandate cancelled → `subscription.halted` day 1 → immediate escalation (link + Overdue tag + finance email). Ignores 3 grace reminders, 4 overdue reissues, 2 final warnings. **Oct 10:** `Rent Defaulted`, vacate-today notice, deposit forfeited per terms, finance notified, episode frozen. Never pays. Ops evicts, runs checkout with damages noted; Alumni record created; refund due date computed but payout = ₹0 (forfeited ⚠️ by human decision); guest may dispute within 30 days.

### J8 — Residency year
Tagged `Residencies`. Cycle 1: Jan 1–May 1 (4m). T−14/T−10 emails say **re-apply** (not self-extend). Hub renews at +5% price. Cycle 2: May 1–Sep 1. Renewed again → Cycle 3: Sep 1–Jan 1. Deposit carried across all three. Any payment month inside a cycle can take any §8 branch.

---

## 14. Every email / notification trigger

| # | Trigger | Recipient | Content |
|---|---|---|---|
| 1 | Admin invite | Guest | `/book` form link |
| 2 | Booking links created | Guest (on screen + email via links) | Deposit + upfront rent links |
| 3 | Deposit link paid | Finance | Payment notice; Zoho retainer receipted |
| 4 | Each rent auto-debit success (months 2+) | Guest | GST invoice PDF (Zoho `sendInvoice`) |
| 5 | Auto-debit failure 1–4 (`subscription.pending`) | Guest | "Rent auto-debit failed — we'll retry (attempt N of 5)" |
| 6 | 5th failure / `subscription.halted` | Guest + Finance | "Action required — rent overdue, late fee accruing" / "Subscription halted" |
| 7 | Dunning days 1–3 | Guest (daily) | "Rent payment pending — {Month}" |
| 8 | Dunning days 4–7 | Guest (daily, link reissued) | "Rent overdue — late fee accruing" |
| 9 | Dunning days 8–9 | Guest (daily) | "FINAL WARNING — vacate notice on the 10th" |
| 10 | Day 10 default | Guest + Finance | "Notice to vacate — rent default" / "RENT DEFAULT — {name}" |
| 11 | Any rent link paid | Finance | Payment notice; dunning state cleared |
| 12 | T−14 days to checkout | Guest | Extend (co-living) / re-apply (residency) |
| 13 | T−10 days to checkout | Guest | Second wave, "confirm by" framing |
| 14 | Extension confirmed | Guest | All new payment links |
| 15 | Special booking of any type | Azaan | Approval notice |
| 16 | Final-month stub link issued (~T−3 days before final month) | Guest | Pro-rated rent link |

⚠️ Not emailed anywhere: 7-day upfront-rent deadline reminders, refund-processed confirmations, checkout confirmations, deposit-top-up dunning.

---

## 15. Gaps, undefined behaviour & manual-only paths (everything that "goes wrong" outside code)

1. **No refund automation at all** — every promised payout (50% cancellation, deposit, move credit, hub-initiated) is a human NEFT/IMPS; a "refund failed" scenario has no system representation.
2. **Deposit forfeiture is never written** — day-10 emails assert it; `depositStatus` (`held/refunded/forfeited`) exists in types but is never set by dunning.
3. **Late fee only exists on links** — a slow-but-eventually-successful auto-debit (attempts 1–4) never pays a fee, regardless of date.
4. **Portal "Pay this month's rent" bypasses fees** — flat `monthlyRate` link any day of the month; paying it clears all dunning tags.
5. **Bed soft-holds have no expiry** — an abandoned booking or no-show holds the bed until a `payment.failed`/refund webhook or ops intervention.
6. **7-day upfront-rent deadline is unenforced** — stated in terms; no code checks it.
7. **Race window on bed assignment** — `assertBedVacant` is read-then-write; simultaneous bookings can collide (loser gets deferred assignment, ops resolves).
8. **No webhook idempotency ledger** — replayed `subscription.pending` double-counts failures; replayed `payment_link.paid` re-emails finance and re-posts Zoho payments.
9. **Double payment possible** — an open dunning link isn't cancelled when a retry succeeds; both can settle.
10. **Room move doesn't update the mandate** — subscription keeps debiting the old rate after a reassignment.
11. **Extension applied before payment** — same-room extension pushes the checkout date immediately; unpaid extension links leave a guest with extended dates and no money collected.
12. **Missed cron day skips reminder waves** — 14/10-day nudges are exact-match (dunning, by contrast, catches up by pinning to day 10).
13. **Pet & second-guest billing unwired** — ₹25,000/₹5,000/mo and any couple premium are text-only.
14. **Month-end rollover** — check-in on the 29th/30th/31st + N months can land checkout on the 1st–3rd of a later month (Jan 31 + 1m → Mar 3), stretching billing past "a month".
15. **Two parallel rate vocabularies** — inventory/availability say "Premium", pricing says "Deluxe" (same numbers); weekly rate is a flat ₹25,000 (defined, unused by schedule math, and *higher* than Standard Sharing's monthly ₹21,500).
16. **Legacy dead routes** — `create-order` + `bookings/confirm` (checkout-modal path) are unwired; `inventory.ts` static bed data last synced 17 Jun 2026.
17. **No partial payments** — links and subscriptions are fixed-amount; Zoho `partially_paid` is display-only.
18. **No no-show / abandonment detection**, no reschedule flow, no mandate-resume flow after `halted` — all ops.
19. **Eviction, inspections, key fees** (₹2,500 failed inspection, 3 strikes, ₹3,000/key) — house-rules text with no system wiring.
20. **Dunning reminder emails (days 1–3) only reach link-episode members** — a healthy subscription member whose charge simply hasn't landed yet gets nothing (correctly, since Razorpay is still retrying).

---

## Appendix — every constant

| Constant | Value | Source |
|---|---|---|
| Stay durations | 1w (7d), 1m, 2m, 3m, 4m | `stay.ts` |
| `MAX_STAY_MONTHS` | 4 (then re-apply; deposit carries) | `stay.ts` |
| Monthly rates (₹, GST-incl, per bed) | Std Sharing 21,500 · Deluxe Sharing 25,000 · Std Private 43,500 · Deluxe Private 50,000 | `pricing.ts` |
| Weekly rate | 25,000 flat (defined; unused by schedule math) | `inventory.ts` |
| Security deposit | 1 month's tariff, refundable, never offsets rent | terms |
| Maintenance fee | ₹2,000 one-time, strictly non-refundable | terms |
| Pet fees | ₹25,000 deposit + ₹5,000/month (manual) | house rules §14 |
| `SECOND_PAYMENT_DUE_DAYS` | 7 (upfront rent after deposit) | `stay.ts` |
| `PRORATE_BUNDLE_THRESHOLD_DAYS` | 10 (stub ≤10d bundles next month) | `stay.ts` |
| Pro-ration | round(rate ÷ actual-days-in-month × days) | `rent-schedule.ts` |
| Subscription anchor | 1st of rent month − 2 days; caps at 120 cycles open-ended | `razorpay.ts` |
| `LATE_FEE_GRACE_DAY` | 3 (fee-free through the 3rd, IST) | webhook + cron |
| `LATE_FEE_PER_DAY` | ₹500 (env `RENT_LATE_FEE_PER_DAY_INR`) | webhook + cron |
| `DEFAULT_DAY` | 10 (fee caps at ₹3,500; vacate notice; tag `Rent Defaulted`) | cron |
| `MAX_CHARGE_FAILURES` | 5 (escalation → link + `Rent Overdue`) | webhook |
| `EXTEND_STAY_WINDOW_DAYS` | 14 (reminders at exactly 14 & 10 days out) | `stay.ts` + cron |
| `CANCELLATION_NOTICE_DAYS` | 31 | `stay.ts` |
| `CANCELLATION_REFUND_FRACTION` | 0.5 | `stay.ts` |
| `EARLY_CHECKOUT_NOTICE_MONTHS` | 1 calendar month | `stay.ts` |
| Notice shortfall | days-short × (tariff ÷ 30), from deposit | cancellation policy |
| Deposit refund due | 7 working days (Mon–Fri, minus Indian holidays) after later of checkout / notice end | `dates.ts` |
| Dispute window | 30 days | refund policy |
| `RESIDENCY_CYCLE_MONTHS` | 4 (tag `Residencies`) | `stay.ts` |
| Key replacement / failed inspection | ₹3,000/key · ₹2,500, 3 strikes → eviction | house rules |
| Rent HSN codes | 9963, 996311 (billing filter) | `billing/route.ts` |
| Dunning Notion props | `Rent Failure Count`, `Due Rent Link ID`, `Due Rent Base (₹)`, tags `Rent Overdue`/`Rent Defaulted` | `notion.ts` |
| Link `notes.type` values | `security_deposit` · `pro_rated_rent` · `rent` | `razorpay.ts` |
| Guest statuses | Deposit Pending → Booking confirmed → (pre-check-in + arrival → checked in → Done) → Checked-Out / Cancelled | `notion.ts` |
