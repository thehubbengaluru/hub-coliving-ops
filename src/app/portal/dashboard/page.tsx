"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, LogOut, User, Wrench, CreditCard, CalendarX } from "lucide-react"

const AMBER = "#F9A91F"

type GuestData = {
  notionPageId: string
  guestName: string
  email: string
  room: string
  property: string
  checkIn: string | null
  checkOut: string | null
  monthlyRate: number
  status: string
  contactNumber: number | null
  orgName: string
  occupation: string
  workAddress: string
  emergencyName: string
  emergencyNumber: string
  emergencyRelation: string
}

type Tab = "info" | "maintenance" | "payments" | "checkout" | "cancel"

const MAINTENANCE_CATEGORIES = [
  "Electrical",
  "Plumbing",
  "Furniture",
  "Housekeeping",
  "Internet / Wi-Fi",
  "AC / Appliances",
  "Other",
]

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-5">{title}</h2>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder, type = "text" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
      style={{ "--tw-ring-color": AMBER } as React.CSSProperties}
    />
  )
}

function PortalDashboardInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [guest, setGuest] = useState<GuestData | null>(null)
  const [tab, setTab] = useState<Tab>("info")

  // Update-info state
  const [contactNumber, setContactNumber] = useState("")
  const [orgName, setOrgName] = useState("")
  const [occupation, setOccupation] = useState("")
  const [workAddress, setWorkAddress] = useState("")
  const [emergencyName, setEmergencyName] = useState("")
  const [emergencyNumber, setEmergencyNumber] = useState("")
  const [emergencyRelation, setEmergencyRelation] = useState("")
  const [infoSaving, setInfoSaving] = useState(false)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)

  // Maintenance state
  const [mtCategory, setMtCategory] = useState("")
  const [mtDesc, setMtDesc] = useState("")
  const [mtPhoto, setMtPhoto] = useState<File | null>(null)
  const [mtSubmitting, setMtSubmitting] = useState(false)
  const [mtMsg, setMtMsg] = useState<string | null>(null)

  // Checkout state
  const [coDate, setCoDate] = useState("")
  const [coSaving, setCoSaving] = useState(false)
  const [coMsg, setCoMsg] = useState<string | null>(null)
  const [coError, setCoError] = useState<string | null>(null)

  // Cancel booking state
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelSaving, setCancelSaving] = useState(false)
  const [cancelMsg, setCancelMsg] = useState<string | null>(null)
  const [cancelError, setCancelError] = useState<string | null>(null)

  // Pay-rent state
  const [payingRent, setPayingRent] = useState(false)
  const [payRentError, setPayRentError] = useState<string | null>(null)
  const [rentLinkId, setRentLinkId] = useState<string | null>(null)
  const [rentProperty, setRentProperty] = useState<string | null>(null)
  const [rentPaid, setRentPaid] = useState(false)
  const [rentChecking, setRentChecking] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("portal_guest")
    if (!stored) { router.replace("/portal"); return }
    const g: GuestData = JSON.parse(stored)
    setGuest(g)
    setContactNumber(g.contactNumber ? String(g.contactNumber) : "")
    setOrgName(g.orgName ?? "")
    setOccupation(g.occupation ?? "")
    setWorkAddress(g.workAddress ?? "")
    setEmergencyName(g.emergencyName ?? "")

    // If returning from Razorpay rent payment callback, restore pending link and switch to payments tab
    const fromRent = searchParams.get("rentReturn") === "1"
    const savedRentLink = localStorage.getItem(`hub_rent_link_${g.notionPageId}`)
    if (fromRent && savedRentLink) {
      try {
        const { linkId, property } = JSON.parse(savedRentLink) as { linkId: string; property: string }
        setRentLinkId(linkId)
        setRentProperty(property)
        setTab("payments")
      } catch { /* ignore */ }
    }
    setEmergencyNumber(g.emergencyNumber ?? "")
    setEmergencyRelation(g.emergencyRelation ?? "")
    if (g.checkOut) setCoDate(g.checkOut)

    // Re-fetch fresh data from Notion in background to get updated status/property
    fetch("/api/portal/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: g.email }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(fresh => {
        if (!fresh) return
        setGuest(fresh)
        localStorage.setItem("portal_guest", JSON.stringify(fresh))
        setContactNumber(fresh.contactNumber ? String(fresh.contactNumber) : "")
        setOrgName(fresh.orgName ?? "")
        setOccupation(fresh.occupation ?? "")
        setWorkAddress(fresh.workAddress ?? "")
        setEmergencyName(fresh.emergencyName ?? "")
        setEmergencyNumber(fresh.emergencyNumber ?? "")
        setEmergencyRelation(fresh.emergencyRelation ?? "")
        if (fresh.checkOut) setCoDate(fresh.checkOut)
      })
      .catch(() => { /* ignore */ })
  }, [router])

  function logout() {
    localStorage.removeItem("portal_guest")
    localStorage.removeItem("portal_profile")
    router.replace("/")
  }

  async function handleSaveInfo() {
    if (!guest) return
    setInfoSaving(true); setInfoMsg(null)
    try {
      const res = await fetch("/api/portal/update-info", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionPageId: guest.notionPageId,
          contactNumber, orgName, occupation, workAddress,
          emergencyName, emergencyNumber, emergencyRelation,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setInfoMsg("Information updated successfully.")
      const updated = { ...guest, contactNumber: parseInt(contactNumber, 10) || null, orgName, occupation, workAddress, emergencyName, emergencyNumber, emergencyRelation }
      setGuest(updated)
      localStorage.setItem("portal_guest", JSON.stringify(updated))
    } catch (e) {
      setInfoMsg(e instanceof Error ? e.message : "Failed to save.")
    } finally {
      setInfoSaving(false)
    }
  }

  async function handleMaintenanceSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!guest || !mtCategory || !mtDesc.trim()) return
    setMtSubmitting(true); setMtMsg(null)
    try {
      const fd = new FormData()
      fd.append("notionPageId", guest.notionPageId)
      fd.append("guestName", guest.guestName)
      fd.append("room", guest.room)
      fd.append("category", mtCategory)
      fd.append("description", mtDesc)
      if (mtPhoto) fd.append("photo", mtPhoto)
      const res = await fetch("/api/portal/maintenance", { method: "POST", body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setMtMsg("Ticket raised successfully! Our team will be in touch.")
      setMtCategory(""); setMtDesc(""); setMtPhoto(null)
    } catch (e) {
      setMtMsg(e instanceof Error ? e.message : "Failed to submit.")
    } finally {
      setMtSubmitting(false)
    }
  }

  async function handleCheckoutUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!guest || !coDate) return
    setCoSaving(true); setCoError(null); setCoMsg(null)
    try {
      const res = await fetch("/api/portal/checkout-date", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionPageId: guest.notionPageId, checkOutDate: coDate }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setCoMsg(d.message)
      const updated = { ...guest, checkOut: coDate }
      setGuest(updated)
      localStorage.setItem("portal_guest", JSON.stringify(updated))
    } catch (e) {
      setCoError(e instanceof Error ? e.message : "Failed to update. Please try again or contact the office.")
    } finally {
      setCoSaving(false)
    }
  }

  async function handleCancelBooking() {
    if (!guest) return
    setCancelSaving(true); setCancelError(null); setCancelMsg(null)
    try {
      const res = await fetch("/api/portal/cancel-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notionPageId: guest.notionPageId, email: guest.email }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      setCancelMsg(d.message)
      setCancelConfirm(false)
      const updated = { ...guest, status: "Cancelled" }
      setGuest(updated)
      localStorage.setItem("portal_guest", JSON.stringify(updated))
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : "Failed to cancel booking.")
    } finally {
      setCancelSaving(false)
    }
  }

  async function handlePayRent() {
    if (!guest) return
    setPayingRent(true); setPayRentError(null); setRentPaid(false)
    try {
      const callbackUrl = `${window.location.origin}/portal/dashboard?tab=payments&rentReturn=1`
      const res = await fetch("/api/portal/pay-rent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notionPageId: guest.notionPageId,
          room: guest.room,
          guestName: guest.guestName,
          email: guest.email,
          phone: guest.contactNumber ? String(guest.contactNumber) : "",
          amount: guest.monthlyRate,
          callbackUrl,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? "Failed")
      // Store link info so we can poll after Razorpay callback
      localStorage.setItem(`hub_rent_link_${guest.notionPageId}`, JSON.stringify({ linkId: d.linkId, property: d.property }))
      setRentLinkId(d.linkId)
      setRentProperty(d.property)
      window.open(d.url, "_blank", "noopener")
    } catch (e) {
      setPayRentError(e instanceof Error ? e.message : "Failed to start payment")
    } finally {
      setPayingRent(false)
    }
  }

  const checkRentStatus = useCallback(async (showSpinner = false) => {
    if (!rentLinkId || !rentProperty || rentPaid) return
    if (showSpinner) setRentChecking(true)
    try {
      const p = new URLSearchParams({ pageId: guest?.notionPageId ?? "", property: rentProperty, depositLinkId: rentLinkId })
      const r = await fetch(`/api/bookings/payment-status?${p}`)
      const d = await r.json()
      if (d.depositPaid) {
        setRentPaid(true)
        if (guest) localStorage.removeItem(`hub_rent_link_${guest.notionPageId}`)
      }
    } catch { /* ignore */ }
    finally { if (showSpinner) setRentChecking(false) }
  }, [rentLinkId, rentProperty, rentPaid, guest])

  useEffect(() => {
    if (!rentLinkId || rentPaid) return
    checkRentStatus()
    const id = setInterval(() => checkRentStatus(), 6000)
    return () => clearInterval(id)
  }, [rentLinkId, rentPaid, checkRentStatus])

  // Minimum checkout date: 1 calendar month from today
  const minCheckoutDate = (() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    return d.toISOString().slice(0, 10)
  })()

  if (!guest) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    )
  }

  // Maintenance & Check-out only make sense for a guest with an occupied room.
  const hasRoom = !!(guest.room && guest.room.trim())
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const checkInDate = guest.checkIn ? new Date(guest.checkIn + "T00:00:00") : null
  const checkOutDate = guest.checkOut ? new Date(guest.checkOut + "T00:00:00") : null
  const checkInHappened = checkInDate ? checkInDate <= today : false
  const checkInUpcoming = checkInDate ? checkInDate > today : false
  const isConfirmedBooking = /confirm|paid|incoming|occupied/i.test(guest.status)

  // Derive a human-readable occupancy label from dates + status.
  function occupancyLabel(): string {
    const s = guest?.status?.toLowerCase() ?? ""
    if (s.includes("cancel")) return "Cancelled"
    if (s.includes("checked-out") || s.includes("checked out")) return "Checked out"
    if (!checkInDate) return "—"
    if (checkInUpcoming) {
      return "Arriving " + checkInDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    }
    if (checkOutDate && checkOutDate > today) {
      return "Checking out " + checkOutDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    }
    return "Currently staying"
  }


  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "info",        label: "My Info",        icon: <User className="w-4 h-4" /> },
    ...(hasRoom ? [{ id: "maintenance" as Tab, label: "Maintenance", icon: <Wrench className="w-4 h-4" /> }] : []),
    { id: "payments",    label: "Payments",        icon: <CreditCard className="w-4 h-4" /> },
    ...(hasRoom && checkInHappened ? [{ id: "checkout" as Tab, label: "Check-out", icon: <CalendarX className="w-4 h-4" /> }] : []),
    ...(hasRoom && checkInUpcoming && isConfirmedBooking ? [{ id: "cancel" as Tab, label: "Cancel", icon: <CalendarX className="w-4 h-4" /> }] : []),
  ]

  // If the active tab got gated away, fall back to My Info.
  if (tab === "maintenance" && !hasRoom) setTab("info")
  if (tab === "checkout" && (!hasRoom || !checkInHappened)) setTab("info")
  if (tab === "cancel" && (!hasRoom || !checkInUpcoming || !isConfirmedBooking)) setTab("info")

  return (
    <div className="min-h-screen bg-[#FAF9F7]">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="text-xl font-normal" style={{ fontFamily: "Calistoga, serif", color: AMBER }}>
            The Hub
          </a>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 hidden sm:block">{guest.guestName}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Booking summary card */}
        <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)" }}>
          <p className="text-xs uppercase tracking-widest opacity-60 mb-1">Your Booking</p>
          <h1 className="text-2xl font-semibold mb-3" style={{ fontFamily: "Calistoga, serif" }}>
            {guest.guestName}
          </h1>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="opacity-50 text-xs">Property</p>
              <p className="font-medium">{guest.property || "—"}</p>
            </div>
            <div>
              <p className="opacity-50 text-xs">Room</p>
              <p className="font-medium">{guest.room || "—"}</p>
            </div>
            <div>
              <p className="opacity-50 text-xs">Check-in</p>
              <p className="font-medium">
                {guest.checkIn ? new Date(guest.checkIn + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—"}
              </p>
            </div>
            <div>
              <p className="opacity-50 text-xs">Occupancy</p>
              <p className="font-medium">{occupancyLabel()}</p>
            </div>
            <div className="col-span-2">
              <p className="opacity-50 text-xs">Security deposit</p>
              <p className="font-medium text-green-400">Paid ✓</p>
            </div>
          </div>
          {guest.monthlyRate > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10 text-sm">
              <p className="opacity-50 text-xs">Monthly rate</p>
              <p className="font-semibold">₹{guest.monthlyRate.toLocaleString("en-IN")}/mo <span className="font-normal opacity-60 text-xs">(Incl. GST)</span></p>
            </div>
          )}
        </div>

        {/* Tab nav */}
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-100 shadow-sm overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-1 justify-center"
              style={tab === t.id
                ? { backgroundColor: AMBER, color: "#000" }
                : { color: "#6b7280" }}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab: Update Info */}
        {tab === "info" && (
          <Section title="Update your information">
            <div className="space-y-4">
              <Field label="Contact number">
                <TextInput value={contactNumber} onChange={setContactNumber} placeholder="+91 98765 43210" type="tel" />
              </Field>
              <Field label="Organisation / College">
                <TextInput value={orgName} onChange={setOrgName} placeholder="Company or college name" />
              </Field>
              <Field label="Occupation">
                <TextInput value={occupation} onChange={setOccupation} placeholder="Your role or occupation" />
              </Field>
              <Field label="Work / college address">
                <TextInput value={workAddress} onChange={setWorkAddress} placeholder="Office or campus address" />
              </Field>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-sm font-medium text-gray-700 mb-3">Emergency contact</p>
                <div className="space-y-3">
                  <Field label="Name">
                    <TextInput value={emergencyName} onChange={setEmergencyName} placeholder="Full name" />
                  </Field>
                  <Field label="Phone number">
                    <TextInput value={emergencyNumber} onChange={setEmergencyNumber} placeholder="Contact number" type="tel" />
                  </Field>
                  <Field label="Relation">
                    <TextInput value={emergencyRelation} onChange={setEmergencyRelation} placeholder="e.g. Parent, Sibling" />
                  </Field>
                </div>
              </div>

              {infoMsg && (
                <p className={`text-sm ${infoMsg.includes("successfully") ? "text-green-600" : "text-red-500"}`}>
                  {infoMsg}
                </p>
              )}

              <button
                onClick={handleSaveInfo}
                disabled={infoSaving}
                className="w-full py-3 rounded-xl text-sm font-semibold text-black flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: AMBER }}
              >
                {infoSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : "Save changes"}
              </button>
            </div>
          </Section>
        )}

        {/* Tab: Maintenance */}
        {tab === "maintenance" && (
          <Section title="Raise a maintenance ticket">
            <form onSubmit={handleMaintenanceSubmit} className="space-y-4">
              <Field label="Category">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {MAINTENANCE_CATEGORIES.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setMtCategory(c)}
                      className="px-3 py-2 rounded-lg border text-sm text-left transition-all"
                      style={{
                        borderColor: mtCategory === c ? AMBER : "#e5e7eb",
                        backgroundColor: mtCategory === c ? "#fef3d8" : "#fff",
                        color: mtCategory === c ? "#111" : "#374151",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Describe the issue">
                <textarea
                  value={mtDesc}
                  onChange={e => setMtDesc(e.target.value)}
                  placeholder="Please describe the issue in detail…"
                  rows={4}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all resize-none"
                  style={{ "--tw-ring-color": AMBER } as React.CSSProperties}
                />
              </Field>

              <Field label="Photo (optional)">
                <label className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-dashed border-gray-300 cursor-pointer hover:border-amber-400 transition-colors">
                  <span className="text-sm text-gray-500">
                    {mtPhoto ? mtPhoto.name : "Tap to upload a photo"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => setMtPhoto(e.target.files?.[0] ?? null)}
                  />
                </label>
              </Field>

              {mtMsg && (
                <p className={`text-sm ${mtMsg.includes("successfully") ? "text-green-600" : "text-red-500"}`}>
                  {mtMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={mtSubmitting || !mtCategory || !mtDesc.trim()}
                className="w-full py-3 rounded-xl text-sm font-semibold text-black flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ backgroundColor: AMBER }}
              >
                {mtSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : "Submit ticket"}
              </button>
            </form>
          </Section>
        )}

        {/* Tab: Payments */}
        {tab === "payments" && (
          <Section title="Payment timeline">
            <div className="space-y-4">
              {/* Security deposit — always paid (deposit is the gate to portal access) */}
              <div className="rounded-xl border bg-green-50 border-green-200 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-green-900">Security deposit</p>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-200 text-green-800">Paid</span>
                </div>
                {guest.monthlyRate > 0 && (
                  <p className="text-xl font-bold text-green-900">
                    ₹{guest.monthlyRate.toLocaleString("en-IN")}
                    <span className="text-sm font-normal ml-1 opacity-70">(= 1 month's rent)</span>
                  </p>
                )}
                <p className="text-xs text-green-700">
                  Held against potential damages. Refunded within 7 working days after you check out.
                </p>
              </div>

              {/* Current rent info */}
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-900">Monthly rent</p>
                {guest.monthlyRate > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-amber-900">
                      ₹{guest.monthlyRate.toLocaleString("en-IN")}
                      <span className="text-sm font-normal text-amber-700 ml-1">/mo (Incl. GST)</span>
                    </p>
                    <p className="text-xs text-amber-700">
                      Monthly subscription is auto-debited on the 1st of each month via Razorpay mandate.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-amber-700">Rate not available. Please contact the office.</p>
                )}
              </div>

              <div className="rounded-xl border border-gray-200 p-4 space-y-3 text-sm">
                <p className="font-semibold text-gray-800">Next payment</p>
                <div className="flex justify-between text-gray-600">
                  <span>Due date</span>
                  <span className="font-medium">
                    {(() => {
                      const d = new Date()
                      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
                      return next.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                    })()}
                  </span>
                </div>
                {guest.monthlyRate > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Amount</span>
                    <span className="font-medium">₹{guest.monthlyRate.toLocaleString("en-IN")} (Incl. GST)</span>
                  </div>
                )}

                {guest.monthlyRate > 0 && (
                  <div className="pt-2 border-t border-gray-100 space-y-2">
                    {rentPaid ? (
                      <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        Paid — ₹{guest.monthlyRate.toLocaleString("en-IN")} received
                      </div>
                    ) : (
                      <button
                        onClick={handlePayRent}
                        disabled={payingRent}
                        className="w-full py-2.5 rounded-lg text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
                        style={{ backgroundColor: AMBER }}
                      >
                        {payingRent ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Pay this month&rsquo;s rent (₹{guest.monthlyRate.toLocaleString("en-IN")})
                      </button>
                    )}
                    {payRentError && <p className="text-xs text-red-500">{payRentError}</p>}
                    {rentLinkId && !rentPaid && (
                      <button
                        type="button"
                        onClick={() => checkRentStatus(true)}
                        disabled={rentChecking}
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-60"
                      >
                        {rentChecking ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                        I&rsquo;ve paid — check status
                      </button>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Your rent is normally <span className="font-medium text-gray-600">auto-debited via your Razorpay subscription</span> on the 1st.
                      Use this one-off payment link only if a charge was missed or your mandate isn&rsquo;t active yet.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-100 p-4 text-xs text-gray-400 space-y-1">
                <p className="font-medium text-gray-500">Deposit policy</p>
                <p>The deposit cannot be used to offset monthly rent. It is refunded within 7 working days after you check out, minus any outstanding dues.</p>
              </div>

              <p className="text-xs text-gray-400 text-center">
                For detailed payment history or receipts, contact the office.
              </p>
            </div>
          </Section>
        )}

        {/* Tab: Check-out */}
        {tab === "checkout" && (
          <Section title="Update check-out / notice period">
            <div className="space-y-5">
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600 space-y-2">
                <p className="font-medium text-gray-800">Notice period policy</p>
                <ul className="space-y-1 list-disc list-inside text-xs">
                  <li>Notice period is <strong>1 calendar month</strong>, served in writing.</li>
                  <li>Security deposit is returned within <strong>7 working days</strong> after check-out.</li>
                  <li>The deposit cannot be used to offset monthly rent.</li>
                </ul>
              </div>

              <form onSubmit={handleCheckoutUpdate} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                    Intended check-out date
                  </label>
                  <input
                    type="date"
                    value={coDate}
                    onChange={e => setCoDate(e.target.value)}
                    min={minCheckoutDate}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                    style={{ "--tw-ring-color": AMBER } as React.CSSProperties}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Earliest possible: {new Date(minCheckoutDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </div>

                {coError && <p className="text-sm text-red-500">{coError}</p>}
                {coMsg && <p className="text-sm text-green-600">{coMsg}</p>}

                <button
                  type="submit"
                  disabled={coSaving || !coDate}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-black flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                  style={{ backgroundColor: AMBER }}
                >
                  {coSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</> : "Confirm check-out date"}
                </button>
              </form>
            </div>
          </Section>
        )}

        {/* Tab: Cancel Booking */}
        {tab === "cancel" && (
          <Section title="Cancel booking">
            <div className="space-y-5">
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 space-y-2">
                <p className="font-medium text-red-800">Cancellation policy</p>
                <ul className="space-y-1 list-disc list-inside text-xs">
                  <li>A cancellation fee of <strong>₹3,500</strong> applies.</li>
                  <li>Your security deposit will be refunded minus the cancellation fee within 7 working days.</li>
                  <li>Your bed will be released back to the available pool.</li>
                  <li>Cancellations are only possible before check-in.</li>
                </ul>
              </div>

              {cancelMsg ? (
                <div className="rounded-xl bg-green-50 border border-green-200 p-4 text-sm text-green-700">
                  {cancelMsg}
                </div>
              ) : !cancelConfirm ? (
                <button
                  type="button"
                  onClick={() => setCancelConfirm(true)}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                >
                  Cancel my booking
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-700 font-medium">
                    Are you sure? A ₹3,500 cancellation fee will apply and this cannot be undone.
                  </p>
                  {cancelError && <p className="text-sm text-red-500">{cancelError}</p>}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setCancelConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      Go back
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelBooking}
                      disabled={cancelSaving}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      {cancelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      Yes, cancel booking
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>
        )}
      </main>
    </div>
  )
}

export default function PortalDashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    }>
      <PortalDashboardInner />
    </Suspense>
  )
}
