import { NextResponse } from "next/server"
import { verifyWebhookSignature } from "@/lib/razorpay"

export const dynamic = "force-dynamic"

// Razorpay sends events as POST with x-razorpay-signature header.
// Configure webhook URL in Razorpay Dashboard → Settings → Webhooks:
//   https://yourdomain.com/api/razorpay/webhook
// Copy the webhook secret into RZP_WEBHOOK_SECRET_PLAZA / RZP_WEBHOOK_SECRET_PEEPAL
// For local testing: use ngrok to expose port 3001.

export async function POST(req: Request) {
  const rawBody = await req.text()
  const signature = req.headers.get("x-razorpay-signature") ?? ""

  // Try both property secrets (we have one endpoint for both accounts)
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
      // Deposit paid — the notes.property and notes.guest_name identify the guest
      const pl = (event.payload as { payment_link?: { entity?: { notes?: Record<string, string> } } })
        ?.payment_link?.entity
      const notes = pl?.notes ?? {}
      console.log("[webhook] deposit paid:", notes)
      // TODO: use Notion API to tick "Deposit Paid ✓" on the guest's page
      // Requires storing notionPageId in payment link notes (add to createDepositLink call)
      break
    }

    case "subscription.charged": {
      const sub = (event.payload as { subscription?: { entity?: { notes?: Record<string, string> } } })
        ?.subscription?.entity
      const notes = sub?.notes ?? {}
      console.log("[webhook] subscription charged:", notes)
      // TODO: log payment in Notion
      break
    }

    default:
      console.log("[webhook] unhandled event:", event.event)
  }

  return NextResponse.json({ received: true })
}
