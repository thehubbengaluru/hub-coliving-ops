import { NextResponse } from "next/server"
import { checkOutGuest, syncGuestToAlumni } from "@/lib/notion"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const { notionPageId, property, checkOutDate, roomNumber, bedLabel, roomType } = await req.json() as {
      notionPageId: string
      property: Property
      checkOutDate: string
      roomNumber?: string
      bedLabel?: string | null
      roomType?: "private" | "sharing"
    }

    // Sync to Alumni DB first (reads page before it's cleared)
    await syncGuestToAlumni({ notionPageId, property, checkOutDate, roomNumber, bedLabel, roomType })

    // Then mark the bed as vacant in the Members DB
    await checkOutGuest({ notionPageId, property, checkOutDate })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/rooms/checkout]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
