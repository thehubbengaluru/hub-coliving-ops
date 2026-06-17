"use client"

import { useState, useEffect, useCallback } from "react"
import type { MaintenanceTicket } from "@/lib/notion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CheckCircle2, RefreshCw, AlertCircle, Clock, Wrench, User, IndianRupee } from "lucide-react"
import { usePropertyScope } from "@/lib/property-context"

// ─── Helpers ──────────────────────────────────────────────────────────────

function urgencyLabel(t: MaintenanceTicket) {
  return t.isUrgent ? "Urgent" : "Non-urgent"
}

function statusLabel(t: MaintenanceTicket) {
  return t.resolved ? "Resolved" : "Open"
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function MaintenancePage() {
  const [tickets, setTickets]           = useState<MaintenanceTicket[]>([])
  const [loading, setLoading]           = useState(true)
  const [statusFilter, setStatusFilter] = useState("all")
  const [urgencyFilter, setUrgencyFilter] = useState("all")
  const [selected, setSelected]         = useState<MaintenanceTicket | null>(null)
  const [resolveComment, setResolveComment] = useState("")
  const [resolving, setResolving]       = useState(false)

  const { scope } = usePropertyScope()

  const fetchTickets = useCallback(() => {
    setLoading(true)
    fetch("/api/maintenance")
      .then(r => r.json())
      .then((data: MaintenanceTicket[]) => { setTickets(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchTickets() }, [fetchTickets])

  // Maintenance DB is property-agnostic (single form for both properties)
  // scope filter: room numbers 1xx → peepal, 2xx/3xx → plaza
  const scopedTickets = tickets.filter(t => {
    if (scope === "all") return true
    const num = parseInt(t.room)
    if (scope === "peepal-tree")  return num >= 100 && num < 200
    if (scope === "safina-plaza") return num >= 200
    return true
  })

  const filtered = scopedTickets.filter(t => {
    if (statusFilter  === "open"     && t.resolved)   return false
    if (statusFilter  === "resolved" && !t.resolved)  return false
    if (urgencyFilter === "urgent"   && !t.isUrgent)  return false
    if (urgencyFilter === "normal"   && t.isUrgent)   return false
    return true
  })

  const openCount     = scopedTickets.filter(t => !t.resolved).length
  const urgentCount   = scopedTickets.filter(t => !t.resolved && t.isUrgent).length
  const resolvedCount = scopedTickets.filter(t => t.resolved).length

  async function handleResolve() {
    if (!selected) return
    setResolving(true)
    await fetch("/api/maintenance/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notionPageId: selected.notionPageId, comment: resolveComment }),
    })
    setResolving(false)
    setSelected(null)
    setResolveComment("")
    fetchTickets()
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open",     count: openCount,     icon: AlertCircle,  iconCls: "text-red-500 bg-red-50",          countCls: "text-red-600" },
          { label: "Urgent",   count: urgentCount,   icon: Clock,        iconCls: "text-amber-600 bg-amber-50",      countCls: "text-amber-700" },
          { label: "Resolved", count: resolvedCount, icon: CheckCircle2, iconCls: "text-emerald-600 bg-emerald-50",  countCls: "text-emerald-700" },
        ].map(({ label, count, icon: Icon, iconCls, countCls }) => (
          <Card key={label} className="bg-card border-border shadow-none">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className={`text-xl font-semibold tabular-nums ${countCls}`}>{loading ? "—" : count}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap w-full">
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="flex-1 min-w-[100px] h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={urgencyFilter} onValueChange={v => setUrgencyFilter(v ?? "all")}>
          <SelectTrigger className="flex-1 min-w-[100px] h-9 text-xs"><SelectValue placeholder="Urgency" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Urgency</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="normal">Non-urgent</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{loading ? "…" : `${filtered.length} tickets`}</span>
        <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 shrink-0" onClick={fetchTickets}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading from Notion…
        </div>
      )}

      {/* Ticket grid */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(ticket => (
            <button
              key={ticket.notionPageId}
              onClick={() => { setSelected(ticket); setResolveComment("") }}
              className="bg-card border border-border rounded-xl p-4 text-left hover:border-slate-300 hover:shadow-sm transition-all duration-150 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ticket.isUrgent ? "bg-red-400" : "bg-blue-400"}`} />
                  <span className={`text-[10px] font-medium ${ticket.isUrgent ? "text-red-600" : "text-blue-700"}`}>
                    {urgencyLabel(ticket)}
                  </span>
                </div>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${
                  ticket.resolved
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-red-50 text-red-600 border-red-200"
                }`}>
                  {ticket.resolved ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
                  {statusLabel(ticket)}
                </span>
              </div>

              <p className="text-[13px] font-medium text-foreground leading-snug mb-1">
                {ticket.description.slice(0, 80)}{ticket.description.length > 80 ? "…" : ""}
              </p>

              {ticket.category.length > 0 && (
                <p className="text-[10px] text-muted-foreground mb-1.5">{ticket.category.join(", ")}</p>
              )}

              <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {ticket.room && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">Rm {ticket.room}</Badge>
                  )}
                  {ticket.location.length > 0 && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">{ticket.location[0]}</Badge>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(ticket.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </div>

              {ticket.assignedStaff.length > 0 && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <User className="w-2.5 h-2.5" /> {ticket.assignedStaff.join(", ")}
                </div>
              )}
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-3 flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground text-sm">
              <CheckCircle2 className="w-5 h-5" />
              {statusFilter === "open" ? "No open tickets" : "No tickets found"}
            </div>
          )}
        </div>
      )}

      {/* Detail / resolve modal */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); setResolveComment("") } }}>
        <DialogContent className="bg-card border-border max-w-md shadow-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wrench className="w-4 h-4 text-muted-foreground" />
              Maintenance Ticket
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-foreground">{selected.description}</p>
                {selected.category.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-1">{selected.category.join(" · ")}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {[
                  ["Room",       selected.room || "—"],
                  ["Urgency",    urgencyLabel(selected)],
                  ["Status",     statusLabel(selected)],
                  ["Location",   selected.location.join(", ") || "—"],
                  ["Assigned",   selected.assignedStaff.join(", ") || "Unassigned"],
                  ["Submitted",  new Date(selected.submittedAt).toLocaleDateString("en-IN")],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {selected.cost !== null && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <IndianRupee className="w-3 h-3" />
                  Cost incurred: <span className="font-medium text-foreground">₹{selected.cost.toLocaleString("en-IN")}</span>
                  {selected.fixType && <span>· {selected.fixType}</span>}
                </div>
              )}

              {selected.comment && (
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                  <p className="text-xs text-foreground">{selected.comment}</p>
                </div>
              )}

              {!selected.resolved && (
                <div className="space-y-2 pt-1">
                  <Textarea
                    value={resolveComment}
                    onChange={e => setResolveComment(e.target.value)}
                    placeholder="Resolution notes (optional)…"
                    className="text-xs h-16 resize-none"
                  />
                  <Button
                    className="w-full h-8 text-xs bg-foreground text-background hover:bg-foreground/90 gap-1.5"
                    onClick={handleResolve}
                    disabled={resolving}
                  >
                    {resolving ? <><RefreshCw className="w-3 h-3 animate-spin" /> Saving…</> : <><CheckCircle2 className="w-3 h-3" /> Mark Resolved in Notion</>}
                  </Button>
                </div>
              )}

              {selected.resolved && selected.resolutionDate && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Resolved on {new Date(selected.resolutionDate).toLocaleDateString("en-IN")}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
