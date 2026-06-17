"use client"

import { useState } from "react"
import { leads } from "@/lib/mock-data"
import type { LeadStage } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Search, Plus, Link2, Phone, Mail, ChevronRight } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const stages: { id: LeadStage; label: string; dot: string; bg: string; text: string }[] = [
  { id: "captured",          label: "Captured",          dot: "bg-slate-400", bg: "bg-slate-100", text: "text-slate-600" },
  { id: "viewing-scheduled", label: "Viewing Scheduled", dot: "bg-amber-400",  bg: "bg-amber-50",  text: "text-amber-700" },
  { id: "viewed",            label: "Viewed",            dot: "bg-blue-400",   bg: "bg-blue-50",   text: "text-blue-700" },
  { id: "deposit-paid",      label: "Deposit Paid",      dot: "bg-emerald-400",bg: "bg-emerald-50",text: "text-emerald-700" },
  { id: "checked-in",        label: "Checked In",        dot: "bg-slate-700",  bg: "bg-slate-100", text: "text-slate-700" },
  { id: "dropped-off",       label: "Dropped Off",       dot: "bg-red-400",    bg: "bg-red-50",    text: "text-red-600" },
]

const sourceBadge: Record<string, string> = {
  "walk-in":  "bg-orange-50 text-orange-700 border-orange-200",
  "online":   "bg-blue-50 text-blue-700 border-blue-200",
  "referral": "bg-purple-50 text-purple-700 border-purple-200",
}

function LeadCard({ lead, onClick }: { lead: typeof leads[0]; onClick: () => void }) {
  const stage = stages.find(s => s.id === lead.stage)!
  const daysSince = Math.floor((Date.now() - new Date(lead.createdAt).getTime()) / 86400000)

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-border rounded-xl p-3.5 hover:border-slate-300 hover:shadow-sm transition-all duration-150 cursor-pointer group"
    >
      <div className="flex items-start gap-2.5 mb-2.5">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-foreground shrink-0">
          {lead.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground truncate">{lead.name}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{lead.gender}</p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full border capitalize ${sourceBadge[lead.source]}`}>
          {lead.source}
        </span>
        {lead.property && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
            {lead.property === "safina-plaza" ? "Plaza" : "PT"}
          </Badge>
        )}
        {lead.roomType && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground capitalize">
            {lead.roomType}
          </Badge>
        )}
      </div>

      {lead.roomShown && (
        <p className="text-[10px] text-muted-foreground mt-1.5">Shown: Rm {lead.roomShown}</p>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${stage.bg} ${stage.text}`}>
          {stage.label}
        </span>
        <span className="text-[10px] text-muted-foreground">{daysSince}d ago</span>
      </div>

      {lead.bookingLinkSent && lead.stage === "viewed" && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-600">
          <Link2 className="w-3 h-3" /> Link sent · expires {lead.bookingLinkExpiry}
        </div>
      )}
    </button>
  )
}

export default function LeadsPage() {
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<typeof leads[0] | null>(null)

  const filtered = leads.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.email.toLowerCase().includes(search.toLowerCase())
  )

  const stageCounts = stages.map(s => ({ ...s, count: leads.filter(l => l.stage === s.id).length }))

  return (
    <div className="space-y-4">
      {/* Funnel strip */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
        {stageCounts.map((s, i) => (
          <Card key={s.id} className="bg-card border-border shadow-none">
            <CardContent className="p-3 text-center">
              <p className="text-xl font-semibold text-foreground tabular-nums">{s.count}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
              {i < stageCounts.length - 1 && s.count > 0 && stageCounts[i + 1].count > 0 && (
                <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                  {Math.round((stageCounts[i + 1].count / s.count) * 100)}%→
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" className="pl-8 h-8 text-xs" />
        </div>
        <Button size="sm" className="h-8 gap-1.5 bg-foreground text-background hover:bg-foreground/90">
          <Plus className="w-3.5 h-3.5" /> Add Lead
        </Button>
      </div>

      {/* Kanban columns (exclude checked-in from active columns) */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {stages.filter(s => s.id !== "checked-in").map(stage => {
          const stageLeads = filtered.filter(l => l.stage === stage.id)
          return (
            <div key={stage.id} className="space-y-2 min-w-[200px] w-[200px] shrink-0">
              <div className="flex items-center gap-2 px-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />
                <span className="text-[12px] font-medium text-foreground">{stage.label}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">{stageLeads.length}</span>
              </div>
              <div className="space-y-1.5">
                {stageLeads.map(lead => (
                  <LeadCard key={lead.id} lead={lead} onClick={() => setSelected(lead)} />
                ))}
                {stageLeads.length === 0 && (
                  <div className="h-16 border border-dashed border-border rounded-xl flex items-center justify-center text-[11px] text-muted-foreground">
                    None
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="bg-card border-border max-w-md shadow-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-foreground">
                {selected?.name.charAt(0)}
              </div>
              {selected?.name}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="flex gap-4">
                <a href={`mailto:${selected.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Mail className="w-3.5 h-3.5" /> {selected.email}
                </a>
                <a href={`tel:${selected.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Phone className="w-3.5 h-3.5" /> {selected.phone}
                </a>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-1">
                {[
                  ["Stage",     stages.find(s => s.id === selected.stage)?.label],
                  ["Source",    selected.source],
                  ["Property",  selected.property === "safina-plaza" ? "Safina Plaza" : selected.property === "peepal-tree" ? "Peepal Tree" : "—"],
                  ["Room Type", selected.roomType ?? "—"],
                  ["Check-in",  selected.preferredCheckIn ?? "—"],
                  ["Room Shown",selected.roomShown ?? "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-xs font-medium text-foreground capitalize mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              {selected.dropReason && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
                  <p className="text-xs font-medium text-red-600">Drop reason</p>
                  <p className="text-xs text-red-500 mt-0.5">{selected.dropReason}</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                {selected.stage === "viewed" && !selected.bookingLinkSent && (
                  <Button size="sm" className="flex-1 bg-foreground text-background hover:bg-foreground/90 h-8 text-xs">Send Booking Link</Button>
                )}
                {selected.stage === "viewed" && selected.bookingLinkSent && (
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs">Resend Link</Button>
                )}
                {selected.stage === "captured" && (
                  <Button size="sm" className="flex-1 bg-foreground text-background hover:bg-foreground/90 h-8 text-xs">Schedule Viewing</Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
