"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Search, Calendar, Building2, UserCheck, RefreshCw,
  CheckCircle2, Clock, AlertCircle, Zap,
} from "lucide-react"
import type { Room } from "@/lib/types"
import type { PendingBooking } from "@/lib/notion"
import { usePropertyScope } from "@/lib/property-context"

// ─── Active guests ─────────────────────────────────────────────────────────

type ActiveGuest = {
  id: string
  name: string
  status: "occupied" | "incoming" | "special"
  room: string
  property: "safina-plaza" | "peepal-tree"
  type: "private" | "sharing"
  checkIn: string
  checkOut?: string
  tier: string
  monthlyRate: number
  entity: "feazzo" | "safina-ventures"
  gender: string
  depositPaid?: boolean
}

function buildGuests(rooms: Room[]): ActiveGuest[] {
  const guests: ActiveGuest[] = []
  for (const room of rooms) {
    for (const bed of room.beds) {
      if (bed.status !== "occupied" && bed.status !== "incoming" && bed.status !== "special") continue
      if (!bed.guestName || !bed.checkIn) continue
      guests.push({
        id: bed.id,
        name: bed.guestName,
        status: bed.status as "occupied" | "incoming" | "special",
        room: room.number,
        property: room.property,
        type: room.type,
        checkIn: bed.checkIn,
        checkOut: bed.checkOut,
        tier: bed.tier ?? "monthly",
        monthlyRate: room.monthlyRate,
        entity: room.entity,
        gender: bed.genderRestriction,
        depositPaid: bed.depositPaid,
      })
    }
  }
  return guests
}

function ActiveGuestCard({ guest }: { guest: ActiveGuest }) {
  return (
    <Card className="bg-card border-border shadow-none hover:border-slate-300 hover:shadow-sm transition-all duration-150">
      <CardContent className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
            guest.status === "occupied" ? "bg-slate-100 text-slate-700" :
            guest.status === "special"  ? "bg-blue-50 text-blue-700" :
            "bg-amber-50 text-amber-700"
          }`}>
            {guest.name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-foreground truncate">{guest.name}</p>
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                guest.status === "occupied" ? "bg-emerald-400" :
                guest.status === "special"  ? "bg-blue-400" : "bg-amber-400"
              }`} />
            </div>
            <p className="text-[11px] text-muted-foreground capitalize">{guest.gender}</p>
          </div>
        </div>
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              {guest.property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"} · Rm {guest.room} · {guest.type}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">
              {new Date(guest.checkIn).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              {guest.checkOut
                ? ` → ${new Date(guest.checkOut).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                : " (open-ended)"}
            </span>
          </div>
          {guest.monthlyRate > 0 && (
            <div className="flex items-center gap-2">
              <UserCheck className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground tabular-nums">₹{guest.monthlyRate.toLocaleString("en-IN")}/mo</span>
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <Badge variant="outline" className={`text-[10px] h-4 px-1.5 capitalize ${
            guest.tier === "monthly"    ? "bg-slate-50 text-slate-600 border-slate-200" :
            guest.tier === "weekly"     ? "bg-orange-50 text-orange-700 border-orange-200" :
            guest.tier === "open-ended" ? "bg-violet-50 text-violet-700 border-violet-200" :
            "bg-muted text-muted-foreground"
          }`}>{guest.tier}</Badge>
          <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${
            guest.status === "occupied" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
            guest.status === "special"  ? "bg-blue-50 text-blue-700 border-blue-200" :
            "bg-amber-50 text-amber-700 border-amber-200"
          }`}>
            {guest.status === "occupied" ? "Checked In" : guest.status === "special" ? "Special" : "Incoming"}
          </Badge>
          {guest.depositPaid !== undefined && (
            <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ml-auto ${
              guest.depositPaid ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
            }`}>
              {guest.depositPaid ? "Deposit paid" : "Deposit due"}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Pending bookings ──────────────────────────────────────────────────────

type ActivateState = "idle" | "loading" | "done" | "error"

function PendingBookingCard({
  booking,
  onActivated,
}: {
  booking: PendingBooking
  onActivated: () => void
}) {
  const [state, setState] = useState<ActivateState>("idle")
  const [result, setResult] = useState<{ depositLinkUrl?: string; subscriptionUrl?: string } | null>(null)
  const [error, setError] = useState("")

  const activate = useCallback(async () => {
    setState("loading")
    setError("")
    try {
      const res = await fetch("/api/bookings/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formPageId: booking.notionPageId }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Activation failed")
      setResult(data)
      setState("done")
      onActivated()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
      setState("error")
    }
  }, [booking.notionPageId, onActivated])

  const propertyLabel = booking.property === "safina-plaza" ? "Safina Plaza" :
    booking.property === "peepal-tree" ? "Peepal Tree" : "Unknown property"

  const propertyColor = booking.property === "safina-plaza"
    ? "bg-violet-50 text-violet-700 border-violet-200"
    : booking.property === "peepal-tree"
    ? "bg-teal-50 text-teal-700 border-teal-200"
    : "bg-slate-50 text-slate-600 border-slate-200"

  return (
    <Card className={`bg-card border-border shadow-none transition-all duration-150 ${state === "done" ? "opacity-60" : "hover:border-slate-300"}`}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-700 shrink-0">
            {booking.guestName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate">{booking.guestName}</p>
            <p className="text-[11px] text-muted-foreground capitalize">{booking.gender}</p>
          </div>
          <Badge variant="outline" className={`text-[9px] h-4 px-1.5 shrink-0 ${propertyColor}`}>
            {propertyLabel}
          </Badge>
        </div>

        <div className="space-y-1.5 text-xs mb-3">
          {booking.room && (
            <div className="flex items-center gap-2">
              <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Room {booking.room}</span>
            </div>
          )}
          {booking.checkInDate && (
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                {new Date(booking.checkInDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                {booking.checkOutDate ? ` → ${new Date(booking.checkOutDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
              </span>
            </div>
          )}
          {booking.tariff > 0 && (
            <div className="flex items-center gap-2">
              <UserCheck className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground tabular-nums">₹{booking.tariff.toLocaleString("en-IN")}/mo</span>
            </div>
          )}
          {booking.organisation && (
            <p className="text-[10px] text-muted-foreground truncate">{booking.organisation} · {booking.occupation}</p>
          )}
        </div>

        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {booking.rulesAccepted && (
            <span className="inline-flex items-center gap-0.5 text-[9px] text-emerald-600 font-medium">
              <CheckCircle2 className="w-2.5 h-2.5" /> Rules accepted
            </span>
          )}
          {booking.idProofType && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-slate-50 text-slate-600 border-slate-200">
              {booking.idProofType}
            </Badge>
          )}
          {booking.status && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-amber-50 text-amber-700 border-amber-200 ml-auto">
              {booking.status}
            </Badge>
          )}
        </div>

        {state === "done" ? (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Activated — Notion updated
            {result?.depositLinkUrl && <span className="text-muted-foreground font-normal">· Deposit link sent</span>}
          </div>
        ) : (
          <>
            {!booking.property && (
              <p className="text-[10px] text-amber-600 mb-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Room number doesn&apos;t map to a known property
              </p>
            )}
            <Button
              size="sm"
              className="w-full h-7 text-[11px] gap-1.5 bg-foreground text-background hover:bg-foreground/90"
              disabled={state === "loading" || !booking.property || !booking.room}
              onClick={activate}
            >
              {state === "loading"
                ? <><RefreshCw className="w-3 h-3 animate-spin" /> Activating…</>
                : <><Zap className="w-3 h-3" /> Activate → push to Notion + send Razorpay</>}
            </Button>
            {state === "error" && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function GuestsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [pending, setPending] = useState<PendingBooking[]>([])
  const [loadingActive, setLoadingActive] = useState(true)
  const [loadingPending, setLoadingPending] = useState(true)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<"active" | "pending">("active")

  const { scope } = usePropertyScope()

  const fetchActive = useCallback(() => {
    setLoadingActive(true)
    fetch("/api/rooms")
      .then(r => r.json())
      .then((data: Room[]) => { setRooms(data); setLoadingActive(false) })
      .catch(() => setLoadingActive(false))
  }, [])

  const fetchPending = useCallback(() => {
    setLoadingPending(true)
    fetch("/api/bookings/pending")
      .then(r => r.json())
      .then((data: PendingBooking[]) => { setPending(data); setLoadingPending(false) })
      .catch(() => setLoadingPending(false))
  }, [])

  useEffect(() => { fetchActive(); fetchPending() }, [fetchActive, fetchPending])

  const allGuests = buildGuests(rooms)
  const scopedGuests = scope !== "all" ? allGuests.filter(g => g.property === scope) : allGuests
  const filteredGuests = scopedGuests.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    g.room.toLowerCase().includes(search.toLowerCase())
  )

  const scopedPending = scope !== "all" ? pending.filter(b => b.property === scope) : pending
  const filteredPending = scopedPending.filter(b =>
    b.guestName.toLowerCase().includes(search.toLowerCase()) ||
    b.room.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      {/* Tab + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-muted rounded-md p-0.5">
          <button
            onClick={() => setTab("active")}
            className={`px-3 py-1 rounded-[5px] text-xs font-medium transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
              tab === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Active
            <span className={`text-[10px] min-w-4 h-4 flex items-center justify-center rounded-full px-1 ${
              tab === "active" ? "bg-muted text-foreground" : "bg-muted-foreground/15 text-muted-foreground"
            }`}>{scopedGuests.length}</span>
          </button>
          <button
            onClick={() => setTab("pending")}
            className={`px-3 py-1 rounded-[5px] text-xs font-medium transition-all duration-150 cursor-pointer flex items-center gap-1.5 ${
              tab === "pending" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Pending Bookings
            {scopedPending.length > 0 && (
              <span className={`text-[10px] min-w-4 h-4 flex items-center justify-center rounded-full px-1 ${
                tab === "pending" ? "bg-amber-100 text-amber-700" : "bg-amber-100 text-amber-700"
              }`}>{scopedPending.length}</span>
            )}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search guests or rooms…"
            className="pl-8 h-8 text-xs w-52"
          />
        </div>

        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto" onClick={() => { fetchActive(); fetchPending() }}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {/* Active guests tab */}
      {tab === "active" && (
        <>
          {loadingActive ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading from Notion…
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredGuests.map(guest => <ActiveGuestCard key={guest.id} guest={guest} />)}
              </div>
              {filteredGuests.length === 0 && (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  {search ? `No guests matching "${search}"` : "No active guests"}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Pending bookings tab */}
      {tab === "pending" && (
        <>
          {loadingPending ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading bookings from Notion…
            </div>
          ) : (
            <>
              {filteredPending.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  These are form submissions from the booking site. Click <strong>Activate</strong> to push the guest into the {scope === "safina-plaza" ? "Safina Plaza" : scope === "peepal-tree" ? "Peepal Tree" : "right property&apos;s"} members database and auto-send Razorpay links.
                </p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredPending.map(b => (
                  <PendingBookingCard key={b.notionPageId} booking={b} onActivated={fetchActive} />
                ))}
              </div>
              {filteredPending.length === 0 && (
                <div className="flex flex-col items-center justify-center h-32 gap-1 text-muted-foreground text-sm">
                  <Clock className="w-5 h-5" />
                  No pending bookings — all caught up
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
