import { NextResponse } from "next/server"
import { checkInGuest } from "@/lib/notion"
import { createDepositLink, createRentSubscription } from "@/lib/razorpay"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const {
      notionPageId, property, guestName, gender,
      phone, email, checkInDate, checkOutDate, monthlyRate,
      sendDepositLink, createSubscription,
    } = await req.json() as {
      notionPageId: string
      property: Property
      guestName: string
      gender: "male" | "female"
      phone: string
      email: string
      checkInDate: string
      checkOutDate?: string
      monthlyRate: number
      sendDepositLink: boolean
      createSubscription: boolean
    }

    // 1. Write to Notion
    await checkInGuest({ notionPageId, property, guestName, gender, phone, email, checkInDate, checkOutDate, monthlyRate })

    const results: Record<string, string> = {}

    // 2. Send deposit payment link
    if (sendDepositLink && phone) {
      try {
        const link = await createDepositLink({
          property, guestName, email: email ?? "", phone, amount: monthlyRate,
          notionPageId,
        })
        results.depositLinkUrl = link.short_url
      } catch (e) {
        results.depositLinkError = e instanceof Error ? e.message : "Failed"
      }
    }

    // 3. Create rent subscription
    if (createSubscription && phone) {
      try {
        const sub = await createRentSubscription({ property, guestName, email: email ?? "", phone, monthlyRate })
        results.subscriptionUrl = sub.short_url
      } catch (e) {
        results.subscriptionError = e instanceof Error ? e.message : "Failed"
      }
    }

    return NextResponse.json({ ok: true, ...results })
  } catch (err) {
    console.error("[api/rooms/checkin]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
