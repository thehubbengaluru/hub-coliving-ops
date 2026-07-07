import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { createDepositLink, createRentPaymentLink } from "@/lib/razorpay"
import { getGuestContact } from "@/lib/notion"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    await requireAdminApi()

    const { notionPageId, property, amount, guestName, type } = await req.json() as {
      notionPageId: string
      property: Property
      amount: number
      guestName: string
      type?: "deposit" | "rent"
    }

    if (!notionPageId || !property || !amount || !guestName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const { email, phone } = await getGuestContact(notionPageId)

    if (!phone) {
      return NextResponse.json({ error: "Guest has no phone number in Notion" }, { status: 422 })
    }

    const linkFn = type === "rent" ? createRentPaymentLink : createDepositLink
    const link = await linkFn({
      property,
      guestName,
      email: email ?? "",
      phone,
      amount,
      notionPageId,
    })

    return NextResponse.json({ id: link.id, url: link.short_url, status: link.status })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/razorpay/payment-link]", err)
    const message = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
