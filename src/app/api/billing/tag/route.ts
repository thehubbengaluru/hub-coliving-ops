import { NextResponse } from "next/server"
import { tagInvoiceToGuest } from "@/lib/zoho"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

// Tag a Zoho invoice to a guest (writes guest into the invoice reference).
export async function POST(req: Request) {
  try {
    const { property, invoiceId, guestName, guestEmail } = await req.json() as {
      property: Property
      invoiceId: string
      guestName: string
      guestEmail?: string
    }
    if (!property || !invoiceId || !guestName?.trim()) {
      return NextResponse.json({ error: "property, invoiceId and guestName are required" }, { status: 400 })
    }
    await tagInvoiceToGuest({ property, invoiceId, guestName: guestName.trim(), guestEmail: guestEmail?.trim() })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[api/billing/tag]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
