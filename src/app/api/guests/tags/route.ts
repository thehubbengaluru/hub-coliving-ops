import { NextResponse } from "next/server"
import { setGuestTags } from "@/lib/notion"

export const dynamic = "force-dynamic"

// Allowed guest tags (gender is derived separately and not set here).
export const GUEST_TAGS = ["Long term", "HWC", "Pet Parent", "Special Guest"]

export async function POST(req: Request) {
  try {
    const { notionPageId, tags } = await req.json() as { notionPageId: string; tags: string[] }
    if (!notionPageId || !Array.isArray(tags)) {
      return NextResponse.json({ error: "notionPageId and tags[] are required" }, { status: 400 })
    }
    const clean = tags.filter((t) => GUEST_TAGS.includes(t))
    await setGuestTags(notionPageId, clean)
    return NextResponse.json({ ok: true, tags: clean })
  } catch (err) {
    console.error("[api/guests/tags]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
