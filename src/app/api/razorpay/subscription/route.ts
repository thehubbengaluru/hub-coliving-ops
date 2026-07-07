import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { createRentSubscription } from "@/lib/razorpay"
import { getGuestContact, markSubscriptionCreated } from "@/lib/notion"
import { computeRentSchedule } from "@/lib/rent-schedule"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

// Create OR resume a rent mandate for a member. This is the recovery path after
// a `subscription.halted` (Razorpay stopped auto-charging). Pass the stay dates
// so the resumed mandate runs only for the full months remaining to check-out;
// omit them for an open-ended mandate (legacy behaviour).
export async function POST(req: Request) {
  try {
    await requireAdminApi()

    const { notionPageId, property, monthlyRate, guestName, checkInDate, checkOutDate } = await req.json() as {
      notionPageId: string
      property: Property
      monthlyRate: number
      guestName: string
      checkInDate?: string
      checkOutDate?: string
    }

    if (!notionPageId || !property || !monthlyRate || !guestName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const { email, phone } = await getGuestContact(notionPageId)

    if (!phone) {
      return NextResponse.json({ error: "Guest has no phone number in Notion" }, { status: 422 })
    }

    // If dates are supplied, map the mandate to the remaining full months so it
    // stops itself at check-out (a partial final month is a cron link).
    const sched = checkInDate && checkOutDate
      ? computeRentSchedule(checkInDate, checkOutDate, monthlyRate).subscription
      : null
    if (checkInDate && checkOutDate && !sched) {
      return NextResponse.json({ error: "No full months remain — collect the final month by payment link, no mandate needed." }, { status: 422 })
    }

    const sub = await createRentSubscription({
      property,
      guestName,
      email: email ?? "",
      phone,
      monthlyRate,
      ...(sched ? { startISO: sched.startISO, totalCount: sched.cycles } : {}),
    })

    // Record on the member page so we don't create a duplicate later.
    await markSubscriptionCreated(notionPageId, sub.id)

    return NextResponse.json({ id: sub.id, url: sub.short_url, status: sub.status, planId: sub.plan_id })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/razorpay/subscription]", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
