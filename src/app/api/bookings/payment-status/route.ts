import { NextResponse } from "next/server"
import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import { getPaymentLinkStatus } from "@/lib/razorpay"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

// Polled by the booking wizard's payment step to reflect a green "Paid" state.
// Primary signal: Razorpay payment link status queried directly (always accurate).
// Fallback: Notion "Deposit Paid ✓" / Status field (set by webhook after payment).
export async function GET(req: Request) {
  try {
    const url            = new URL(req.url)
    const pageId         = url.searchParams.get("pageId")
    const depositLinkId  = url.searchParams.get("depositLinkId")
    const proRatedLinkId = url.searchParams.get("proRatedLinkId")
    const property       = (url.searchParams.get("property") ?? "safina-plaza") as Property

    if (!pageId) return NextResponse.json({ error: "Missing pageId" }, { status: 400 })

    // ── Query Razorpay directly for each link's status ─────────────────────
    // This is the primary signal — accurate even before the webhook fires.
    let depositPaid  = false
    let proRatedPaid = false

    if (depositLinkId) {
      const status = await getPaymentLinkStatus(property, depositLinkId)
      depositPaid = status === "paid"
    }

    if (proRatedLinkId) {
      const status = await getPaymentLinkStatus(property, proRatedLinkId)
      proRatedPaid = status === "paid"
    }

    // ── Notion fallback ────────────────────────────────────────────────────
    // If we couldn't determine deposit status from Razorpay (no linkId or API
    // error), fall back to the Notion page fields set by the webhook.
    if (!depositPaid) {
      const notion = new Client({ auth: process.env.NOTION_TOKEN })
      const page = await notion.pages.retrieve({ page_id: pageId })
      if (isFullPage(page)) {
        const props = (page as PageObjectResponse).properties
        const depProp = props["Deposit Paid ✓"]
        const checkboxPaid = depProp?.type === "checkbox" ? depProp.checkbox : false
        const statusProp = props["Status"]
        const status = statusProp?.type === "select" ? (statusProp.select?.name ?? null) : null
        const statusPaid = !!status && /confirm|paid/i.test(status)
        depositPaid = checkboxPaid || statusPaid
      }
    }

    return NextResponse.json({ depositPaid, proRatedPaid })
  } catch (err) {
    console.error("[bookings/payment-status]", err)
    return NextResponse.json({ depositPaid: false, proRatedPaid: false })
  }
}
