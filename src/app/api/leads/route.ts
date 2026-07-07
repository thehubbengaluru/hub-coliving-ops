import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { getLeads } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await requireAdminApi()

    const leads = await getLeads()
    return NextResponse.json(leads)
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/leads]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
