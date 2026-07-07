import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { getRefund, updateRefundAmounts, markRefundIssued, markRefundFailed, type Deduction } from "@/lib/ledger"
import { createRefund } from "@/lib/razorpay"
import { setDepositStatus } from "@/lib/notion"
import { createCreditNote } from "@/lib/zoho"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

// POST /api/admin/refunds/issue — review + issue a queued refund. Optionally
// adjust deductions/gross first, then call the Razorpay refund API against the
// source payment. Marks the ledger row issued/failed and (for deposit refunds)
// flips the member's deposit status to "refunded".
export async function POST(req: Request) {
  try {
    await requireAdminApi()
    const { id, deductions, gross } = await req.json() as {
      id: string
      deductions?: Deduction[]
      gross?: number
    }
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

    let refund = await getRefund(id)
    if (!refund) return NextResponse.json({ error: "Refund not found" }, { status: 404 })
    if (refund.status === "issued") {
      return NextResponse.json({ error: "This refund was already issued." }, { status: 409 })
    }

    // Apply any reviewed deduction/gross changes before issuing.
    if (deductions || gross != null) {
      const updated = await updateRefundAmounts(id, deductions ?? refund.deductions, gross ?? refund.gross_amount)
      if (updated) refund = updated
    }

    if (refund.net_amount <= 0) {
      // Fully deducted / nothing owed — close it out without a Razorpay call.
      await markRefundIssued(id, "n/a-zero-net")
      return NextResponse.json({ ok: true, issued: false, note: "Net refund is ₹0 — nothing to pay out; marked settled." })
    }
    if (!refund.razorpay_payment_id) {
      return NextResponse.json({
        error: "No source Razorpay payment on record for this refund — settle it manually (NEFT) and mark it done, or attach a payment id.",
      }, { status: 422 })
    }

    try {
      const result = await createRefund(
        (refund.property ?? "safina-plaza") as Property,
        refund.razorpay_payment_id,
        refund.net_amount,
        { refund_kind: refund.kind, notion_page_id: refund.notion_page_id ?? "" },
      )
      await markRefundIssued(id, result.id)
      if (refund.kind === "deposit" && refund.notion_page_id) {
        await setDepositStatus(refund.notion_page_id, "refunded")
      }
      // Best-effort Zoho credit note so the books reflect the returned money.
      try {
        await createCreditNote({
          property: (refund.property ?? "safina-plaza") as Property,
          guestName: refund.guest_name ?? "Guest",
          email: refund.guest_email ?? "",
          phone: "",
          amount: refund.net_amount,
          reason: refund.reason ?? `Refund (${refund.kind})`,
        })
      } catch (e) { console.warn("[refunds/issue] Zoho credit note failed (non-fatal):", e) }
      return NextResponse.json({ ok: true, issued: true, razorpayRefundId: result.id, amount: refund.net_amount })
    } catch (rzpErr) {
      const msg = rzpErr instanceof Error ? rzpErr.message : "Razorpay refund failed"
      await markRefundFailed(id, msg)
      return NextResponse.json({ error: `Razorpay refund failed: ${msg}` }, { status: 502 })
    }
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/admin/refunds/issue]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
