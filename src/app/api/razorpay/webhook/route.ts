import { NextResponse } from "next/server"
import { verifyWebhookSignature } from "@/lib/razorpay"
import { markDepositPaid } from "@/lib/notion"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  const rawBody = await req.text()
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
        payment_link?: { entity?: { notes?: Record<string, string> } }
      })?.payment_link?.entity
      const notes = entity?.notes ?? {}
      const notionPageId = notes["notion_page_id"]

      if (notionPageId) {
        try {
          await markDepositPaid(notionPageId)
          console.log("[webhook] deposit marked paid in Notion:", notionPageId)
        } catch (e) {
          console.error("[webhook] failed to update Notion:", e)
        }
      }
      break
    }

    case "subscription.charged": {
      const sub = (event.payload as {
        subscription?: { entity?: { notes?: Record<string, string> } }
      })?.subscription?.entity
      console.log("[webhook] subscription charged:", sub?.notes)
      break
    }

    default:
      console.log("[webhook] unhandled event:", event.event)
  }

  return NextResponse.json({ received: true })
}
