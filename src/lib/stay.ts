// Co-living stay rules — shared by the booking wizard, admin check-in, the
// guest portal and the cancellation flow so the numbers can never drift apart.

export type StayDurationKey = "1w" | "1m" | "2m" | "3m" | "4m"

export const STAY_DURATIONS: {
  key: StayDurationKey
  label: string
  short: string
  days?: number
  months?: number
}[] = [
  { key: "1w", label: "1 Week Exploratory Stay", short: "1w", days: 7 },
  { key: "1m", label: "1 month",  short: "1m", months: 1 },
  { key: "2m", label: "2 months", short: "2m", months: 2 },
  { key: "3m", label: "3 months", short: "3m", months: 3 },
  { key: "4m", label: "4 months", short: "4m", months: 4 },
]

// ─── 1 Week Exploratory Stay ────────────────────────────────────────────────
// A flat-priced trial week, PRIVATE rooms only: ₹25,000 incl. GST covers the
// whole week regardless of the room's monthly tariff. NO security deposit is
// collected (the maintenance fee still applies); there is never a subscription
// or a final pro-rated month — the flat rent is the only rent charge.
export const EXPLORATORY_WEEK_RENT = 25000

// A stay of 7 nights or fewer is an exploratory stay. Derived from the dates
// (not the wizard's duration key) so the server can't be told otherwise.
export function isExploratoryStay(checkInISO: string, checkOutISO: string | null | undefined): boolean {
  if (!checkInISO || !checkOutISO || checkOutISO <= checkInISO) return false
  const nights = Math.round((new Date(checkOutISO + "T00:00:00").getTime() - new Date(checkInISO + "T00:00:00").getTime()) / 86_400_000)
  return nights <= 7
}

// Hard cap on a single tenancy. Beyond this a guest must re-apply (a fresh
// contract; the deposit carries forward to the new tenancy).
export const MAX_STAY_MONTHS = 4

// ─── Fees (₹) ───────────────────────────────────────────────────────────────
export const MAINTENANCE_FEE = 2000        // one-time, strictly non-refundable
export const PET_DEPOSIT_FEE = 25000       // one-time pet deposit (Pet Parent only)
export const PET_MONTHLY_FEE = 5000        // recurring pet fee, billed alongside rent
// Second guest on a Private room is single-billing under the primary by design
// (no extra charge). Set this > 0 to switch on a couple premium; it then folds
// into the rent schedule + subscription exactly like the pet monthly fee.
export const COUPLE_PREMIUM_MONTHLY = 0

// House-rules penalties (previously text-only, now billable via fee links).
export const FAILED_INSPECTION_FEE = 2500
export const KEY_REPLACEMENT_FEE = 3000            // per key
export const INSPECTION_STRIKES_FOR_EVICTION = 3   // 3 failed inspections → eviction

// ─── Streams: co-living vs residency ───────────────────────────────────────
// Both streams share one backend and one occupancy board. Co-living books
// through /book; residency is marketed through THP and runs on fixed
// 4-month cycles. Everyone has a defined exit date and re-applies at cycle end.

export type StayStream = "co-living" | "residency"

// The existing Notion "Type" tag on the Active Members DB that marks a resident.
export const RESIDENCY_TAG = "Residencies"

// A residency runs in fixed cycles; at the end the resident re-applies and
// the Hub decides whether to renew, and at what price.
export const RESIDENCY_CYCLE_MONTHS = 4

export function streamFromTags(tags: string[] | undefined | null): StayStream {
  return tags?.includes(RESIDENCY_TAG) ? "residency" : "co-living"
}

// Minimum notice for an early check-out (leaving before the booked end date).
export const EARLY_CHECKOUT_NOTICE_MONTHS = 1

// Self-serve extension only opens once the "check-out coming up, want to
// extend?" reminder has actually gone out (cron/extend-stay-reminders fires
// it at exactly this many days out) — not any time earlier in the tenancy.
export const EXTEND_STAY_WINDOW_DAYS = 14

// Days until `checkOutISO`, relative to `todayISO` (both YYYY-MM-DD).
export function daysUntilISO(checkOutISO: string, todayISO: string): number {
  const a = parseISO(todayISO), b = parseISO(checkOutISO)
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

// Is self-serve extension open yet for this check-out date? Opens at
// EXTEND_STAY_WINDOW_DAYS out and stays open afterwards (including once the
// booked check-out date has passed, so a guest who missed the window can
// still extend rather than being locked out entirely).
export function extendStayWindowOpen(checkOutISO: string, todayISO: string): boolean {
  return daysUntilISO(checkOutISO, todayISO) <= EXTEND_STAY_WINDOW_DAYS
}

// A cancellation is only possible this many days (or more) before check-in.
export const CANCELLATION_NOTICE_DAYS = 31

// Refund fraction when a cancellation is still allowed (31+ days out).
export const CANCELLATION_REFUND_FRACTION = 0.5

function toISO(d: Date): string {
  // Read calendar parts directly — toISOString() converts to UTC, which shifts
  // a local-midnight date back one day for timezones ahead of UTC (like IST).
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function parseISO(iso: string): Date {
  return new Date(iso + "T00:00:00")
}

export function durationLabel(key: StayDurationKey): string {
  return STAY_DURATIONS.find(o => o.key === key)?.label ?? key
}

// Checkout date for a given check-in + duration, as an ISO (YYYY-MM-DD) string.
// Returns "" when either input is missing.
export function checkoutForDuration(checkInISO: string, key: StayDurationKey | ""): string {
  const opt = key ? STAY_DURATIONS.find(o => o.key === key) : undefined
  if (!checkInISO || !opt) return ""
  const d = parseISO(checkInISO)
  if (opt.days) d.setDate(d.getDate() + opt.days)
  if (opt.months) d.setMonth(d.getMonth() + opt.months)
  return toISO(d)
}

// Would this duration push the stay past a hard availability limit (e.g. the
// bed is only free until `untilISO`)? Used to disable options the bed can't honour.
export function durationFitsUntil(checkInISO: string, key: StayDurationKey, untilISO?: string | null): boolean {
  if (!untilISO) return true
  const checkout = checkoutForDuration(checkInISO, key)
  return !!checkout && checkout <= untilISO
}

// The latest date on which a cancellation is still permitted (50% refund).
// On/before this date → cancellable; after it → locked, no refund.
export function cancellationCutoffISO(checkInISO: string): string {
  const d = parseISO(checkInISO)
  d.setDate(d.getDate() - CANCELLATION_NOTICE_DAYS)
  return toISO(d)
}

// Can a booking with this check-in still be cancelled, given "today"?
export function canCancelBooking(checkInISO: string, todayISO: string): boolean {
  if (!checkInISO) return false
  return todayISO <= cancellationCutoffISO(checkInISO)
}

// Earliest date a guest may choose for an early check-out (1 month notice).
export function earliestEarlyCheckoutISO(todayISO: string): string {
  const d = parseISO(todayISO)
  d.setMonth(d.getMonth() + EARLY_CHECKOUT_NOTICE_MONTHS)
  return toISO(d)
}

// Second payment (first month's rent) is due this many days after the deposit
// is paid, to secure and block the room.
export const SECOND_PAYMENT_DUE_DAYS = 7

// Once payment links are generated, the guest has this long to PAY THE DEPOSIT.
// The deposit link expires after this window and the booking is void — the
// guest must restart the process. (The rent link keeps its 7-day window.)
export const DEPOSIT_PAYMENT_WINDOW_MINUTES = 25

// Pro-rated first-month rents of 10 days or fewer are bundled with the next
// month's rent into the single securing payment.
export const PRORATE_BUNDLE_THRESHOLD_DAYS = 10

export function addDaysISO(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

// Today's calendar date in IST (YYYY-MM-DD). All day-boundary rules (cancellation
// cutoff, early-checkout notice, extension window) must use this — never
// `new Date().toISOString()`, which is UTC and shifts the date back for IST.
export function istTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
}

// The latest check-out a single tenancy may reach (check-in + the 4-month cap).
// Beyond this the guest must re-apply (fresh contract, deposit carries forward).
export function maxStayCheckoutISO(checkInISO: string): string {
  const d = parseISO(checkInISO)
  d.setMonth(d.getMonth() + MAX_STAY_MONTHS)
  return toISO(d)
}

// Would extending to `checkOutISO` push this tenancy (starting `checkInISO`)
// past the hard 4-month cap?
export function exceedsMaxStay(checkInISO: string, checkOutISO: string): boolean {
  if (!checkInISO || !checkOutISO) return false
  return checkOutISO > maxStayCheckoutISO(checkInISO)
}
