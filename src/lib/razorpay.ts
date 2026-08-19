import Razorpay from "razorpay"
import crypto from "crypto"
import type { Property } from "./types"

function getClient(property: Property) {
  const isPlaza = property === "safina-plaza"
  return new Razorpay({
    key_id:     isPlaza ? process.env.RZP_KEY_ID_PLAZA!     : process.env.RZP_KEY_ID_PEEPAL!,
    key_secret: isPlaza ? process.env.RZP_KEY_SECRET_PLAZA! : process.env.RZP_KEY_SECRET_PEEPAL!,
  })
}

export interface RazorpayLink {
  id: string
  short_url: string
  status: string
}

export interface RazorpaySubscription {
  id: string
  short_url: string
  status: string
  plan_id: string
}

export async function createDepositLink({
  property,
  guestName,
  email,
  phone,
  amount,
  notionPageId,
  zohoRetainerId,
  callbackUrl,
  description,
  expireByUnix,
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  amount: number
  notionPageId?: string
  zohoRetainerId?: string
  callbackUrl?: string
  description?: string  // override for no-deposit flows (e.g. exploratory week)
  expireByUnix?: number // unix seconds — link expires and the booking is void (Razorpay minimum: 15 min out)
}): Promise<RazorpayLink> {
  const rzp = getClient(property)
  const propertyLabel = property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await (rzp.paymentLink as any).create({
    amount: Math.round(amount * 100),
    currency: "INR",
    description: description ?? `Security Deposit — ${propertyLabel}`,
    customer: { name: guestName, email, contact: phone },
    notify: { sms: true, email: true },
    reminder_enable: true,
    ...(callbackUrl ? { callback_url: callbackUrl, callback_method: "get" } : {}),
    ...(expireByUnix ? { expire_by: expireByUnix } : {}),
    notes: { property, type: "security_deposit", guest_name: guestName, notion_page_id: notionPageId ?? "", zoho_retainer_id: zohoRetainerId ?? "" },
  })

  return link as RazorpayLink
}

// One-off rent payment link (manual rent payment from the guest portal, the
// final pro-rated month, or a dunning reissue — distinct from the auto-debit
// subscription mandate). rentMonth ("YYYY-MM") rides in the notes so the daily
// dunning sweep can compute the late fee against the month the rent is FOR,
// not whatever month the link happens to be reissued in.
export async function createRentPaymentLink({
  property, guestName, email, phone, amount, description, notionPageId, callbackUrl, rentMonth,
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  amount: number
  description?: string
  notionPageId?: string
  callbackUrl?: string
  rentMonth?: string
}): Promise<RazorpayLink> {
  const rzp = getClient(property)
  const propertyLabel = property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await (rzp.paymentLink as any).create({
    amount: Math.round(amount * 100),
    currency: "INR",
    description: description ?? `Monthly Rent — ${propertyLabel}`,
    customer: { name: guestName, email, contact: phone },
    notify: { sms: true, email: true },
    reminder_enable: true,
    ...(callbackUrl ? { callback_url: callbackUrl, callback_method: "get" } : {}),
    notes: {
      property, type: "rent", guest_name: guestName, notion_page_id: notionPageId ?? "",
      ...(rentMonth ? { rent_month: rentMonth } : {}),
    },
  })
  return link as RazorpayLink
}

// Returns pro-rated rent details for a mid-month check-in, or null if checking in on the 1st.
export function calcProRatedRent(checkInDateStr: string, monthlyRate: number): {
  amount: number
  daysInMonth: number
  daysRemaining: number
  monthName: string
  description: string
} | null {
  const date = new Date(checkInDateStr + "T00:00:00")
  const day = date.getDate()
  if (day === 1) return null
  const year = date.getFullYear()
  const month = date.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysRemaining = daysInMonth - day + 1
  const amount = Math.round((monthlyRate / daysInMonth) * daysRemaining)
  const monthName = date.toLocaleString("en-IN", { month: "long" })
  return {
    amount,
    daysInMonth,
    daysRemaining,
    monthName,
    description: `Pro-rated rent — ${monthName} (${day}th–${daysInMonth}th, ${daysRemaining} days @ ₹${monthlyRate.toLocaleString("en-IN")}/mo)`,
  }
}

export async function createProRatedLink({
  property,
  guestName,
  email,
  phone,
  amount,
  description,
  notionPageId,
  callbackUrl,
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  amount: number
  description: string
  notionPageId?: string
  callbackUrl?: string
}): Promise<RazorpayLink> {
  const rzp = getClient(property)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await (rzp.paymentLink as any).create({
    amount: Math.round(amount * 100),
    currency: "INR",
    description,
    customer: { name: guestName, email, contact: phone },
    notify: { sms: true, email: true },
    reminder_enable: true,
    ...(callbackUrl ? { callback_url: callbackUrl, callback_method: "get" } : {}),
    notes: { property, type: "pro_rated_rent", guest_name: guestName, notion_page_id: notionPageId ?? "" },
  })
  return link as RazorpayLink
}

// One-off miscellaneous fee link (failed-inspection ₹2,500, key replacement
// ₹3,000/key, damages, etc.). notes.type = "fee" so the webhook records the
// payment + notifies finance but applies NO deposit/rent/dunning side effects.
export async function createFeeLink({
  property, guestName, email, phone, amount, description, notionPageId, callbackUrl,
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  amount: number
  description: string
  notionPageId?: string
  callbackUrl?: string
}): Promise<RazorpayLink> {
  const rzp = getClient(property)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await (rzp.paymentLink as any).create({
    amount: Math.round(amount * 100),
    currency: "INR",
    description,
    customer: { name: guestName, email, contact: phone },
    notify: { sms: true, email: true },
    reminder_enable: true,
    ...(callbackUrl ? { callback_url: callbackUrl, callback_method: "get" } : {}),
    notes: { property, type: "fee", guest_name: guestName, notion_page_id: notionPageId ?? "" },
  })
  return link as RazorpayLink
}

/** Cancel a live payment link (before reissuing it with an updated late fee). Best-effort. */
export async function cancelPaymentLink(property: Property, linkId: string): Promise<boolean> {
  try {
    const rzp = getClient(property)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (rzp.paymentLink as any).cancel(linkId)
    return true
  } catch (e) {
    // Already paid/cancelled links can't be cancelled — treat as non-fatal.
    console.warn("[cancelPaymentLink] failed for", linkId, e)
    return false
  }
}

export async function getPaymentLinkStatus(property: Property, linkId: string): Promise<string | null> {
  return (await fetchPaymentLink(property, linkId))?.status ?? null
}

/** Full payment-link lookup: status + URL + our notes (rent_month etc.). null when unfetchable. */
export async function fetchPaymentLink(property: Property, linkId: string): Promise<{
  status: string
  short_url: string
  notes: Record<string, string>
} | null> {
  try {
    const rzp = getClient(property)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const link = await (rzp.paymentLink as any).fetch(linkId)
    if (!link?.status) return null
    return { status: link.status as string, short_url: (link.short_url as string) ?? "", notes: (link.notes as Record<string, string>) ?? {} }
  } catch {
    return null
  }
}

export async function createRentSubscription({
  property,
  guestName,
  email,
  phone,
  monthlyRate,
  checkInDate,
  startISO,
  totalCount,
  zohoInvoiceId,
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  monthlyRate: number
  checkInDate?: string  // ISO date string; rent month = month after this (legacy fallback when startISO absent)
  startISO?: string     // first day (YYYY-MM-01) of the first auto-debited rent month — from computeRentSchedule
  totalCount?: number | null // exact number of monthly cycles (maps the sub to the check-out date); null/undefined → long-stop cap
  zohoInvoiceId?: string
}): Promise<RazorpaySubscription> {
  const rzp = getClient(property)
  const propertyLabel = property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"

  // Auto-debit anchors on the 2nd-last day of the month BEFORE the rent month:
  // 2 days of buffer ahead of the 1st plus the 3-day grace window gives
  // Razorpay's ~5-day retry cycle room to finish before the per-day late fee
  // starts on the 4th. Falls back to the 1st of the rent month when the anchor
  // is already in the past (e.g. booking confirmed on the 30th/31st), and to
  // "1 hour from now" if even that has passed.
  let firstOfRentMonth: Date
  if (startISO) {
    firstOfRentMonth = new Date(startISO + "T00:00:00")
  } else {
    const base = checkInDate ? new Date(checkInDate + "T00:00:00") : new Date()
    firstOfRentMonth = new Date(base.getFullYear(), base.getMonth() + 1, 1)
  }
  const anchor = new Date(firstOfRentMonth)
  anchor.setDate(anchor.getDate() - 2)

  const minStart = Date.now() + 60 * 60 * 1000
  let startAt = anchor
  if (startAt.getTime() < minStart) startAt = firstOfRentMonth
  const startAtUnix = Math.floor(Math.max(startAt.getTime(), minStart) / 1000)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = await (rzp.plans as any).create({
    period: "monthly",
    interval: 1,
    item: {
      name: `Monthly Rent — ${guestName} (${propertyLabel})`,
      amount: Math.round(monthlyRate * 100),
      currency: "INR",
    },
    notes: { property, guest_name: guestName },
  })

  // Store guest contact + rate in notes so the webhook can create Zoho invoices
  // for month 2 onwards without any additional lookups
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sub = await (rzp.subscriptions as any).create({
    plan_id: plan.id,
    customer_notify: 1,
    quantity: 1,
    // Exact cycle count maps the subscription to the check-out date — it stops
    // by itself after the last fully-covered month (a partial final month is
    // collected by payment link instead, since Razorpay can't pro-rate a
    // cycle). Long-stop cap only for open-ended admin flows.
    total_count: totalCount ?? 120,
    start_at: startAtUnix,
    notify_info: { notify_phone: phone, notify_email: email },
    notes: {
      property,
      guest_name:      guestName,
      guest_email:     email,
      guest_phone:     phone,
      monthly_rate:    String(monthlyRate),
      zoho_invoice_id: zohoInvoiceId ?? "",
    },
  })

  return sub as RazorpaySubscription
}

/** Issue a refund against a captured payment. amount is in INR (rupees); omit
 * for a full refund. Returns the refund id/status. Throws on API failure so the
 * caller can mark the ledger row 'failed'. */
export async function createRefund(
  property: Property,
  paymentId: string,
  amountInr: number | null,
  notes?: Record<string, string>,
): Promise<{ id: string; status: string; amount: number }> {
  const rzp = getClient(property)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = { speed: "normal", ...(notes ? { notes } : {}) }
  if (amountInr != null) payload.amount = Math.round(amountInr * 100)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refund = await (rzp.payments as any).refund(paymentId, payload)
  return { id: refund.id as string, status: (refund.status as string) ?? "processed", amount: (refund.amount as number) ?? 0 }
}

/** Cancel a subscription (e.g. after a room move, before creating a new mandate
 * at the new rate). Best-effort — a already-cancelled/completed sub is fine. */
export async function cancelSubscription(property: Property, subscriptionId: string, cancelAtCycleEnd = false): Promise<boolean> {
  try {
    const rzp = getClient(property)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (rzp.subscriptions as any).cancel(subscriptionId, cancelAtCycleEnd)
    return true
  } catch (e) {
    console.warn("[cancelSubscription] failed for", subscriptionId, e)
    return false
  }
}

export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  // Constant-time compare to avoid leaking the signature via timing. Both are
  // hex strings of equal length on a match; guard unequal lengths first since
  // timingSafeEqual throws on a length mismatch.
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(signature, "utf8")
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function getRzpInstance(property: Property) {
  return getClient(property)
}

export function getPublicKey(property: Property): string {
  return property === "safina-plaza" ? process.env.RZP_KEY_ID_PLAZA! : process.env.RZP_KEY_ID_PEEPAL!
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, property: Property): boolean {
  const secret = property === "safina-plaza" ? process.env.RZP_KEY_SECRET_PLAZA! : process.env.RZP_KEY_SECRET_PEEPAL!
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex")
  return expected === signature
}
