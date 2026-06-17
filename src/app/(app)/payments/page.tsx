"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
        bed,
      })
    }
  }
  return rows
}

type ActionState = "idle" | "loading" | "done" | "error"

interface LinkResult {
  url: string
  type: "deposit" | "subscription"
}

function GuestCard({
  row,
  tab,
}: {
  row: GuestRow
  tab: "deposits" | "subscriptions"
}) {
  const [depositState, setDepositState] = useState<ActionState>("idle")
  const [subState, setSubState] = useState<ActionState>("idle")
  const [linkResult, setLinkResult] = useState<LinkResult | null>(null)
  const [errorMsg, setErrorMsg] = useState("")
  const [customAmount, setCustomAmount] = useState(String(row.monthlyRate))

  const sendDepositLink = useCallback(async () => {
    setDepositState("loading")
    setErrorMsg("")
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
      setLinkResult({ url: data.url, type: "deposit" })
      setDepositState("done")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error")
      setDepositState("error")
    }
  }, [row, customAmount])

  const createSubscription = useCallback(async () => {
    setSubState("loading")
    setErrorMsg("")
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
      setLinkResult({ url: data.url, type: "subscription" })
      setSubState("done")
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Error")
      setSubState("error")
    }
  }, [row, customAmount])

  const propertyLabel = row.property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"
  const entityLabel   = row.entity === "feazzo" ? "Feazzo" : "SV"
  const avatarChar    = row.guestName.charAt(0).toUpperCase()

  return (
    <>
      <Card className="bg-card border-border shadow-none hover:border-slate-300 transition-all duration-150">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-sm font-semibold text-slate-700 shrink-0">
              {avatarChar}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">{row.guestName}</p>
              <p className="text-[11px] text-muted-foreground">{propertyLabel} · Rm {row.room}</p>
            </div>
            <span className="text-[10px] text-muted-foreground">{entityLabel}</span>
          </div>

          {tab === "deposits" && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Deposit amount</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">₹</span>
                  <Input
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    className="w-24 h-6 text-xs text-right px-1.5 tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                {row.depositPaid === true ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                    <CheckCircle2 className="w-3 h-3" /> Paid
                  </span>
                ) : row.depositPaid === false ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                    <Clock className="w-3 h-3" /> Pending
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">—</span>
                )}
              </div>

              {depositState === "done" && linkResult ? (
                <a
                  href={linkResult.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full h-7 rounded-md border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700 font-medium hover:bg-emerald-100 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Open payment link
                </a>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-[11px] gap-1.5"
                  disabled={depositState === "loading"}
                  onClick={sendDepositLink}
                >
                  {depositState === "loading"
                    ? <><RefreshCw className="w-3 h-3 animate-spin" /> Generating…</>
                    : <><Link2 className="w-3 h-3" /> Send Deposit Link</>}
                </Button>
              )}
              {depositState === "error" && (
                <p className="text-[10px] text-red-500">{errorMsg}</p>
              )}
            </div>
          )}

          {tab === "subscriptions" && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Monthly rent</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">₹</span>
                  <Input
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    className="w-24 h-6 text-xs text-right px-1.5 tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Billing</span>
                <span className="text-[10px] text-muted-foreground">1st of every month</span>
              </div>

              {subState === "done" && linkResult ? (
                <a
                  href={linkResult.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full h-7 rounded-md border border-emerald-200 bg-emerald-50 text-[11px] text-emerald-700 font-medium hover:bg-emerald-100 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> View mandate link
                </a>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 text-[11px] gap-1.5"
                  disabled={subState === "loading"}
                  onClick={createSubscription}
                >
                  {subState === "loading"
                    ? <><RefreshCw className="w-3 h-3 animate-spin" /> Creating…</>
                    : <><CreditCard className="w-3 h-3" /> Create Subscription</>}
                </Button>
              )}
              {subState === "error" && (
                <p className="text-[10px] text-red-500">{errorMsg}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Link result dialog */}
      <Dialog open={!!linkResult && (tab === "deposits" ? depositState === "done" : subState === "done")} onOpenChange={() => { setLinkResult(null); setDepositState("idle"); setSubState("idle") }}>
        <DialogContent className="max-w-sm bg-card border-border shadow-lg">
          <DialogHeader>
            <DialogTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {linkResult?.type === "deposit" ? "Deposit link sent" : "Subscription created"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {linkResult?.type === "deposit"
                ? `SMS + email sent to ${row.guestName} via Razorpay.`
                : `Mandate link sent to ${row.guestName}. Billing starts 1st of next month.`}
            </DialogDescription>
          </DialogHeader>
          {linkResult && (
            <a
              href={linkResult.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 h-8 rounded-md border border-border bg-muted text-[11px] text-foreground font-medium hover:bg-muted/80 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> {linkResult.url}
            </a>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function PaymentsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<"deposits" | "subscriptions">("deposits")

  const { scope } = usePropertyScope()

  useEffect(() => {
    fetch("/api/rooms")
      .then(r => r.json())
      .then((data: Room[]) => { setRooms(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const allGuests = buildGuestRows(rooms)
  const scopedGuests = scope !== "all" ? allGuests.filter(g => g.property === scope) : allGuests
  const filtered = scopedGuests.filter(g =>
    g.guestName.toLowerCase().includes(search.toLowerCase()) ||
    g.room.includes(search)
  )

  const depositPendingCount = scopedGuests.filter(g => !g.depositPaid).length
  const totalRent = scopedGuests.reduce((s, g) => s + g.monthlyRate, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Loading from Notion…
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
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
          <CreditCard className="w-3 h-3" />
          ₹{(totalRent / 1000).toFixed(0)}k/mo gross rent
        </div>
      </div>

      {/* Tab + search */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-muted rounded-md p-0.5">
          <button
            onClick={() => setTab("deposits")}
            className={`px-3 py-1 rounded-[5px] text-xs font-medium transition-all duration-150 cursor-pointer ${
              tab === "deposits" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Security Deposits
          </button>
          <button
            onClick={() => setTab("subscriptions")}
            className={`px-3 py-1 rounded-[5px] text-xs font-medium transition-all duration-150 cursor-pointer ${
              tab === "subscriptions" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Monthly Subscriptions
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search guest…" className="pl-8 h-8 text-xs w-52" />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} guests</span>
      </div>

      {tab === "deposits" && (
        <p className="text-xs text-muted-foreground">
          Generates a Razorpay Payment Link and sends it to the guest via SMS + email. Amount pre-filled from Notion tariff — edit before sending if needed.
        </p>
      )}
      {tab === "subscriptions" && (
        <p className="text-xs text-muted-foreground">
          Creates a Razorpay plan + subscription mandate. Guest receives the auto-debit authorization link. Billing starts on the 1st of next month.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(row => (
          <GuestCard key={`${row.notionPageId}-${tab}`} row={row} tab={tab} />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
          {search ? `No guests matching "${search}"` : "No active guests"}
        </div>
      )}

      <div className="mt-4 p-3 rounded-lg border border-amber-200 bg-amber-50">
        <p className="text-[11px] text-amber-700 font-medium mb-0.5">Webhook setup needed for real-time payment confirmation</p>
        <p className="text-[10px] text-amber-600">
          Go to Razorpay Dashboard → Settings → Webhooks → Add endpoint: <code className="font-mono">https://yourdomain.com/api/razorpay/webhook</code>.
          Copy the webhook secret into <code className="font-mono">RZP_WEBHOOK_SECRET_PLAZA</code> / <code className="font-mono">RZP_WEBHOOK_SECRET_PEEPAL</code> in .env.local.
          For local testing use ngrok: <code className="font-mono">ngrok http 3001</code>.
        </p>
      </div>
    </div>
  )
}
