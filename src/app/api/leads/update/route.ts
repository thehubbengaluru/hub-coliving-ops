import { NextResponse } from "next/server"
import { updateLeadStatus } from "@/lib/notion"
import type { Lead } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const { notionPageId, status } = await req.json() as { notionPageId: string; status: Lead["status"] }
    await updateLeadStatus(notionPageId, status)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/leads/update]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
