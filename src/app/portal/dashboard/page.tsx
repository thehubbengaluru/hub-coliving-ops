"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
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

type Tab = "info" | "maintenance" | "payments" | "checkout"

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

export default function PortalDashboard() {
  const router = useRouter()
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
    setEmergencyNumber(g.emergencyNumber ?? "")
    setEmergencyRelation(g.emergencyRelation ?? "")
    if (g.checkOut) setCoDate(g.checkOut)
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
      setCoError(e instanceof Error ? e.message : "Failed to update.")
    } finally {
      setCoSaving(false)
    }
  }

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

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "info",        label: "My Info",        icon: <User className="w-4 h-4" /> },
    { id: "maintenance", label: "Maintenance",     icon: <Wrench className="w-4 h-4" /> },
    { id: "payments",    label: "Payments",        icon: <CreditCard className="w-4 h-4" /> },
    { id: "checkout",    label: "Check-out",       icon: <CalendarX className="w-4 h-4" /> },
  ]

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
              <p className="opacity-50 text-xs">Status</p>
              <p className="font-medium capitalize">{guest.status || "—"}</p>
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
              </div>

              <div className="rounded-xl border border-gray-100 p-4 text-sm text-gray-500 space-y-1">
                <p className="font-medium text-gray-700">Security deposit</p>
                <p>Your security deposit (equivalent to 1 month's rent) is held against potential damages.</p>
                <p className="mt-1">It will be refunded within <span className="font-medium text-gray-800">7 working days</span> after your notice period ends and you check out.</p>
                <p className="mt-1 text-xs text-amber-600">The deposit cannot be used to offset your monthly rent.</p>
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
      </main>
    </div>
  )
}
