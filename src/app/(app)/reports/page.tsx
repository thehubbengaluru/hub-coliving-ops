"use client"

import { revenueByMonth, occupancyTrend, rooms, leads, invoices } from "@/lib/mock-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from "recharts"

const C = {
  grid: "#f1f5f9",
  tick: "#94a3b8",
  bar1: "#334155",
  bar2: "#94a3b8",
  line: "#334155",
  pie: ["#334155", "#64748b", "#94a3b8", "#cbd5e1"],
}

const tooltipStyle = {
  contentStyle: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    fontSize: "12px",
    color: "#0f172a",
    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
  }
}

const roomTypeData = [
  { name: "Private — Occupied", value: rooms.filter(r => r.type === "private" && r.beds[0].status === "occupied").length },
  { name: "Private — Vacant",   value: rooms.filter(r => r.type === "private" && r.beds[0].status === "vacant").length },
  { name: "Sharing — Full",     value: rooms.filter(r => r.type === "sharing" && r.beds.every(b => b.status === "occupied")).length },
  { name: "Sharing — Partial",  value: rooms.filter(r => r.type === "sharing" && r.beds.some(b => b.status === "occupied") && !r.beds.every(b => b.status === "occupied")).length },
]
const leadSourceData = [
  { name: "Online",   value: leads.filter(l => l.source === "online").length },
  { name: "Walk-in",  value: leads.filter(l => l.source === "walk-in").length },
  { name: "Referral", value: leads.filter(l => l.source === "referral").length },
]
const conversionFunnel = [
  { stage: "Captured",  count: leads.length },
  { stage: "Viewing",   count: leads.filter(l => ["viewing-scheduled","viewed","deposit-paid","checked-in"].includes(l.stage)).length },
  { stage: "Viewed",    count: leads.filter(l => ["viewed","deposit-paid","checked-in"].includes(l.stage)).length },
  { stage: "Deposit",   count: leads.filter(l => ["deposit-paid","checked-in"].includes(l.stage)).length },
  { stage: "Checked In",count: leads.filter(l => l.stage === "checked-in").length },
]
const paymentBreakdown = [
  { name: "Paid",    value: invoices.filter(i => i.status === "paid").reduce((s,i) => s+i.amount,0), fill: "#334155" },
  { name: "Pending", value: invoices.filter(i => i.status === "unpaid").reduce((s,i) => s+i.amount,0), fill: "#94a3b8" },
  { name: "Overdue", value: invoices.filter(i => i.status === "overdue").reduce((s,i) => s+i.amount+(i.lateFee??0),0), fill: "#fca5a5" },
]

export default function ReportsPage() {
  const totalRevenue = revenueByMonth.reduce((s,m) => s+m.safina+m.peepal, 0)
  const avgOccupancy = Math.round(occupancyTrend.reduce((s,m) => s+m.rate, 0) / occupancyTrend.length)

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "YTD Revenue",       value: `₹${(totalRevenue/100000).toFixed(1)}L`, sub: "Both properties" },
          { label: "Avg Occupancy",     value: `${avgOccupancy}%`,                      sub: "6-month average" },
          { label: "Total Leads",       value: String(leads.length),                    sub: `${Math.round((leads.filter(l=>l.stage==="checked-in").length/leads.length)*100)}% converted` },
          { label: "Avg Rev / Bed",     value: "₹24k",                                 sub: "Per occupied bed/mo" },
        ].map(({ label, value, sub }) => (
          <Card key={label} className="bg-card border-border shadow-none">
            <CardContent className="p-5">
              <p className="text-2xl font-semibold text-foreground tabular-nums">{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              <p className="text-[10px] text-muted-foreground/70">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Revenue + Occupancy */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <Card className="lg:col-span-3 bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Monthly Revenue by Property</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-5">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByMonth} barSize={14} barGap={3}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize:11, fill:C.tick }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:C.tick }} axisLine={false} tickLine={false} tickFormatter={v=>`₹${v/1000}k`} />
                <Tooltip {...tooltipStyle} formatter={v=>[`₹${Number(v).toLocaleString("en-IN")}`,""]} />
                <Legend wrapperStyle={{ fontSize:"11px", paddingTop:"8px", color:"#64748b" }} />
                <Bar dataKey="safina" name="Safina Plaza" fill={C.bar1} radius={[3,3,0,0]} />
                <Bar dataKey="peepal" name="Peepal Tree"  fill={C.bar2} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2 bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Occupancy Trend</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-5">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={occupancyTrend}>
                <defs>
                  <linearGradient id="occ2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={C.line} stopOpacity={0.07} />
                    <stop offset="95%" stopColor={C.line} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize:11, fill:C.tick }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:C.tick }} axisLine={false} tickLine={false} domain={[0,100]} tickFormatter={v=>`${v}%`} />
                <Tooltip {...tooltipStyle} formatter={v=>[`${v}%`,"Occupancy"]} />
                <Area type="monotone" dataKey="rate" stroke={C.line} strokeWidth={1.5} fill="url(#occ2)" dot={{ fill:C.line, r:3, strokeWidth:0 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Pies + Funnel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Room Distribution</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={roomTypeData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
                  {roomTypeData.map((_,i) => <Cell key={i} fill={C.pie[i]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize:"10px", color:"#64748b" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Lead Sources</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={leadSourceData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" paddingAngle={2}>
                  {leadSourceData.map((_,i) => <Cell key={i} fill={C.pie[i]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize:"10px", color:"#64748b" }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold">Conversion Funnel</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 pt-3 space-y-2.5">
            {conversionFunnel.map((s, i) => (
              <div key={s.stage} className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-16 shrink-0">{s.stage}</span>
                <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                  <div className="h-full bg-foreground rounded-full" style={{ width:`${(s.count/conversionFunnel[0].count)*100}%`, opacity: 1 - i*0.12 }} />
                </div>
                <span className="text-xs font-medium text-foreground tabular-nums w-4 text-right">{s.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Payment bar */}
      <Card className="bg-card border-border shadow-none">
        <CardHeader className="pb-1 pt-5 px-5">
          <CardTitle className="text-sm font-semibold">June 2026 — Payment Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex gap-5 flex-wrap mb-3">
            {paymentBreakdown.map(({ name, value, fill }) => (
              <div key={name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: fill }} />
                <span className="text-xs text-muted-foreground">{name}</span>
                <span className="text-xs font-medium text-foreground tabular-nums">₹{(value/1000).toFixed(1)}k</span>
              </div>
            ))}
          </div>
          <div className="h-2.5 bg-muted rounded-full overflow-hidden flex gap-0.5">
            {paymentBreakdown.map(({ name, value, fill }) => {
              const total = paymentBreakdown.reduce((s,p) => s+p.value, 0)
              return <div key={name} style={{ width:`${(value/total)*100}%`, backgroundColor: fill }} className="h-full first:rounded-l-full last:rounded-r-full" />
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
