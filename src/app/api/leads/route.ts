import { NextResponse } from "next/server"
import { getLeads } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const leads = await getLeads()
    return NextResponse.json(leads)
  } catch (err) {
    console.error("[api/leads]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
