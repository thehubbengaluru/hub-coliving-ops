import { NextResponse } from "next/server"
import { getRooms } from "@/lib/notion"

export const dynamic = "force-dynamic"
export const revalidate = 0

export async function GET() {
  try {
    const rooms = await getRooms()
    return NextResponse.json(rooms)
  } catch (err) {
    console.error("[api/rooms] Notion fetch failed:", err)
    return NextResponse.json({ error: "Failed to fetch rooms" }, { status: 500 })
  }
}
