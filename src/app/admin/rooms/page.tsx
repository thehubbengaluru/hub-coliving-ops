"use client"

import { useState, useEffect, useCallback } from "react"
import type { BedStatus, Floor } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Building2, User, Calendar, UserPlus, Lock, Star, BedDouble,
  ShieldAlert, RefreshCw, CheckCircle2, LogOut,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import type { Room, Bed } from "@/lib/types"
import { usePropertyScope } from "@/lib/property-context"

const statusConfig: Record<BedStatus, { label: string; dot: string; bg: string; border: string; text: string; badge: string }> = {
  occupied: { label: "Occupied",  dot: "bg-emerald-500", bg: "bg-emerald-50",  border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  vacant:   { label: "Vacant",    dot: "bg-orange-400",  bg: "bg-orange-50",   border: "border-orange-200",  text: "text-orange-700", badge: "bg-orange-100 text-orange-700 border-orange-200" },
  incoming: { label: "Incoming Booking", dot: "bg-amber-400", bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700 border-amber-200" },
  blocked:  { label: "Blocked",   dot: "bg-red-400",     bg: "bg-red-50",      border: "border-red-200",     text: "text-red-600",    badge: "bg-red-100 text-red-600 border-red-200" },
  special:  { label: "Special",   dot: "bg-blue-400",    bg: "bg-blue-50",     border: "border-blue-200",    text: "text-blue-700",   badge: "bg-blue-100 text-blue-700 border-blue-200" },
}

function BedTile({ bed, onClick }: { bed: Bed; onClick: () => void }) {
  const cfg = statusConfig[bed.status]
  return (
    <button
      onClick={onClick}
      className={`flex-1 p-2.5 rounded-md border ${cfg.bg} ${cfg.border} hover:brightness-95 transition-all duration-150 text-left cursor-pointer group`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
        {bed.status === "blocked" && <Lock className="w-2.5 h-2.5 text-red-500 ml-auto" />}
        {bed.status === "special" && <Star className="w-2.5 h-2.5 text-blue-500 ml-auto" />}
        {bed.status === "vacant"  && <UserPlus className="w-2.5 h-2.5 text-orange-500 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
      <p className={`text-[11px] font-medium leading-tight ${bed.guestName ? "text-foreground" : cfg.text}`}>
        {bed.guestName ?? cfg.label}
      </p>
      {bed.checkIn && (
        <p className="text-[9px] text-muted-foreground mt-1 flex items-center gap-0.5">
          <Calendar className="w-2 h-2" />
          {new Date(bed.checkIn).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          {bed.checkOut ? ` → ${new Date(bed.checkOut).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : " (open)"}
        </p>
      )}
    </button>
  )
}

function RoomCard({ room, onBedClick }: { room: Room; onBedClick: (r: Room, b: Bed) => void }) {
  const primaryStatus: BedStatus = room.isBlocked ? "blocked"
    : room.specialBookingType ? "special"
    : room.beds.every(b => b.status === "occupied") ? "occupied"
    : room.beds.some(b => b.status === "incoming") ? "incoming"
    : room.beds.every(b => b.status === "vacant") ? "vacant"
    : "occupied"
  const cfg = statusConfig[primaryStatus]

  return (
    <div className="bg-card border border-border rounded-xl p-3.5 hover:border-slate-300 transition-all duration-150 shadow-none">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {room.type === "sharing"
            ? <BedDouble className="w-3.5 h-3.5 text-muted-foreground" />
            : <User className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground">{room.number}</span>
        </div>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${cfg.badge}`}>{cfg.label}</span>
      </div>

      {room.type === "sharing" ? (
        <div className="flex gap-1.5">
          {room.beds.map(bed => <BedTile key={bed.id} bed={bed} onClick={() => onBedClick(room, bed)} />)}
        </div>
      ) : (
        <BedTile bed={room.beds[0]} onClick={() => onBedClick(room, room.beds[0])} />
      )}

      <div className="mt-2.5 flex items-center justify-between">
        {room.monthlyRate > 0 && (
          <span className="text-[10px] text-muted-foreground tabular-nums">₹{room.monthlyRate.toLocaleString("en-IN")}/mo</span>
        )}
        {room.isBlocked && (
          <span className="text-[10px] text-red-500 flex items-center gap-0.5">
            <ShieldAlert className="w-2.5 h-2.5" /> {room.blockReason?.split("—")[0].trim()}
          </span>
        )}
        {room.specialBookingType && (
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 bg-blue-50 text-blue-700 border-blue-200">
            {room.specialBookingType.replace("-", " ")}
          </Badge>
        )}
      </div>
    </div>
  )
}

// ─── Bed action modal ──────────────────────────────────────────────────────

type ModalMode = "view" | "checkin" | "checkout" | "success"

function today() {
  return new Date().toISOString().slice(0, 10)
}

function BedModal({
  room, bed, open, onClose, onDone,
}: {
  room: Room | null
  bed: Bed | null
  open: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [mode, setMode] = useState<ModalMode>("view")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [successMsg, setSuccessMsg] = useState("")

  // Check-in form state
  const [ciName, setCiName]           = useState("")
  const [ciGender, setCiGender]       = useState<"male" | "female">("male")
  const [ciPhone, setCiPhone]         = useState("")
  const [ciEmail, setCiEmail]         = useState("")
  const [ciDate, setCiDate]           = useState(today())
  const [ciCheckOut, setCiCheckOut]   = useState("")
  const [ciRate, setCiRate]           = useState("")
  const [ciSendLink, setCiSendLink]   = useState(true)
  const [ciCreateSub, setCiCreateSub] = useState(true)

  // Checkout form state
  const [coDate, setCoDate] = useState(today())

  useEffect(() => {
    if (open) {
      setMode("view")
      setError("")
      setSuccessMsg("")
      setCiName("")
      setCiPhone("")
      setCiEmail("")
      setCiDate(today())
      setCiCheckOut("")
      setCiRate(room?.monthlyRate ? String(room.monthlyRate) : "")
      setCoDate(today())
    }
  }, [open, room])

  const handleCheckIn = useCallback(async () => {
    if (!room || !bed) return
    if (!ciName.trim()) { setError("Guest name is required"); return }
    if (!ciPhone.trim()) { setError("Phone is required to send Razorpay links"); return }

    setLoading(true)
    setError("")

    const notionPageId = bed.guestId ?? bed.id.replace(/^(plaza|peepal)-/, "")

    try {
      const res = await fetch("/api/rooms/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionPageId,
          property: room.property,
          guestName: ciName.trim(),
          gender: ciGender,
          phone: ciPhone.trim(),
          email: ciEmail.trim(),
          checkInDate: ciDate,
          checkOutDate: ciCheckOut || undefined,
          monthlyRate: Number(ciRate) || 0,
          sendDepositLink: ciSendLink,
          createSubscription: ciCreateSub,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Check-in failed")

      const parts: string[] = ["Checked in and Notion updated."]
      if (data.depositLinkUrl) parts.push("Deposit link sent via SMS + email.")
      if (data.subscriptionUrl) parts.push("Rent mandate sent.")
      if (data.depositLinkError) parts.push(`Deposit link failed: ${data.depositLinkError}`)
      if (data.subscriptionError) parts.push(`Subscription failed: ${data.subscriptionError}`)
      setSuccessMsg(parts.join(" "))
      setMode("success")
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }, [room, bed, ciName, ciGender, ciPhone, ciEmail, ciDate, ciCheckOut, ciRate, ciSendLink, ciCreateSub, onDone])

  const handleCheckOut = useCallback(async () => {
    if (!room || !bed) return
    setLoading(true)
    setError("")

    const notionPageId = bed.guestId ?? bed.id.replace(/^(plaza|peepal)-/, "")

    try {
      const res = await fetch("/api/rooms/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionPageId,
          property:    room.property,
          checkOutDate: coDate,
          roomNumber:  room.number,
          bedLabel:    bed.bedNumber === 1 ? "A" : bed.bedNumber === 2 ? "B" : null,
          roomType:    room.type,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Checkout failed")
      setSuccessMsg(`${bed.guestName} checked out. Notion updated.`)
      setMode("success")
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }, [room, bed, coDate, onDone])

  if (!room || !bed) return null
  const cfg = statusConfig[bed.status]

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="bg-card border-border max-w-sm shadow-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
            Room {room.number}{room.type === "sharing" ? ` — Bed ${bed.bedNumber}` : ""}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {room.property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"} · {room.floor} Floor · {room.type}
          </DialogDescription>
        </DialogHeader>

        {/* ── View mode ── */}
        {mode === "view" && (
          <div className="space-y-3 pt-1">
            {([
              ["Status",   cfg.label],
              bed.guestName ? ["Guest", bed.guestName] : null,
              bed.checkIn  ? ["Check-in",  new Date(bed.checkIn).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })] : null,
              bed.checkOut ? ["Check-out", new Date(bed.checkOut).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })] : null,
              !bed.checkOut && bed.status === "occupied" ? ["Stay", "Open-ended"] : null,
              ["Gender", `${bed.genderRestriction} only`],
              room.monthlyRate > 0 ? ["Rate", `₹${room.monthlyRate.toLocaleString("en-IN")}/mo`] : null,
              bed.depositPaid !== undefined ? ["Deposit", bed.depositPaid ? "Paid" : "Pending"] : null,
            ] as ([string, string] | null)[]).filter((r): r is [string, string] => r !== null).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className={`text-xs font-medium capitalize ${label === "Deposit" && value === "Paid" ? "text-emerald-600" : label === "Deposit" ? "text-amber-600" : "text-foreground"}`}>{value}</span>
              </div>
            ))}

            {bed.status === "vacant" && (
              <Button size="sm" className="w-full mt-1 h-8 text-xs bg-foreground text-background hover:bg-foreground/90 gap-1.5" onClick={() => setMode("checkin")}>
                <UserPlus className="w-3.5 h-3.5" /> Check In Guest
              </Button>
            )}
            {(bed.status === "occupied" || bed.status === "special") && (
              <Button size="sm" variant="outline" className="w-full mt-1 h-8 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setMode("checkout")}>
                <LogOut className="w-3.5 h-3.5" /> Check Out
              </Button>
            )}
          </div>
        )}

        {/* ── Check-in form ── */}
        {mode === "checkin" && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] text-muted-foreground">Guest Name *</label>
                <Input value={ciName} onChange={e => setCiName(e.target.value)} placeholder="Full name" className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Gender</label>
                <Select value={ciGender} onValueChange={v => setCiGender(v as "male" | "female")}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Monthly Rate (₹)</label>
                <Input value={ciRate} onChange={e => setCiRate(e.target.value)} placeholder="0" className="h-8 text-xs" type="number" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] text-muted-foreground">Phone *</label>
                <Input value={ciPhone} onChange={e => setCiPhone(e.target.value)} placeholder="+91 98765 43210" className="h-8 text-xs" type="tel" />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[11px] text-muted-foreground">Email</label>
                <Input value={ciEmail} onChange={e => setCiEmail(e.target.value)} placeholder="guest@email.com" className="h-8 text-xs" type="email" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Check-in Date *</label>
                <Input value={ciDate} onChange={e => setCiDate(e.target.value)} className="h-8 text-xs" type="date" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Check-out Date</label>
                <Input value={ciCheckOut} onChange={e => setCiCheckOut(e.target.value)} className="h-8 text-xs" type="date" placeholder="Open-ended" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5 pt-1 border-t border-border">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={ciSendLink} onChange={e => setCiSendLink(e.target.checked)} className="w-3 h-3 rounded" />
                <span className="text-[11px] text-muted-foreground">Send deposit payment link via SMS + email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={ciCreateSub} onChange={e => setCiCreateSub(e.target.checked)} className="w-3 h-3 rounded" />
                <span className="text-[11px] text-muted-foreground">Create monthly rent subscription (starts 1st of next month)</span>
              </label>
            </div>

            {error && <p className="text-[11px] text-red-500">{error}</p>}

            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => { setMode("view"); setError("") }}>Back</Button>
              <Button size="sm" className="flex-1 h-8 text-xs bg-foreground text-background hover:bg-foreground/90" disabled={loading} onClick={handleCheckIn}>
                {loading ? <><RefreshCw className="w-3 h-3 animate-spin mr-1" /> Checking in…</> : "Confirm Check-in"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Checkout confirmation ── */}
        {mode === "checkout" && (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              Marking <span className="font-medium text-foreground">{bed.guestName}</span> as checked out.
              This will update Notion immediately.
            </p>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Check-out Date</label>
              <Input value={coDate} onChange={e => setCoDate(e.target.value)} className="h-8 text-xs" type="date" />
            </div>
            {error && <p className="text-[11px] text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => { setMode("view"); setError("") }}>Back</Button>
              <Button size="sm" className="flex-1 h-8 text-xs bg-red-600 text-white hover:bg-red-700" disabled={loading} onClick={handleCheckOut}>
                {loading ? <><RefreshCw className="w-3 h-3 animate-spin mr-1" /> Checking out…</> : "Confirm Checkout"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Success ── */}
        {mode === "success" && (
          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-xs text-emerald-700">{successMsg}</p>
            </div>
            <Button size="sm" className="w-full h-8 text-xs" variant="outline" onClick={onClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────

const PLAZA_FLOORS: Floor[] = ["2nd", "3rd"]
const PEEPAL_FLOORS: Floor[] = ["1st", "2nd", "3rd"]

export default function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState("all")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)
  const [selectedBed, setSelectedBed] = useState<Bed | null>(null)

  const { scope } = usePropertyScope()

  const fetchRooms = useCallback(() => {
    setLoading(true)
    fetch("/api/rooms")
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((data: Room[]) => { setRooms(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  useEffect(() => { fetchRooms() }, [fetchRooms])

  const scopedRooms = scope !== "all" ? rooms.filter(r => r.property === scope) : rooms
  const filtered = scopedRooms.filter(room => {
    if (typeFilter !== "all" && room.type !== typeFilter) return false
    if (statusFilter !== "all" && !room.beds.some(b => b.status === statusFilter)) return false
    return true
  })

  const counts = {
    occupied: scopedRooms.flatMap(r => r.beds).filter(b => b.status === "occupied").length,
    vacant:   scopedRooms.flatMap(r => r.beds).filter(b => b.status === "vacant").length,
    incoming: scopedRooms.flatMap(r => r.beds).filter(b => b.status === "incoming").length,
    blocked:  scopedRooms.filter(r => r.isBlocked).length,
    special:  scopedRooms.filter(r => r.specialBookingType).length,
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
      <RefreshCw className="w-4 h-4 animate-spin" /> Loading rooms from Notion…
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center h-48 gap-2">
      <p className="text-sm text-red-500">Failed to load rooms: {error}</p>
      <Button size="sm" variant="outline" onClick={fetchRooms}>Retry</Button>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(Object.entries(counts) as [BedStatus, number][]).map(([status, count]) => {
          const cfg = statusConfig[status]
          return (
            <div key={status} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.badge}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
              {count} {cfg.label}
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v ?? "all")}>
          <SelectTrigger className="w-32 h-8 text-xs bg-background border-border"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="sharing">Sharing</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-32 h-8 text-xs bg-background border-border"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="occupied">Occupied</SelectItem>
            <SelectItem value="vacant">Vacant</SelectItem>
            <SelectItem value="incoming">Incoming</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="special">Special</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs ml-auto gap-1.5" onClick={fetchRooms}>
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
        <span className="text-xs text-muted-foreground">{filtered.length} rooms</span>
      </div>

      {filtered.some(r => r.property === "safina-plaza") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Safina Plaza</h2>
            <span className="text-xs text-muted-foreground">· Feazzo Holdings</span>
          </div>
          {PLAZA_FLOORS.map(floor => {
            const floorRooms = filtered.filter(r => r.property === "safina-plaza" && r.floor === floor)
            if (!floorRooms.length) return null
            return (
              <div key={floor}>
                <p className="text-[11px] text-muted-foreground mb-2 font-medium uppercase tracking-wide">{floor} Floor</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                  {floorRooms.map(room => (
                    <RoomCard key={room.id} room={room} onBedClick={(r, b) => { setSelectedRoom(r); setSelectedBed(b) }} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {filtered.some(r => r.property === "peepal-tree") && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">Peepal Tree</h2>
            <span className="text-xs text-muted-foreground">· Safina Ventures</span>
          </div>
          {PEEPAL_FLOORS.map(floor => {
            const floorRooms = filtered.filter(r => r.property === "peepal-tree" && r.floor === floor)
            if (!floorRooms.length) return null
            return (
              <div key={floor}>
                <p className="text-[11px] text-muted-foreground mb-2 font-medium uppercase tracking-wide">{floor} Floor</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                  {floorRooms.map(room => (
                    <RoomCard key={room.id} room={room} onBedClick={(r, b) => { setSelectedRoom(r); setSelectedBed(b) }} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <BedModal
        room={selectedRoom}
        bed={selectedBed}
        open={!!selectedRoom}
        onClose={() => { setSelectedRoom(null); setSelectedBed(null) }}
        onDone={() => { fetchRooms() }}
      />
    </div>
  )
}
