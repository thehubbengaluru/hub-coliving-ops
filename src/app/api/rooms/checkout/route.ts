import { NextResponse } from "next/server"
import { checkOutGuest, syncGuestToAlumni } from "@/lib/notion"
import { computeRefundDueDate } from "@/lib/dates"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const {
      notionPageId, property, checkOutDate, roomNumber, bedLabel, roomType,
      noticePeriodLastDate, checkedOutBy, damagesNote, checklist,
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

    return NextResponse.json({ ok: true, alumniPageId, refundDueDate })
  } catch (err) {
    console.error("[api/rooms/checkout]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
