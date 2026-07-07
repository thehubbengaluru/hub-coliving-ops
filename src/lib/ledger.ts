import "server-only"
import { createServiceClient } from "@/lib/supabase/service"
import type { Property } from "@/lib/types"

// Financial ledger (Supabase, service-role only): captured payments + the
// refund/settlement queue. Payments are recorded by the Razorpay webhook so a
// later refund can target the right payment id; refunds are computed + queued
// by the cancellation/checkout flows and issued by an admin.

export type Deduction = { label: string; amount: number }

export type RefundKind = "cancellation" | "deposit" | "hub_initiated" | "room_move_downgrade"

export type RefundRow = {
  id: string
  notion_page_id: string | null
  guest_name: string | null
  guest_email: string | null
  property: string | null
  kind: RefundKind
  gross_amount: number
  deductions: Deduction[]
  net_amount: number
  currency: string
  reason: string | null
  status: "pending" | "issued" | "failed" | "cancelled"
  razorpay_payment_id: string | null
  razorpay_refund_id: string | null
  due_date: string | null
  created_by: string | null
  created_at: string
  issued_at: string | null
  error: string | null
}

// ── Payments ────────────────────────────────────────────────────────────────

export async function recordPayment(p: {
  paymentId: string
  notionPageId: string | null
  property: Property | ""
  type: string
  amount: number
  email?: string
  guestName?: string
}): Promise<void> {
  const supabase = createServiceClient()
  if (!supabase || !p.paymentId) return
  const { error } = await supabase.from("payments").upsert(
    {
      razorpay_payment_id: p.paymentId,
      notion_page_id: p.notionPageId,
      property: p.property || null,
      type: p.type,
      amount: p.amount,
      email: p.email ?? null,
      guest_name: p.guestName ?? null,
    },
    { onConflict: "razorpay_payment_id" },
  )
  if (error) console.warn("[ledger.recordPayment] failed:", error.message)
}

// Sum of every payment captured for a booking (deposit + upfront + rent). Used
// to compute a cancellation refund (fraction of total paid).
export async function totalPaidFor(notionPageId: string): Promise<number> {
  const supabase = createServiceClient()
  if (!supabase) return 0
  const { data, error } = await supabase.from("payments").select("amount").eq("notion_page_id", notionPageId)
  if (error || !data) return 0
  return data.reduce((s, r) => s + Number(r.amount ?? 0), 0)
}

// The deposit payment for a booking (the one to refund at checkout). Prefers the
// security_deposit type; returns null if none captured.
export async function depositPaymentFor(notionPageId: string): Promise<{ paymentId: string; amount: number } | null> {
  const supabase = createServiceClient()
  if (!supabase) return null
  const { data } = await supabase
    .from("payments")
    .select("razorpay_payment_id, amount")
    .eq("notion_page_id", notionPageId)
    .eq("type", "security_deposit")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return { paymentId: data.razorpay_payment_id as string, amount: Number(data.amount) }
}

// Email-based lookups — payments are keyed by the notion page id that was on the
// link (form page for /book, member page for admin check-in), which differs from
// the member page id used at checkout. Email is the stable join across them.
export async function depositPaymentByEmail(email: string): Promise<{ paymentId: string; amount: number } | null> {
  const supabase = createServiceClient()
  if (!supabase || !email) return null
  const { data } = await supabase
    .from("payments")
    .select("razorpay_payment_id, amount")
    .eq("email", email.trim().toLowerCase())
    .eq("type", "security_deposit")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return { paymentId: data.razorpay_payment_id as string, amount: Number(data.amount) }
}

// The largest single captured payment for a booking — a fallback refund source
// when the deposit wasn't tagged (e.g. legacy). Razorpay refunds against a
// specific payment, so cancellation refunds use this.
export async function largestPaymentFor(notionPageId: string): Promise<{ paymentId: string; amount: number } | null> {
  const supabase = createServiceClient()
  if (!supabase) return null
  const { data } = await supabase
    .from("payments")
    .select("razorpay_payment_id, amount")
    .eq("notion_page_id", notionPageId)
    .order("amount", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return { paymentId: data.razorpay_payment_id as string, amount: Number(data.amount) }
}

// Has this guest paid any rent (upfront pro-rated or monthly) yet? Used by the
// lifecycle sweep to chase a confirmed booking whose upfront rent never landed.
export async function rentPaidByEmail(email: string): Promise<boolean> {
  const supabase = createServiceClient()
  if (!supabase || !email) return false
  const { data } = await supabase
    .from("payments")
    .select("razorpay_payment_id")
    .eq("email", email.trim().toLowerCase())
    .in("type", ["rent", "pro_rated_rent"])
    .limit(1)
  return !!(data && data.length)
}

// ── Refund queue ──────────────────────────────────────────────────────────────

export async function queueRefund(r: {
  notionPageId: string | null
  guestName?: string | null
  guestEmail?: string | null
  property: Property | "" | null
  kind: RefundKind
  gross: number
  deductions?: Deduction[]
  reason?: string
  paymentId?: string | null
  dueDate?: string | null
  createdBy?: string
}): Promise<RefundRow | null> {
  const supabase = createServiceClient()
  if (!supabase) {
    console.warn("[ledger.queueRefund] no service client; refund NOT recorded")
    return null
  }
  const deductions = r.deductions ?? []
  const net = Math.max(0, r.gross - deductions.reduce((s, d) => s + Number(d.amount ?? 0), 0))
  const { data, error } = await supabase
    .from("refunds")
    .insert({
      notion_page_id: r.notionPageId,
      guest_name: r.guestName ?? null,
      guest_email: r.guestEmail ?? null,
      property: r.property || null,
      kind: r.kind,
      gross_amount: r.gross,
      deductions,
      net_amount: net,
      reason: r.reason ?? null,
      razorpay_payment_id: r.paymentId ?? null,
      due_date: r.dueDate ?? null,
      created_by: r.createdBy ?? "system",
    })
    .select()
    .single()
  if (error) {
    console.warn("[ledger.queueRefund] failed:", error.message)
    return null
  }
  return data as RefundRow
}

export async function listRefunds(status?: RefundRow["status"]): Promise<RefundRow[]> {
  const supabase = createServiceClient()
  if (!supabase) return []
  let q = supabase.from("refunds").select("*").order("created_at", { ascending: false })
  if (status) q = q.eq("status", status)
  const { data, error } = await q
  if (error || !data) return []
  return data as RefundRow[]
}

export async function getRefund(id: string): Promise<RefundRow | null> {
  const supabase = createServiceClient()
  if (!supabase) return null
  const { data } = await supabase.from("refunds").select("*").eq("id", id).maybeSingle()
  return (data as RefundRow) ?? null
}

// Apply reviewed deductions + net before issuing.
export async function updateRefundAmounts(id: string, deductions: Deduction[], gross: number): Promise<RefundRow | null> {
  const supabase = createServiceClient()
  if (!supabase) return null
  const net = Math.max(0, gross - deductions.reduce((s, d) => s + Number(d.amount ?? 0), 0))
  const { data } = await supabase
    .from("refunds")
    .update({ deductions, gross_amount: gross, net_amount: net })
    .eq("id", id)
    .select()
    .maybeSingle()
  return (data as RefundRow) ?? null
}

export async function markRefundIssued(id: string, razorpayRefundId: string): Promise<void> {
  const supabase = createServiceClient()
  if (!supabase) return
  await supabase
    .from("refunds")
    .update({ status: "issued", razorpay_refund_id: razorpayRefundId, issued_at: new Date().toISOString(), error: null })
    .eq("id", id)
}

export async function markRefundFailed(id: string, error: string): Promise<void> {
  const supabase = createServiceClient()
  if (!supabase) return
  await supabase.from("refunds").update({ status: "failed", error }).eq("id", id)
}
