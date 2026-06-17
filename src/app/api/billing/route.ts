import { NextResponse } from "next/server"
import { listInvoicesByHsn, listRetainerInvoices, zohoEnabled } from "@/lib/zoho"

export const dynamic = "force-dynamic"

const RENT_HSN = ["9963", "996311"]

export async function GET() {
  try {
    const [
      plazaInvoices, peepalInvoices,
      plazaDeposits, peepalDeposits,
    ] = await Promise.all([
      zohoEnabled("safina-plaza") ? listInvoicesByHsn("safina-plaza", RENT_HSN) : Promise.resolve([]),
      zohoEnabled("peepal-tree")  ? listInvoicesByHsn("peepal-tree",  RENT_HSN) : Promise.resolve([]),
      zohoEnabled("safina-plaza") ? listRetainerInvoices("safina-plaza")         : Promise.resolve([]),
      zohoEnabled("peepal-tree")  ? listRetainerInvoices("peepal-tree")          : Promise.resolve([]),
    ])

    return NextResponse.json({
      plaza:  { invoices: plazaInvoices,  deposits: plazaDeposits },
      peepal: { invoices: peepalInvoices, deposits: peepalDeposits },
    })
  } catch (err) {
    console.error("[api/billing]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
