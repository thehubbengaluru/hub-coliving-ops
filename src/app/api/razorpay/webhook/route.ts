import { NextResponse } from "next/server"
import { verifyWebhookSignature } from "@/lib/razorpay"
import { markDepositPaid } from "@/lib/notion"
import { markDepositReceived, markInvoicePaid } from "@/lib/zoho"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const rawBody  = await req.text()
  const signature = req.headers.get("x-razorpay-signature") ?? ""

  const secretPlaza  = process.env.RZP_WEBHOOK_SECRET_PLAZA  ?? ""
  const secretPeepal = process.env.RZP_WEBHOOK_SECRET_PEEPAL ?? ""

  const valid =
    (secretPlaza  && verifyWebhookSignature(rawBody, signature, secretPlaza))  ||
    (secretPeepal && verifyWebhookSignature(rawBody, signature, secretPeepal))

  if (!valid) {
    console.warn("[webhook] Invalid signature")
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: { event: string; payload: Record<string, unknown> }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 })
  }

  console.log("[webhook] event:", event.event)

  switch (event.event) {
    case "payment_link.paid": {
      const entity = (event.payload as {
        payment_link?: { entity?: { notes?: Record<string, string>; amount?: number } }
        payment?:      { entity?: { id?: string; created_at?: number } }
      })

      const notes          = entity.payment_link?.entity?.notes ?? {}
      const notionPageId   = notes["notion_page_id"]
      const zohoRetainerId = notes["zoho_retainer_id"]
      const property       = (notes["property"] ?? "") as Property
      const paidAmount     = (entity.payment_link?.entity?.amount ?? 0) / 100
      const paymentRef     = entity.payment?.entity?.id ?? ""
      const paymentTs      = entity.payment?.entity?.created_at
      const paymentDate    = paymentTs
        ? new Date(paymentTs * 1000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      // Mark deposit paid in Notion
      if (notionPageId) {
        try {
          await markDepositPaid(notionPageId)
          console.log("[webhook] deposit marked paid in Notion:", notionPageId)
        } catch (e) {
          console.error("[webhook] Notion update failed:", e)
        }
      }

      // Mark deposit retainer paid in Zoho Books
      if (process.env.ZOHO_CLIENT_ID && zohoRetainerId && property) {
        try {
          await markDepositReceived({ property, retainerInvoiceId: zohoRetainerId, amount: paidAmount, paymentDate, reference: paymentRef })
          console.log("[webhook] Zoho retainer marked paid:", zohoRetainerId)
        } catch (e) {
          console.error("[webhook] Zoho deposit update failed:", e)
        }
      }
      break
    }

    case "subscription.charged": {
      const sub = (event.payload as {
        subscription?: { entity?: { notes?: Record<string, string> } }
        payment?:      { entity?: { id?: string; amount?: number; created_at?: number } }
      })

      const notes       = sub.subscription?.entity?.notes ?? {}
      const property    = (notes["property"] ?? "") as Property
      const zohoInvId   = notes["zoho_invoice_id"] ?? ""
      const paidAmount  = (sub.payment?.entity?.amount ?? 0) / 100
      const paymentRef  = sub.payment?.entity?.id ?? ""
      const paymentTs   = sub.payment?.entity?.created_at
      const paymentDate = paymentTs
        ? new Date(paymentTs * 1000).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)

      console.log("[webhook] subscription charged:", notes)

      // Mark Zoho invoice paid if we have the ID
      if (process.env.ZOHO_CLIENT_ID && zohoInvId && property) {
        try {
          await markInvoicePaid({ property, invoiceId: zohoInvId, amount: paidAmount, paymentDate, reference: paymentRef })
          console.log("[webhook] Zoho invoice marked paid:", zohoInvId)
        } catch (e) {
          console.error("[webhook] Zoho invoice update failed:", e)
        }
      }
      break
    }

    default:
      console.log("[webhook] unhandled event:", event.event)
  }

  return NextResponse.json({ received: true })
}
