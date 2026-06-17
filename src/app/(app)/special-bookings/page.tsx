"use client"

import { specialBookings } from "@/lib/mock-data"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Star, Shield, CheckCircle2, Clock, Mail, Plus } from "lucide-react"

const typeConfig = {
  "airbnb":             { label: "Airbnb Block",          badge: "bg-orange-50 text-orange-700 border-orange-200" },
  "owners-guest":       { label: "Owner's Guest",         badge: "bg-blue-50 text-blue-700 border-blue-200" },
  "team-discounted":    { label: "Team — Discounted",     badge: "bg-purple-50 text-purple-700 border-purple-200" },
  "team-complimentary": { label: "Team — Complimentary",  badge: "bg-purple-50 text-purple-700 border-purple-200" },
}

export default function SpecialBookingsPage() {
  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-4.5 h-4.5 text-slate-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">All special bookings require approval</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            Zero-charge or discounted bookings can only be authorised through this flow — never by editing a tariff field directly.
            Azaan receives an email notification for every special booking regardless of approver.
          </p>
        </div>
      </div>

      {/* Types reference */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {Object.entries(typeConfig).map(([key, cfg]) => (
          <div key={key} className={`rounded-xl p-3 border ${cfg.badge}`}>
            <p className="text-xs font-medium">{cfg.label}</p>
            <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
              {key === "airbnb"             ? "Manual block, no Hub Ops invoice"  :
               key === "owners-guest"       ? "Zero charge, owner authorised"     :
               key === "team-discounted"    ? "Custom tariff set by approver"     :
               "Zero charge, explicitly authorised"}
            </p>
          </div>
        ))}
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{specialBookings.length} special booking{specialBookings.length !== 1 ? "s" : ""} on record</p>
        <Button size="sm" className="h-8 gap-1.5 bg-foreground text-background hover:bg-foreground/90">
          <Plus className="w-3.5 h-3.5" /> Request
        </Button>
      </div>

      {/* Bookings */}
      {specialBookings.map(booking => {
        const cfg = typeConfig[booking.type]
        return (
          <Card key={booking.id} className="bg-card border-slate-200 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                    <Star className="w-4.5 h-4.5 text-slate-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                      {booking.isZeroCharge && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200">
                          Zero charge
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-foreground mt-1.5">{booking.guestName ?? "No guest name"}</p>
                    <p className="text-xs text-muted-foreground">
                      Room {booking.roomNumber} · {booking.property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6 text-xs">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Check-in</p>
                    <p className="font-medium text-foreground mt-0.5">
                      {new Date(booking.checkIn).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  {booking.checkOut && (
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Check-out</p>
                      <p className="font-medium text-foreground mt-0.5">
                        {new Date(booking.checkOut).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Audit log */}
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Audit Log</p>
                <div className="space-y-1.5">
                  {booking.auditLog.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                      <span className="font-medium text-foreground">{entry.action}</span>
                      <span className="text-muted-foreground">by {entry.by}</span>
                      <span className="text-muted-foreground ml-auto tabular-nums">
                        {new Date(entry.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {booking.azaanNotified && (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-600">
                      <Mail className="w-3 h-3" /> Azaan notified
                    </div>
                  )}
                  {booking.approvedBy && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                      <Clock className="w-3 h-3" /> Approved by {booking.approvedBy}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
