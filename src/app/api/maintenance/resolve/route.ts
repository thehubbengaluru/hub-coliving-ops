import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { resolveTicket } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    await requireAdminApi()

    const { notionPageId, comment } = await req.json() as { notionPageId: string; comment?: string }
    await resolveTicket(notionPageId, comment)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/maintenance/resolve]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
