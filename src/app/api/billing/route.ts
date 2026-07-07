import { NextResponse } from "next/server"
import { listInvoicesByHsn, listRetainerInvoices, zohoEnabled } from "@/lib/zoho"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"

export const dynamic = "force-dynamic"

const RENT_HSN = ["9963", "996311"]

export async function GET() {
  try {
    await requireAdminApi()

    const [plazaInvoices, plazaDeposits] = await Promise.all([
      zohoEnabled("safina-plaza") ? listInvoicesByHsn("safina-plaza", RENT_HSN) : Promise.resolve([]),
      zohoEnabled("safina-plaza") ? listRetainerInvoices("safina-plaza")         : Promise.resolve([]),
    ])

    return NextResponse.json({
      plaza: { invoices: plazaInvoices, deposits: plazaDeposits },
    })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/billing]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
