import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { getPendingBookings } from "@/lib/notion"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    await requireAdminApi()

    const bookings = await getPendingBookings()
    return NextResponse.json(bookings)
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/bookings/pending]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
