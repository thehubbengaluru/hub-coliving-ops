import { NextResponse } from "next/server"
import { sendInvoice, zohoEnabled } from "@/lib/zoho"
import type { Property } from "@/lib/types"

export async function POST(request: Request) {
  try {
    const { property, invoiceId } = await request.json() as { property: Property; invoiceId: string }

    if (!property || !invoiceId) {
      return NextResponse.json({ error: "property and invoiceId required" }, { status: 400 })
    }

    if (!zohoEnabled(property)) {
      return NextResponse.json({ error: "Zoho not configured for this property" }, { status: 503 })
    }

    await sendInvoice(property, invoiceId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/billing/send]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
