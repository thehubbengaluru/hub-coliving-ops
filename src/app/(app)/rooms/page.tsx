"use client"

import { useState, useEffect } from "react"
import type { BedStatus, Floor } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Building2, User, Calendar, UserPlus, Lock, Star, BedDouble, ShieldAlert, RefreshCw } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import type { Room, Bed } from "@/lib/types"
import { usePropertyScope } from "@/lib/property-context"

const statusConfig: Record<BedStatus, { label: string; dot: string; bg: string; border: string; text: string; badge: string }> = {
  occupied: { label: "Occupied",  dot: "bg-emerald-500", bg: "bg-emerald-50",  border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  vacant:   { label: "Vacant",    dot: "bg-orange-400",  bg: "bg-orange-50",   border: "border-orange-200",  text: "text-orange-700", badge: "bg-orange-100 text-orange-700 border-orange-200" },
  incoming: { label: "Incoming",  dot: "bg-amber-400",   bg: "bg-amber-50",    border: "border-amber-200",   text: "text-amber-700",  badge: "bg-amber-100 text-amber-700 border-amber-200" },
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

function BedDetailModal({ room, bed, open, onClose }: { room: Room | null; bed: Bed | null; open: boolean; onClose: () => void }) {
  if (!room || !bed) return null
  const cfg = statusConfig[bed.status]
  return (
    <Dialog open={open} onOpenChange={onClose}>
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
        <div className="space-y-3 pt-1">
          {([
            ["Status",   cfg.label],
            bed.guestName ? ["Guest", bed.guestName] : null,
            bed.checkIn  ? ["Check-in",  new Date(bed.checkIn).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })] : null,
            bed.checkOut ? ["Check-out", new Date(bed.checkOut).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })] : null,
            !bed.checkOut && bed.status === "occupied" ? ["Stay type", "Open-ended"] : null,
            ["Gender",   `${bed.genderRestriction} only`],
            room.monthlyRate > 0 ? ["Rate", `₹${room.monthlyRate.toLocaleString("en-IN")}/mo`] : null,
          ] as ([string, string] | null)[]).filter((r): r is [string, string] => r !== null).map(([label, value]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="text-xs font-medium text-foreground capitalize">{value}</span>
            </div>
          ))}
          {room.isBlocked && room.blockReason && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
              <p className="text-xs font-medium text-red-600">Blocked</p>
              <p className="text-xs text-red-500 mt-0.5">{room.blockReason}</p>
            </div>
          )}
          {bed.status === "vacant" && (
            <Button size="sm" className="w-full mt-1 h-8 text-xs bg-foreground text-background hover:bg-foreground/90">
              Schedule Viewing
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

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

  useEffect(() => {
    fetch("/api/rooms")
      .then(r => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then((data: Room[]) => { setRooms(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading rooms from Notion…
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2">
        <p className="text-sm text-red-500">Failed to load rooms: {error}</p>
        <Button size="sm" variant="outline" onClick={() => { setLoading(true); setError(null); fetch("/api/rooms").then(r => r.json()).then(d => { setRooms(d); setLoading(false) }).catch(e => { setError(e.message); setLoading(false) }) }}>
          Retry
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary pills */}
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

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v ?? "all")}>
          <SelectTrigger className="w-32 h-8 text-xs bg-background border-border">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="sharing">Sharing</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-32 h-8 text-xs bg-background border-border">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="occupied">Occupied</SelectItem>
            <SelectItem value="vacant">Vacant</SelectItem>
            <SelectItem value="incoming">Incoming</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
            <SelectItem value="special">Special</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} rooms</span>
      </div>

      {/* Safina Plaza — grouped by floor */}
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

      {/* Peepal Tree — grouped by floor */}
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

      <BedDetailModal
        room={selectedRoom} bed={selectedBed}
        open={!!selectedRoom}
        onClose={() => { setSelectedRoom(null); setSelectedBed(null) }}
      />
    </div>
  )
}
