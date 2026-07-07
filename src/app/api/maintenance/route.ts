import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { getMaintenanceTickets } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireAdminApi()

    const tickets = await getMaintenanceTickets()
    return NextResponse.json(tickets)
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/maintenance]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
