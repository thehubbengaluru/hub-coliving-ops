"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Building2, RefreshCw, CheckCircle2, AlertCircle,
  Clock, ExternalLink, Send, IndianRupee,
} from "lucide-react"
import type { ZohoInvoiceListItem, ZohoRetainerListItem } from "@/lib/zoho"
import { usePropertyScope } from "@/lib/property-context"

// ─── Types ────────────────────────────────────────────────────────────────

type BillingData = {
  plaza:  { invoices: ZohoInvoiceListItem[];  deposits: ZohoRetainerListItem[] }
  peepal: { invoices: ZohoInvoiceListItem[];  deposits: ZohoRetainerListItem[] }
}

type Entity = {
  key:      "plaza" | "peepal"
  name:     string
  property: string
  invoices: ZohoInvoiceListItem[]
  deposits: ZohoRetainerListItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function statusBadge(status: string) {
  switch (status) {
    case "paid":           return "bg-emerald-50 text-emerald-700 border-emerald-200"
    case "overdue":        return "bg-red-50 text-red-600 border-red-200"
    case "sent":           return "bg-blue-50 text-blue-700 border-blue-200"
    case "partially_paid": return "bg-amber-50 text-amber-700 border-amber-200"
    case "draft":          return "bg-slate-50 text-slate-500 border-slate-200"
    default:               return "bg-slate-50 text-slate-500 border-slate-200"
  }
}

function statusLabel(status: string) {
  if (status === "partially_paid") return "Part paid"
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
}

// ─── Invoice row ─────────────────────────────────────────────────────────

function InvoiceRow({ inv, onResend }: { inv: ZohoInvoiceListItem; onResend: (id: string) => void }) {
  const paid = inv.status === "paid" || inv.balance === 0
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0 last:pb-0 first:pt-0">
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-0.5 ${
        paid ? "bg-emerald-400" : inv.status === "overdue" ? "bg-red-400" : "bg-amber-400"
      }`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{inv.customer_name}</p>
        <p className="text-[10px] text-muted-foreground">
          {inv.invoice_number} · {new Date(inv.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-medium text-foreground tabular-nums">{fmt(inv.total)}</p>
        {inv.balance > 0 && inv.balance !== inv.total && (
          <p className="text-[10px] text-amber-600 tabular-nums">₹{inv.balance.toLocaleString("en-IN")} due</p>
        )}
      </div>
      <Badge variant="outline" className={`text-[9px] h-4 px-1.5 shrink-0 ${statusBadge(inv.status)}`}>
        {statusLabel(inv.status)}
      </Badge>
      <div className="flex items-center gap-1 shrink-0">
        {!paid && (
          <Button
            size="sm" variant="outline"
            className="h-5 text-[10px] px-1.5"
            onClick={() => onResend(inv.invoice_id)}
          >
            <Send className="w-2.5 h-2.5 mr-0.5" />{inv.status === "overdue" ? "Chase" : "Send"}
          </Button>
        )}
        {paid && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
        {inv.invoice_url && (
          <a href={inv.invoice_url} target="_blank" rel="noreferrer">
            <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
          </a>
        )}
      </div>
    </div>
  )
}

// ─── Entity card ─────────────────────────────────────────────────────────

function EntityCard({ entity, onResend }: { entity: Entity; onResend: (property: "safina-plaza" | "peepal-tree", invoiceId: string) => void }) {
  const property = entity.key === "plaza" ? "safina-plaza" : "peepal-tree"
  const paid     = entity.invoices.filter(i => i.status === "paid" || i.balance === 0)
  const overdue  = entity.invoices.filter(i => i.status === "overdue")
  const unpaid   = entity.invoices.filter(i => i.status !== "paid" && i.balance > 0)
  const collected = paid.reduce((s, i) => s + i.total, 0)
  const outstanding = unpaid.reduce((s, i) => s + i.balance, 0)

  // deposits
  const heldDeposits   = entity.deposits.filter(d => d.status !== "void")
  const totalDeposits  = heldDeposits.reduce((s, d) => s + d.total, 0)

  return (
    <Card className="bg-card border-border shadow-none">
      <CardHeader className="pt-5 pb-3 px-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">{entity.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{entity.property}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Collected",    value: fmt(collected),   cls: "text-foreground" },
            { label: "Outstanding",  value: fmt(outstanding), cls: outstanding > 0 ? "text-amber-600" : "text-foreground" },
            { label: "Overdue",      value: String(overdue.length), cls: overdue.length > 0 ? "text-red-500" : "text-foreground" },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-muted/50 rounded-lg p-2.5 text-center">
              <p className={`text-base font-semibold tabular-nums ${cls}`}>{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Invoice list */}
        {entity.invoices.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No invoices yet</p>
        ) : (
          <div className="divide-y divide-border">
            {entity.invoices.map(inv => (
              <InvoiceRow key={inv.invoice_id} inv={inv} onResend={(id) => onResend(property, id)} />
            ))}
          </div>
        )}

        {/* Deposit summary */}
        {heldDeposits.length > 0 && (
          <div className="pt-2 border-t border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Security Deposits Held</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{heldDeposits.length} deposit{heldDeposits.length > 1 ? "s" : ""} · {fmt(totalDeposits)} total</span>
              <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-slate-50 text-slate-600 border-slate-200">
                Refundable — not revenue
              </Badge>
            </div>
            <div className="mt-2 space-y-1">
              {heldDeposits.map(d => (
                <div key={d.retainerinvoice_id} className="flex items-center justify-between text-[11px]">
                  <span className="text-foreground">{d.customer_name}</span>
                  <span className="tabular-nums text-muted-foreground">{fmt(d.total)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [data, setData]     = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState<string | null>(null)

  const { scope } = usePropertyScope()

  const fetchData = useCallback(() => {
    setLoading(true)
    fetch("/api/billing")
      .then(r => r.json())
      .then((d: BillingData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleResend(property: "safina-plaza" | "peepal-tree", invoiceId: string) {
    setSending(invoiceId)
    try {
      await fetch("/api/razorpay/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionPageId: "", property, invoiceId }),
      })
      // Use Zoho send endpoint directly
      await fetch(`/api/billing/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ property, invoiceId }),
      })
    } finally {
      setSending(null)
      fetchData()
    }
  }

  const entities: Entity[] = data ? [
    { key: "plaza",  name: "Feazzo Holdings",         property: "Safina Plaza",  invoices: data.plaza.invoices,  deposits: data.plaza.deposits },
    { key: "peepal", name: "Safina Ventures Pvt Ltd", property: "Peepal Tree",   invoices: data.peepal.invoices, deposits: data.peepal.deposits },
  ] : []

  const visibleEntities = scope === "all" ? entities
    : scope === "safina-plaza" ? entities.filter(e => e.key === "plaza")
    : entities.filter(e => e.key === "peepal")

  const allInvoices  = entities.flatMap(e => e.invoices)
  const totalCollected   = allInvoices.filter(i => i.status === "paid" || i.balance === 0).reduce((s, i) => s + i.total, 0)
  const totalOutstanding = allInvoices.filter(i => i.balance > 0).reduce((s, i) => s + i.balance, 0)
  const totalOverdue     = allInvoices.filter(i => i.status === "overdue").length

  const allDeposits  = entities.flatMap(e => e.deposits)
  const totalDepositsHeld = allDeposits.filter(d => d.status !== "void").reduce((s, d) => s + d.total, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading from Zoho Books…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Collected",  value: fmt(totalCollected),        icon: CheckCircle2, cls: "text-emerald-600 bg-emerald-50" },
          { label: "Outstanding",      value: fmt(totalOutstanding),      icon: Clock,        cls: "text-amber-600 bg-amber-50" },
          { label: "Overdue Invoices", value: String(totalOverdue),       icon: AlertCircle,  cls: "text-red-500 bg-red-50" },
          { label: "Deposits Held",    value: fmt(totalDepositsHeld),     icon: IndianRupee,  cls: "text-slate-600 bg-slate-100" },
        ].map(({ label, value, icon: Icon, cls }) => (
          <Card key={label} className="bg-card border-border shadow-none">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground tabular-nums">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Zoho source badge */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" /> Live from Zoho Books
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={fetchData}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {/* Per-entity cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {visibleEntities.map(entity => (
          <EntityCard
            key={entity.key}
            entity={entity}
            onResend={handleResend}
          />
        ))}
      </div>

      {sending && (
        <div className="fixed bottom-4 right-4 bg-foreground text-background text-xs px-3 py-2 rounded-lg flex items-center gap-2 shadow-lg">
          <RefreshCw className="w-3 h-3 animate-spin" /> Sending invoice…
        </div>
      )}
    </div>
  )
}
