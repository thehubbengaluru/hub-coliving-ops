import { NextResponse } from "next/server"
import { verifyWebhookSignature } from "@/lib/razorpay"
import { markDepositPaid, confirmBedOccupied, revertBedAllotment, revertBedAllotmentByEmail, markGuestStatus } from "@/lib/notion"
import { sendEmail, financeRecipients } from "@/lib/email"
import { markDepositReceived, markInvoicePaid, createRentInvoice, sendInvoice, zohoEnabled } from "@/lib/zoho"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const rawBody   = await req.text()
  const signature = req.headers.get("x-razorpay-signature") ?? ""

  const secretPlaza  = process.env.RZP_WEBHOOK_SECRET_PLAZA  ?? ""
  const secretPeepal = process.env.RZP_WEBHOOK_SECRET_PEEPAL ?? ""

  const valid =
    (secretPlaza  && verifyWebhookSignature(rawBody, signature, secretPlaza))  ||
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

      if (notionPageId && paymentType === "security_deposit") {
        try {
          await markDepositPaid(notionPageId)
          console.log("[webhook] deposit marked paid in Notion:", notionPageId)
        } catch (e) { console.error("[webhook] Notion update failed:", e) }

        // Confirm the bed as Occupied (Peepal: Incoming → Occupied). Safe no-op
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
      }

      // Loop in finance on deposit receipt (Phase 4.5).
      const financeTo = financeRecipients()
      if (financeTo.length) {
        const guestName = notes["guest_name"] ?? "Guest"
        try {
          await sendEmail({
            to: financeTo,
            subject: `Deposit received — ${guestName} (${property})`,
            html: `<p>Security deposit of ₹${paidAmount.toLocaleString("en-IN")} received from <strong>${guestName}</strong> (${property}).</p><p>Payment ref: ${paymentRef}</p>`,
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

    // ── Monthly rent collected via subscription ────────────────────────────
    case "subscription.charged": {
      const sc = event.payload as {
        subscription?: { entity?: { notes?: Record<string, string>; current_end?: number } }
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

      if (!zohoEnabled(property)) break

      // Determine billing cycle number — current_end tells us which month this charge covers.
      // If current_end is set, this is month 2+; if not (edge case), fall back to marking
      // the original invoice paid.
      const isMonth1 = !!zohoInvId && !sc.subscription?.entity?.current_end

      if (isMonth1 && zohoInvId) {
        // First charge: just mark the invoice we created at check-in as paid
        try {
          await markInvoicePaid({ property, invoiceId: zohoInvId, amount: paidAmount, paymentDate, reference: paymentRef })
          console.log("[webhook] Zoho month-1 invoice marked paid:", zohoInvId)
        } catch (e) { console.error("[webhook] Zoho invoice mark-paid failed:", e) }
      } else if (email && guestName && monthlyRate > 0) {
        // Month 2 onwards: create a fresh invoice, mark it paid, send GST PDF to guest
        try {
          const invoice = await createRentInvoice({
            property,
            guestName,
            email,
            phone,
            amount:      paidAmount || monthlyRate,
            checkInDate: paymentDate,
            description: `Monthly Rent — ${paymentDate.slice(0, 7)}`,
          })
          await markInvoicePaid({ property, invoiceId: invoice.invoice_id, amount: paidAmount || monthlyRate, paymentDate, reference: paymentRef })
          await sendInvoice(property, invoice.invoice_id)
          console.log("[webhook] Zoho monthly invoice created + paid + sent:", invoice.invoice_number)
        } catch (e) { console.error("[webhook] Zoho monthly invoice failed:", e) }
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
        payment?:        { entity?: { notes?: Record<string, string>; email?: string } }
        payment_link?:   { entity?: { notes?: Record<string, string> } }
        refund?:         { entity?: { notes?: Record<string, string> } }
      }
      const notes =
        p.refund?.entity?.notes ??
        p.payment?.entity?.notes ??
        p.payment_link?.entity?.notes ??
        {}
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
