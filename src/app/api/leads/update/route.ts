import { NextResponse } from "next/server"
import { updateLeadStatus, updateLeadType } from "@/lib/notion"
import type { Lead } from "@/lib/notion"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"

export const dynamic = "force-dynamic"

// Whitelist the select values so a malformed value can't permanently pollute
// the Notion Leads DB schema (Notion auto-creates unknown select options).
const VALID_STATUS: Lead["status"][] = ["yet-to-confirm", "won", "lost"]
const VALID_LEAD_TYPE: Lead["leadType"][] = ["co-living", "residency"]

export async function POST(req: Request) {
  try {
    await requireAdminApi()

    const { notionPageId, status, leadType } = await req.json() as {
      notionPageId: string
      status?: Lead["status"]
      leadType?: Lead["leadType"]
    }
    if (!notionPageId) return NextResponse.json({ error: "notionPageId required" }, { status: 400 })
    if (status && !VALID_STATUS.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }
    if (leadType && !VALID_LEAD_TYPE.includes(leadType)) {
      return NextResponse.json({ error: "Invalid lead type" }, { status: 400 })
    }
    if (status) await updateLeadStatus(notionPageId, status)
    if (leadType) await updateLeadType(notionPageId, leadType)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/leads/update]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
