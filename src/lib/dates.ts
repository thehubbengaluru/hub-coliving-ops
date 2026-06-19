// Indian public holidays — national + major Karnataka observances, 2025-2026.
// ISO date strings (YYYY-MM-DD). Extend each year as needed.
const HOLIDAYS = new Set([
  // 2025
  "2025-01-26", // Republic Day
  "2025-03-14", // Holi
  "2025-04-14", // Dr Ambedkar Jayanti / Tamil New Year
  "2025-04-18", // Good Friday
  "2025-05-01", // Karnataka Rajyotsava / Labour Day
  "2025-06-07", // Eid ul-Adha (approx)
  "2025-07-06", // Muharram (approx)
  "2025-08-15", // Independence Day
  "2025-10-02", // Gandhi Jayanti
  "2025-10-02", // Dussehra (Vijayadashami) — varies
  "2025-10-20", // Diwali (Naraka Chaturdashi) — varies
  "2025-10-21", // Diwali / Lakshmi Puja
  "2025-11-05", // Kannada Rajyotsava (Karnataka Foundation Day)
  "2025-11-15", // Guru Nanak Jayanti (approx)
  "2025-12-25", // Christmas
  // 2026
  "2026-01-26", // Republic Day
  "2026-03-03", // Holi (approx)
  "2026-04-03", // Good Friday (approx)
  "2026-04-14", // Dr Ambedkar Jayanti
  "2026-05-01", // Labour Day / Karnataka Rajyotsava
  "2026-08-15", // Independence Day
  "2026-10-02", // Gandhi Jayanti
  "2026-11-01", // Kannada Rajyotsava
  "2026-12-25", // Christmas
])

function isWorkingDay(date: Date): boolean {
  const day = date.getDay()
  if (day === 0 || day === 6) return false // Sun / Sat
  const iso = date.toISOString().slice(0, 10)
  return !HOLIDAYS.has(iso)
}

/** Add N working days (Mon–Fri, excl. Indian public holidays) to an ISO date. */
export function addWorkingDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00")
  let added = 0
  while (added < days) {
    d.setDate(d.getDate() + 1)
    if (isWorkingDay(d)) added++
  }
  return d.toISOString().slice(0, 10)
}

/**
 * Deposit refund is due 7 working days after WHICHEVER IS LATER of the actual
 * checked-out date and the notice-period last date. Either may be empty.
 */
export function computeRefundDueDate(
  checkedOutDate: string | null | undefined,
  noticePeriodLastDate: string | null | undefined,
  workingDays = 7,
): string | null {
  const dates = [checkedOutDate, noticePeriodLastDate].filter(Boolean) as string[]
  if (dates.length === 0) return null
  const later = dates.reduce((a, b) => (a > b ? a : b))
  return addWorkingDays(later, workingDays)
}

// ─── Room-move financial model ──────────────────────────────────────────────

export type RoomMoveFinancials = {
  // Date info
  moveDate: string
  monthLabel: string       // e.g. "June 2026"
  daysInMonth: number
  daysAtOldRate: number   // days 1 → (moveDay - 1)
  daysAtNewRate: number   // days moveDay → end of month
  oldRatePeriod: string   // e.g. "June 1–14"
  newRatePeriod: string   // e.g. "June 15–30"

  // Rent
  oldRate: number
  newRate: number
  proOldRent: number      // pro-rated rent for old period
  proNewRent: number      // pro-rated rent for new period
  rentAlreadyPaid: number // assumed = oldRate (full month paid on 1st)
  rentDelta: number       // positive = credit (overpaid), negative = owes more

  // Deposit (= 1 month's rate per policy)
  depositPaid: number     // = oldRate
  depositRequired: number // = newRate
  depositDelta: number    // positive = refund, negative = top-up

  // Net
  totalRefund: number     // > 0 if guest gets money back
  totalTopUp: number      // > 0 if guest owes money (rent top-up + deposit top-up)
  refundByDate: string | null // 7 working days from move date
}

export function computeRoomMoveFinancials(
  moveDate: string,
  oldRate: number,
  newRate: number,
): RoomMoveFinancials {
  const d = new Date(moveDate + "T00:00:00")
  const year = d.getFullYear()
  const month = d.getMonth() // 0-indexed
  const moveDay = d.getDate()

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysAtOldRate = moveDay - 1
  const daysAtNewRate = daysInMonth - moveDay + 1

  const monthLabel = d.toLocaleDateString("en-IN", { month: "long", year: "numeric" })
  const monthShort = d.toLocaleDateString("en-IN", { month: "long" })

  const oldRatePeriod = daysAtOldRate > 0
    ? `${monthShort} 1–${moveDay - 1}`
    : `—`
  const newRatePeriod = `${monthShort} ${moveDay}–${daysInMonth}`

  const proOldRent = daysAtOldRate > 0
    ? Math.round((oldRate / daysInMonth) * daysAtOldRate)
    : 0
  const proNewRent = Math.round((newRate / daysInMonth) * daysAtNewRate)

  const rentAlreadyPaid = oldRate
  const totalRentDue    = proOldRent + proNewRent
  const rentDelta       = rentAlreadyPaid - totalRentDue // positive = credit

  const depositPaid     = oldRate
  const depositRequired = newRate
  const depositDelta    = depositPaid - depositRequired  // positive = refund

  const totalRefund = Math.max(0, rentDelta) + Math.max(0, depositDelta)
  const totalTopUp  = Math.max(0, -rentDelta) + Math.max(0, -depositDelta)

  const refundByDate = totalRefund > 0
    ? addWorkingDays(moveDate, 7)
    : null

  return {
    moveDate,
    monthLabel,
    daysInMonth,
    daysAtOldRate,
    daysAtNewRate,
    oldRatePeriod,
    newRatePeriod,
    oldRate,
    newRate,
    proOldRent,
    proNewRent,
    rentAlreadyPaid,
    rentDelta,
    depositPaid,
    depositRequired,
    depositDelta,
    totalRefund,
    totalTopUp,
    refundByDate,
  }
}

export function formatDateLong(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  })
}
