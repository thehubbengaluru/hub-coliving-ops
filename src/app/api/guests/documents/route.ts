import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { findGuestFormPages, findMemberPagesByEmail } from "@/lib/notion"
import { listGuestDocuments, type StoredGuestDocument } from "@/lib/supabase/storage"

export const dynamic = "force-dynamic"

// Everything stored for one guest in the Supabase KYC archive, as short-lived
// signed download URLs. Look up by ?guestKey= (the guest's form page id) or
// ?email= (finds every booking's folder for that address). Admin-only — these
// are Aadhaar/passport documents.
export async function GET(req: Request) {
  try {
    await requireAdminApi()

    const url = new URL(req.url)
    const guestKey = url.searchParams.get("guestKey")?.trim()
    const email = url.searchParams.get("email")?.trim()
    if (!guestKey && !email) {
      return NextResponse.json({ error: "Provide guestKey or email" }, { status: 400 })
    }

    // A guest can have folders keyed by form page(s) (new flow) and/or by
    // their member page (legacy guests, backfilled) — check both.
    const folders = guestKey
      ? [{ pageId: guestKey, guestName: "", submittedAt: "" }]
      : (await Promise.all([findGuestFormPages(email!), findMemberPagesByEmail(email!)])).flat()

    const groups: { guestKey: string; guestName: string; submittedAt: string; documents: StoredGuestDocument[] }[] = []
    for (const f of folders) {
      const documents = await listGuestDocuments(f.pageId)
      if (documents.length) {
        groups.push({ guestKey: f.pageId, guestName: f.guestName, submittedAt: f.submittedAt, documents })
      }
    }

    return NextResponse.json({ ok: true, groups })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/guests/documents]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
