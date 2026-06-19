import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"
import { revertBedAllotmentByEmail } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const { notionPageId, email } = await req.json()
    if (!notionPageId || !email) {
      return NextResponse.json({ error: "Missing notionPageId or email" }, { status: 400 })
    }

    const notion = new Client({ auth: process.env.NOTION_TOKEN })

    // Read the booking page to verify it's in a cancellable state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const page = await notion.pages.retrieve({ page_id: notionPageId }) as any
    const statusProp = page.properties?.["Status"]
    const status = statusProp?.type === "select" ? (statusProp.select?.name ?? "") : ""
    if (/cancelled/i.test(status)) {
      return NextResponse.json({ error: "This booking is already cancelled." }, { status: 400 })
    }

    // Check check-in date — must be in the future
    const checkInProp = page.properties?.["Check In Date"]
    const checkInDate = checkInProp?.type === "date" ? checkInProp.date?.start : null
    if (checkInDate) {
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const cin = new Date(checkInDate + "T00:00:00")
      if (cin <= today) {
        return NextResponse.json({ error: "Cannot cancel a booking after check-in has occurred." }, { status: 400 })
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

    return NextResponse.json({
      ok: true,
      message: "Your booking has been cancelled. A cancellation fee of ₹3,500 will be deducted from your security deposit refund. The refund will be processed within 7 working days.",
    })
  } catch (err) {
    console.error("[portal/cancel-booking]", err)
    return NextResponse.json({ error: "Failed to cancel booking" }, { status: 500 })
  }
}
