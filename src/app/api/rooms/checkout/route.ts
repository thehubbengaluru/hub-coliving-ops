import { NextResponse } from "next/server"
import { checkOutGuest } from "@/lib/notion"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const { notionPageId, property, checkOutDate } = await req.json() as {
      notionPageId: string
      property: Property
      checkOutDate: string
    }

    await checkOutGuest({ notionPageId, property, checkOutDate })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/rooms/checkout]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
