import { NextResponse } from "next/server"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { Client } from "@notionhq/client"
import { checkOutGuest, syncGuestToAlumni, setDepositStatus } from "@/lib/notion"
import { computeRefundDueDate } from "@/lib/dates"
import { depositPaymentByEmail, queueRefund, type Deduction } from "@/lib/ledger"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

const MAINTENANCE_FEE = 2000 // one-time, strictly non-refundable

export async function POST(req: Request) {
  try {
    await requireAdminApi()

    const {
      notionPageId, property, checkOutDate, roomNumber, bedLabel, roomType,
      noticePeriodLastDate, checkedOutBy, damagesNote, checklist,
      deductions, depositForfeited,
    } = await req.json() as {
      notionPageId: string
      property: Property
      checkOutDate: string
      roomNumber?: string
      bedLabel?: string | null
      roomType?: "private" | "sharing"
      noticePeriodLastDate?: string | null
      checkedOutBy?: string
      damagesNote?: string
      checklist?: { label: string; checked: boolean }[]
      deductions?: Deduction[]   // reviewed damage/dues deductions from deposit
      depositForfeited?: boolean  // eviction/abandonment — no refund, forfeit
    }

    // Manual checkout requires team confirmation: all checklist items ticked.
    if (checklist && checklist.some((c) => !c.checked)) {
      return NextResponse.json(
        { error: "Complete every check-out checklist item before checking the guest out." },
        { status: 400 },
      )
    }

    // Deposit refund is due 7 working days after whichever is later:
    // the actual checked-out date or the notice-period last date.
    const refundDueDate = computeRefundDueDate(checkOutDate, noticePeriodLastDate)
    const checklistSummary = checklist?.map((c) => `${c.checked ? "☑" : "☐"} ${c.label}`).join("\n")

    // 1. Archive to Alumni DB first (reads the page before it's cleared).
    //    If this throws, we abort BEFORE clearing the bed so the guest is
    //    never lost — "nothing is deleted, only moved".
    const alumniPageId = await syncGuestToAlumni({
      notionPageId, property, checkOutDate, roomNumber, bedLabel, roomType,
      noticePeriodLastDate, refundDueDate, checkedOutBy, damagesNote, checklistSummary,
    })

    if (!alumniPageId) {
      return NextResponse.json(
        { error: "Alumni archive was not created; bed left unchanged to avoid losing the guest record." },
        { status: 500 },
      )
    }

    // 2. Only now clear the bed in the Members DB.
    await checkOutGuest({ notionPageId, property, checkOutDate })

    // 3. Deposit settlement. The refundable deposit is 1 month's tariff (the
    //    ₹2,000 maintenance fee is never refunded). On eviction/abandonment the
    //    deposit is forfeited; otherwise queue a refund (net of any reviewed
    //    deductions) for an admin to issue.
    let refund: { id: string; net: number } | null = null
    let depositStatus: "held" | "forfeited" = "held"
    try {
      const notion = new Client({ auth: process.env.NOTION_TOKEN })
      const member = await notion.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse
      const num = (k: string) => { const p = member.properties[k]; return p?.type === "number" ? (p.number ?? 0) : 0 }
      const emailProp = member.properties["Email"] ?? member.properties["✉️ Email"]
      const email = emailProp?.type === "email" ? (emailProp.email ?? "") : ""
      const nameProp = member.properties["Member Name"]
      const guestName = nameProp?.type === "title" ? nameProp.title.map((t) => t.plain_text).join("").trim() : ""
      const tariff = num("Monthly Rent") || num("Tariff") || num("Deposit Amount (₹)") - MAINTENANCE_FEE || 0
      const refundableDeposit = Math.max(0, tariff)

      if (depositForfeited) {
        await setDepositStatus(notionPageId, "forfeited")
        depositStatus = "forfeited"
      } else if (refundableDeposit > 0) {
        const src = email ? await depositPaymentByEmail(email) : null
        const row = await queueRefund({
          notionPageId, guestName, guestEmail: email, property,
          kind: "deposit", gross: refundableDeposit, deductions: deductions ?? [],
          paymentId: src?.paymentId ?? null, dueDate: refundDueDate, createdBy: checkedOutBy,
          reason: `Deposit refund at checkout${damagesNote ? ` — damages: ${damagesNote}` : ""}`,
        })
        await setDepositStatus(notionPageId, "held")
        if (row) refund = { id: row.id, net: row.net_amount }
      }
    } catch (e) {
      console.error("[checkout] deposit settlement failed:", e)
    }

    return NextResponse.json({ ok: true, alumniPageId, refundDueDate, refund, depositStatus })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/rooms/checkout]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
