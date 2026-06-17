import { NextResponse } from "next/server"
import { getMaintenanceTickets } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const tickets = await getMaintenanceTickets()
    return NextResponse.json(tickets)
  } catch (err) {
    console.error("[api/maintenance]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
