"use client"

import { useState, useEffect, useCallback } from "react"
import { revenueByMonth, occupancyTrend } from "@/lib/mock-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Building2, Users, AlertCircle, Wrench, IndianRupee,
  ArrowUpRight, Clock, CheckCircle2, TrendingUp, RefreshCw, Zap,
} from "lucide-react"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import Link from "next/link"
import type { Room } from "@/lib/types"
import type { PendingBooking } from "@/lib/notion"
import { usePropertyScope } from "@/lib/property-context"

// ─── Types ────────────────────────────────────────────────────────────────

type LiveStats = {
  totalBeds: number
  occupied: number
  vacant: number
  incoming: number
  blocked: number
  special: number
  occupancyRate: number
  revenueEstimate: number   // sum of monthlyRate for occupied beds
  plazaOccupied: number
  peepalOccupied: number
  plazaTotal: number
  peepalTotal: number
  depositsDue: number       // plaza beds with depositPaid=false
  depositsPaid: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function computeStats(rooms: Room[], scope: string): LiveStats {
  const filtered = scope === "all" ? rooms : rooms.filter(r => r.property === scope)
  let totalBeds = 0, occupied = 0, vacant = 0, incoming = 0, blocked = 0, special = 0
  let revenueEstimate = 0, depositsDue = 0, depositsPaid = 0
  let plazaOccupied = 0, peepalOccupied = 0, plazaTotal = 0, peepalTotal = 0

  for (const room of filtered) {
    for (const bed of room.beds) {
      totalBeds++
      if (room.property === "safina-plaza") plazaTotal++
      else peepalTotal++

      switch (bed.status) {
        case "occupied":
          occupied++
          revenueEstimate += room.monthlyRate
          if (room.property === "safina-plaza") plazaOccupied++
          else peepalOccupied++
          if (bed.depositPaid === false) depositsDue++
          if (bed.depositPaid === true)  depositsPaid++
          break
        case "vacant":   vacant++;   break
        case "incoming": incoming++; break
        case "blocked":  blocked++;  break
        case "special":  special++;  break
      }
    }
  }

  const occupancyRate = totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : 0
  return { totalBeds, occupied, vacant, incoming, blocked, special, occupancyRate, revenueEstimate, plazaOccupied, peepalOccupied, plazaTotal, peepalTotal, depositsDue, depositsPaid }
}

// ─── Sub-components ───────────────────────────────────────────────────────

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

const CHART_COLORS = { safina: "#334155", peepal: "#94a3b8", occupancy: "#334155", grid: "#f1f5f9", tick: "#94a3b8" }

// ─── Page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [pending, setPending] = useState<PendingBooking[]>([])
  const [loading, setLoading] = useState(true)
  const { scope } = usePropertyScope()

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch("/api/rooms").then(r => r.json()),
      fetch("/api/bookings/pending").then(r => r.json()),
    ]).then(([roomData, pendingData]: [Room[], PendingBooking[]]) => {
      setRooms(roomData)
      setPending(Array.isArray(pendingData) ? pendingData : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const stats = computeStats(rooms, scope)
  const scopedPending = scope === "all" ? pending : pending.filter(b => b.property === scope)

  const scopeLabel = scope === "safina-plaza" ? "Safina Plaza" : scope === "peepal-tree" ? "Peepal Tree" : "Both properties"

  return (
    <div className="space-y-5">
      {/* Live data notice + refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {loading
            ? <span className="text-xs text-muted-foreground flex items-center gap-1.5"><RefreshCw className="w-3 h-3 animate-spin" /> Loading from Notion…</span>
            : <span className="flex items-center gap-1.5 text-[11px] text-emerald-600"><CheckCircle2 className="w-3 h-3" /> Live from Notion · {scopeLabel}</span>
          }
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={fetchData}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Occupancy Rate"
          value={loading ? "—" : `${stats.occupancyRate}%`}
          sub={loading ? "Loading…" : `${stats.occupied} of ${stats.totalBeds} beds`}
          icon={Building2}
          accent
        />
        <StatCard
          label="Est. Revenue / Month"
          value={loading ? "—" : `₹${Math.round(stats.revenueEstimate / 1000)}k`}
          sub={loading ? "" : `${scopeLabel} · occupied beds`}
          icon={IndianRupee}
        />
        <StatCard
          label="Pending Bookings"
          value={loading ? "—" : String(scopedPending.length)}
          sub="From booking site — activate to confirm"
          icon={Clock}
        />
        <StatCard
          label="Deposits Due"
          value={loading ? "—" : String(stats.depositsDue)}
          sub={loading ? "" : `${stats.depositsPaid} paid (Plaza only)`}
          icon={AlertCircle}
        />
      </div>

      {/* Charts — revenue trend uses representative mock data; will update once Razorpay webhooks are live */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <Card className="lg:col-span-3 bg-card border-border shadow-none">
          <CardHeader className="pb-1 pt-5 px-5">
            <CardTitle className="text-sm font-semibold text-foreground">Revenue by Property</CardTitle>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Jan – Jun 2026
              <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1 text-amber-600 border-amber-200 bg-amber-50">Representative</Badge>
            </p>
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
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              6-month view
              <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1 text-amber-600 border-amber-200 bg-amber-50">Representative</Badge>
            </p>
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
        {/* Live bed breakdown */}
        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-2 pt-5 px-5 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Bed Status</CardTitle>
            <Link href="/rooms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">View board →</Link>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <RefreshCw className="w-3 h-3 animate-spin" /> Loading…
              </div>
            ) : [
              { label: "Occupied",  count: stats.occupied,  bar: "bg-slate-800", dot: "bg-emerald-500" },
              { label: "Vacant",    count: stats.vacant,    bar: "bg-orange-400", dot: "bg-orange-400" },
              { label: "Incoming",  count: stats.incoming,  bar: "bg-amber-400",  dot: "bg-amber-400" },
              { label: "Blocked / Special", count: stats.blocked + stats.special, bar: "bg-red-400", dot: "bg-red-400" },
            ].map(({ label, count, bar, dot }) => (
              <div key={label} className="flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
                <span className="text-xs text-muted-foreground flex-1">{label}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${bar} rounded-full`} style={{ width: stats.totalBeds > 0 ? `${(count / stats.totalBeds) * 100}%` : "0%" }} />
                  </div>
                  <span className="text-xs font-medium text-foreground tabular-nums w-4 text-right">{count}</span>
                </div>
              </div>
            ))}
            {!loading && (
              <div className="pt-1 border-t border-border grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div>Plaza: <span className="font-medium text-foreground">{stats.plazaOccupied}/{stats.plazaTotal}</span></div>
                <div>Peepal: <span className="font-medium text-foreground">{stats.peepalOccupied}/{stats.peepalTotal}</span></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending bookings to action */}
        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-2 pt-5 px-5 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Pending Bookings</CardTitle>
            <Link href="/guests" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Activate →</Link>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="w-3 h-3 animate-spin" /> Loading…</div>
            ) : scopedPending.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> All bookings activated
              </div>
            ) : scopedPending.slice(0, 4).map(b => (
              <div key={b.notionPageId} className="flex items-start justify-between gap-2 pb-2.5 border-b border-border last:border-0 last:pb-0">
                <div>
                  <p className="text-xs font-medium text-foreground">{b.guestName}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Rm {b.room} · {b.property === "safina-plaza" ? "Plaza" : b.property === "peepal-tree" ? "Peepal" : "Unknown"}
                  </p>
                </div>
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 shrink-0 bg-amber-50 text-amber-700 border-amber-200">
                  Awaiting
                </Badge>
              </div>
            ))}
            {!loading && scopedPending.length > 4 && (
              <p className="text-[11px] text-muted-foreground">+{scopedPending.length - 4} more in Guests → Pending</p>
            )}
          </CardContent>
        </Card>

        {/* Deposits due (Plaza) */}
        <Card className="bg-card border-border shadow-none">
          <CardHeader className="pb-2 pt-5 px-5 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">Deposits (Plaza)</CardTitle>
            <Link href="/payments" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Manage →</Link>
          </CardHeader>
          <CardContent className="px-5 pb-5 space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="w-3 h-3 animate-spin" /> Loading…</div>
            ) : (
              <>
                {[
                  { label: "Deposit paid",     count: stats.depositsPaid, dot: "bg-emerald-400", text: "text-emerald-600" },
                  { label: "Deposit due",      count: stats.depositsDue,  dot: "bg-amber-400",   text: "text-amber-700" },
                ].map(({ label, count, dot, text }) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`} />
                    <span className="text-xs text-muted-foreground flex-1">{label}</span>
                    <span className={`text-xs font-semibold tabular-nums ${text}`}>{count}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-border flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Zap className="w-3 h-3" /> Peepal deposit tracking not in Notion
                </div>
                {stats.depositsDue > 0 && (
                  <Link href="/payments">
                    <Button size="sm" className="w-full h-7 text-[11px] mt-1 bg-foreground text-background hover:bg-foreground/90">
                      Send {stats.depositsDue} missing link{stats.depositsDue > 1 ? "s" : ""}
                    </Button>
                  </Link>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Beds Occupied",
            value: loading ? "—" : String(stats.occupied),
            icon: CheckCircle2,
            sub: loading ? "" : `of ${stats.totalBeds} total`,
          },
          {
            label: "Vacant Beds",
            value: loading ? "—" : String(stats.vacant),
            icon: Building2,
            sub: "Available now",
          },
          {
            label: "Incoming",
            value: loading ? "—" : String(stats.incoming),
            icon: TrendingUp,
            sub: "Booked, not yet arrived",
          },
          {
            label: "To Action",
            value: loading ? "—" : String(scopedPending.length + stats.depositsDue),
            icon: AlertCircle,
            sub: `${scopedPending.length} pending bookings · ${stats.depositsDue} deposits due`,
          },
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

      {/* Leads / Maintenance / Billing notice */}
      <div className="bg-muted/40 border border-border rounded-xl p-4 flex items-start gap-3">
        <Users className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Leads, Maintenance, and Billing</span> panels will show live data once those Notion databases are connected. Revenue trend charts will update once Razorpay webhook secrets are configured.
        </p>
      </div>
    </div>
  )
}
