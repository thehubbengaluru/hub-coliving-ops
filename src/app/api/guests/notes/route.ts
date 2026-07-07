import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { addGuestNote } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    await requireAdminApi()

    const { notionPageId, note, author } = await req.json() as {
      notionPageId: string
      note: string
      author: string
    }
    if (!notionPageId || !note?.trim() || !author?.trim()) {
      return NextResponse.json(
        { error: "notionPageId, note and author are all required" },
        { status: 400 },
      )
    }
    await addGuestNote({ notionPageId, note: note.trim(), author: author.trim() })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/guests/notes]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
