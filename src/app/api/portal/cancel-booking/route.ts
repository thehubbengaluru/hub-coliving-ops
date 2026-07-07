import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"
import { revertBedAllotmentByEmail } from "@/lib/notion"
import { requirePortalGuest, authErrorResponse } from "@/lib/auth/api-guards"
import { totalPaidFor, largestPaymentFor, queueRefund } from "@/lib/ledger"
import { computeRefundDueDate } from "@/lib/dates"
import {
  canCancelBooking, cancellationCutoffISO, CANCELLATION_NOTICE_DAYS,
  CANCELLATION_REFUND_FRACTION, istTodayISO,
} from "@/lib/stay"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    // Auth: a valid guest session is required, and the session email must own
    // the booking being cancelled (prevents cancelling anyone else's booking).
    const { email: sessionEmail } = await requirePortalGuest()

    const { notionPageId } = await req.json()
    if (!notionPageId) {
      return NextResponse.json({ error: "Missing notionPageId" }, { status: 400 })
    }

    const notion = new Client({ auth: process.env.NOTION_TOKEN })

    // Read the booking page to verify it's in a cancellable state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await notion.pages.retrieve({ page_id: notionPageId }) as any

    // Ownership: the page's email must equal the authenticated session email.
    const pageEmailProp = page.properties?.["✉️ Email"] ?? page.properties?.["Email"]
    const pageEmail = pageEmailProp?.type === "email" ? (pageEmailProp.email ?? "") : ""
    if (!pageEmail || pageEmail.trim().toLowerCase() !== sessionEmail) {
      return NextResponse.json({ error: "This booking is not associated with your account." }, { status: 403 })
    }
    const email = pageEmail

    const statusProp = page.properties?.["Status"]
    const status = statusProp?.type === "select" ? (statusProp.select?.name ?? "") : ""
    if (/cancelled/i.test(status)) {
      return NextResponse.json({ error: "This booking is already cancelled." }, { status: 400 })
    }

    // Cancellation is only possible 31+ days before check-in. Within that
    // window (or after check-in) it is locked — no cancellation, no refund.
    const checkInProp = page.properties?.["Check In Date"]
    const checkInDate = checkInProp?.type === "date" ? checkInProp.date?.start : null
    if (checkInDate) {
      const todayISO = istTodayISO()
      if (!canCancelBooking(checkInDate, todayISO)) {
        const cutoff = new Date(cancellationCutoffISO(checkInDate) + "T00:00:00")
          .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
        return NextResponse.json({
          error: `Cancellations close ${CANCELLATION_NOTICE_DAYS} days before check-in (by ${cutoff}). This booking can no longer be cancelled and is non-refundable.`,
        }, { status: 400 })
      }
    }

    // Mark booking as Cancelled
    await notion.pages.update({
      page_id: notionPageId,
      properties: { Status: { select: { name: "Cancelled" } } },
    })

    // Revert the bed back to Vacant on the room board
    try {
      await revertBedAllotmentByEmail(email, undefined)
    } catch (e) {
      console.warn("[cancel-booking] Bed revert failed:", e)
    }

    // Queue the cancellation refund (50% of everything paid) for an admin to
    // review + issue. The source payment is the largest captured payment for
    // this booking (Razorpay refunds target a specific payment).
    let refundAmount = 0
    try {
      const guestName = page.properties?.["🧑‍💼 Guest Name"]?.type === "title"
        ? page.properties["🧑‍💼 Guest Name"].title.map((t: { plain_text: string }) => t.plain_text).join("").trim()
        : ""
      const totalPaid = await totalPaidFor(notionPageId)
      refundAmount = Math.round(totalPaid * CANCELLATION_REFUND_FRACTION)
      if (refundAmount > 0) {
        const src = await largestPaymentFor(notionPageId)
        await queueRefund({
          notionPageId, guestName, guestEmail: email, property: "safina-plaza",
          kind: "cancellation", gross: refundAmount, paymentId: src?.paymentId ?? null,
          reason: `Cancellation ≥${CANCELLATION_NOTICE_DAYS}d before check-in — ${Math.round(CANCELLATION_REFUND_FRACTION * 100)}% of ₹${totalPaid.toLocaleString("en-IN")} paid`,
          dueDate: computeRefundDueDate(istTodayISO(), null),
        })
      }
    } catch (e) {
      console.error("[cancel-booking] refund queue failed:", e)
    }

    return NextResponse.json({
      ok: true,
      message: `Your booking has been cancelled. As it was cancelled ${CANCELLATION_NOTICE_DAYS}+ days before check-in, ${Math.round(CANCELLATION_REFUND_FRACTION * 100)}% of the total amount paid${refundAmount ? ` (₹${refundAmount.toLocaleString("en-IN")})` : ""} will be refunded within 7 working days; the remaining ${Math.round((1 - CANCELLATION_REFUND_FRACTION) * 100)}% is the cancellation fee.`,
    })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[portal/cancel-booking]", err)
    return NextResponse.json({ error: "Failed to cancel booking" }, { status: 500 })
  }
}
