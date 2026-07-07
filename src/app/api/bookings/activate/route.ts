import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { activateBooking } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    await requireAdminApi()

    const { formPageId } = await req.json() as { formPageId: string }
    if (!formPageId) return NextResponse.json({ error: "formPageId required" }, { status: 400 })

    const result = await activateBooking(formPageId)
    return NextResponse.json(result)
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/bookings/activate]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
