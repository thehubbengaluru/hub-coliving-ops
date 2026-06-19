import { NextResponse } from "next/server"
import { createRentSubscription } from "@/lib/razorpay"
import { getGuestContact, markSubscriptionCreated } from "@/lib/notion"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const { notionPageId, property, monthlyRate, guestName } = await req.json() as {
      notionPageId: string
      property: Property
      monthlyRate: number
      guestName: string
    }

    if (!notionPageId || !property || !monthlyRate || !guestName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const { email, phone } = await getGuestContact(notionPageId)

    if (!phone) {
      return NextResponse.json({ error: "Guest has no phone number in Notion" }, { status: 422 })
    }

    const sub = await createRentSubscription({
      property,
      guestName,
      email: email ?? "",
      phone,
      monthlyRate,
    })

    // Record on the member page so we don't create a duplicate later.
    await markSubscriptionCreated(notionPageId, sub.id)

    return NextResponse.json({ id: sub.id, url: sub.short_url, status: sub.status, planId: sub.plan_id })
  } catch (err) {
    console.error("[api/razorpay/subscription]", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
