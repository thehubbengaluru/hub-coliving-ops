import { NextResponse } from "next/server"
import { verifyWebhookSignature, createRentPaymentLink, cancelPaymentLink, cancelSubscription } from "@/lib/razorpay"
import {
  markDepositPaid, confirmBedOccupied, revertBedAllotment, revertBedAllotmentByEmail, markGuestStatus,
  recordRentChargeFailure, getRentOverdueState, markRentOverdue, resetRentChargeFailures,
  setDueRentLink, clearRentDunningState, assignBedForBooking, getBookingRazorpayIds,
} from "@/lib/notion"
import { sendEmail, financeRecipients } from "@/lib/email"
import { markDepositReceived, markInvoicePaid, createRentInvoice, sendInvoice, zohoEnabled } from "@/lib/zoho"
import { claimWebhookEvent } from "@/lib/webhook-dedupe"
import { lateFeeForDay, istDayOfMonth, istMonth, LATE_FEE_PER_DAY } from "@/lib/dunning"
import { recordPayment } from "@/lib/ledger"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

// Auto-debit policy: Razorpay retries a failed charge on its own schedule; we
// count every failed attempt (subscription.pending fires per attempt) and on
// the 5th failure apply a late fee + issue a one-off payment link.
// Late fee: rent is payable at the agreed tariff up to the 3rd of the month;
// from the 4th, ₹500 per day applies (4th = ₹500, …), CAPPED at ₹3,500 (day 10).
// The fee math lives in @/lib/dunning so the webhook and cron can never diverge.
const MAX_CHARGE_FAILURES = 5

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`

// The month the debt is FOR (YYYY-MM). Derived from the subscription's current
// billing-period start when available (+4 days pushes a T−2 anchor into the
// month it pays for); falls back to the current IST month. Prevents a 5th
// failure that lands after the rent month ends from mis-dating the debt.
function rentMonthForPeriod(periodStartTs?: number | null): string {
  if (periodStartTs) return new Date((periodStartTs + 4 * 86400) * 1000).toISOString().slice(0, 7)
  return istMonth()
}

// 5th failure (or Razorpay halting the subscription): late fee + payment link,
// "Rent Overdue" tag on the member page, guest + finance emails.
async function escalateOverdueRent({
  property, guestName, email, phone, monthlyRate, pageId, reason, periodStartTs,
}: {
  property: Property
  guestName: string
  email: string
  phone: string
  monthlyRate: number
  pageId: string | null
  reason: string
  periodStartTs?: number | null
}) {
  const { feeDays: daysLate, fee } = lateFeeForDay(istDayOfMonth())
  const total = monthlyRate + fee
  const feeLabel = daysLate > 0
    ? `Late Fee ${inr(fee)} (${daysLate} day${daysLate === 1 ? "" : "s"} @ ${inr(LATE_FEE_PER_DAY)}/day)`
    : "No late fee yet"
  const rentMonth = rentMonthForPeriod(periodStartTs)

  // Tag the member as overdue FIRST, so a racing/retried subscription.pending
  // sees `alreadyOverdue` and won't escalate again (double link / double fee
  // email). Only then create + store the payment link.
  if (pageId) await markRentOverdue(pageId)

  const link = await createRentPaymentLink({
    property,
    guestName,
    email,
    phone,
    amount: total,
    description: daysLate > 0 ? `Overdue Rent ${inr(monthlyRate)} + ${feeLabel}` : `Overdue Rent ${inr(monthlyRate)}`,
    notionPageId: pageId ?? undefined,
    rentMonth,
  })

  if (pageId) {
    // Hand the episode to the daily dunning cron: it cancels & reissues this
    // link with the growing late fee from the 4th and defaults on the 10th.
    await setDueRentLink(pageId, link.id, monthlyRate)
  }

  if (email) {
    try {
      await sendEmail({
        to: email,
        subject: `Action required — rent overdue, late fee accruing`,
        html: `<p>Hi ${guestName},</p>
<p>Your monthly rent auto-debit could not be completed after repeated attempts. As per your agreement, a late fee of ${inr(LATE_FEE_PER_DAY)} per day applies from the 4th of the month:</p>
<p>Rent: <strong>${inr(monthlyRate)}</strong><br/>Late fee (${daysLate} day${daysLate === 1 ? "" : "s"} so far): <strong>${inr(fee)}</strong><br/>Total due today: <strong>${inr(total)}</strong></p>
<p><a href="${link.short_url}">Pay now</a></p>
<p>The late fee continues to grow by ${inr(LATE_FEE_PER_DAY)} each day — please clear this today to avoid further charges.</p>`,
      })
    } catch (e) { console.error("[webhook] overdue guest email failed:", e) }
  }

  const financeTo = financeRecipients()
  if (financeTo.length) {
    try {
      await sendEmail({
        to: financeTo,
        subject: `Rent overdue — ${guestName} (${property})`,
        html: `<p>Auto-debit failed for <strong>${guestName}</strong> (${property}) — ${reason}.</p>
<p>${feeLabel}; payment link for ${inr(total)} sent to ${email || "guest"}. If payment slips further, the link amount will be stale (fee accrues ${inr(LATE_FEE_PER_DAY)}/day) — reissue from the admin payments page with a custom amount.</p>
<p>Link: <a href="${link.short_url}">${link.short_url}</a></p>`,
      })
    } catch (e) { console.error("[webhook] overdue finance email failed:", e) }
  }

  console.log("[webhook] overdue rent escalated:", { guestName, total, linkId: link.id, reason })
}

export async function POST(req: Request) {
  const rawBody   = await req.text()
  const signature = req.headers.get("x-razorpay-signature") ?? ""

  // Each property has its own Razorpay account, so a delivery may be signed
  // with either account's secret — try both. Accepting only Plaza's would 401
  // every Peepal webhook, i.e. the guest pays but nothing is ever recorded.
  const secretPlaza  = process.env.RZP_WEBHOOK_SECRET_PLAZA  ?? ""
  const secretPeepal = process.env.RZP_WEBHOOK_SECRET_PEEPAL ?? ""

  const valid =
    (secretPlaza  && verifyWebhookSignature(rawBody, signature, secretPlaza)) ||
    (secretPeepal && verifyWebhookSignature(rawBody, signature, secretPeepal))

  if (!valid) {
    console.warn("[webhook] Invalid signature")
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: { event: string; payload: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 })
  }

  // Idempotency: skip a duplicate delivery (Razorpay retries on non-2xx). Ack
  // with 200 so Razorpay stops retrying a payload we've already handled.
  const eventId = req.headers.get("x-razorpay-event-id")
  if (!(await claimWebhookEvent(eventId, event.event))) {
    console.log("[webhook] duplicate delivery skipped:", event.event, eventId)
    return NextResponse.json({ received: true, duplicate: true })
  }

  console.log("[webhook] event:", event.event)

  switch (event.event) {

    // ── Deposit paid via payment link ──────────────────────────────────────
    case "payment_link.paid": {
      const pl = event.payload as {
        payment_link?: { entity?: { notes?: Record<string, string>; amount?: number } }
        payment?:      { entity?: { id?: string; created_at?: number } }
      }

      const notes          = pl.payment_link?.entity?.notes ?? {}
      const notionPageId   = notes["notion_page_id"]
      const zohoRetainerId = notes["zoho_retainer_id"]
      const property       = (notes["property"] ?? "") as Property
      const paymentType    = notes["type"] ?? "security_deposit"
      const paidAmount     = (pl.payment_link?.entity?.amount ?? 0) / 100
      const paymentRef     = pl.payment?.entity?.id ?? ""
      const paymentDate    = pl.payment?.entity?.created_at
        ? new Date(pl.payment.entity.created_at * 1000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      // Capture the payment so a later refund (cancellation / deposit at
      // checkout) can target the right payment id.
      if (paymentRef) {
        try {
          await recordPayment({
            paymentId: paymentRef, notionPageId: notionPageId ?? null, property,
            type: paymentType, amount: paidAmount, email: notes["guest_email"], guestName: notes["guest_name"],
          })
        } catch (e) { console.error("[webhook] recordPayment (link) failed:", e) }
      }

      if (notionPageId && paymentType === "security_deposit") {
        try {
          await markDepositPaid(notionPageId)
          console.log("[webhook] deposit marked paid in Notion:", notionPageId)
        } catch (e) { console.error("[webhook] Notion update failed:", e) }

        // Confirm the bed as Occupied. Safe no-op
        // if notionPageId is a guest-info page rather than a bed page.
        try {
          await confirmBedOccupied(notionPageId)
        } catch (e) { console.error("[webhook] confirmBedOccupied failed:", e) }

        // Hardening: also flip the booking page Status to "Booking confirmed".
        // The "Status" select always exists (set to "Deposit Pending" at booking),
        // so the wizard's payment-status poll can detect Paid even if the booking
        // DB lacks a "Deposit Paid ✓" checkbox. Best-effort.
        try {
          await markGuestStatus(notionPageId, "Booking confirmed")
        } catch (e) { console.error("[webhook] markGuestStatus failed:", e) }

        // NOW the room gets blocked: the bed is assigned only once the deposit
        // is actually paid ("if the deposit is not paid the room is not
        // blocked"). First paid deposit wins the bed; a still-occupied room
        // (future-dated booking) defers to ops at turnover.
        try {
          const result = await assignBedForBooking(notionPageId)
          console.log("[webhook] bed assignment on deposit payment:", result, notionPageId)
        } catch (e) { console.error("[webhook] assignBedForBooking failed:", e) }
      }

      // A paid rent link (overdue reissue, final pro-rated month, or a manual
      // portal payment) closes any dunning episode: failure counter to 0,
      // Overdue/Defaulted tags dropped, stored link cleared.
      if (notionPageId && (paymentType === "rent" || paymentType === "pro_rated_rent")) {
        try {
          await clearRentDunningState(notionPageId)
          console.log("[webhook] rent link paid — dunning state cleared:", notionPageId)
        } catch (e) { console.error("[webhook] clearRentDunningState failed:", e) }
      }

      // Loop in finance on link payments (Phase 4.5).
      const financeTo = financeRecipients()
      if (financeTo.length) {
        const guestName = notes["guest_name"] ?? "Guest"
        const paymentLabel = paymentType === "security_deposit" ? "Security deposit" : "Rent (payment link)"
        try {
          await sendEmail({
            to: financeTo,
            subject: `${paymentLabel} received — ${guestName} (${property})`,
            html: `<p>${paymentLabel} of ₹${paidAmount.toLocaleString("en-IN")} received from <strong>${guestName}</strong> (${property}).</p><p>Payment ref: ${paymentRef}</p>`,
          })
        } catch (e) { console.error("[webhook] finance notify failed:", e) }
      }

      if (zohoEnabled(property) && zohoRetainerId) {
        try {
          await markDepositReceived({ property, retainerInvoiceId: zohoRetainerId, amount: paidAmount, paymentDate, reference: paymentRef })
          console.log("[webhook] Zoho retainer marked paid:", zohoRetainerId)
        } catch (e) { console.error("[webhook] Zoho deposit update failed:", e) }
      }
      break
    }

    // ── Deposit link expired — the 25-minute payment window lapsed ─────────
    // The booking is void: mark it Expired (frees the room window + lets the
    // guest restart), and cancel the sibling rent link and the unauthorised
    // subscription so nothing orphaned can still be paid.
    case "payment_link.expired": {
      const pl = event.payload as {
        payment_link?: { entity?: { notes?: Record<string, string> } }
      }
      const notes        = pl.payment_link?.entity?.notes ?? {}
      const notionPageId = notes["notion_page_id"]
      const property     = (notes["property"] ?? "safina-plaza") as Property
      const paymentType  = notes["type"] ?? ""

      if (notionPageId && paymentType === "security_deposit") {
        try {
          await markGuestStatus(notionPageId, "Expired")
          console.log("[webhook] deposit window lapsed — booking expired:", notionPageId)
        } catch (e) { console.error("[webhook] markGuestStatus (expired) failed:", e) }

        const ids = await getBookingRazorpayIds(notionPageId)
        if (ids.prorated) await cancelPaymentLink(property, ids.prorated)
        if (ids.subscription) await cancelSubscription(property, ids.subscription)
      }
      break
    }

    // ── Monthly rent collected via subscription ────────────────────────────
    case "subscription.charged": {
      const sc = event.payload as {
        subscription?: { entity?: { notes?: Record<string, string>; current_start?: number; current_end?: number; paid_count?: number } }
        payment?:      { entity?: { id?: string; amount?: number; created_at?: number } }
      }

      const notes       = sc.subscription?.entity?.notes ?? {}
      const property    = (notes["property"] ?? "") as Property
      const guestName   = notes["guest_name"]  ?? ""
      const email       = notes["guest_email"] ?? ""
      const phone       = notes["guest_phone"] ?? ""
      const monthlyRate = parseFloat(notes["monthly_rate"] ?? "0")
      const zohoInvId   = notes["zoho_invoice_id"] ?? ""  // month-1 invoice (already sent at check-in)
      const paidAmount  = (sc.payment?.entity?.amount ?? 0) / 100
      const paymentRef  = sc.payment?.entity?.id ?? ""
      const paymentTs   = sc.payment?.entity?.created_at
      const paymentDate = paymentTs
        ? new Date(paymentTs * 1000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      console.log("[webhook] subscription charged:", { property, guestName, monthlyRate, paymentDate })

      if (paymentRef) {
        try {
          await recordPayment({ paymentId: paymentRef, notionPageId: null, property, type: "rent", amount: paidAmount || monthlyRate, email, guestName })
        } catch (e) { console.error("[webhook] recordPayment (sub) failed:", e) }
      }

      // A successful charge closes any overdue episode: zero the failure
      // counter and drop the "Rent Overdue" tag.
      if (email) {
        try { await resetRentChargeFailures(email) }
        catch (e) { console.error("[webhook] resetRentChargeFailures failed:", e) }
      }

      if (!zohoEnabled(property)) break

      // Determine billing cycle number from `paid_count` (this charge's ordinal;
      // 1 on the first successful debit). The old check used `!current_end`, but
      // Razorpay sets current_end on EVERY charge including the first, so month-1
      // was never detected — it double-invoiced month 1 and left the check-in
      // invoice unpaid in Zoho. First charge → just mark the check-in invoice paid.
      const paidCount = sc.subscription?.entity?.paid_count
      const isMonth1 = !!zohoInvId && paidCount === 1

      if (isMonth1 && zohoInvId) {
        // First charge: just mark the invoice we created at check-in as paid
        try {
          await markInvoicePaid({ property, invoiceId: zohoInvId, amount: paidAmount, paymentDate, reference: paymentRef })
          console.log("[webhook] Zoho month-1 invoice marked paid:", zohoInvId)
        } catch (e) { console.error("[webhook] Zoho invoice mark-paid failed:", e) }
      } else if (email && guestName && monthlyRate > 0) {
        // Month 2 onwards: create a fresh invoice, mark it paid, send GST PDF to guest.
        // The debit anchors 2 days before the rent month, so the rent month is
        // derived from the billing-period start (+4 days pushes a late-month
        // anchor into the month it pays for; a legacy 1st-of-month anchor
        // stays in its own month). Falls back to the payment date.
        const periodStartTs = sc.subscription?.entity?.current_start ?? paymentTs
        const rentMonth = periodStartTs
          ? new Date((periodStartTs + 4 * 86400) * 1000).toISOString().slice(0, 7)
          : paymentDate.slice(0, 7)
        try {
          const invoice = await createRentInvoice({
            property,
            guestName,
            email,
            phone,
            amount:      paidAmount || monthlyRate,
            checkInDate: paymentDate,
            description: `Monthly Rent — ${rentMonth}`,
          })
          await markInvoicePaid({ property, invoiceId: invoice.invoice_id, amount: paidAmount || monthlyRate, paymentDate, reference: paymentRef })
          await sendInvoice(property, invoice.invoice_id)
          console.log("[webhook] Zoho monthly invoice created + paid + sent:", invoice.invoice_number)
        } catch (e) { console.error("[webhook] Zoho monthly invoice failed:", e) }
      }
      break
    }

    // ── Rent auto-debit attempt failed (Razorpay will keep retrying) ───────
    // Fires once per failed charge attempt while the subscription is pending.
    case "subscription.pending": {
      const sp = event.payload as {
        subscription?: { entity?: { id?: string; notes?: Record<string, string>; current_start?: number } }
      }
      const notes       = sp.subscription?.entity?.notes ?? {}
      const periodStart = sp.subscription?.entity?.current_start ?? null
      const property    = (notes["property"] ?? "safina-plaza") as Property
      const guestName   = notes["guest_name"]  ?? "Guest"
      const email       = notes["guest_email"] ?? ""
      const phone       = notes["guest_phone"] ?? ""
      const monthlyRate = parseFloat(notes["monthly_rate"] ?? "0")

      if (!email || monthlyRate <= 0) {
        console.warn("[webhook] subscription.pending without guest notes; cannot track failure")
        break
      }

      let count: number | null = null
      let pageId: string | null = null
      let alreadyOverdue = false
      try {
        ({ count, pageId, alreadyOverdue } = await recordRentChargeFailure(email))
      } catch (e) { console.error("[webhook] recordRentChargeFailure failed:", e) }

      console.log("[webhook] rent charge failed:", { guestName, count, alreadyOverdue })

      // Escalation already ran for this overdue episode — don't send another link.
      if (alreadyOverdue) break

      if (count !== null && count >= MAX_CHARGE_FAILURES) {
        try {
          await escalateOverdueRent({ property, guestName, email, phone, monthlyRate, pageId, reason: `${count} consecutive failed charge attempts`, periodStartTs: periodStart })
        } catch (e) { console.error("[webhook] escalateOverdueRent failed:", e) }
        break
      }

      // Attempts 1–4: warn the guest that the debit failed and will be retried.
      // If counting is unavailable (count === null), still warn; escalation then
      // rides on subscription.halted instead.
      try {
        const attemptNote = count !== null
          ? `attempt ${count} of ${MAX_CHARGE_FAILURES}`
          : "we will retry automatically"
        await sendEmail({
          to: email,
          subject: `Rent auto-debit failed — we'll retry`,
          html: `<p>Hi ${guestName},</p>
<p>We couldn't collect your monthly rent of <strong>${inr(monthlyRate)}</strong> via auto-debit (${attemptNote}). Razorpay will retry automatically — please ensure your account has sufficient balance and the mandate is active.</p>
<p>If the debit keeps failing, a late fee of ${inr(LATE_FEE_PER_DAY)} per day (from the 4th of the month) will apply and you'll receive a payment link instead.</p>`,
        })
      } catch (e) { console.error("[webhook] retry-warning email failed:", e) }
      break
    }

    // ── Razorpay exhausted its retries → subscription halted ───────────────
    // Backstop: if the 5th-failure escalation didn't run (e.g. the counter
    // property is missing in Notion), escalate now.
    case "subscription.halted": {
      const sh = event.payload as {
        subscription?: { entity?: { id?: string; notes?: Record<string, string>; current_start?: number } }
      }
      const notes       = sh.subscription?.entity?.notes ?? {}
      const periodStart = sh.subscription?.entity?.current_start ?? null
      const property    = (notes["property"] ?? "safina-plaza") as Property
      const guestName   = notes["guest_name"]  ?? "Guest"
      const email       = notes["guest_email"] ?? ""
      const phone       = notes["guest_phone"] ?? ""
      const monthlyRate = parseFloat(notes["monthly_rate"] ?? "0")
      const subId       = sh.subscription?.entity?.id ?? ""

      let pageId: string | null = null
      let alreadyOverdue = false
      try {
        ({ pageId, alreadyOverdue } = await getRentOverdueState(email))
      } catch (e) { console.error("[webhook] getRentOverdueState failed:", e) }

      if (!alreadyOverdue && email && monthlyRate > 0) {
        try {
          await escalateOverdueRent({ property, guestName, email, phone, monthlyRate, pageId, reason: "subscription halted after Razorpay exhausted retries", periodStartTs: periodStart })
        } catch (e) { console.error("[webhook] escalateOverdueRent (halted) failed:", e) }
      }

      // Finance always needs to know the mandate stopped — future months won't
      // auto-charge until the subscription is resumed or recreated.
      const financeTo = financeRecipients()
      if (financeTo.length) {
        try {
          await sendEmail({
            to: financeTo,
            subject: `Subscription halted — ${guestName} (${property})`,
            html: `<p>Razorpay subscription <strong>${subId}</strong> for <strong>${guestName}</strong> is halted; auto-debit has stopped and future months will NOT charge automatically. Resume the mandate or issue manual links from the admin payments page.</p>`,
          })
        } catch (e) { console.error("[webhook] halted finance email failed:", e) }
      }
      break
    }

    // ── Payment failed or refunded → revert the room allotment ─────────────
    // Refunds are manual-from-our-side only; if Razorpay refunds a failed
    // payment, the bed must go back to Vacant so it isn't held by a non-paying
    // booking. revertBedAllotment only undoes the same guest's hold and no-ops
    // on non-bed pages, so a settled tenant is never evicted.
    case "payment.failed":
    case "refund.created":
    case "refund.processed": {
      const p = event.payload as {
        payment?:        { entity?: { notes?: Record<string, string>; email?: string; invoice_id?: string | null; recurring?: boolean | string } }
        payment_link?:   { entity?: { notes?: Record<string, string> } }
        refund?:         { entity?: { notes?: Record<string, string> } }
      }
      const notes =
        p.refund?.entity?.notes ??
        p.payment?.entity?.notes ??
        p.payment_link?.entity?.notes ??
        {}

      // A failed monthly subscription charge must NOT revert the tenant's bed —
      // they live here; dunning is handled by subscription.pending/halted above.
      // Link payments carry our notes.type; recurring charges carry an invoice
      // id / recurring flag and none of our link types.
      if (event.event === "payment.failed") {
        const linkType = notes["type"] ?? ""
        const isLinkPayment = ["security_deposit", "pro_rated_rent", "rent"].includes(linkType)
        const rec = p.payment?.entity?.recurring
        const isRecurringCharge = !!p.payment?.entity?.invoice_id || rec === true || rec === "1"
        if (!isLinkPayment && isRecurringCharge) {
          console.log("[webhook] payment.failed for a subscription charge — skipping bed revert")
          break
        }
      }
      const notionPageId = notes["notion_page_id"]
      const guestName    = notes["guest_name"]
      // Razorpay refund/payment.failed events usually DON'T carry the original
      // payment-link's notes, so fall back to the payer's email to find the bed.
      const payerEmail   = p.payment?.entity?.email ?? ""

      try {
        let reverted = false
        if (notionPageId) {
          reverted = await revertBedAllotment(notionPageId, guestName)
        }
        if (!reverted && payerEmail) {
          reverted = await revertBedAllotmentByEmail(payerEmail, guestName)
        }
        console.log(`[webhook] ${event.event}: bed allotment ${reverted ? "reverted to Vacant" : "not reverted (no matching bed hold)"}`)
        if (!reverted && !notionPageId && !payerEmail) {
          console.warn(`[webhook] ${event.event}: no notion_page_id or payer email; cannot revert allotment`)
        }
      } catch (e) { console.error("[webhook] revert allotment failed:", e) }
      break
    }

    default:
      console.log("[webhook] unhandled event:", event.event)
  }

  return NextResponse.json({ received: true })
}
