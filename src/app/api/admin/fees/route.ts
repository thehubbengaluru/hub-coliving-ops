import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { createFeeLink } from "@/lib/razorpay"
import { recordFailedInspection } from "@/lib/notion"
import { sendEmail, financeRecipients } from "@/lib/email"
import { FAILED_INSPECTION_FEE, KEY_REPLACEMENT_FEE, INSPECTION_STRIKES_FOR_EVICTION } from "@/lib/stay"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

// Admin: charge a house-rules penalty as a Razorpay fee link (previously
// text-only). Failed inspection = ₹2,500 + a strike (3 strikes → eviction flag);
// key replacement = ₹3,000/key.
export async function POST(req: Request) {
  try {
    await requireAdminApi()
    const { notionPageId, kind, keys, guestName, email, phone, property } = await req.json() as {
      notionPageId: string
      kind: "inspection_fail" | "key_replacement"
      keys?: number
      guestName: string
      email?: string
      phone: string
      property: Property
    }
    if (!notionPageId || !kind || !guestName || !phone) {
      return NextResponse.json({ error: "notionPageId, kind, guestName and phone are required" }, { status: 400 })
    }

    let amount: number
    let description: string
    let strike: { count: number; evict: boolean } | null = null

    if (kind === "inspection_fail") {
      amount = FAILED_INSPECTION_FEE
      strike = await recordFailedInspection(notionPageId, INSPECTION_STRIKES_FOR_EVICTION)
      description = `Failed room inspection fee (strike ${strike.count} of ${INSPECTION_STRIKES_FOR_EVICTION})`
    } else if (kind === "key_replacement") {
      const n = Math.max(1, Math.floor(keys ?? 1))
      amount = KEY_REPLACEMENT_FEE * n
      description = `Key replacement — ${n} key${n > 1 ? "s" : ""} @ ₹${KEY_REPLACEMENT_FEE.toLocaleString("en-IN")}`
    } else {
      return NextResponse.json({ error: "Unknown fee kind" }, { status: 400 })
    }

    const link = await createFeeLink({
      property, guestName, email: email ?? "", phone, amount, description, notionPageId,
    })

    // On the 3rd failed inspection, alert ops that the member is eviction-eligible.
    if (strike?.evict) {
      const to = financeRecipients()
      if (to.length) {
        try {
          await sendEmail({
            to,
            subject: `EVICTION ELIGIBLE — ${guestName} (3 failed inspections)`,
            html: `<p><strong>${guestName}</strong> has now failed <strong>${strike.count}</strong> inspections and is tagged for eviction per house rules. Coordinate the check-out + settlement.</p>`,
          })
        } catch { /* non-fatal */ }
      }
    }

    return NextResponse.json({ ok: true, url: link.short_url, linkId: link.id, amount, strike })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/admin/fees]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
