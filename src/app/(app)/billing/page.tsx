"use client"

import { invoices } from "@/lib/mock-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Building2, Zap, CheckCircle2 } from "lucide-react"

const entities = [
  { id: "feazzo",           name: "Feazzo Holdings",         property: "Safina Plaza",   invoices: invoices.filter(i => i.entity === "feazzo") },
  { id: "safina-ventures",  name: "Safina Ventures Pvt Ltd", property: "Peepal Tree",    invoices: invoices.filter(i => i.entity === "safina-ventures") },
]

export default function BillingPage() {
  return (
    <div className="space-y-4">
      {/* Zoho sync banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Zoho Books sync active</p>
          <p className="text-xs text-muted-foreground mt-0.5">All invoices auto-generated and synced per entity. GST-compliant PDFs sent to guests.</p>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-100 shrink-0">
          View in Zoho
        </Button>
      </div>

      {/* Per-entity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {entities.map(entity => {
          const paid    = entity.invoices.filter(i => i.status === "paid")
          const overdue = entity.invoices.filter(i => i.status === "overdue")
          const pending = entity.invoices.filter(i => i.status === "unpaid")
          const totalRevenue = paid.reduce((s,i) => s+i.amount, 0)

          return (
            <Card key={entity.id} className="bg-card border-border shadow-none">
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
                    { label: "Collected", value: `₹${(totalRevenue/1000).toFixed(0)}k`, cls: "text-foreground" },
                    { label: "Overdue",   value: String(overdue.length),                cls: "text-red-500" },
                    { label: "Pending",   value: String(pending.length),                cls: "text-amber-600" },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="bg-muted/50 rounded-lg p-2.5 text-center">
                      <p className={`text-base font-semibold tabular-nums ${cls}`}>{value}</p>
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Invoice list */}
                <div className="space-y-0 divide-y divide-border">
                  {entity.invoices.map(inv => (
                    <div key={inv.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        inv.status === "paid" ? "bg-emerald-400" : inv.status === "overdue" ? "bg-red-400" : "bg-amber-400"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{inv.guestName}</p>
                        <p className="text-[10px] text-muted-foreground">{inv.period}</p>
                      </div>
                      <p className="text-xs font-medium text-foreground tabular-nums">
                        ₹{inv.amount.toLocaleString("en-IN")}
                        {inv.lateFee ? <span className="text-red-500"> +₹{inv.lateFee.toLocaleString("en-IN")}</span> : null}
                      </p>
                      {inv.status === "paid"
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        : <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5 shrink-0">
                            {inv.status === "overdue" ? "Chase" : "Send"}
                          </Button>
                      }
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <p className="text-[10px] text-muted-foreground">Next invoices: 25–27 Jun 2026</p>
                  <Button size="sm" variant="outline" className="h-7 text-xs">
                    <FileText className="w-3 h-3 mr-1" /> Draft
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Deposit ledger */}
      <Card className="bg-card border-border shadow-none">
        <CardHeader className="pt-5 pb-3 px-5">
          <CardTitle className="text-sm font-semibold">Security Deposit Ledger</CardTitle>
          <p className="text-xs text-muted-foreground">Recorded as refundable receipts in Zoho Books — not taxable revenue</p>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Deposits Held",  value: "11", sub: "₹2.8L held as security", cls: "text-foreground" },
              { label: "Pending Refund", value: "2",  sub: "Within 7 working days",  cls: "text-amber-600" },
              { label: "Refunded YTD",   value: "3",  sub: "₹72k returned",          cls: "text-emerald-600" },
            ].map(({ label, value, sub, cls }) => (
              <div key={label} className="bg-muted/50 rounded-xl p-4">
                <p className={`text-xl font-semibold tabular-nums ${cls}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                <p className="text-[10px] text-muted-foreground/70">{sub}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
