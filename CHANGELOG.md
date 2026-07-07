# Changelog

Plain-language history of hub-ops. Two sections: **committed history** (already pushed) and
**work in progress** (staged locally, not yet pushed) — so you can see how the prototype
turned into the running product and what's about to ship next.

---

## Work in progress (staged locally, not pushed yet)

This batch is mostly about turning "anyone who knows the URL can get in" into real login and
locking down guest documents — plus fixing the rent-collection follow-up logic.

- **Real admin login.** Added Supabase-based authentication: an admin login page, a session
  check that runs on every request (`src/proxy.ts`, replacing Next's old "middleware" file),
  and a shared helper (`requireAdmin`) that every admin page/API now calls before showing
  data. Admin pages moved into a `(protected)` route group to make that guard structural,
  not just a convention. Before this, admin access wasn't gated by a real login.
- **Guest KYC documents move off Notion into secure storage.** ID proofs, photos, signatures,
  and passport scans are now archived in a private Supabase storage bucket instead of living
  as file attachments on the Notion page. A new "Documents" button on the Guests page lets
  staff view/download them via short-lived (15-minute) signed links. A backfill script
  (`scripts/backfill-kyc-to-supabase.mjs`) migrates documents from existing bookings. Notion
  stays the day-to-day record; Supabase is now the system of record for sensitive ID documents.
- **Staff notes on guests.** Staff can attach a free-text note (with their name) to any active
  guest from the Guests page — useful for things like "asked for late checkout" that don't
  fit anywhere else in Notion.
- **Rent collection follow-up rebuilt.** The daily reminder cron now runs a real "dunning"
  timeline for unpaid rent (whether from a failed auto-debit or a guest's final pro-rated
  month): due-date reminder → late fee accruing daily from the 4th → final warning on the
  8th–9th → default notice + deposit forfeiture on the 10th, with the payment link
  automatically cancelled and reissued at the new amount each step. Also splits the
  "your stay is ending, want to extend?" nudge by guest type — co-living guests get the
  self-serve extend flow, residency guests get "your cycle is ending, please re-apply."
- Guest portal login now returns through a dedicated callback route
  (`/portal/auth/callback`), matching the same Supabase auth pattern.
- Small fixes riding along: booking confirmation, payment-link creation, and check-in flows
  were adjusted to pass through the new fields these features need (rent month, guest doc
  keys, etc).

---

## Committed history (already pushed)

### The prototype phase
The app started as a scaffolded Next.js template, then in one big pass ("INITIAL COMMIT")
became a full mock admin dashboard — Dashboard, Rooms, Guests, Leads, Payments, Billing,
Reports, Maintenance, Special Bookings — all built against fake sample data (`mock-data.ts`)
just to nail down the look and navigation before anything was wired to real systems.

### Making it real: Notion becomes the source of truth
- Check-in/checkout on the Rooms page started actually writing to Notion (guest details,
  bed status), instead of just updating the on-screen mock state.
- Dashboard numbers (occupancy, revenue estimate, deposits due, pending bookings) switched
  from mock data to live Notion queries, with a property switcher (Plaza/Peepal/All).
- Guests page gained a "Pending Bookings" tab so staff could see and activate bookings that
  came in through the (now-retired) Lovable-built booking form.
- Leads and Maintenance pages became live kanban/ticket views backed by Notion, with
  write-back buttons (mark won/lost, mark resolved, assign).
- On checkout, a guest's full record now gets copied into a Notion "Alumni" database before
  their bed record is cleared — so history isn't lost when a bed is reused.

### Money: Razorpay + Zoho Books
- Razorpay payment links and subscriptions were wired to real check-in/deposit/rent flows,
  with the webhook writing payment status back into Notion.
- Zoho Books was added for GST-compliant invoicing: every rent charge and deposit now creates
  a real invoice/receipt and emails the guest a PDF. Extended to support Plaza and Peepal as
  two separate Zoho accounts/logins.
- Billing page switched from mock invoices to live Zoho data, filtered down to just rent-type
  invoices (by tax code) so it isn't cluttered with other transactions. Reports page followed
  the same path — every chart now derives from live Notion + Zoho data instead of mock trends.

### Becoming a real product, not just an admin tool
- The admin section was moved under `/admin` and the app grew a public-facing side: a 6-step
  self-serve booking wizard (`/book`) for prospective guests, and a guest self-service portal
  (`/portal`) with login, info, maintenance requests, payments, and checkout — so guests no
  longer depend on staff for everything.
- Added the operational pieces a real business needs: legal pages (terms, privacy, refund/
  cancellation policy), the ability to block/reassign/invite guests into rooms, staff tags on
  guests and billing records, self-serve rent payment from the guest portal, and a cron job
  that reminds guests ahead of their check-out date about extending their stay.
- Mobile support: the whole admin app got a responsive rework (collapsible nav drawer,
  touch-friendly controls, adaptive spacing) so it's usable from a phone, not just desktop.

### Bug fixes along the way
- Fixed a Zoho API call that broke when a URL already had query parameters (was appending a
  second `?` instead of `&`), which had been crashing the Billing page.
