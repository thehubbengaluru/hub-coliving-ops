import { NextResponse } from "next/server"
import { blockBed, unblockBed, BedOccupiedError } from "@/lib/notion"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

// POST → make a bed unavailable (with reason/duration/blocked-by).
// DELETE → make it available again.
export async function POST(req: Request) {
  try {
    const { notionPageId, property, reason, fromDate, untilDate, blockedBy } = await req.json() as {
      notionPageId: string
      property: Property
      reason: string
      fromDate?: string
      untilDate?: string
      blockedBy: string
    }
    if (!notionPageId || !reason?.trim() || !blockedBy?.trim()) {
      return NextResponse.json({ error: "reason and blockedBy are required" }, { status: 400 })
    }
    await blockBed({ notionPageId, property, reason: reason.trim(), fromDate, untilDate, blockedBy: blockedBy.trim() })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/rooms/block POST]", err)
    if (err instanceof BedOccupiedError) return NextResponse.json({ error: err.message }, { status: 409 })
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const { notionPageId, property } = await req.json() as { notionPageId: string; property: Property }
    if (!notionPageId) return NextResponse.json({ error: "notionPageId required" }, { status: 400 })
    await unblockBed({ notionPageId, property })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/rooms/block DELETE]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
