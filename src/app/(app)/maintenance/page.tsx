"use client"

import { useState } from "react"
import { tickets } from "@/lib/mock-data"
import type { TicketStatus, TicketUrgency } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Wrench, CheckCircle2, AlertTriangle, RefreshCw, AlertCircle, User } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const urgencyConfig: Record<TicketUrgency, { label: string; dot: string; text: string; badge: string }> = {
  high:   { label: "High",   dot: "bg-red-400",    text: "text-red-600",    badge: "bg-red-50 text-red-600 border-red-200" },
  medium: { label: "Medium", dot: "bg-amber-400",  text: "text-amber-700",  badge: "bg-amber-50 text-amber-700 border-amber-200" },
  low:    { label: "Low",    dot: "bg-blue-400",   text: "text-blue-700",   badge: "bg-blue-50 text-blue-700 border-blue-200" },
}

const statusConfig: Record<TicketStatus, { label: string; badge: string; icon: React.ElementType }> = {
  open:        { label: "Open",        badge: "bg-red-50 text-red-600 border-red-200",       icon: AlertCircle },
  "in-progress":{ label: "In Progress",badge: "bg-amber-50 text-amber-700 border-amber-200", icon: RefreshCw },
  resolved:    { label: "Resolved",   badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
}

export default function MaintenancePage() {
  const [statusFilter, setStatusFilter] = useState("all")
  const [urgencyFilter, setUrgencyFilter] = useState("all")
  const [propertyFilter, setPropertyFilter] = useState("all")
  const [selected, setSelected] = useState<typeof tickets[0] | null>(null)

  const filtered = tickets.filter(t => {
    if (statusFilter !== "all" && t.status !== statusFilter) return false
    if (urgencyFilter !== "all" && t.urgency !== urgencyFilter) return false
    if (propertyFilter !== "all" && t.property !== propertyFilter) return false
    return true
  })

  const openCount       = tickets.filter(t => t.status === "open").length
  const inProgressCount = tickets.filter(t => t.status === "in-progress").length
  const resolvedCount   = tickets.filter(t => t.status === "resolved").length

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Open",        count: openCount,        icon: AlertCircle,  iconCls: "text-red-500 bg-red-50",     countCls: "text-red-600" },
          { label: "In Progress", count: inProgressCount,  icon: RefreshCw,    iconCls: "text-amber-600 bg-amber-50", countCls: "text-amber-700" },
          { label: "Resolved",    count: resolvedCount,    icon: CheckCircle2, iconCls: "text-emerald-600 bg-emerald-50", countCls: "text-emerald-700" },
        ].map(({ label, count, icon: Icon, iconCls, countCls }) => (
          <Card key={label} className="bg-card border-border shadow-none">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconCls}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className={`text-xl font-semibold tabular-nums ${countCls}`}>{count}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in-progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
        <Select value={urgencyFilter} onValueChange={v => setUrgencyFilter(v ?? "all")}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue placeholder="Urgency" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Urgency</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={propertyFilter} onValueChange={v => setPropertyFilter(v ?? "all")}>
          <SelectTrigger className="w-38 h-8 text-xs"><SelectValue placeholder="Property" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Properties</SelectItem>
            <SelectItem value="safina-plaza">Safina Plaza</SelectItem>
            <SelectItem value="peepal-tree">Peepal Tree</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} tickets</span>
      </div>

      {/* Ticket grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(ticket => {
          const urgency = urgencyConfig[ticket.urgency]
          const status  = statusConfig[ticket.status]
          const StatusIcon = status.icon
          return (
            <button
              key={ticket.id}
              onClick={() => setSelected(ticket)}
              className="bg-card border border-border rounded-xl p-4 text-left hover:border-slate-300 hover:shadow-sm transition-all duration-150 cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 mb-2.5">
                <div className={`flex items-center gap-1.5 text-[10px] font-medium ${urgency.text}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${urgency.dot}`} />
                  {urgency.label}
                  {ticket.isRecurring && <AlertTriangle className="w-3 h-3 ml-0.5 text-amber-500" />}
                </div>
                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${status.badge}`}>
                  <StatusIcon className="w-2.5 h-2.5" />{status.label}
                </span>
              </div>
              <p className="text-[13px] font-medium text-foreground leading-snug mb-1.5">{ticket.description}</p>
              <p className="text-xs text-muted-foreground">{ticket.location}</p>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                    {ticket.property === "safina-plaza" ? "Plaza" : "PT"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
                    Rm {ticket.roomNumber}
                  </Badge>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(ticket.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>
              </div>
              {ticket.assignedTo && (
                <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <User className="w-2.5 h-2.5" /> {ticket.assignedTo}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="bg-card border-border max-w-md shadow-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wrench className="w-4 h-4 text-muted-foreground" />
              Ticket #{selected?.id}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-sm text-foreground">{selected.description}</p>
                <p className="text-xs text-muted-foreground mt-1">{selected.location}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                {[
                  ["Urgency",     urgencyConfig[selected.urgency].label],
                  ["Status",      statusConfig[selected.status].label],
                  ["Room",        `Rm ${selected.roomNumber}`],
                  ["Property",    selected.property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"],
                  ["Assigned To", selected.assignedTo ?? "Unassigned"],
                  ["Created",     new Date(selected.createdAt).toLocaleDateString("en-IN")],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {selected.isRecurring && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700">Recurring issue — flagged to senior staff</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                {selected.status !== "resolved" && (
                  <Button size="sm" className="flex-1 bg-foreground text-background hover:bg-foreground/90 h-8 text-xs">
                    Mark Resolved
                  </Button>
                )}
                {selected.status === "open" && (
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">
                    Assign & Start
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
