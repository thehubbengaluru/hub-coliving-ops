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
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  amount: number
  notionPageId?: string
  zohoRetainerId?: string
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
    notes: { property, type: "security_deposit", guest_name: guestName, notion_page_id: notionPageId ?? "", zoho_retainer_id: zohoRetainerId ?? "" },
  })

  return link as RazorpayLink
}

export async function createRentSubscription({
  property,
  guestName,
  email,
  phone,
  monthlyRate,
  zohoInvoiceId,
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  monthlyRate: number
  zohoInvoiceId?: string
}): Promise<RazorpaySubscription> {
  const rzp = getClient(property)
  const propertyLabel = property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"

  // Billing starts on the 1st of next month
  const now = new Date()
  const startAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
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
