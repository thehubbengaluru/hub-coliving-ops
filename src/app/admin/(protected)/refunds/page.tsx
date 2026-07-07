"use client"

import { useEffect, useState, useCallback } from "react"
import { Loader2, Undo2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react"

type Deduction = { label: string; amount: number }
type Refund = {
  id: string
  notion_page_id: string | null
  guest_name: string | null
  guest_email: string | null
  property: string | null
  kind: string
  gross_amount: number
  deductions: Deduction[]
  net_amount: number
  reason: string | null
  status: "pending" | "issued" | "failed" | "cancelled"
  razorpay_payment_id: string | null
  razorpay_refund_id: string | null
  due_date: string | null
  created_at: string
  error: string | null
}

const inr = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`
const KIND_LABEL: Record<string, string> = {
  cancellation: "Cancellation (50%)",
  deposit: "Deposit at checkout",
  hub_initiated: "Hub-initiated",
  room_move_downgrade: "Room-move credit",
}

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deductDraft, setDeductDraft] = useState<Record<string, string>>({})

  // No synchronous setState here (avoids the cascading-render lint rule); the
  // first setState happens after the await. Manual refresh flips loading itself.
  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/refunds")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to load refunds")
      setRefunds(data.refunds ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load refunds")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/admin/refunds")
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) throw new Error(data.error ?? "Failed to load refunds")
        setRefunds(data.refunds ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load refunds")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  async function issue(r: Refund) {
    const extra = parseFloat(deductDraft[r.id] ?? "")
    const deductions = Number.isFinite(extra) && extra > 0
      ? [...r.deductions, { label: "Deductions (checkout review)", amount: extra }]
      : r.deductions
    const net = Math.max(0, r.gross_amount - deductions.reduce((s, d) => s + d.amount, 0))
    if (!confirm(`Issue a ${inr(net)} refund to ${r.guest_name || r.guest_email || "guest"}? This calls Razorpay.`)) return
    setBusyId(r.id); setError(null)
    try {
      const res = await fetch("/api/admin/refunds/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, deductions }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to issue refund")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to issue refund")
    } finally {
      setBusyId(null)
    }
  }

  const pending = refunds.filter((r) => r.status === "pending")
  const settled = refunds.filter((r) => r.status !== "pending")

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Undo2 className="w-5 h-5" />
          <h1 className="text-xl font-semibold text-foreground">Refunds</h1>
        </div>
        <button onClick={() => { setLoading(true); load() }} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-foreground mb-2">Pending ({pending.length})</h2>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-8">No refunds awaiting action.</p>
          ) : (
            <div className="space-y-3 mb-8">
              {pending.map((r) => (
                <div key={r.id} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-foreground">{r.guest_name || r.guest_email || "—"}</p>
                      <p className="text-xs text-muted-foreground">{KIND_LABEL[r.kind] ?? r.kind}{r.due_date ? ` · due ${r.due_date}` : ""}</p>
                      {r.reason && <p className="text-xs text-muted-foreground mt-1">{r.reason}</p>}
                      {!r.razorpay_payment_id && (
                        <p className="text-xs text-amber-600 mt-1">No source Razorpay payment — settle via NEFT, then issue marks it done.</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Gross {inr(r.gross_amount)}{r.deductions.length ? ` − ${inr(r.deductions.reduce((s, d) => s + d.amount, 0))}` : ""}</p>
                      <p className="font-semibold text-foreground">Net {inr(r.net_amount)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {r.kind === "deposit" && (
                      <input
                        type="number"
                        placeholder="Extra deductions ₹"
                        value={deductDraft[r.id] ?? ""}
                        onChange={(e) => setDeductDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                        className="w-40 px-2.5 py-1.5 rounded-lg border border-border text-sm bg-background"
                      />
                    )}
                    <button
                      onClick={() => issue(r)}
                      disabled={busyId === r.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-foreground text-background hover:opacity-90 disabled:opacity-60 cursor-pointer"
                    >
                      {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Issue refund
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h2 className="text-sm font-semibold text-foreground mb-2">History ({settled.length})</h2>
          {settled.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing settled yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Guest</th>
                    <th className="text-left font-medium px-3 py-2">Kind</th>
                    <th className="text-right font-medium px-3 py-2">Net</th>
                    <th className="text-left font-medium px-3 py-2">Status</th>
                    <th className="text-left font-medium px-3 py-2">Razorpay</th>
                  </tr>
                </thead>
                <tbody>
                  {settled.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 text-foreground">{r.guest_name || r.guest_email || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{KIND_LABEL[r.kind] ?? r.kind}</td>
                      <td className="px-3 py-2 text-right text-foreground">{inr(r.net_amount)}</td>
                      <td className="px-3 py-2">
                        <span className={r.status === "issued" ? "text-green-600" : r.status === "failed" ? "text-red-600" : "text-muted-foreground"}>
                          {r.status}{r.error ? ` — ${r.error}` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.razorpay_refund_id ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
