import { NextResponse } from "next/server"
import { createRentPaymentLink } from "@/lib/razorpay"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

// Infer property from room number (Peepal 100–199, Plaza 200+).
// Handles formats like "316", "Room 316 · Bed A", "316A" by extracting the first number.
function inferProperty(room: string): Property | null {
  const match = room.match(/\d+/)
  const n = match ? parseInt(match[0], 10) : NaN
  if (isNaN(n)) return null
  if (n >= 100 && n < 200) return "peepal-tree"
  if (n >= 200) return "safina-plaza"
  return null
}

// Manual rent payment from the guest portal: generates a one-off Razorpay
// payment link (separate from the auto-debit subscription mandate).
export async function POST(req: Request) {
  try {
    const { notionPageId, room, guestName, email, phone, amount, callbackUrl } = await req.json() as {
      notionPageId?: string
      room: string
      guestName: string
      email: string
      phone: string
      amount: number
      callbackUrl?: string
    }

    const property = inferProperty(room ?? "")
    if (!property) return NextResponse.json({ error: "Could not determine property from room" }, { status: 400 })
    if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid rent amount" }, { status: 400 })
    if (!phone?.trim()) return NextResponse.json({ error: "A phone number is required to send the payment link" }, { status: 422 })

    const link = await createRentPaymentLink({
      property,
      guestName: guestName || "Guest",
      email: email ?? "",
      phone: phone.trim(),
      amount,
      notionPageId,
      callbackUrl,
    })

    return NextResponse.json({ ok: true, url: link.short_url, linkId: link.id, property })
  } catch (err) {
    console.error("[api/portal/pay-rent]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
