import { NextResponse } from "next/server"
import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import { requirePortalGuest, authErrorResponse } from "@/lib/auth/api-guards"
import { sendEmail, financeRecipients } from "@/lib/email"
import { istTodayISO } from "@/lib/stay"

export const dynamic = "force-dynamic"

const DS_PLAZA = process.env.NOTION_DS_PLAZA!

function daysBetween(aISO: string, bISO: string): number {
  return Math.round((new Date(bISO + "T00:00:00").getTime() - new Date(aISO + "T00:00:00").getTime()) / 86_400_000)
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00")
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// Self-serve reschedule of the CHECK-IN date, before arrival. Shifts check-out by
// the same delta so the booked duration is preserved. Only allowed pre-arrival
// (Deposit Pending / Booking confirmed). Because a shift can move which calendar
// months the rent covers, ops is emailed to re-align the payment links/mandate
// rather than the system silently reissuing them.
export async function PATCH(req: Request) {
  try {
    const { email: sessionEmail } = await requirePortalGuest()
    const { notionPageId, newCheckIn } = await req.json() as { notionPageId: string; newCheckIn: string }
    if (!notionPageId || !newCheckIn) {
      return NextResponse.json({ error: "Missing notionPageId or newCheckIn" }, { status: 400 })
    }
    if (newCheckIn < istTodayISO()) {
      return NextResponse.json({ error: "New check-in date can't be in the past." }, { status: 400 })
    }

    const notion = new Client({ auth: process.env.NOTION_TOKEN })
    const page = await notion.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse

    // Ownership.
    const ownerProp = page.properties["✉️ Email"] ?? page.properties["Email"]
    const ownerEmail = ownerProp?.type === "email" ? (ownerProp.email ?? "") : ""
    if (!ownerEmail || ownerEmail.trim().toLowerCase() !== sessionEmail) {
      return NextResponse.json({ error: "This booking is not associated with your account." }, { status: 403 })
    }

    // Pre-arrival only.
    const statusProp = page.properties["Status"]
    const status = statusProp?.type === "select" ? (statusProp.select?.name ?? "") : ""
    if (!/deposit pending|booking confirmed/i.test(status)) {
      return NextResponse.json({ error: "Rescheduling is only available before check-in. Contact the office for changes after arrival." }, { status: 400 })
    }

    const ciProp = page.properties["Check In Date"]
    const oldCheckIn = ciProp?.type === "date" ? (ciProp.date?.start ?? null) : null
    if (!oldCheckIn) return NextResponse.json({ error: "No check-in date on record — contact the office." }, { status: 422 })
    if (oldCheckIn < istTodayISO()) {
      return NextResponse.json({ error: "Your check-in has already passed and can't be rescheduled here." }, { status: 400 })
    }

    const rangeProp = page.properties["📅 Check-in & Check-out Date (Estimated)"]
    const oldCheckOut = rangeProp?.type === "date" ? (rangeProp.date?.end ?? null) : null
    const delta = daysBetween(oldCheckIn, newCheckIn)
    const newCheckOut = oldCheckOut ? addDays(oldCheckOut, delta) : null

    // Update the form page dates (preserving duration).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateProps: Record<string, any> = {
      "Check In Date": { date: { start: newCheckIn } },
    }
    if (rangeProp?.type === "date") {
      updateProps["📅 Check-in & Check-out Date (Estimated)"] = { date: { start: newCheckIn, ...(newCheckOut ? { end: newCheckOut } : {}) } }
    }
    await notion.pages.update({ page_id: notionPageId, properties: updateProps })

    // Best-effort: shift the bed-board dates too.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (notion.dataSources as any).query({
        data_source_id: DS_PLAZA, filter: { property: "Email", email: { equals: sessionEmail } }, page_size: 1,
      })
      const bed = res.results?.find((p: unknown) => isFullPage(p as PageObjectResponse))
      if (bed) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bedProps: Record<string, any> = { "Check In Date": { date: { start: newCheckIn } } }
        if (newCheckOut) bedProps["Check Out Date "] = { date: { start: newCheckOut } }
        await notion.pages.update({ page_id: bed.id, properties: bedProps })
      }
    } catch (e) {
      console.warn("[portal/reschedule] bed board update failed:", e)
    }

    // Flag ops to re-align payment links / mandate for the new months.
    const ops = financeRecipients()
    if (ops.length) {
      try {
        await sendEmail({
          to: ops,
          subject: `Reschedule — ${ownerEmail} moved check-in to ${newCheckIn}`,
          html: `<p><strong>${ownerEmail}</strong> rescheduled check-in from ${oldCheckIn} to <strong>${newCheckIn}</strong>${newCheckOut ? ` (check-out ${oldCheckOut} → ${newCheckOut})` : ""}. Review the deposit/upfront links and the auto-debit mandate — the covered months may have shifted.</p>`,
        })
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ ok: true, newCheckIn, newCheckOut, message: `Check-in moved to ${newCheckIn}. We'll confirm any payment updates by email.` })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[portal/reschedule]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to reschedule" }, { status: 500 })
  }
}
