"use client"

import { dashboardStats, revenueByMonth, occupancyTrend, invoices, tickets, leads } from "@/lib/mock-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Building2, Users, AlertCircle, Wrench, IndianRupee, ArrowUpRight, Clock, CheckCircle2, TrendingUp } from "lucide-react"
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import Link from "next/link"

const CHART_COLORS = {
  safina:     "#334155",
  peepal:     "#94a3b8",
  occupancy:  "#334155",
  grid:       "#f1f5f9",
  tick:       "#94a3b8",
}

function StatCard({ label, value, sub, icon: Icon, trend, accent = false }: {
  label: string; value: string; sub?: string; icon: React.ElementType; trend?: string; accent?: boolean
}) {
  return (
    <Card className="bg-card border-border shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? "bg-foreground" : "bg-muted"}`}>
            <Icon className={`w-4 h-4 ${accent ? "text-background" : "text-muted-foreground"}`} />
          </div>
          {trend && (
            <span className="flex items-center gap-0.5 text-[11px] text-emerald-600 font-medium">
              <ArrowUpRight className="w-3 h-3" />{trend}
            </span>
          )}
        </div>
        <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

const ChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="font-medium text-foreground mb-1.5">{label}</p>
      {payload.map(p => (
        <p key={p.name} className="text-muted-foreground">
          <span style={{ color: p.color }}>■</span> {p.name}: <span className="font-medium text-foreground tabular-nums">₹{p.value.toLocaleString("en-IN")}</span>
        </p>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const overdueInvoices = invoices.filter(i => i.status === "overdue")
  const openTickets = tickets.filter(t => t.status !== "resolved")
  const activeLeads = leads.filter(l => !["checked-in", "dropped-off"].includes(l.stage))

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Occupancy Rate"    value={`${dashboardStats.occupancyRate}%`} sub="13 of 18 beds"        icon={Building2}     trend="+3%"  accent />
        <StatCard label="Revenue This Month" value={`₹${(dashboardStats.revenueThisMonth / 1000).toFixed(0)}k`} sub="Both properties" icon={IndianRupee} trend="+8%" />
        <StatCard label="Outstanding"        value={`₹${(dashboardStats.outstandingPayments / 1000).toFixed(0)}k`} sub="2 overdue"    icon={AlertCircle} />
        <StatCard label="Active Leads"       value={String(activeLeads.length)} sub={`${dashboardStats.conversionRate}% conversion`} icon={Users} trend="+2" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <Card className="lg:col-span-3 bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold text-foreground">Revenue by Property</CardTitle>
            <p className="text-xs text-muted-foreground">Jan – Jun 2026</p>
          </CardHeader>
          <CardContent className="px-2 pb-5">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={revenueByMonth} barSize={14} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: CHART_COLORS.tick }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.tick }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v / 1000}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px", color: "#64748b" }} />
                <Bar dataKey="safina" name="Safina Plaza" fill={CHART_COLORS.safina} radius={[3, 3, 0, 0]} />
                <Bar dataKey="peepal" name="Peepal Tree"  fill={CHART_COLORS.peepal} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold text-foreground">Occupancy Trend</CardTitle>
            <p className="text-xs text-muted-foreground">6-month view</p>
          </CardHeader>
          <CardContent className="px-2 pb-5">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={occupancyTrend}>
                <defs>
                  <linearGradient id="occGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={CHART_COLORS.occupancy} stopOpacity={0.08} />
                    <stop offset="95%" stopColor={CHART_COLORS.occupancy} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: CHART_COLORS.tick }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: CHART_COLORS.tick }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v) => [`${v}%`, "Occupancy"]} contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: "8px", fontSize: "12px" }} />
                <Area type="monotone" dataKey="rate" stroke={CHART_COLORS.occupancy} strokeWidth={1.5} fill="url(#occGrad)" dot={{ fill: CHART_COLORS.occupancy, r: 3, strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Room status */}
        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-2 pt-5 px-5 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Room Status</CardTitle>
            <Link href="/rooms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">View board →</Link>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {[
              { label: "Occupied",  count: dashboardStats.occupiedRooms,  bar: "bg-slate-800", dot: "bg-emerald-500" },
              { label: "Vacant",    count: dashboardStats.vacantRooms,    bar: "bg-orange-400", dot: "bg-orange-400" },
              { label: "Incoming",  count: dashboardStats.incomingRooms,  bar: "bg-amber-400",  dot: "bg-amber-400" },
              { label: "Blocked",   count: dashboardStats.blockedRooms,   bar: "bg-red-400",    dot: "bg-red-400" },
            ].map(({ label, count, bar, dot }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
                <span className="text-xs text-muted-foreground flex-1">{label}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${bar} rounded-full`} style={{ width: `${(count / dashboardStats.totalRooms) * 100}%` }} />
                  </div>
                  <span className="text-xs font-medium text-foreground tabular-nums w-4 text-right">{count}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Overdue */}
        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-2 pt-5 px-5 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Overdue Payments</CardTitle>
            <Link href="/payments" className="text-xs text-muted-foreground hover:text-foreground transition-colors">View all →</Link>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {overdueInvoices.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> All payments up to date
              </div>
            ) : overdueInvoices.map(inv => (
              <div key={inv.id} className="flex items-start justify-between gap-2 pb-2.5 border-b border-border last:border-0 last:pb-0">
                <div>
                  <p className="text-xs font-medium text-foreground">{inv.guestName}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Rm {inv.roomId.replace("r", "")} · {inv.period}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-red-500 tabular-nums">₹{((inv.amount + (inv.lateFee ?? 0)) / 1000).toFixed(1)}k</p>
                  <p className="text-[10px] text-red-400">+₹{inv.lateFee} fee</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Tickets */}
        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-2 pt-5 px-5 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Open Tickets</CardTitle>
            <Link href="/maintenance" className="text-xs text-muted-foreground hover:text-foreground transition-colors">View all →</Link>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {openTickets.slice(0, 4).map(ticket => (
              <div key={ticket.id} className="flex items-start gap-2.5 pb-2.5 border-b border-border last:border-0 last:pb-0">
                <div className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                  ticket.urgency === "high" ? "bg-red-400" : ticket.urgency === "medium" ? "bg-amber-400" : "bg-blue-400"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate">{ticket.description.slice(0, 44)}…</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Rm {ticket.roomNumber} · {ticket.property === "safina-plaza" ? "Plaza" : "PT"}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] h-4 px-1.5 shrink-0 font-normal border ${
                  ticket.status === "in-progress" ? "border-amber-200 text-amber-600 bg-amber-50" : "border-red-200 text-red-500 bg-red-50"
                }`}>
                  {ticket.status === "in-progress" ? "Active" : "Open"}
                </Badge>
              </div>
            ))}
            {openTickets.length === 0 && (
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> No open tickets
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Leads This Week", value: "7",  icon: TrendingUp, sub: "3 awaiting response" },
          { label: "Pending Refunds", value: "2",  icon: Clock,       sub: "Within 7 working days" },
          { label: "Auto-debit Live", value: "8",  icon: CheckCircle2,sub: "Mandates active" },
          { label: "Rooms Checked Out", value: "1",icon: Wrench,      sub: "Awaiting inspection" },
        ].map(({ label, value, icon: Icon, sub }) => (
          <Card key={label} className="bg-card border-border shadow-none">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-semibold text-foreground tabular-nums">{value}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                <p className="text-[10px] text-muted-foreground/60 leading-tight">{sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
