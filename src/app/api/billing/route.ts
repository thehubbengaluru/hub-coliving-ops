import { NextResponse } from "next/server"
import { listInvoices, listRetainerInvoices, zohoEnabled } from "@/lib/zoho"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const [
      plazaInvoices, peepalInvoices,
      plazaDeposits, peepalDeposits,
    ] = await Promise.all([
      zohoEnabled("safina-plaza") ? listInvoices("safina-plaza")         : Promise.resolve([]),
      zohoEnabled("peepal-tree")  ? listInvoices("peepal-tree")          : Promise.resolve([]),
      zohoEnabled("safina-plaza") ? listRetainerInvoices("safina-plaza") : Promise.resolve([]),
      zohoEnabled("peepal-tree")  ? listRetainerInvoices("peepal-tree")  : Promise.resolve([]),
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
