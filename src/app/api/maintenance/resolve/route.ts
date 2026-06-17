import { NextResponse } from "next/server"
import { resolveTicket } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const { notionPageId, comment } = await req.json() as { notionPageId: string; comment?: string }
    await resolveTicket(notionPageId, comment)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/maintenance/resolve]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
