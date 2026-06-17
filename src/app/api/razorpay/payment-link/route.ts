import { NextResponse } from "next/server"
import { createDepositLink } from "@/lib/razorpay"
import { getGuestContact } from "@/lib/notion"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const { notionPageId, property, amount, guestName } = await req.json() as {
      notionPageId: string
      property: Property
      amount: number
      guestName: string
    }

    if (!notionPageId || !property || !amount || !guestName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const { email, phone } = await getGuestContact(notionPageId)

    if (!phone) {
      return NextResponse.json({ error: "Guest has no phone number in Notion" }, { status: 422 })
    }

    const link = await createDepositLink({
      property,
      guestName,
      email: email ?? "",
      phone,
      amount,
    })

    return NextResponse.json({ id: link.id, url: link.short_url, status: link.status })
  } catch (err) {
    console.error("[api/razorpay/payment-link]", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
