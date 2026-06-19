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
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  amount: number
  notionPageId?: string
  zohoRetainerId?: string
  callbackUrl?: string
}): Promise<RazorpayLink> {
  const rzp = getClient(property)
  const propertyLabel = property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link = await (rzp.paymentLink as any).create({
    amount: Math.round(amount * 100),
    currency: "INR",
    description: `Security Deposit — ${propertyLabel}`,
    customer: { name: guestName, email, contact: phone },
    notify: { sms: true, email: true },
    reminder_enable: true,
    ...(callbackUrl ? { callback_url: callbackUrl, callback_method: "get" } : {}),
    notes: { property, type: "security_deposit", guest_name: guestName, notion_page_id: notionPageId ?? "", zoho_retainer_id: zohoRetainerId ?? "" },
  })

  return link as RazorpayLink
}

// One-off rent payment link (manual rent payment from the guest portal — distinct
// from the auto-debit subscription mandate).
export async function createRentPaymentLink({
  property, guestName, email, phone, amount, description, notionPageId, callbackUrl,
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  amount: number
  description?: string
  notionPageId?: string
  callbackUrl?: string
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
    notes: { property, type: "rent", guest_name: guestName, notion_page_id: notionPageId ?? "" },
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

export async function getPaymentLinkStatus(property: Property, linkId: string): Promise<string | null> {
  try {
    const rzp = getClient(property)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const link = await (rzp.paymentLink as any).fetch(linkId)
    return (link?.status as string) ?? null
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
  zohoInvoiceId,
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  monthlyRate: number
  checkInDate?: string  // ISO date string; subscription starts 1st of month after this
  zohoInvoiceId?: string
}): Promise<RazorpaySubscription> {
  const rzp = getClient(property)
  const propertyLabel = property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"

  // Subscription starts 1st of month after check-in (or next month from now if not provided)
  const base = checkInDate ? new Date(checkInDate + "T00:00:00") : new Date()
  const startAt = new Date(base.getFullYear(), base.getMonth() + 1, 1)
  const startAtUnix = Math.floor(startAt.getTime() / 1000)

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
    total_count: 120, // 10-year cap
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

export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
  return expected === signature
}

export function getRzpInstance(property: "safina-plaza" | "peepal-tree") {
  return getClient(property)
}

export function getPublicKey(property: "safina-plaza" | "peepal-tree"): string {
  return property === "safina-plaza" ? process.env.RZP_KEY_ID_PLAZA! : process.env.RZP_KEY_ID_PEEPAL!
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, property: "safina-plaza" | "peepal-tree"): boolean {
  const secret = property === "safina-plaza" ? process.env.RZP_KEY_SECRET_PLAZA! : process.env.RZP_KEY_SECRET_PEEPAL!
  const expected = crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex")
  return expected === signature
}
