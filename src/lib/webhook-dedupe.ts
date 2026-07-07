import "server-only"
import { createServiceClient } from "@/lib/supabase/service"

// Idempotency guard for inbound webhooks. Returns true if this event id is new
// (safe to process) and records it; false if it's a duplicate delivery (skip).
//
// Fails OPEN: if the ledger is unreachable we process the event rather than
// risk dropping a real payment, logging a warning so a rare duplicate stays
// traceable. Razorpay retries deliveries on timeout/non-2xx, so without this a
// replayed `subscription.pending` double-counts failures and a replayed
// `subscription.charged`/`payment_link.paid` re-invoices and re-emails.
export async function claimWebhookEvent(
  eventId: string | null,
  eventType: string,
): Promise<boolean> {
  if (!eventId) return true // no id header — cannot dedupe; process it
  const supabase = createServiceClient()
  if (!supabase) {
    console.warn("[webhook-dedupe] no service client configured; processing without dedupe")
    return true
  }
  const { error } = await supabase
    .from("webhook_events")
    .insert({ event_id: eventId, event_type: eventType })
  if (error) {
    if (error.code === "23505") return false // unique_violation → already processed
    console.warn("[webhook-dedupe] ledger insert failed; processing anyway:", error.message)
    return true
  }
  return true
}

// Claims a (member, IST date) dunning sweep. Returns true if this member hasn't
// been swept yet today (proceed), false if already swept (a second same-day
// cron run — skip to avoid double emails / double link reissues). Fails OPEN.
export async function claimDunningSweep(pageId: string, sweptDate: string): Promise<boolean> {
  const supabase = createServiceClient()
  if (!supabase) return true // no ledger → don't block the sweep
  const { error } = await supabase
    .from("dunning_sweeps")
    .insert({ page_id: pageId, swept_date: sweptDate })
  if (error) {
    if (error.code === "23505") return false // already swept today
    console.warn("[dunning-sweep] claim failed; sweeping anyway:", error.message)
    return true
  }
  return true
}
