import { NextResponse } from "next/server"
import { checkInGuest, BedOccupiedError } from "@/lib/notion"
import { createDepositLink, createRentSubscription } from "@/lib/razorpay"
import { computeRentSchedule } from "@/lib/rent-schedule"
import { createRentInvoice, sendInvoice, createDepositReceipt, zohoEnabled } from "@/lib/zoho"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    await requireAdminApi()

    const {
      notionPageId, property, guestName, gender,
      phone, email, checkInDate, checkOutDate, monthlyRate,
      sendDepositLink, createSubscription, depositAmount,
    } = await req.json() as {
      notionPageId:      string
      property:          Property
      guestName:         string
      gender:            "male" | "female"
      phone:             string
      email:             string
      checkInDate:       string
      checkOutDate?:     string
      monthlyRate:       number
      sendDepositLink:   boolean
      createSubscription: boolean
      depositAmount?:    number
    }

    // 1. Write to Notion
    await checkInGuest({ notionPageId, property, guestName, gender, phone, email, checkInDate, checkOutDate, monthlyRate })

    const results: Record<string, string> = {}

    // 2. Razorpay deposit payment link
    if (sendDepositLink && phone) {
      try {
        const depAmount = depositAmount ?? monthlyRate
        const link = await createDepositLink({
          property, guestName, email: email ?? "", phone, amount: depAmount,
          notionPageId,
        })
        results.depositLinkUrl = link.short_url
      } catch (e) {
        results.depositLinkError = e instanceof Error ? e.message : "Failed"
      }
    }

    // 3. Zoho Books — rent invoice FIRST, so its id can be embedded in the
    // subscription's notes (the webhook uses it to mark month-1 paid). Creating
    // the subscription before this left every mandate with zohoInvoiceId undefined.
    if (zohoEnabled(property) && email) {
      try {
        const invoice = await createRentInvoice({ property, guestName, email, phone, amount: monthlyRate, checkInDate })
        await sendInvoice(property, invoice.invoice_id)
        results.zohoInvoiceId     = invoice.invoice_id
        results.zohoInvoiceNumber = invoice.invoice_number
      } catch (e) {
        results.zohoInvoiceError = e instanceof Error ? e.message : "Failed"
        console.error("[checkin] Zoho invoice error:", e)
      }
    }

    // 4. Razorpay rent subscription — scheduled off the stay window so it
    // skips months collected outside the mandate (check-in month / bundled
    // stub) and stops at the check-out date. Skipped when no full months left.
    if (createSubscription && phone) {
      const schedule = computeRentSchedule(checkInDate, checkOutDate, monthlyRate)
      if (schedule.subscription) {
        try {
          const sub = await createRentSubscription({
            property, guestName, email: email ?? "", phone, monthlyRate,
            startISO: schedule.subscription.startISO,
            totalCount: schedule.subscription.cycles,
            zohoInvoiceId: results.zohoInvoiceId,
          })
          results.subscriptionUrl = sub.short_url
        } catch (e) {
          results.subscriptionError = e instanceof Error ? e.message : "Failed"
        }
      } else {
        results.subscriptionSkipped = "Stay is fully covered by upfront rent — no auto-debit months; collect any partial final month by payment link."
      }
    }

    // 5. Zoho Books — security deposit retainer + re-create Razorpay deposit link with Zoho ID embedded
    let zohoRetainerId: string | undefined
    if (zohoEnabled(property) && email && depositAmount) {
      try {
        const receipt     = await createDepositReceipt({ property, guestName, email, phone, amount: depositAmount, date: checkInDate })
        zohoRetainerId    = receipt.retainerinvoice_id
        results.zohoDepositId     = receipt.retainerinvoice_id
        results.zohoDepositNumber = receipt.retainerinvoice_number
      } catch (e) {
        results.zohoDepositError = e instanceof Error ? e.message : "Failed"
        console.error("[checkin] Zoho deposit error:", e)
      }
    }

    // Re-send deposit link with Zoho retainer ID embedded in notes (so webhook can mark it paid)
    if (sendDepositLink && phone && zohoRetainerId && !results.depositLinkUrl) {
      try {
        const depAmount = depositAmount ?? monthlyRate
        const link = await createDepositLink({ property, guestName, email: email ?? "", phone, amount: depAmount, notionPageId, zohoRetainerId })
        results.depositLinkUrl = link.short_url
      } catch (e) {
        results.depositLinkError = e instanceof Error ? e.message : "Failed"
      }
    }

    return NextResponse.json({ ok: true, ...results })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/rooms/checkin]", err)
    if (err instanceof BedOccupiedError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
