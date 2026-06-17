"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, Calendar, Building2, UserCheck, RefreshCw } from "lucide-react"
import type { Room } from "@/lib/types"
import { usePropertyScope } from "@/lib/property-context"

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
      })
    }
  }
  return guests
}

export default function GuestsPage() {
  const [guests, setGuests] = useState<ActiveGuest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const { scope } = usePropertyScope()

  useEffect(() => {
    fetch("/api/rooms")
      .then(r => r.json())
      .then((data: Room[]) => {
        setGuests(buildGuests(data))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const filtered = guests.filter(g => {
    if (scope !== "all" && g.property !== scope) return false
    return (
      g.name.toLowerCase().includes(search.toLowerCase()) ||
      g.room.toLowerCase().includes(search.toLowerCase())
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading guests from Notion…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guests or rooms…" className="pl-8 h-8 text-xs" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} active guests</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(guest => (
          <Card key={guest.id} className="bg-card border-border shadow-none hover:border-slate-300 hover:shadow-sm transition-all duration-150 cursor-pointer">
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
                      guest.status === "special"  ? "bg-blue-400" :
                      "bg-amber-400"
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
                  guest.tier === "monthly"      ? "bg-slate-50 text-slate-600 border-slate-200" :
                  guest.tier === "weekly"       ? "bg-orange-50 text-orange-700 border-orange-200" :
                  guest.tier === "open-ended"   ? "bg-violet-50 text-violet-700 border-violet-200" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {guest.tier}
                </Badge>
                <Badge variant="outline" className={`text-[10px] h-4 px-1.5 ${
                  guest.status === "occupied" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                  guest.status === "special"  ? "bg-blue-50 text-blue-700 border-blue-200" :
                  "bg-amber-50 text-amber-700 border-amber-200"
                }`}>
                  {guest.status === "occupied" ? "Checked In" : guest.status === "special" ? "Special" : "Incoming"}
                </Badge>
                <span className="text-[10px] text-muted-foreground ml-auto">{guest.entity === "feazzo" ? "Feazzo" : "SV"}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          {search ? `No guests matching "${search}"` : "No active guests found"}
        </div>
      )}
    </div>
  )
}
