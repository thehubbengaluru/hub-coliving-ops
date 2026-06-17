import { NextResponse } from "next/server"
import { getPendingBookings } from "@/lib/notion"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const bookings = await getPendingBookings()
    return NextResponse.json(bookings)
  } catch (err) {
    console.error("[api/bookings/pending]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
