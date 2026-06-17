"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts"
import { RefreshCw, TrendingUp, Users, IndianRupee, Home, CheckCircle2 } from "lucide-react"
import type { Room } from "@/lib/types"
import type { Lead } from "@/lib/notion"
import type { ZohoInvoiceListItem } from "@/lib/zoho"
import { usePropertyScope } from "@/lib/property-context"

// ─── Chart constants ───────────────────────────────────────────────────────

const C = {
  grid: "#f1f5f9",
  tick: "#94a3b8",
  bar1: "#334155",
  bar2: "#94a3b8",
  pie:  ["#334155", "#64748b", "#94a3b8", "#cbd5e1"],
}

const tip = {
  contentStyle: {
    background: "#fff", border: "1px solid #e2e8f0",
    borderRadius: "8px", fontSize: "12px", color: "#0f172a",
    boxShadow: "0 4px 6px -1px rgb(0 0 0/0.05)",
  },
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-")
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" })
}

type BillingData = {
  plaza:  { invoices: ZohoInvoiceListItem[]; deposits: unknown[] }
  peepal: { invoices: ZohoInvoiceListItem[]; deposits: unknown[] }
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [rooms,   setRooms]   = useState<Room[]>([])
  const [leads,   setLeads]   = useState<Lead[]>([])
  const [billing, setBilling] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)

  const { scope } = usePropertyScope()

  const fetchAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch("/api/rooms").then(r => r.json()),
      fetch("/api/leads").then(r => r.json()),
      fetch("/api/billing").then(r => r.json()),
    ]).then(([r, l, b]) => {
      setRooms(Array.isArray(r) ? r : [])
      setLeads(Array.isArray(l) ? l : [])
      setBilling(b?.plaza ? b : null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ── Scope filter ──────────────────────────────────────────────────────
  const scopedRooms = scope === "all" ? rooms : rooms.filter(r => r.property === scope)
  const scopedLeads = scope === "all" ? leads : leads.filter(l => l.property === scope || l.property === null)

  // ── Rooms / beds ──────────────────────────────────────────────────────
  const allBeds      = scopedRooms.flatMap(r => r.beds)
  const occupiedBeds = allBeds.filter(b => b.status === "occupied")
  const totalBeds    = allBeds.length
  const occupancyPct = totalBeds ? Math.round((occupiedBeds.length / totalBeds) * 100) : 0

  const plazaRooms  = rooms.filter(r => r.property === "safina-plaza")
  const peepalRooms = rooms.filter(r => r.property === "peepal-tree")
  const plazaBeds   = plazaRooms.flatMap(r => r.beds)
  const peepalBeds  = peepalRooms.flatMap(r => r.beds)

  const monthlyRunRate = scopedRooms.reduce((s, r) => {
    const occupiedCount = r.beds.filter(b => b.status === "occupied").length
    return s + r.monthlyRate * occupiedCount
  }, 0)
  const revenuePerBed = occupiedBeds.length ? Math.round(monthlyRunRate / occupiedBeds.length) : 0

  const roomDistData = [
    { name: "Private — Occupied", value: scopedRooms.filter(r => r.type === "private" && r.beds.some(b => b.status === "occupied")).length },
    { name: "Private — Vacant",   value: scopedRooms.filter(r => r.type === "private" && r.beds.every(b => b.status !== "occupied")).length },
    { name: "Sharing — Full",     value: scopedRooms.filter(r => r.type === "sharing" && r.beds.every(b => b.status === "occupied")).length },
    { name: "Sharing — Partial",  value: scopedRooms.filter(r => r.type === "sharing" && r.beds.some(b => b.status === "occupied") && !r.beds.every(b => b.status === "occupied")).length },
  ].filter(d => d.value > 0)

  const occupancyCompare = [
    { property: "Safina Plaza", occ: plazaBeds.filter(b => b.status === "occupied").length, total: plazaBeds.length },
    { property: "Peepal Tree",  occ: peepalBeds.filter(b => b.status === "occupied").length, total: peepalBeds.length },
  ]

  // ── Leads ────────────────────────────────────────────────────────────
  const wonLeads  = scopedLeads.filter(l => l.status === "won")
  const lostLeads = scopedLeads.filter(l => l.status === "lost")
  const pendLeads = scopedLeads.filter(l => l.status === "yet-to-confirm")

  const conversionRate = scopedLeads.length
    ? Math.round((wonLeads.length / scopedLeads.length) * 100)
    : 0

  const leadFunnelData = [
    { stage: "Total",   count: scopedLeads.length },
    { stage: "Pending", count: pendLeads.length },
    { stage: "Won",     count: wonLeads.length },
    { stage: "Lost",    count: lostLeads.length },
  ]

  // ── Billing ──────────────────────────────────────────────────────────
  const plazaInvoices  = billing?.plaza.invoices  ?? []
  const peepalInvoices = billing?.peepal.invoices ?? []

  const scopedInvoices = scope === "all"
    ? [...plazaInvoices, ...peepalInvoices]
    : scope === "safina-plaza" ? plazaInvoices : peepalInvoices

  // Monthly revenue grouped by month
  const monthlyMap: Record<string, { month: string; safina: number; peepal: number }> = {}
  for (const inv of plazaInvoices) {
    const ym = inv.date.slice(0, 7)
    if (!monthlyMap[ym]) monthlyMap[ym] = { month: ym, safina: 0, peepal: 0 }
    monthlyMap[ym].safina += inv.total
  }
  for (const inv of peepalInvoices) {
    const ym = inv.date.slice(0, 7)
    if (!monthlyMap[ym]) monthlyMap[ym] = { month: ym, safina: 0, peepal: 0 }
    monthlyMap[ym].peepal += inv.total
  }
  const monthlyRevData = Object.values(monthlyMap)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(d => ({ ...d, month: fmtMonth(d.month) }))

  // YTD = current year paid invoices
  const thisYear  = new Date().getFullYear().toString()
  const ytdRevenue = [...plazaInvoices, ...peepalInvoices]
    .filter(i => i.date.startsWith(thisYear) && (i.status === "paid" || i.balance === 0))
    .reduce((s, i) => s + i.total, 0)

  // Payment breakdown
  const paidTotal        = scopedInvoices.filter(i => i.status === "paid" || i.balance === 0).reduce((s, i) => s + i.total, 0)
  const outstandingTotal = scopedInvoices.filter(i => i.balance > 0 && i.status !== "overdue").reduce((s, i) => s + i.balance, 0)
  const overdueTotal     = scopedInvoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.balance, 0)

  const paymentBreakdown = [
    { name: "Paid",        value: paidTotal,        fill: "#334155" },
    { name: "Outstanding", value: outstandingTotal,  fill: "#94a3b8" },
    { name: "Overdue",     value: overdueTotal,      fill: "#fca5a5" },
  ].filter(d => d.value > 0)

  const paymentTotal = paymentBreakdown.reduce((s, d) => s + d.value, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading live data…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "YTD Revenue",     value: `₹${(ytdRevenue / 100000).toFixed(1)}L`,  sub: `${thisYear} paid invoices`,     icon: IndianRupee,  cls: "text-emerald-600 bg-emerald-50" },
          { label: "Occupancy",       value: `${occupancyPct}%`,                        sub: `${occupiedBeds.length}/${totalBeds} beds filled`,  icon: Home,         cls: "text-blue-600 bg-blue-50" },
          { label: "Total Leads",     value: String(scopedLeads.length),                sub: `${conversionRate}% converted`,  icon: Users,        cls: "text-slate-600 bg-slate-100" },
          { label: "Avg Rev / Bed",   value: revenuePerBed ? `₹${revenuePerBed.toLocaleString("en-IN")}` : "—",
                                                                                         sub: "Per occupied bed/mo",           icon: TrendingUp,   cls: "text-purple-600 bg-purple-50" },
        ].map(({ label, value, sub, icon: Icon, cls }) => (
          <Card key={label} className="bg-card border-border shadow-none">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-semibold text-foreground tabular-nums">{value}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-[10px] text-muted-foreground/60">{sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Live badge + refresh */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3" /> Live from Notion + Zoho Books
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={fetchAll}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {/* Revenue + Occupancy by property */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Monthly revenue chart */}
        <Card className="lg:col-span-3 bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Monthly Revenue by Property</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-5">
            {monthlyRevData.length === 0 ? (
              <div className="h-[220px] flex items-center justify-center text-xs text-muted-foreground">No invoice data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyRevData} barSize={14} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.tick }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v / 1000}k`} />
                  <Tooltip {...tip} formatter={v => [`₹${Number(v).toLocaleString("en-IN")}`, ""]} />
                  <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px", color: "#64748b" }} />
                  <Bar dataKey="safina" name="Safina Plaza" fill={C.bar1} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="peepal" name="Peepal Tree"  fill={C.bar2} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Occupancy by property */}
        <Card className="lg:col-span-2 bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Current Occupancy</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-3 space-y-4">
            {occupancyCompare.map(({ property, occ, total }) => {
              const pct = total ? Math.round((occ / total) * 100) : 0
              return (
                <div key={property}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-foreground font-medium">{property}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{occ}/{total} beds · {pct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? "#334155" : pct >= 60 ? "#64748b" : "#94a3b8" }}
                    />
                  </div>
                </div>
              )
            })}
            <div className="pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Overall</span>
                <span className="text-sm font-semibold text-foreground tabular-nums">{occupancyPct}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pies + Lead funnel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Room distribution */}
        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Room Distribution</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            {roomDistData.length === 0 ? (
              <div className="h-[180px] flex items-center justify-center text-xs text-muted-foreground">No room data</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={roomDistData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {roomDistData.map((_, i) => <Cell key={i} fill={C.pie[i % C.pie.length]} />)}
                  </Pie>
                  <Tooltip {...tip} />
                  <Legend wrapperStyle={{ fontSize: "10px", color: "#64748b" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Lead pipeline bar */}
        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Lead Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-5">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={leadFunnelData} barSize={28} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: C.tick }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 11, fill: C.tick }} axisLine={false} tickLine={false} width={48} />
                <Tooltip {...tip} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {leadFunnelData.map((d, i) => (
                    <Cell key={i} fill={
                      d.stage === "Won"  ? "#334155" :
                      d.stage === "Lost" ? "#fca5a5" :
                      C.bar2
                    } />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Payment breakdown */}
        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Invoice Status</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-3">
            {paymentBreakdown.length === 0 ? (
              <div className="h-[150px] flex items-center justify-center text-xs text-muted-foreground">No invoice data</div>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  {paymentBreakdown.map(({ name, value, fill }) => (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: fill }} />
                          <span className="text-xs text-muted-foreground">{name}</span>
                        </div>
                        <span className="text-xs font-medium text-foreground tabular-nums">
                          ₹{(value / 1000).toFixed(1)}k
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${paymentTotal ? (value / paymentTotal) * 100 : 0}%`, backgroundColor: fill }} />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Total: ₹{(paymentTotal / 1000).toFixed(1)}k across {scopedInvoices.length} invoices
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
