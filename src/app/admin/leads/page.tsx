"use client"

import { useState, useEffect, useCallback } from "react"
import type { Lead } from "@/lib/notion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Search, Phone, RefreshCw, ChevronRight, CheckCircle2, XCircle, Clock } from "lucide-react"
import { usePropertyScope } from "@/lib/property-context"

// ─── Config ───────────────────────────────────────────────────────────────

const STAGES: { id: Lead["status"]; label: string; dot: string; bg: string; text: string }[] = [
  { id: "yet-to-confirm", label: "Yet to Confirm", dot: "bg-amber-400",  bg: "bg-amber-50",  text: "text-amber-700" },
  { id: "won",            label: "Won",            dot: "bg-emerald-400", bg: "bg-emerald-50", text: "text-emerald-700" },
  { id: "lost",           label: "Lost",           dot: "bg-red-400",    bg: "bg-red-50",    text: "text-red-600" },
]

// ─── Lead card ────────────────────────────────────────────────────────────

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const stage    = STAGES.find(s => s.id === lead.status)!
  const initials = lead.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border border-border rounded-xl p-3.5 hover:border-slate-300 hover:shadow-sm transition-all duration-150 cursor-pointer group"
    >
      <div className="flex items-start gap-2.5 mb-2.5">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-foreground shrink-0">
          {initials || "?"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-foreground truncate">{lead.name || "Unnamed"}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{lead.gender}</p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {lead.property && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
            {lead.property === "safina-plaza" ? "Plaza" : "Peepal"}
          </Badge>
        )}
        {lead.roomType && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground capitalize">
            {lead.roomType}
          </Badge>
        )}
        {lead.leadAmount && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-muted-foreground">
            ₹{lead.leadAmount.toLocaleString("en-IN")}
          </Badge>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${stage.bg} ${stage.text}`}>
          {stage.label}
        </span>
        {lead.leadDate && (
          <span className="text-[10px] text-muted-foreground">
            {new Date(lead.leadDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>
        )}
      </div>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function LeadsPage() {
  const [leads, setLeads]     = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState("")
  const [selected, setSelected] = useState<Lead | null>(null)
  const [updating, setUpdating] = useState(false)

  const { scope } = usePropertyScope()

  const fetchLeads = useCallback(() => {
    setLoading(true)
    fetch("/api/leads")
      .then(r => r.json())
      .then((data: Lead[]) => { setLeads(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchLeads() }, [fetchLeads])

  const scopedLeads = scope === "all" ? leads : leads.filter(l => l.property === scope || l.property === null)

  const filtered = scopedLeads.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase()) ||
    l.phone.includes(search)
  )

  const stageCounts = STAGES.map(s => ({
    ...s,
    count: scopedLeads.filter(l => l.status === s.id).length,
  }))

  async function updateStatus(lead: Lead, status: Lead["status"]) {
    setUpdating(true)
    await fetch("/api/leads/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notionPageId: lead.notionPageId, status }),
    })
    setUpdating(false)
    setSelected(null)
    fetchLeads()
  }

  return (
    <div className="space-y-4">
      {/* Funnel strip */}
      <div className="grid grid-cols-3 gap-2">
        {stageCounts.map(s => (
          <Card key={s.id} className="bg-card border-border shadow-none">
            <CardContent className="p-3 text-center">
              <div className={`w-1.5 h-1.5 rounded-full ${s.dot} mx-auto mb-1`} />
              <p className="text-xl font-semibold text-foreground tabular-nums">{loading ? "—" : s.count}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search + refresh */}
      <div className="flex items-center gap-2 w-full">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search leads…" className="pl-8 h-9 text-xs" />
        </div>
        <Button size="sm" variant="outline" className="h-9 text-xs gap-1.5 shrink-0" onClick={fetchLeads}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" /> Loading from Notion…
        </div>
      )}

      {/* Kanban columns */}
      {!loading && (
        <>
          <p className="text-[10px] text-muted-foreground sm:hidden">← Scroll to see all columns</p>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-3 px-3 sm:mx-0 sm:px-0">
          {STAGES.map(stage => {
            const stageLeads = filtered.filter(l => l.status === stage.id)
            return (
              <div key={stage.id} className="space-y-2 min-w-[220px] w-[220px] shrink-0">
                <div className="flex items-center gap-2 px-0.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${stage.dot}`} />
                  <span className="text-[12px] font-medium text-foreground">{stage.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{stageLeads.length}</span>
                </div>
                <div className="space-y-1.5">
                  {stageLeads.map(lead => (
                    <LeadCard key={lead.notionPageId} lead={lead} onClick={() => setSelected(lead)} />
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
        </>
      )}

      {/* Detail modal */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
        <DialogContent className="bg-card border-border max-w-md shadow-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-foreground">
                {selected?.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "?"}
              </div>
              {selected?.name || "Unnamed"}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              {selected.phone && (
                <a href={`tel:${selected.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Phone className="w-3.5 h-3.5" /> {selected.phone}
                </a>
              )}

              <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-1">
                {[
                  ["Status",   STAGES.find(s => s.id === selected.status)?.label ?? "—"],
                  ["Property", selected.property === "safina-plaza" ? "Safina Plaza" : selected.property === "peepal-tree" ? "Peepal Tree" : "—"],
                  ["Room Type", selected.roomType ? (selected.roomType === "private" ? "Single" : "Double") : "—"],
                  ["Amount",   selected.leadAmount ? `₹${selected.leadAmount.toLocaleString("en-IN")}` : "—"],
                  ["Lead Date", selected.leadDate ? new Date(selected.leadDate).toLocaleDateString("en-IN") : "—"],
                  ["Response", selected.responseDate ? new Date(selected.responseDate).toLocaleDateString("en-IN") : "—"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-xs font-medium text-foreground mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              {/* Status actions */}
              {selected.status !== "won" && selected.status !== "lost" && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs gap-1.5"
                    disabled={updating}
                    onClick={() => updateStatus(selected, "won")}
                  >
                    <CheckCircle2 className="w-3 h-3" /> Mark Won
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
                    disabled={updating}
                    onClick={() => updateStatus(selected, "lost")}
                  >
                    <XCircle className="w-3 h-3" /> Mark Lost
                  </Button>
                </div>
              )}

              {selected.status === "won" && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Won{selected.conversionDate ? ` on ${new Date(selected.conversionDate).toLocaleDateString("en-IN")}` : ""}
                </div>
              )}

              {selected.status === "lost" && (
                <div className="flex items-center gap-1.5 text-xs text-red-500">
                  <XCircle className="w-3.5 h-3.5" /> Lost
                  <Button
                    size="sm" variant="ghost"
                    className="ml-auto h-6 text-[10px] text-muted-foreground"
                    disabled={updating}
                    onClick={() => updateStatus(selected, "yet-to-confirm")}
                  >
                    <Clock className="w-3 h-3 mr-1" /> Reopen
                  </Button>
                </div>
              )}

              {updating && <p className="text-xs text-muted-foreground">Updating Notion…</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
