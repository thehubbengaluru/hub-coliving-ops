import { NextResponse } from "next/server"
import { getRzpInstance, getPublicKey } from "@/lib/razorpay"

export const dynamic = "force-dynamic"

const MAINTENANCE_FEE = 2000

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { property, monthlyRate, guestName, email, phone } = body

    if (!property || !monthlyRate || !guestName || !email || !phone) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    if (property !== "safina-plaza" && property !== "peepal-tree") {
      return NextResponse.json({ error: "Invalid property" }, { status: 400 })
    }

    const propKey = property as "safina-plaza" | "peepal-tree"
    const total = monthlyRate + MAINTENANCE_FEE

    const rzp = getRzpInstance(propKey)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const order = await (rzp.orders as any).create({
      amount: total * 100,
      currency: "INR",
      receipt: `hub-booking-${Date.now()}`,
      notes: { property: propKey, guestName },
    })

    return NextResponse.json({
      orderId: order.id,
      amount: total,
      currency: "INR",
      key: getPublicKey(propKey),
    })
  } catch (err) {
    console.error("[api/bookings/create-order]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create order" },
      { status: 500 }
    )
  }
}
