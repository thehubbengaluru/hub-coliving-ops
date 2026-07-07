// Single source of truth for how a stay's rent is split across payment links
// and the Razorpay auto-debit subscription. Shared by the booking wizard (to
// preview the payment plan), the payment-link API routes (to charge it) and
// the cron (to collect the final pro-rated month), so the three can never
// disagree about who owes what when.
//
// Model — a stay covers the nights [checkIn, checkOut):
//   1. "Upfront" months are collected by payment link before check-in: the
//      (possibly pro-rated) check-in month, plus the following month when the
//      pro-rated stub is short (≤ PRORATE_BUNDLE_THRESHOLD_DAYS).
//   2. The subscription auto-debits only calendar months that are fully
//      covered by the stay AND not already paid upfront. Its total_count is
//      fixed at creation so it can never charge past the check-out date.
//   3. A partial final month (check-out mid-month) can't be pro-rated by a
//      Razorpay subscription cycle, so it is collected by a payment link
//      issued shortly before that month starts (see the daily cron).

import { PRORATE_BUNDLE_THRESHOLD_DAYS } from "./stay"

export interface RentMonth {
  year: number
  month: number        // 0-based calendar month
  monthLabel: string   // "January"
  fromISO: string      // first charged day (inclusive)
  toISO: string        // last charged day (inclusive)
  days: number
  daysInMonth: number
  full: boolean        // covers the entire calendar month
  amount: number       // ₹, full rate or pro-rated per-day
}

export interface RentSchedule {
  // Months collected by the pre-check-in rent payment link (1 or 2 entries).
  upfront: RentMonth[]
  upfrontAmount: number
  // Auto-debit window. cycles === null means the check-out date is unknown
  // (open-ended admin flows) — callers fall back to the long-stop cap.
  subscription: { startISO: string; cycles: number | null } | null
  // Partial check-out month, collected later by payment link. null when the
  // stay ends on a month boundary or is already fully covered upfront.
  finalMonth: RentMonth | null
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

// Timezone-safe YYYY-MM-DD from calendar parts (never routes through UTC).
function partsToISO(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parseParts(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split("-").map(Number)
  return { year: y, month: m - 1, day: d }
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString("en-IN", { month: "long" })
}

// Rent for one calendar month clipped to [fromDay, toDay] (inclusive).
function monthPortion(
  year: number, month: number, fromDay: number, toDay: number, monthlyRate: number,
): RentMonth {
  const dim = daysInMonth(year, month)
  const to = Math.min(toDay, dim)
  const days = to - fromDay + 1
  const full = fromDay === 1 && to === dim
  return {
    year, month,
    monthLabel: monthLabel(year, month),
    fromISO: partsToISO(year, month, fromDay),
    toISO: partsToISO(year, month, to),
    days, daysInMonth: dim, full,
    amount: full ? monthlyRate : Math.round((monthlyRate / dim) * days),
  }
}

export function computeRentSchedule(
  checkInISO: string,
  checkOutISO: string | null | undefined,
  monthlyRate: number,
): RentSchedule {
  const ci = parseParts(checkInISO)

  // Last charged night: the day before check-out (guests don't pay for the
  // check-out day itself — a 1-week stay covers exactly 7 nights).
  let last: { year: number; month: number; day: number } | null = null
  if (checkOutISO && checkOutISO > checkInISO) {
    const co = parseParts(checkOutISO)
    if (co.day === 1) {
      const pm = co.month === 0 ? { year: co.year - 1, month: 11 } : { year: co.year, month: co.month - 1 }
      last = { ...pm, day: daysInMonth(pm.year, pm.month) }
    } else {
      last = { year: co.year, month: co.month, day: co.day - 1 }
    }
  }

  const monthIdx = (y: number, m: number) => y * 12 + m
  const lastIdx = last ? monthIdx(last.year, last.month) : Infinity
  const lastDayIn = (y: number, m: number) =>
    last && monthIdx(y, m) === lastIdx ? last.day : daysInMonth(y, m)

  // 1 — check-in month (pro-rated unless checking in on the 1st and staying
  // through month-end).
  const upfront: RentMonth[] = [
    monthPortion(ci.year, ci.month, ci.day, lastDayIn(ci.year, ci.month), monthlyRate),
  ]

  // 2 — short pro-rated stub (≤ threshold days) bundles the next month into
  // the same upfront link, provided the stay actually reaches it.
  const first = upfront[0]
  const stubBundles =
    ci.day > 1 &&
    first.days <= PRORATE_BUNDLE_THRESHOLD_DAYS &&
    lastIdx > monthIdx(ci.year, ci.month)
  if (stubBundles) {
    const ny = ci.month === 11 ? ci.year + 1 : ci.year
    const nm = ci.month === 11 ? 0 : ci.month + 1
    upfront.push(monthPortion(ny, nm, 1, lastDayIn(ny, nm), monthlyRate))
  }

  // 3 — subscription: fully-covered months after the last upfront month.
  const lastUpfront = upfront[upfront.length - 1]
  let subY = lastUpfront.month === 11 ? lastUpfront.year + 1 : lastUpfront.year
  let subM = lastUpfront.month === 11 ? 0 : lastUpfront.month + 1

  let subscription: RentSchedule["subscription"] = null
  if (!last) {
    // Open-ended stay: subscription runs until cancelled (caller applies cap).
    subscription = { startISO: partsToISO(subY, subM, 1), cycles: null }
  } else {
    let cycles = 0
    let y = subY, m = subM
    while (monthIdx(y, m) < lastIdx || (monthIdx(y, m) === lastIdx && last.day === daysInMonth(y, m))) {
      cycles++
      if (m === 11) { y++; m = 0 } else { m++ }
    }
    if (cycles > 0) subscription = { startISO: partsToISO(subY, subM, 1), cycles }
    subY = y; subM = m
  }

  // 4 — partial final month, if the stay ends mid-month beyond what the
  // upfront link already covers.
  let finalMonth: RentMonth | null = null
  if (
    last &&
    last.day < daysInMonth(last.year, last.month) &&
    lastIdx > monthIdx(lastUpfront.year, lastUpfront.month)
  ) {
    finalMonth = monthPortion(last.year, last.month, 1, last.day, monthlyRate)
  }

  return {
    upfront,
    upfrontAmount: upfront.reduce((s, m) => s + m.amount, 0),
    subscription,
    finalMonth,
  }
}

export function ordinal(n: number): string {
  const rem10 = n % 10, rem100 = n % 100
  if (rem10 === 1 && rem100 !== 11) return `${n}st`
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`
  return `${n}th`
}

// Human description for a rent payment link covering the given months, e.g.
// "Pro-rated rent — January (20th–31st, 12 days) + February (full month)".
export function describeRentMonths(months: RentMonth[], monthlyRate: number): string {
  const parts = months.map((m) =>
    m.full
      ? `${m.monthLabel} (full month)`
      : `${m.monthLabel} (${ordinal(parseParts(m.fromISO).day)}–${ordinal(parseParts(m.toISO).day)}, ${m.days} days)`
  )
  const anyProRated = months.some((m) => !m.full)
  return `${anyProRated ? "Pro-rated rent" : "Rent"} — ${parts.join(" + ")} @ ₹${monthlyRate.toLocaleString("en-IN")}/mo`
}
