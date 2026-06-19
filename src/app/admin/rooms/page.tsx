"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import type { BedStatus, Floor } from "@/lib/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Building2, User, Calendar, UserPlus, Lock, Star, BedDouble,
  ShieldAlert, RefreshCw, CheckCircle2, LogOut, ArrowLeftRight, ArrowRight, Search,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import type { Room, Bed } from "@/lib/types"
import { usePropertyScope } from "@/lib/property-context"
import { rateForTier, tierOptions } from "@/lib/pricing"
import { computeRoomMoveFinancials, formatDateLong } from "@/lib/dates"

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

type ModalMode = "view" | "invite" | "checkin" | "checkout" | "block" | "reassign" | "success"

function today() {
  return new Date().toISOString().slice(0, 10)
}

// Default check-out checklist (placeholder — to be finalised with Benjamin's SOP).
const CHECKOUT_CHECKLIST_ITEMS = [
  "Room keys / access cards returned",
  "Room inspected for damages",
  "Personal belongings cleared",
  "Outstanding dues settled",
  "Furniture & fixtures intact",
  "Cleaning / housekeeping done",
]

function BedModal({
  room, bed, open, onClose, onDone, allRooms,
}: {
  room: Room | null
  bed: Bed | null
  open: boolean
  onClose: () => void
  onDone: () => void
  allRooms: Room[]
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

  // Invite (minimal check-in) form state
  const [invName, setInvName]   = useState("")
  const [invPhone, setInvPhone] = useState("")
  const [invEmail, setInvEmail] = useState("")

  // Block (make unavailable) form state
  const [blkReason, setBlkReason] = useState("")
  const [blkFrom, setBlkFrom]     = useState(today())
  const [blkUntil, setBlkUntil]   = useState("")
  const [blkBy, setBlkBy]         = useState("")

  // Checkout form state
  const [coDate, setCoDate] = useState(today())
  const [coNoticeDate, setCoNoticeDate] = useState("")
  const [coBy, setCoBy] = useState("")
  const [coDamages, setCoDamages] = useState("")
  const [coChecklist, setCoChecklist] = useState<{ label: string; checked: boolean }[]>([])

  // Reassign form state
  const [raRoomId, setRaRoomId]           = useState("")
  const [raSelectedBed, setRaSelectedBed] = useState<"A" | "B" | "">("")
  const [raFilter, setRaFilter]           = useState("")
  const [raMoveDate, setRaMoveDate]       = useState(today())
  const [raSendDiffLink, setRaSendDiffLink] = useState(true)
  const [raDepositDiff, setRaDepositDiff] = useState<number | null>(null)
  const [raDepositDiffLink, setRaDepositDiffLink] = useState<string | null>(null)

  const raSelectedRoom       = allRooms.find(r => r.id === raRoomId) ?? null
  // Resolve the destination rate from its known tier first, then any rate Notion
  // already has. Only when neither exists is the tier genuinely ambiguous and we
  // ask the operator to pick a tier manually.
  const raTierRate           = raSelectedRoom ? rateForTier(raSelectedRoom.property, raSelectedRoom.roomTier) : 0
  const raKnownRate          = raSelectedRoom ? (raSelectedRoom.monthlyRate || raTierRate) : 0
  // A room with a fixed tier (or any known rate) is never tier-ambiguous — the
  // operator can't change a room's tier, so the manual picker stays hidden.
  const raRateUnknown        = raSelectedRoom !== null && raKnownRate === 0 && !raSelectedRoom.roomTier
  const [raRateOverride, setRaRateOverride] = useState("")
  const raNewRate            = raRateUnknown
    ? (raRateOverride ? Number(raRateOverride) : 0)
    : raKnownRate
  const raOldRate            = room?.monthlyRate ?? 0
  const raDepositDelta       = raNewRate - raOldRate

  const raFinancials = raSelectedRoom && raNewRate > 0 && raOldRate > 0
    ? computeRoomMoveFinancials(raMoveDate, raOldRate, raNewRate)
    : null

  // Available target rooms: not the current room, at least one vacant bed
  const raAvailableRooms = useMemo(() =>
    allRooms.filter(r => r.id !== room?.id && r.beds.some(b => b.status === "vacant")),
    [allRooms, room]
  )

  const raFilteredRooms = useMemo(() =>
    raFilter.trim()
      ? raAvailableRooms.filter(r => r.number.includes(raFilter.trim()))
      : raAvailableRooms,
    [raAvailableRooms, raFilter]
  )

  // For sharing rooms, only show vacant beds
  const raVacantBeds = useMemo<("A" | "B")[]>(() => {
    if (!raSelectedRoom || raSelectedRoom.type === "private") return []
    return raSelectedRoom.beds
      .filter(b => b.status === "vacant")
      .map(b => (b.bedNumber === 1 ? "A" : "B"))
  }, [raSelectedRoom])

  // Auto-select bed when only one is available
  useEffect(() => {
    if (raVacantBeds.length === 1) setRaSelectedBed(raVacantBeds[0])
    else setRaSelectedBed("")
  }, [raVacantBeds])

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
      setCoNoticeDate("")
      setCoBy("")
      setCoDamages("")
      setCoChecklist(CHECKOUT_CHECKLIST_ITEMS.map((label) => ({ label, checked: false })))
      setInvName("")
      setInvPhone("")
      setInvEmail("")
      setBlkReason("")
      setBlkFrom(today())
      setBlkUntil("")
      setBlkBy("")
      setRaRoomId("")
      setRaSelectedBed("")
      setRaFilter("")
      setRaMoveDate(today())
      setRaRateOverride("")
      setRaSendDiffLink(true)
      setRaDepositDiff(null)
      setRaDepositDiffLink(null)
    }
  }, [open, room])

  const handleBlock = useCallback(async () => {
    if (!room || !bed) return
    if (!blkReason.trim()) { setError("Reason is required"); return }
    if (!blkBy.trim()) { setError("Please record who is blocking this bed"); return }
    setLoading(true)
    setError("")
    const notionPageId = bed.guestId ?? bed.id.replace(/^(plaza|peepal)-/, "")
    try {
      const res = await fetch("/api/rooms/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionPageId, property: room.property,
          reason: blkReason.trim(), fromDate: blkFrom || undefined,
          untilDate: blkUntil || undefined, blockedBy: blkBy.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to block")
      setSuccessMsg("Bed marked unavailable.")
      setMode("success")
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }, [room, bed, blkReason, blkFrom, blkUntil, blkBy, onDone])

  const handleUnblock = useCallback(async () => {
    if (!room || !bed) return
    setLoading(true)
    setError("")
    const notionPageId = bed.guestId ?? bed.id.replace(/^(plaza|peepal)-/, "")
    try {
      const res = await fetch("/api/rooms/block", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionPageId, property: room.property }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      setSuccessMsg("Bed is available again.")
      setMode("success")
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }, [room, bed, onDone])

  const handleInvite = useCallback(async () => {
    if (!room || !bed) return
    if (!invName.trim()) { setError("Guest name is required"); return }
    if (!invEmail.trim() && !invPhone.trim()) { setError("Email or phone is required"); return }

    setLoading(true)
    setError("")
    const notionPageId = bed.guestId ?? bed.id.replace(/^(plaza|peepal)-/, "")

    try {
      const res = await fetch("/api/rooms/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionPageId,
          property: room.property,
          guestName: invName.trim(),
          phone: invPhone.trim(),
          email: invEmail.trim(),
          monthlyRate: room.monthlyRate || 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Invite failed")

      const parts = ["Bed reserved as incoming."]
      parts.push(data.emailSent ? "Form link emailed to guest." : `Email not sent — share this link: ${data.formUrl}`)
      setSuccessMsg(parts.join(" "))
      setMode("success")
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }, [room, bed, invName, invPhone, invEmail, onDone])

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
    if (coChecklist.some((c) => !c.checked)) { setError("Complete every checklist item before checking out."); return }
    if (!coBy.trim()) { setError("Record who is confirming the check-out."); return }
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
          noticePeriodLastDate: coNoticeDate || undefined,
          checkedOutBy: coBy.trim(),
          damagesNote: coDamages.trim() || undefined,
          checklist: coChecklist,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Checkout failed")
      const refund = data.refundDueDate
        ? ` Deposit refund due by ${new Date(data.refundDueDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`
        : ""
      setSuccessMsg(`${bed.guestName} checked out. Notion updated.${refund}`)
      setMode("success")
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }, [room, bed, coDate, coNoticeDate, coBy, coDamages, coChecklist, onDone])

  const handleReassign = useCallback(async () => {
    if (!room || !bed || !raSelectedRoom) return
    if (raSelectedRoom.type === "sharing" && !raSelectedBed) {
      setError("Select a bed in the new room"); return
    }
    setLoading(true); setError("")
    const oldBedPageId = bed.guestId ?? bed.id.replace(/^(plaza|peepal)-/, "")
    const bedLabel     = raSelectedRoom.type === "sharing" ? ` · Bed ${raSelectedBed}` : ""
    const newRoomLabel = `Room ${raSelectedRoom.number}${bedLabel}`
    try {
      const res = await fetch("/api/rooms/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldBedPageId,
          property: raSelectedRoom.property,
          newRoom: raSelectedRoom.number,
          newBed: raSelectedBed || null,
          newRoomLabel,
          oldMonthlyRate: room.monthlyRate || 0,
          newMonthlyRate: raNewRate,
          guestName: bed.guestName,
          sendDepositDiff: raSendDiffLink,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Reassign failed")
      const diff: number = data.depositDiff ?? 0
      setRaDepositDiff(diff)
      setRaDepositDiffLink(data.depositDiffLink ?? null)
      const fin = raFinancials
      const diffNote = fin
        ? fin.totalTopUp > 0
          ? ` ₹${fin.totalTopUp.toLocaleString("en-IN")} payable by guest before move-in.${data.depositDiffLink ? " Payment link sent." : ""}`
          : fin.totalRefund > 0
            ? ` ₹${fin.totalRefund.toLocaleString("en-IN")} refund due by ${fin.refundByDate ? formatDateLong(fin.refundByDate) : "7 working days"}.`
            : ""
        : ""
      setSuccessMsg(`${bed.guestName} moved to ${newRoomLabel}. Notion updated.${diffNote}`)
      setMode("success")
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setLoading(false)
    }
  }, [room, bed, raSelectedRoom, raSelectedBed, raNewRate, raSendDiffLink, onDone])

  if (!room || !bed) return null
  const cfg = statusConfig[bed.status]

  // Gender restriction shown in the view modal:
  // - occupied/special bed → that guest's gender (informational)
  // - vacant bed in a SHARING room with an occupied sibling → sibling's gender
  // - empty room (no occupant) → no restriction
  function genderDisplay(): string {
    if (!room || !bed) return "No restriction"
    const hasGuest = bed.status === "occupied" || bed.status === "special" || bed.status === "incoming"
    if (hasGuest) return `${bed.genderRestriction}`
    if (room.type === "sharing") {
      const sibling = room.beds.find((b) => b.bedNumber !== bed.bedNumber)
      const siblingOccupied = sibling && (sibling.status === "occupied" || sibling.status === "incoming" || sibling.status === "special")
      if (siblingOccupied && sibling) return `${sibling.genderRestriction} only (to match roommate)`
    }
    return "No restriction"
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className={`bg-card border-border shadow-lg ${mode === "reassign" ? "w-[95vw] sm:max-w-[940px] max-h-[88vh] sm:p-6 flex flex-col overflow-hidden" : "max-w-sm"}`}>
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
              ["Gender", genderDisplay()],
              room.monthlyRate > 0 ? ["Rate", `₹${room.monthlyRate.toLocaleString("en-IN")}/mo`] : null,
              bed.depositPaid !== undefined ? ["Deposit", bed.depositPaid ? "Paid" : "Pending"] : null,
            ] as ([string, string] | null)[]).filter((r): r is [string, string] => r !== null).map(([label, value]) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className={`text-xs font-medium capitalize ${label === "Deposit" && value === "Paid" ? "text-emerald-600" : label === "Deposit" ? "text-amber-600" : "text-foreground"}`}>{value}</span>
              </div>
            ))}

            {bed.status === "vacant" && (
              <>
                <Button size="sm" className="w-full mt-1 h-8 text-xs bg-foreground text-background hover:bg-foreground/90 gap-1.5" onClick={() => setMode("invite")}>
                  <UserPlus className="w-3.5 h-3.5" /> Reserve & Send Form Link
                </Button>
                <button className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors" onClick={() => setMode("checkin")}>
                  Full manual check-in instead
                </button>
                <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setMode("block")}>
                  <Lock className="w-3.5 h-3.5" /> Make Unavailable
                </Button>
              </>
            )}
            {bed.status === "blocked" && (
              <Button size="sm" variant="outline" className="w-full mt-1 h-8 text-xs gap-1.5" disabled={loading} onClick={handleUnblock}>
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Make Available
              </Button>
            )}
            {(bed.status === "occupied" || bed.status === "special") && (
              <Button size="sm" variant="outline" className="w-full mt-1 h-8 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50" onClick={() => setMode("checkout")}>
                <LogOut className="w-3.5 h-3.5" /> Check Out
              </Button>
            )}
            {(bed.status === "occupied" || bed.status === "special" || bed.status === "incoming") && (
              <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50" onClick={() => setMode("reassign")}>
                <ArrowLeftRight className="w-3.5 h-3.5" /> Reassign to Different Room
              </Button>
            )}
          </div>
        )}

        {/* ── Invite (minimal check-in) ── */}
        {mode === "invite" && (
          <div className="space-y-3 pt-1">
            <p className="text-[11px] text-muted-foreground">
              Reserve this bed and send the guest a link to complete the full booking form
              (the form is our source of truth for their details).
            </p>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Guest Name *</label>
              <Input value={invName} onChange={e => setInvName(e.target.value)} placeholder="Full name" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Phone</label>
              <Input value={invPhone} onChange={e => setInvPhone(e.target.value)} placeholder="+91 98765 43210" className="h-8 text-xs" type="tel" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Email</label>
              <Input value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="guest@email.com" className="h-8 text-xs" type="email" />
            </div>
            {error && <p className="text-[11px] text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => { setMode("view"); setError("") }}>Back</Button>
              <Button size="sm" className="flex-1 h-8 text-xs bg-foreground text-background hover:bg-foreground/90" disabled={loading} onClick={handleInvite}>
                {loading ? <><RefreshCw className="w-3 h-3 animate-spin mr-1" /> Sending…</> : "Reserve & Send"}
              </Button>
            </div>
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

        {/* ── Make Unavailable ── */}
        {mode === "block" && (
          <div className="space-y-3 pt-1">
            <p className="text-[11px] text-muted-foreground">Mark this bed unavailable (e.g. maintenance, repairs, held). It won&rsquo;t be offered for booking.</p>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Reason *</label>
              <Input value={blkReason} onChange={e => setBlkReason(e.target.value)} placeholder="e.g. Plumbing repair" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">From</label>
                <Input value={blkFrom} onChange={e => setBlkFrom(e.target.value)} className="h-8 text-xs" type="date" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Until</label>
                <Input value={blkUntil} onChange={e => setBlkUntil(e.target.value)} className="h-8 text-xs" type="date" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Blocked by *</label>
              <Input value={blkBy} onChange={e => setBlkBy(e.target.value)} placeholder="Your name" className="h-8 text-xs" />
            </div>
            {error && <p className="text-[11px] text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => { setMode("view"); setError("") }}>Back</Button>
              <Button size="sm" className="flex-1 h-8 text-xs bg-red-600 text-white hover:bg-red-700" disabled={loading} onClick={handleBlock}>
                {loading ? <><RefreshCw className="w-3 h-3 animate-spin mr-1" /> Saving…</> : "Make Unavailable"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Checkout confirmation ── */}
        {mode === "checkout" && (
          <div className="space-y-3 pt-1 max-h-[60vh] overflow-y-auto">
            <p className="text-xs text-muted-foreground">
              Confirming check-out for <span className="font-medium text-foreground">{bed.guestName}</span>.
              This archives them to Alumni and frees the bed.
            </p>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Checked-out date</label>
                <Input value={coDate} onChange={e => setCoDate(e.target.value)} className="h-8 text-xs" type="date" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Notice-period last date</label>
                <Input value={coNoticeDate} onChange={e => setCoNoticeDate(e.target.value)} className="h-8 text-xs" type="date" />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">Deposit refund is due 7 working days after whichever of these two dates is later.</p>

            <div className="space-y-1.5 pt-1 border-t border-border">
              <p className="text-[11px] font-medium text-foreground">Check-out checklist *</p>
              {coChecklist.map((item, i) => (
                <label key={item.label} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={e => setCoChecklist(prev => prev.map((c, j) => j === i ? { ...c, checked: e.target.checked } : c))}
                    className="w-3 h-3 rounded"
                  />
                  <span className="text-[11px] text-muted-foreground">{item.label}</span>
                </label>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Damages / deductions (if any)</label>
              <textarea value={coDamages} onChange={e => setCoDamages(e.target.value)} placeholder="Describe any damages to deduct from deposit" rows={2} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs" />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Confirmed by *</label>
              <Input value={coBy} onChange={e => setCoBy(e.target.value)} placeholder="Your name" className="h-8 text-xs" />
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

        {/* ── Reassign ── */}
        {mode === "reassign" && (
          <>
            {/* Transfer journey: FROM ⇄ TO as two equal cards */}
            <div className="shrink-0 mt-1 grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-stretch gap-3 sm:gap-2">
              {/* FROM */}
              <div className="min-w-0 rounded-2xl border border-amber-100 bg-amber-50/50 px-5 py-4">
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-amber-600 mb-2">From</p>
                <p className="text-[15px] font-bold text-foreground leading-snug truncate">
                  Room {room.number}{room.type === "sharing" ? ` · Bed ${bed.bedNumber}` : ""}
                </p>
                <p className="text-sm text-muted-foreground mt-1 truncate">{bed.guestName}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-2.5">Old bed reverts to Vacant</p>
              </div>

              {/* Arrow connector */}
              <div className="flex items-center justify-center">
                <div className="w-9 h-9 rounded-full bg-card border border-border shadow-sm flex items-center justify-center rotate-90 sm:rotate-0">
                  <ArrowRight className="w-4 h-4 text-amber-500" />
                </div>
              </div>

              {/* TO */}
              <div className={`min-w-0 rounded-2xl border px-5 py-4 transition-colors ${
                raSelectedRoom ? "border-emerald-100 bg-emerald-50/40" : "border-dashed border-border bg-muted/20"
              }`}>
                <p className="text-[10px] font-bold tracking-[0.14em] uppercase text-emerald-600 mb-2">To</p>
                {raSelectedRoom ? (
                  <>
                    <p className="text-[15px] font-bold text-foreground leading-snug truncate">
                      Room {raSelectedRoom.number}{raSelectedBed ? ` · Bed ${raSelectedBed}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {raSelectedRoom.property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"} · {raSelectedRoom.floor} Floor
                    </p>
                    {raSelectedRoom.roomTier && (
                      <p className="text-[11px] font-medium text-emerald-600 mt-2.5 truncate">{raSelectedRoom.roomTier}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic mt-1">Choose a room below</p>
                )}
              </div>
            </div>

            {/* Main 50/50 content */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-0 mt-5 min-h-0">

              {/* ── LEFT: Destination picker ── */}
              <div className="flex flex-col gap-3 min-h-0 sm:pr-5 sm:border-r border-border">
                <p className="shrink-0 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                  Choose Destination
                </p>

                {/* Search */}
                <div className="relative shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    value={raFilter}
                    onChange={e => setRaFilter(e.target.value)}
                    placeholder="Search rooms…"
                    className="h-9 text-sm pl-9"
                  />
                </div>

                {/* Room list */}
                <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-border divide-y divide-border/50">
                  {raFilteredRooms.map(r => {
                    const vacantCount = r.beds.filter(b => b.status === "vacant").length
                    const isSelected  = raRoomId === r.id
                    const crossProp   = r.property !== room.property
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => { setRaRoomId(r.id); setRaSelectedBed(""); setRaRateOverride("") }}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all focus:outline-none focus-visible:ring-inset focus-visible:ring-2 focus-visible:ring-ring cursor-pointer ${
                          isSelected
                            ? "bg-amber-50 border-l-[3px] border-l-amber-500"
                            : "hover:bg-muted/20 border-l-[3px] border-l-transparent"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">Room {r.number}</span>
                            {crossProp && (
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">
                                {r.property === "safina-plaza" ? "Safina" : "Peepal"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] px-1.5 py-[2px] rounded-md font-medium ${
                              r.type === "private" ? "bg-sky-50 text-sky-600" : "bg-violet-50 text-violet-600"
                            }`}>
                              {r.roomTier ?? (r.type === "private" ? "Private" : "Sharing")}
                            </span>
                            {r.type === "sharing" && (
                              <span className="text-[10px] text-muted-foreground">{vacantCount} bed{vacantCount !== 1 ? "s" : ""} free</span>
                            )}
                            <span className="text-[10px] text-muted-foreground/40">{r.floor}</span>
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-2.5">
                          <span className={`text-sm font-bold tabular-nums ${isSelected ? "text-amber-600" : "text-foreground"}`}>
                            {r.monthlyRate > 0
                              ? `₹${r.monthlyRate >= 1000 ? (r.monthlyRate / 1000).toFixed(r.monthlyRate % 1000 === 0 ? 0 : 1) + "k" : r.monthlyRate}`
                              : <span className="text-muted-foreground/50 font-normal text-xs">TBD</span>
                            }
                          </span>
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-all duration-150 ${
                            isSelected ? "bg-amber-500 scale-100" : "bg-muted/40 scale-90"
                          }`}>
                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                  {raFilteredRooms.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-2.5 py-12">
                      <Search className="w-5 h-5 text-muted-foreground/20" />
                      <p className="text-xs text-muted-foreground/60">No rooms match</p>
                    </div>
                  )}
                </div>

                {/* Bed picker */}
                {raSelectedRoom?.type === "sharing" && raVacantBeds.length > 1 && (
                  <div className="shrink-0 space-y-2 pt-0.5">
                    <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">Assign Bed</p>
                    <div className="grid grid-cols-3 gap-2">
                      {raVacantBeds.map(b => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setRaSelectedBed(b)}
                          className={`h-9 rounded-xl border text-xs font-semibold transition-all ${
                            raSelectedBed === b
                              ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                              : "border-border text-muted-foreground hover:border-amber-300 hover:bg-amber-50"
                          }`}
                        >
                          Bed {b}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── RIGHT: Date + Tier + Financials ── */}
              <div className="flex flex-col gap-4 min-h-0 sm:pl-5 overflow-y-auto">

                {/* Move date */}
                <div className="shrink-0 space-y-2">
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">Move Date</p>
                  <Input
                    type="date"
                    value={raMoveDate}
                    onChange={e => setRaMoveDate(e.target.value)}
                    className="h-10 text-sm font-medium"
                  />
                </div>

                {/* Tier selector */}
                {raRateUnknown && raSelectedRoom && (
                  <div className="shrink-0 space-y-2">
                    <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">Room Tier</p>
                    <div className="flex flex-col gap-2">
                      {tierOptions(raSelectedRoom.property, raSelectedRoom.type).map(tier => {
                        const active = raRateOverride === String(tier.rate)
                        return (
                          <button
                            key={tier.rate}
                            type="button"
                            onClick={() => setRaRateOverride(String(tier.rate))}
                            className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                              active
                                ? "border-amber-500 bg-amber-500 text-white shadow-sm"
                                : "border-border text-muted-foreground hover:border-amber-300 hover:bg-amber-50/50"
                            }`}
                          >
                            <span>{tier.label}</span>
                            <span className={`tabular-nums font-bold ${active ? "text-white" : "text-foreground"}`}>
                              ₹{tier.rate.toLocaleString("en-IN")}
                              <span className={`font-normal text-xs ml-0.5 ${active ? "text-white/70" : "text-muted-foreground"}`}>/mo</span>
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Financial breakdown */}
                {raFinancials ? (
                  <div className="shrink-0 space-y-4">

                    {/* Rent */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">
                        Rent · {raFinancials.monthLabel}
                      </p>
                      <div className="rounded-xl border border-border overflow-hidden">
                        <div className="flex justify-between items-center px-4 py-2.5 bg-muted/30 border-b border-border/60">
                          <span className="text-xs text-muted-foreground">Already paid</span>
                          <span className="text-xs tabular-nums font-semibold text-foreground">₹{raFinancials.rentAlreadyPaid.toLocaleString("en-IN")}</span>
                        </div>
                        {raFinancials.daysAtOldRate > 0 && (
                          <div className="flex justify-between items-center px-4 py-2 border-b border-border/60">
                            <span className="text-xs text-muted-foreground">{raFinancials.oldRatePeriod}</span>
                            <span className="text-xs tabular-nums text-foreground">₹{raFinancials.proOldRent.toLocaleString("en-IN")}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center px-4 py-2 border-b border-border/60">
                          <span className="text-xs text-muted-foreground">{raFinancials.newRatePeriod}</span>
                          <span className="text-xs tabular-nums text-foreground">₹{raFinancials.proNewRent.toLocaleString("en-IN")}</span>
                        </div>
                        <div className={`flex justify-between items-center px-4 py-2.5 text-xs font-semibold ${
                          raFinancials.rentDelta > 0 ? "bg-emerald-50 text-emerald-700"
                          : raFinancials.rentDelta < 0 ? "bg-amber-50 text-amber-700"
                          : "bg-muted/20 text-muted-foreground"
                        }`}>
                          <span>{raFinancials.rentDelta >= 0 ? "Credit" : "Owed"}</span>
                          <span className="tabular-nums font-bold">
                            {raFinancials.rentDelta >= 0 ? "+" : "−"}₹{Math.abs(raFinancials.rentDelta).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Deposit */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">Security Deposit</p>
                      <div className="rounded-xl border border-border overflow-hidden">
                        <div className="flex justify-between items-center px-4 py-2 border-b border-border/60">
                          <span className="text-xs text-muted-foreground">Held</span>
                          <span className="text-xs tabular-nums text-foreground">₹{raFinancials.depositPaid.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex justify-between items-center px-4 py-2 border-b border-border/60">
                          <span className="text-xs text-muted-foreground">Required for new room</span>
                          <span className="text-xs tabular-nums text-foreground">₹{raFinancials.depositRequired.toLocaleString("en-IN")}</span>
                        </div>
                        <div className={`flex justify-between items-center px-4 py-2.5 text-xs font-semibold ${
                          raFinancials.depositDelta > 0 ? "bg-emerald-50 text-emerald-700"
                          : raFinancials.depositDelta < 0 ? "bg-amber-50 text-amber-700"
                          : "bg-muted/20 text-muted-foreground"
                        }`}>
                          <span>{raFinancials.depositDelta >= 0 ? "Refund" : "Top-up needed"}</span>
                          <span className="tabular-nums font-bold">
                            {raFinancials.depositDelta >= 0 ? "+" : "−"}₹{Math.abs(raFinancials.depositDelta).toLocaleString("en-IN")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Net totals */}
                    {raFinancials.totalRefund > 0 && (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs font-semibold text-emerald-800">Total Refund</span>
                          <span className="text-xl font-bold tabular-nums text-emerald-700 leading-none">
                            ₹{raFinancials.totalRefund.toLocaleString("en-IN")}
                          </span>
                        </div>
                        {raFinancials.refundByDate && (
                          <p className="text-[11px] text-emerald-600 mt-1.5 leading-snug">
                            By {formatDateLong(raFinancials.refundByDate)} ·{" "}
                            <span className="text-emerald-500/80">7 working days from move</span>
                          </p>
                        )}
                      </div>
                    )}
                    {raFinancials.totalTopUp > 0 && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-4">
                        <div className="flex justify-between items-baseline">
                          <span className="text-xs font-semibold text-amber-800">Amount Due</span>
                          <span className="text-xl font-bold tabular-nums text-amber-700 leading-none">
                            ₹{raFinancials.totalTopUp.toLocaleString("en-IN")}
                          </span>
                        </div>
                        <p className="text-[10px] text-amber-600/80 mt-1.5">Must be cleared before move-in.</p>
                      </div>
                    )}
                    {raFinancials.totalRefund === 0 && raFinancials.totalTopUp === 0 && (
                      <div className="rounded-xl bg-muted/40 border border-border px-4 py-4 text-center">
                        <p className="text-xs text-muted-foreground">No financial adjustment needed</p>
                      </div>
                    )}

                    {/* Send payment link */}
                    {raFinancials.totalTopUp > 0 && (
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={raSendDiffLink}
                          onChange={e => setRaSendDiffLink(e.target.checked)}
                          className="w-4 h-4 rounded accent-amber-500"
                        />
                        <span className="text-xs text-muted-foreground">Send payment link to guest now</span>
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 min-h-[120px] flex flex-col items-center justify-center rounded-xl border border-dashed border-border/40 text-center px-6 gap-3">
                    <div className="w-9 h-9 rounded-full bg-muted/40 flex items-center justify-center">
                      <ArrowLeftRight className="w-4 h-4 text-muted-foreground/30" />
                    </div>
                    <p className="text-xs text-muted-foreground/60 leading-relaxed">
                      {raSelectedRoom
                        ? "Set a move date to see the financial breakdown."
                        : "Select a destination room to get started."}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            {error && <p className="text-xs text-red-500 shrink-0 pt-2">{error}</p>}
            <div className="shrink-0 grid grid-cols-2 gap-3 pt-4 mt-2 border-t border-border">
              <Button variant="outline" className="h-10 text-sm" onClick={() => { setMode("view"); setError("") }}>
                ← Back
              </Button>
              <Button
                className="h-10 text-sm bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 font-semibold"
                disabled={loading || !raSelectedRoom || (raSelectedRoom.type === "sharing" && !raSelectedBed)}
                onClick={handleReassign}
              >
                {loading ? <><RefreshCw className="w-4 h-4 animate-spin mr-1.5" /> Moving…</> : "Confirm Reassign →"}
              </Button>
            </div>
          </>
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
        allRooms={rooms}
      />
    </div>
  )
}
