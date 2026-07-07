import { NextResponse } from "next/server"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"
import { listRefunds, queueRefund, type RefundKind, type Deduction, type RefundRow } from "@/lib/ledger"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

// GET /api/admin/refunds?status=pending — the refund queue for ops.
export async function GET(req: Request) {
  try {
    await requireAdminApi()
    const status = new URL(req.url).searchParams.get("status") as RefundRow["status"] | null
    const refunds = await listRefunds(status ?? undefined)
    return NextResponse.json({ ok: true, refunds })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/admin/refunds GET]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}

// POST /api/admin/refunds — manually queue a refund (e.g. hub-initiated
// termination = full deposit + fee). System-computed refunds (cancellation,
// checkout) are queued by their own flows.
export async function POST(req: Request) {
  try {
    const admin = await requireAdminApi()
    const body = await req.json() as {
      notionPageId?: string
      guestName?: string
      guestEmail?: string
      property?: Property
      kind?: RefundKind
      gross?: number
      deductions?: Deduction[]
      reason?: string
      paymentId?: string
      dueDate?: string
    }
    if (!body.kind || !body.gross || body.gross <= 0) {
      return NextResponse.json({ error: "kind and a positive gross amount are required" }, { status: 400 })
    }
    const row = await queueRefund({
      notionPageId: body.notionPageId ?? null,
      guestName: body.guestName ?? null,
      guestEmail: body.guestEmail ?? null,
      property: body.property ?? "safina-plaza",
      kind: body.kind,
      gross: body.gross,
      deductions: body.deductions ?? [],
      reason: body.reason,
      paymentId: body.paymentId ?? null,
      dueDate: body.dueDate ?? null,
      createdBy: admin.email ?? "admin",
    })
    if (!row) return NextResponse.json({ error: "Could not record refund (ledger unavailable)" }, { status: 503 })
    return NextResponse.json({ ok: true, refund: row })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/admin/refunds POST]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
