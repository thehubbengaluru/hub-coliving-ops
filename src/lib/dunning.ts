// Single source of truth for the rent late-fee ladder, shared by the Razorpay
// webhook (5th-failure escalation) and the daily dunning cron (reissue
// timeline). Rent is fee-free through the 3rd (IST); ₹500/day from the 4th;
// the fee CAPS at 7 fee-days (₹3,500) on the 10th, when the guest defaults.
//
// Previously the webhook computed the fee UNCAPPED (day − 3) while the cron
// capped it — so a 5th failure mid-month could bill a fee far above ₹3,500.
// Both now call `lateFeeForDay`, so the cap can never drift.

export const LATE_FEE_PER_DAY = parseInt(process.env.RENT_LATE_FEE_PER_DAY_INR ?? "500", 10)
export const LATE_FEE_GRACE_DAY = 3 // rent payable without fee through the 3rd
export const DEFAULT_DAY = 10       // defaulter + vacate notice on the 10th
export const MAX_FEE_DAYS = DEFAULT_DAY - LATE_FEE_GRACE_DAY // 7 → fee caps at ₹3,500

// Late fee for a given day-of-month, capped at MAX_FEE_DAYS. day ≤ 3 → ₹0.
export function lateFeeForDay(day: number): { feeDays: number; fee: number } {
  const feeDays = Math.min(MAX_FEE_DAYS, Math.max(0, day - LATE_FEE_GRACE_DAY))
  return { feeDays, fee: feeDays * LATE_FEE_PER_DAY }
}

// Current IST calendar day-of-month (1–31). The server may run in UTC, so the
// day boundary must be computed in Asia/Kolkata.
export function istDayOfMonth(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric" }).format(new Date()),
    10,
  )
}

// Current IST month as "YYYY-MM".
export function istMonth(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()).slice(0, 7)
}

// Where "today" (YYYY-MM-DD, IST) falls in the dunning timeline for rent owed
// for `rentMonth` ("YYYY-MM"). A month that has fully passed pins to the
// default day so a missed cron run still lands on the default flow (catch-up,
// never skip). Returns null when the rent month hasn't started yet.
export function dunningDay(
  todayISO: string,
  rentMonth: string,
): { day: number; feeDays: number; fee: number } | null {
  const curMonth = todayISO.slice(0, 7)
  if (curMonth < rentMonth) return null
  const rawDay = curMonth > rentMonth ? DEFAULT_DAY : parseInt(todayISO.slice(8, 10), 10)
  const { feeDays, fee } = lateFeeForDay(rawDay)
  return { day: Math.min(rawDay, DEFAULT_DAY), feeDays, fee }
}
