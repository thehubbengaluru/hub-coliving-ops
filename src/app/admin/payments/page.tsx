"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import {
  Search, CheckCircle2, Clock, ExternalLink, RefreshCw,
  Link2, CreditCard, Building2,
} from "lucide-react"
import type { Room, Bed } from "@/lib/types"
import { usePropertyScope } from "@/lib/property-context"

type GuestRow = {
  notionPageId: string
  guestName: string
  room: string
  property: "safina-plaza" | "peepal-tree"
  entity: "feazzo" | "safina-ventures"
  monthlyRate: number
  depositPaid: boolean | undefined
  status: "occupied" | "incoming" | "special"
  subscriptionId?: string
  bed: Bed
}

function buildGuestRows(rooms: Room[]): GuestRow[] {
  const rows: GuestRow[] = []
  for (const room of rooms) {
    for (const bed of room.beds) {
      if (bed.status !== "occupied" && bed.status !== "incoming" && bed.status !== "special") continue
      if (!bed.guestId || !bed.guestName) continue
      rows.push({
        notionPageId: bed.guestId,
        guestName: bed.guestName,
        room: room.number,
        property: room.property,
        entity: room.entity,
        monthlyRate: room.monthlyRate,
        depositPaid: bed.depositPaid,
        status: bed.status as "occupied" | "incoming" | "special",
        subscriptionId: bed.subscriptionId,
        bed,
      })
    }
  }
  return rows
}

// Current calendar month label e.g. "June 2026"
function currentMonthLabel() {
  return new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })
}

type ActionState = "idle" | "loading" | "done" | "error"

function GuestCard({ row }: { row: GuestRow }) {
  const [depositState, setDepositState]   = useState<ActionState>("idle")
  const [subState, setSubState]           = useState<ActionState>("idle")
  const [rentState, setRentState]         = useState<ActionState>("idle")
  const [depositLink, setDepositLink]     = useState<string | null>(null)
  const [rentLink, setRentLink]           = useState<string | null>(null)
  const [subLink, setSubLink]             = useState<string | null>(null)
  const [errorMsg, setErrorMsg]           = useState("")
  const [customAmount, setCustomAmount]   = useState(String(row.monthlyRate))
  const [createdSubId, setCreatedSubId]   = useState<string | null>(null)

  const existingSubId    = row.subscriptionId ?? createdSubId
  const rzpDashboardUrl  = existingSubId ? `https://dashboard.razorpay.com/app/subscriptions/${existingSubId}` : null
  const propertyLabel    = row.property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"
  const entityLabel      = row.entity === "feazzo" ? "Feazzo" : "SV"
  const avatarChar       = row.guestName.charAt(0).toUpperCase()

  const sendDepositLink = useCallback(async () => {
    setDepositState("loading"); setErrorMsg("")
    try {
      const res = await fetch("/api/razorpay/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionPageId: row.notionPageId,
          property: row.property,
          amount: Number(customAmount),
          guestName: row.guestName,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      setDepositLink(data.url)
      setDepositState("done")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error")
      setDepositState("error")
    }
  }, [row, customAmount])

  const sendRentLink = useCallback(async () => {
    setRentState("loading"); setErrorMsg("")
    try {
      const res = await fetch("/api/razorpay/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionPageId: row.notionPageId,
          property: row.property,
          amount: Number(customAmount),
          guestName: row.guestName,
          type: "rent",
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      setRentLink(data.url)
      setRentState("done")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error")
      setRentState("error")
    }
  }, [row, customAmount])

  const createSubscription = useCallback(async () => {
    setSubState("loading"); setErrorMsg("")
    try {
      const res = await fetch("/api/razorpay/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionPageId: row.notionPageId,
          property: row.property,
          monthlyRate: Number(customAmount),
          guestName: row.guestName,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      setCreatedSubId(data.id ?? null)
      setSubLink(data.url)
      setSubState("done")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error")
      setSubState("error")
    }
  }, [row, customAmount])

  return (
    <>
      <Card className="bg-card border-border shadow-none hover:border-slate-300 transition-all duration-150">
        <CardContent className="p-4 space-y-3.5">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-700 shrink-0">
              {avatarChar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">{row.guestName}</p>
              <p className="text-[11px] text-muted-foreground">{propertyLabel} · Rm {row.room}</p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{entityLabel}</span>
          </div>

          {/* Rate row */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Monthly tariff</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">₹</span>
              <Input
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                className="w-20 h-6 text-xs text-right px-1.5 tabular-nums"
              />
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-3">

            {/* Security deposit */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Security deposit</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">₹{Number(customAmount).toLocaleString("en-IN")}</span>
                {row.depositPaid === true ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Collected
                  </span>
                ) : row.depositPaid === false ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                    <Clock className="w-3.5 h-3.5" /> Pending
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">—</span>
                )}
              </div>
              {row.depositPaid !== true && (
                depositState === "done" && depositLink ? (
                  <a
                    href={depositLink}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full h-7 rounded-md border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700 font-medium hover:bg-emerald-100 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" /> Open deposit link
                  </a>
                ) : (
                  <Button
                    size="sm" variant="outline"
                    className="w-full h-7 text-[11px] gap-1.5"
                    disabled={depositState === "loading"}
                    onClick={sendDepositLink}
                  >
                    {depositState === "loading"
                      ? <><RefreshCw className="w-3 h-3 animate-spin" /> Generating…</>
                      : <><Link2 className="w-3 h-3" /> Send Deposit Link</>}
                  </Button>
                )
              )}
            </div>

            {/* Monthly tariff — current month */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {currentMonthLabel()} rent
              </p>
              {existingSubId ? (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mandate active
                    </span>
                    {rzpDashboardUrl && (
                      <a href={rzpDashboardUrl} target="_blank" rel="noreferrer"
                        className="text-[10px] text-muted-foreground underline flex items-center gap-0.5 hover:text-foreground">
                        Razorpay <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                  {/* Backup one-off payment link */}
                  {rentState === "done" && rentLink ? (
                    <a
                      href={rentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full h-7 rounded-md border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700 font-medium hover:bg-emerald-100 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" /> Open payment link
                    </a>
                  ) : (
                    <Button
                      size="sm" variant="outline"
                      className="w-full h-7 text-[11px] gap-1.5 text-muted-foreground"
                      disabled={rentState === "loading"}
                      onClick={sendRentLink}
                    >
                      {rentState === "loading"
                        ? <><RefreshCw className="w-3 h-3 animate-spin" /> Generating…</>
                        : <><Link2 className="w-3 h-3" /> Generate one-off payment link</>}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-medium">
                    <Clock className="w-3.5 h-3.5" /> No mandate set up
                  </span>
                  <div className="flex gap-1.5">
                    {subState === "done" && subLink ? (
                      <a
                        href={subLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 flex-1 h-7 rounded-md border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700 font-medium hover:bg-emerald-100 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" /> Open mandate link
                      </a>
                    ) : (
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 h-7 text-[11px] gap-1"
                        disabled={subState === "loading"}
                        onClick={createSubscription}
                      >
                        {subState === "loading"
                          ? <><RefreshCw className="w-3 h-3 animate-spin" /> Creating…</>
                          : <><CreditCard className="w-3 h-3" /> Create mandate</>}
                      </Button>
                    )}
                    {rentState === "done" && rentLink ? (
                      <a
                        href={rentLink}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-1.5 flex-1 h-7 rounded-md border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700 font-medium hover:bg-emerald-100 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" /> Payment link
                      </a>
                    ) : (
                      <Button
                        size="sm" variant="outline"
                        className="flex-1 h-7 text-[11px] gap-1"
                        disabled={rentState === "loading"}
                        onClick={sendRentLink}
                      >
                        {rentState === "loading"
                          ? <><RefreshCw className="w-3 h-3 animate-spin" /> …</>
                          : <><Link2 className="w-3 h-3" /> One-off link</>}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {errorMsg && <p className="text-[10px] text-red-500">{errorMsg}</p>}
        </CardContent>
      </Card>

      {/* Subscription created dialog */}
      <Dialog open={subState === "done" && !!subLink} onOpenChange={() => { setSubLink(null); setSubState("idle") }}>
        <DialogContent className="max-w-sm bg-card border-border shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Subscription created
            </DialogTitle>
            <DialogDescription className="text-xs">
              Mandate link sent to {row.guestName}. Auto-debit starts 1st of next month.
            </DialogDescription>
          </DialogHeader>
          {subLink && (
            <a href={subLink} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-1.5 h-8 rounded-md border border-border bg-muted text-[11px] text-foreground font-medium hover:bg-muted/80 transition-colors">
              <ExternalLink className="w-3 h-3" /> {subLink}
            </a>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function PaymentsPage() {
  const [rooms, setRooms]     = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState("")

  const { scope } = usePropertyScope()

  useEffect(() => {
    fetch("/api/rooms")
      .then(r => r.json())
      .then((data: Room[]) => { setRooms(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const allGuests    = buildGuestRows(rooms)
  const scopedGuests = scope !== "all" ? allGuests.filter(g => g.property === scope) : allGuests
  const filtered     = scopedGuests.filter(g =>
    g.guestName.toLowerCase().includes(search.toLowerCase()) || g.room.includes(search)
  )

  const depositPendingCount = scopedGuests.filter(g => !g.depositPaid).length
  const noMandateCount      = scopedGuests.filter(g => !g.subscriptionId).length
  const totalRent           = scopedGuests.reduce((s, g) => s + g.monthlyRate, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" /> Loading from Notion…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* KPI pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-emerald-100 text-emerald-700 border-emerald-200">
          <Building2 className="w-3 h-3" />
          {scopedGuests.length} active guests
        </div>
        {depositPendingCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-amber-100 text-amber-700 border-amber-200">
            <Clock className="w-3 h-3" />
            {depositPendingCount} deposits pending
          </div>
        )}
        {noMandateCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-orange-100 text-orange-700 border-orange-200">
            <CreditCard className="w-3 h-3" />
            {noMandateCount} no mandate
          </div>
        )}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
          ₹{(totalRent / 1000).toFixed(0)}k/mo gross rent
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guest…" className="pl-8 h-8 text-xs w-56" />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} guests</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(row => (
          <GuestCard key={row.notionPageId} row={row} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          {search ? `No guests matching "${search}"` : "No active guests"}
        </div>
      )}
    </div>
  )
}
