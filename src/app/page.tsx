"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  MapPin, Phone, ChevronDown, ChevronUp, ArrowRight,
  Building2, X, CheckCircle2, Loader2, Wifi, Home,
  Clock, Zap, Droplets, ShieldCheck, Sofa, Users, Star,
  Menu,
} from "lucide-react"
import { formatAvailableFrom, getRoomLabel, type BedListing } from "@/lib/inventory"

// ─── Design tokens ────────────────────────────────────────────────────────────
const AMBER      = "#F9A91F"
const DARK       = "#0A0A0A"
const WARM_WHITE = "#FAF9F7"

// ─── Data ─────────────────────────────────────────────────────────────────────

const properties = [
  {
    id: "safina-plaza" as const,
    name: "The Hub Bengaluru",
    shortName: "Safina Plaza",
    tagline: "City-centre co-living. Shivaji Nagar.",
    area: "Shivaji Nagar",
    address: "Safina Plaza, 84/85, Infantry Rd, Shivaji Nagar, Bengaluru 560001",
    beds: 33,
    privateRooms: 8,
    sharedBeds: 25,
    reception: "24 hours",
    security: "24/7 CCTV + guard",
    whatsapp: "919113992047",
    fromPrice: "₹21,500",
    gradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%)",
    pricing: [
      { label: "1-week short stay",        type: "Any",     monthly: "₹25,000", flat: true,  popular: false, best: false },
      { label: "Standard sharing",          type: "Sharing", monthly: "₹21,500", flat: false, popular: false, best: false },
      { label: "Deluxe sharing",            type: "Sharing", monthly: "₹30,000", flat: false, popular: true,  best: false },
      { label: "Private room",              type: "Private", monthly: "₹43,500", flat: false, popular: false, best: false },
      { label: "Deluxe private",            type: "Private", monthly: "₹60,000", flat: false, popular: false, best: false },
    ],
  },
  {
    id: "peepal-tree" as const,
    name: "Peepal Tree @ The Hub",
    shortName: "Peepal Tree",
    tagline: "Intimate co-living. St Johns Road.",
    area: "St Johns Road",
    address: "35/1, St Johns Rd, Sivanchetti Gardens, Bengaluru 560042",
    beds: 19,
    privateRooms: 4,
    sharedBeds: 15,
    reception: "8 am – 8 pm",
    security: "CCTV + guard 8 am – 8 pm",
    whatsapp: "919113992047",
    fromPrice: "₹18,550",
    gradient: "linear-gradient(135deg, #2d1b00 0%, #4a2c00 40%, #6b3f00 100%)",
    pricing: [
      { label: "1-week short stay",  type: "Any",     monthly: "₹25,000", flat: true,  popular: false, best: false },
      { label: "Shared room",        type: "Sharing", monthly: "₹18,550", flat: false, popular: false, best: true  },
      { label: "Private room",       type: "Private", monthly: "₹39,100", flat: false, popular: false, best: false },
    ],
  },
]

const benefits = [
  { title: "All-Inclusive Rent",    desc: "Wi-Fi, housekeeping, power backup, hot water — all in one price." },
  { title: "Prime Locations",       desc: "Shivaji Nagar & St Johns Road, two of Bengaluru's best-connected neighbourhoods." },
  { title: "Verified Community",    desc: "Professionals, students, and creatives who value good living." },
  { title: "Zero Maintenance",      desc: "We handle it. You just live. No landlord calls, no repair stress." },
  { title: "Flexible Stays",        desc: "From 1 week to open-ended. Your timeline, your call." },
  { title: "24/7 Support",          desc: "Always someone to call. Your property manager is a WhatsApp away." },
]

const faqs = [
  {
    q: "What's included in the monthly rent?",
    a: "Your rent covers your bed, 24/7 Wi-Fi, housekeeping twice a week, power backup, hot water, access to the co-working space, and invites to all Hub community events.",
  },
  {
    q: "Is there a minimum stay?",
    a: "Yes — the minimum stay is 1 week. For monthly stays, our standard pricing applies from the first full month onwards.",
  },
  {
    q: "How does booking work?",
    a: "You fill out our pre-arrival form, sign the rental agreement digitally, and pay the security deposit + first month's rent to confirm your bed. Once done, you'll receive your move-in details within 24 hours.",
  },
  {
    q: "What's the security deposit?",
    a: "The deposit is 1 month's rent. It is refunded within 7 working days after check-out, after any deductions for damages or unpaid dues.",
  },
  {
    q: "What is the cancellation policy?",
    a: "If you cancel within 7 working days after check-out, you are eligible for a refund. If you leave without serving the 1-month notice period, the shortfall will be deducted from your deposit.",
  },
  {
    q: "What IDs do you accept?",
    a: "We accept Aadhaar and PAN. You'll be asked to upload both (front and back) during the pre-arrival form.",
  },
  {
    q: "Are meals included?",
    a: "No, meals are not included. Both properties have a shared kitchen you can use.",
  },
  {
    q: "What's the difference between the two properties?",
    a: "Safina Plaza is in the heart of Shivaji Nagar with 24-hour reception and security — great if you want city-centre access and a larger community. Peepal Tree on St Johns Road is more intimate with 19 rooms in a quieter neighbourhood. Both give you access to Hub community events.",
  },
]

// ─── Enquiry Modal ────────────────────────────────────────────────────────────

interface EnquiryTarget {
  bed: BedListing | null
  property: "safina-plaza" | "peepal-tree"
}

function EnquiryModal({ target, onClose }: { target: EnquiryTarget | null; onClose: () => void }) {
  const [name, setName]         = useState("")
  const [phone, setPhone]       = useState("")
  const [email, setEmail]       = useState("")
  const [roomType, setRoomType] = useState<"sharing" | "private" | "">("")
  const [notes, setNotes]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [done, setDone]         = useState(false)
  const [err, setErr]           = useState("")

  useEffect(() => {
    if (target) {
      setName(""); setPhone(""); setEmail(""); setNotes("")
      setDone(false); setErr("")
      if (target.bed) setRoomType(target.bed.size === "Single" ? "private" : "sharing")
      else setRoomType("")
    }
  }, [target])

  const submit = useCallback(async () => {
    if (!name.trim())  { setErr("Your name is required"); return }
    if (!phone.trim()) { setErr("Phone number is required"); return }
    setLoading(true); setErr("")
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          property: target?.property ?? "safina-plaza",
          roomType: roomType || undefined,
          roomNumber: target?.bed?.roomNumber,
          notes: [
            target?.bed
              ? `Interested in Room ${target.bed.roomNumber}${target.bed.bedLabel ? " Bed " + target.bed.bedLabel : ""}`
              : "",
            notes.trim(),
          ].filter(Boolean).join(" — ") || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Submission failed")
      setDone(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }, [name, phone, email, roomType, notes, target])

  if (!target) return null
  const propertyName = target.property === "peepal-tree" ? "Peepal Tree @ The Hub" : "The Hub Bengaluru"

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <h3 className="text-[17px] font-semibold text-black" style={{ fontFamily: "Cinzel, serif" }}>
              {target.bed ? `Enquire — ${getRoomLabel(target.bed)}` : `Enquire — ${propertyName}`}
            </h3>
            <p className="text-[12px] text-gray-400 mt-1">{propertyName} · We&apos;ll reply within a few hours</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: AMBER }} />
            <p className="text-[16px] font-semibold text-black mb-1">Got it, {name.split(" ")[0]}!</p>
            <p className="text-[13px] text-gray-500">We&apos;ll WhatsApp or call you back within a few hours.</p>
            <button
              onClick={onClose}
              className="mt-5 px-6 py-2.5 rounded-full text-[13px] font-semibold text-black"
              style={{ backgroundColor: AMBER }}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {(
              [
                { label: "Your name *", value: name,  setter: setName,  placeholder: "Full name",       type: "text"  },
                { label: "Phone *",     value: phone, setter: setPhone, placeholder: "+91 98765 43210", type: "tel"   },
                { label: "Email",       value: email, setter: setEmail, placeholder: "you@email.com",   type: "email" },
              ] as Array<{ label: string; value: string; setter: (v: string) => void; placeholder: string; type: string }>
            ).map(({ label, value, setter, placeholder, type }) => (
              <div key={label} className="space-y-1">
                <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</label>
                <input
                  value={value}
                  onChange={e => setter(e.target.value)}
                  placeholder={placeholder}
                  type={type}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:border-amber-400 transition-colors"
                />
              </div>
            ))}

            {!target.bed && (
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Room type</label>
                <div className="flex gap-2">
                  {(["sharing", "private"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setRoomType(t)}
                      className="flex-1 py-2.5 rounded-xl text-[13px] font-medium border transition-all capitalize"
                      style={
                        roomType === t
                          ? { backgroundColor: AMBER, borderColor: AMBER, color: "#000" }
                          : { borderColor: "#e5e7eb", color: "#6b7280" }
                      }
                    >
                      {t === "sharing" ? "Shared bed" : "Private room"}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Message (optional)</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Move-in date, questions, anything else…"
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-[14px] focus:outline-none focus:border-amber-400 transition-colors resize-none"
              />
            </div>

            {err && <p className="text-[12px] text-red-500">{err}</p>}

            <button
              onClick={submit}
              disabled={loading}
              className="w-full py-3.5 rounded-full text-[14px] font-semibold text-black flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-60"
              style={{ backgroundColor: AMBER }}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : "Send enquiry"}
            </button>
            <p className="text-[11px] text-gray-400 text-center">We respond via WhatsApp / call, usually within a few hours.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Bed Card ─────────────────────────────────────────────────────────────────

function BedCard({ bed, onEnquire }: { bed: BedListing; onEnquire: (b: BedListing) => void }) {
  const isNow     = bed.status === "Vacant"
  const isSoon    = bed.status === "Occupied" && bed.availableFrom !== null
  const isPrivate = bed.size === "Single"

  return (
    <div
      className="rounded-2xl border p-5 flex flex-col gap-4 transition-all"
      style={{
        backgroundColor: isNow ? "#fffbf0" : "#fff",
        borderColor: isNow ? "#f9a91f40" : "#f3f4f6",
        boxShadow: isNow ? "0 4px 24px rgba(249,169,31,0.10)" : "0 2px 12px rgba(0,0,0,0.05)",
        opacity: bed.status === "Blocked" ? 0.45 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-semibold text-black">{getRoomLabel(bed)}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">
            {bed.category} · {isPrivate ? "Private room" : "Shared bed"}
          </div>
        </div>
        <span
          className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full"
          style={
            isNow  ? { backgroundColor: "#dcfce7", color: "#166534" } :
            isSoon ? { backgroundColor: "#fff7ed", color: "#9a3412" } :
                     { backgroundColor: "#f3f4f6", color: "#6b7280" }
          }
        >
          {bed.status === "Blocked" ? "Blocked" : formatAvailableFrom(bed)}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-[18px] font-bold text-black" style={{ fontFamily: "Cinzel, serif" }}>
            ₹{bed.monthlyRate.toLocaleString("en-IN")}
            <span className="text-[12px] font-normal text-gray-400"> /mo</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">₹{bed.weeklyRate.toLocaleString("en-IN")} for 1 week · Incl. GST</div>
        </div>
        {(isNow || isSoon) && (
          <button
            onClick={() => onEnquire(bed)}
            className="text-[12px] font-semibold px-4 py-2 rounded-full text-black hover:opacity-80 transition-all"
            style={{ backgroundColor: isNow ? AMBER : "#f3f4f6" }}
          >
            Enquire
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  // Navbar
  const [scrolled, setScrolled]     = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileName, setProfileName] = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("portal_profile")
    if (stored) {
      try { setProfileName(JSON.parse(stored).name ?? null) } catch { /* ignore */ }
    }
  }, [])

  // Property switcher (availability)
  const [activeProperty, setActiveProperty] = useState<"safina-plaza" | "peepal-tree">("safina-plaza")

  // Pricing tab
  const [pricingProperty, setPricingProperty] = useState<"safina-plaza" | "peepal-tree">("safina-plaza")

  // FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Enquiry modal
  const [enquiryModal, setEnquiryModal] = useState(false)
  const [enquiryTarget, setEnquiryTarget] = useState<EnquiryTarget | null>(null)

  // Availability
  const [beds, setBeds]             = useState<BedListing[]>([])
  const [loading, setLoading]       = useState(true)
  const [fetchErr, setFetchErr]     = useState<string | null>(null)
  const [availabilityFilter, setAvailabilityFilter] = useState<"all" | "Vacant" | "shared" | "private">("all")
  const [showAll, setShowAll]       = useState(false)

  // Scroll listener
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Fetch availability
  useEffect(() => {
    fetch("/api/rooms/availability")
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then((data: BedListing[]) => setBeds(data))
      .catch(e => setFetchErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  // Computed availability
  const propertyBeds = beds.filter(b => b.property === activeProperty)
  const filteredBeds = propertyBeds.filter(b => {
    if (b.status === "Blocked") return false
    if (availabilityFilter === "Vacant")  return b.status === "Vacant"
    if (availabilityFilter === "shared")  return b.size === "Double"
    if (availabilityFilter === "private") return b.size === "Single"
    return true
  })
  const sortedBeds = [...filteredBeds].sort((a, b) => {
    if (a.status === "Vacant" && b.status !== "Vacant") return -1
    if (b.status === "Vacant" && a.status !== "Vacant") return 1
    if (a.availableFrom && b.availableFrom) return a.availableFrom.localeCompare(b.availableFrom)
    if (a.availableFrom) return -1
    if (b.availableFrom) return 1
    return 0
  })
  const displayedBeds = showAll ? sortedBeds : sortedBeds.slice(0, 9)
  const vacantNow = propertyBeds.filter(b => b.status === "Vacant").length

  const openEnquiry = useCallback((bed: BedListing | null, property: "safina-plaza" | "peepal-tree") => {
    setEnquiryTarget({ bed, property })
    setEnquiryModal(true)
  }, [])

  const pricingData = properties.find(p => p.id === pricingProperty)!

  return (
    <>
      <style>{`
        @keyframes ambient-pulse { 0%,100%{opacity:0.13} 50%{opacity:0.20} }
        @keyframes scroll-bounce { 0%,100%{transform:translateY(0) translateX(-50%)} 50%{transform:translateY(8px) translateX(-50%)} }
        .ambient-orb { animation: ambient-pulse 5s ease-in-out infinite; }
        .scroll-hint { animation: scroll-bounce 2s ease-in-out infinite; position:absolute; bottom:2rem; left:50%; }
        @media (prefers-reduced-motion: reduce) { .ambient-orb, .scroll-hint { animation: none; } }
      `}</style>

      <EnquiryModal
        target={enquiryModal ? enquiryTarget : null}
        onClose={() => setEnquiryModal(false)}
      />

      {/* ── NAVBAR ── */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
        style={{
          backgroundColor: scrolled ? "rgba(255,255,255,0.97)" : "transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          borderBottom: scrolled ? "1px solid rgba(0,0,0,0.08)" : "none",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: AMBER }}
            >
              <span className="text-black font-bold text-[10px]">TH</span>
            </div>
            <span
              className="text-[18px] font-normal tracking-wide transition-colors"
              style={{ fontFamily: "Calistoga, serif", color: scrolled ? "#111" : "#fff" }}
            >
              The Hub
            </span>
          </Link>

          {/* Desktop links */}
          <div
            className="hidden md:flex items-center gap-7 text-[13px] font-medium"
            style={{ color: scrolled ? "#4b5563" : "rgba(255,255,255,0.80)" }}
          >
            {[
              { label: "Properties",   href: "#properties" },
              { label: "Availability", href: "#availability" },
              { label: "Pricing",      href: "#pricing" },
              { label: "FAQ",          href: "#faq" },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="hover:opacity-100 transition-opacity"
                style={{ opacity: 0.8 }}
              >
                {label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <a
              href="https://wa.me/919113992047"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-medium transition-colors"
              style={{ color: scrolled ? "#4b5563" : "rgba(255,255,255,0.75)" }}
            >
              WhatsApp us
            </a>
            {profileName ? (
              <a
                href="/portal"
                className="text-[13px] font-medium transition-colors flex items-center gap-1.5"
                style={{ color: scrolled ? "#4b5563" : "rgba(255,255,255,0.80)" }}
              >
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0" style={{ backgroundColor: AMBER }}>
                  {profileName.charAt(0).toUpperCase()}
                </span>
                {profileName.split(" ")[0]}
              </a>
            ) : (
              <a
                href="/auth"
                className="text-[13px] font-medium transition-colors"
                style={{ color: scrolled ? "#4b5563" : "rgba(255,255,255,0.80)" }}
              >
                Sign in
              </a>
            )}
            <a
              href={profileName ? "/book" : "/auth?next=/book"}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-[13px] font-semibold text-black"
              style={{ backgroundColor: AMBER }}
            >
              Book a bed
            </a>
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg transition-colors"
            style={{ color: scrolled ? "#111" : "#fff" }}
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 pb-5 pt-3 space-y-1">
            {[
              { label: "Properties",   href: "#properties" },
              { label: "Availability", href: "#availability" },
              { label: "Pricing",      href: "#pricing" },
              { label: "FAQ",          href: "#faq" },
            ].map(({ label, href }) => (
              <a
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-3 rounded-xl text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {label}
              </a>
            ))}
            {profileName ? (
              <a
                href="/portal"
                className="block mt-2 px-4 py-3 rounded-xl text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
              >
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0" style={{ backgroundColor: AMBER }}>
                  {profileName.charAt(0).toUpperCase()}
                </span>
                {profileName.split(" ")[0]} — My account
              </a>
            ) : (
              <a
                href="/auth"
                className="block mt-2 px-4 py-3 rounded-xl text-[14px] font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Sign in
              </a>
            )}
            <a
              href={profileName ? "/book" : "/auth?next=/book"}
              className="block mt-2 px-4 py-3 rounded-full text-[14px] font-semibold text-black text-center"
              style={{ backgroundColor: AMBER }}
            >
              Book a bed
            </a>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section
        className="relative flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: DARK, minHeight: "100vh" }}
      >
        {/* Ambient orbs */}
        <div
          className="ambient-orb pointer-events-none"
          style={{
            position: "absolute",
            top: "-10%",
            right: "-5%",
            width: "55vw",
            height: "55vw",
            maxWidth: 700,
            maxHeight: 700,
            borderRadius: "50%",
            backgroundColor: AMBER,
            filter: "blur(140px)",
            opacity: 0.13,
          }}
        />
        <div
          className="ambient-orb pointer-events-none"
          style={{
            position: "absolute",
            bottom: "-15%",
            left: "-8%",
            width: "45vw",
            height: "45vw",
            maxWidth: 580,
            maxHeight: 580,
            borderRadius: "50%",
            backgroundColor: "#e09518",
            filter: "blur(140px)",
            opacity: 0.10,
            animationDelay: "2.5s",
          }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-24 pb-32">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-widest mb-8"
            style={{ backgroundColor: "rgba(255,255,255,0.08)", color: AMBER, border: "1px solid rgba(249,169,31,0.25)" }}
          >
            Co-Living · Bengaluru
          </div>

          <h1
            className="text-[52px] sm:text-[68px] lg:text-[84px] font-normal leading-[1.05] text-white mb-6"
            style={{ fontFamily: "Cinzel, serif" }}
          >
            Live more.<br />
            <span style={{ color: AMBER }}>Stress less.</span>
          </h1>

          <p className="text-[18px] text-gray-400 leading-relaxed mb-10 max-w-xl mx-auto">
            Two thoughtfully designed co-living spaces in the heart of Bengaluru.
            Community, comfort, and convenience — all included.
          </p>

          <div className="flex flex-wrap gap-4 justify-center mb-12">
            <a
              href={profileName ? "/book" : "/auth?next=/book"}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-[15px] font-semibold text-black transition-all hover:opacity-90"
              style={{ backgroundColor: AMBER }}
            >
              Book a bed
            </a>
            <a
              href="#properties"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-[15px] font-medium text-white transition-all hover:bg-white/10"
              style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Explore properties
            </a>
          </div>

          {/* Stat pills */}
          <div className="flex flex-wrap gap-3 justify-center">
            {[
              "55+ beds across 2 properties",
              "From ₹18,550 / month",
              "Bengaluru, KA",
            ].map(text => (
              <span
                key={text}
                className="text-[13px] text-white px-4 py-1.5 rounded-full"
                style={{ backgroundColor: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.12)" }}
              >
                {text}
              </span>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="scroll-hint text-white/50">
          <ChevronDown className="w-6 h-6" />
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="bg-white border-y border-gray-100 py-12 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "55+",     label: "Beds across both properties" },
            { value: "2",       label: "Properties in Bengaluru" },
            { value: "₹18,550", label: "Starting monthly rate" },
            { value: "24/7",    label: "Support & security" },
          ].map(({ value, label }) => (
            <div key={value} className="text-center">
              <div
                className="text-[38px] sm:text-[44px] font-normal leading-none mb-2"
                style={{ fontFamily: "Cinzel, serif", color: AMBER }}
              >
                {value}
              </div>
              <div className="text-[13px] text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROPERTIES ── */}
      <section id="properties" className="py-24 px-4 sm:px-6" style={{ backgroundColor: WARM_WHITE }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-[38px] sm:text-[48px] font-normal text-black mb-3"
              style={{ fontFamily: "Cinzel, serif" }}
            >
              Our Properties
            </h2>
            <p className="text-[16px] text-gray-500">Choose your neighbourhood</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {properties.map(p => (
              <div
                key={p.id}
                className="rounded-2xl overflow-hidden bg-white"
                style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}
              >
                {/* Card image area */}
                <div className="relative" style={{ height: 220, background: p.gradient }}>
                  <span
                    className="absolute top-4 left-4 text-[11px] font-semibold text-black px-3 py-1 rounded-full"
                    style={{ backgroundColor: AMBER }}
                  >
                    {p.area}
                  </span>
                  <span className="absolute bottom-4 right-4 text-[13px] font-medium text-white/80">
                    {p.beds} beds
                  </span>
                </div>

                {/* Card body */}
                <div className="p-6">
                  <h3
                    className="text-[22px] font-normal text-black mb-1"
                    style={{ fontFamily: "Cinzel, serif" }}
                  >
                    {p.name}
                  </h3>
                  <p className="text-[13px] text-gray-500 mb-5">{p.tagline}</p>

                  <div className="flex flex-col gap-2.5 mb-5">
                    <div className="flex items-start gap-2 text-[13px] text-gray-600">
                      <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: AMBER }} />
                      <span>{p.address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-gray-600">
                      <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: AMBER }} />
                      <span>Reception: {p.reception}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-gray-600">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" style={{ color: AMBER }} />
                      <span>{p.security}</span>
                    </div>
                  </div>

                  <div className="mb-5 text-[15px] font-medium flex items-center gap-1" style={{ color: AMBER }}>
                    From {p.fromPrice}/mo (Incl. GST) <ArrowRight className="w-4 h-4" />
                  </div>

                  <div className="flex gap-2">
                    <a
                      href="#availability"
                      className="flex-1 text-center py-2.5 rounded-full text-[13px] font-semibold text-black"
                      style={{ backgroundColor: AMBER }}
                    >
                      View availability
                    </a>
                    <a
                      href={`https://wa.me/${p.whatsapp}?text=Hi, I'm interested in ${p.name}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[13px] font-medium text-gray-700 border border-gray-200 hover:border-gray-400 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5" /> Enquire
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── AVAILABILITY ── */}
      <section id="availability" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-10">
            <div>
              <h2
                className="text-[38px] sm:text-[48px] font-normal text-black mb-2"
                style={{ fontFamily: "Cinzel, serif" }}
              >
                Live Availability
              </h2>
              {loading ? (
                <p className="text-[15px] text-gray-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading live data…
                </p>
              ) : fetchErr ? (
                <p className="text-[15px] text-red-400">
                  Couldn&apos;t load —{" "}
                  <a href="https://wa.me/919113992047" className="underline">WhatsApp us</a> to check.
                </p>
              ) : (
                <p className="text-[15px] text-gray-500">
                  {vacantNow > 0 ? (
                    <>
                      <span className="font-semibold text-green-700">{vacantNow} beds available right now</span>
                      {" "}at {activeProperty === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"}.
                    </>
                  ) : (
                    "No beds available right now — check back soon or WhatsApp us."
                  )}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => openEnquiry(null, activeProperty)}
                className="px-4 py-2 rounded-full text-[12px] font-semibold text-black border-2 transition-all"
                style={{ borderColor: AMBER, backgroundColor: "#fef3d8" }}
              >
                General enquiry
              </button>
              <div
                className="inline-flex rounded-full p-1"
                style={{ backgroundColor: "#f3f4f6" }}
              >
                {(["safina-plaza", "peepal-tree"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => { setActiveProperty(p); setShowAll(false) }}
                    className="px-4 py-1.5 rounded-full text-[12px] font-medium transition-all"
                    style={
                      activeProperty === p
                        ? { backgroundColor: AMBER, color: "#000" }
                        : { color: "#6b7280" }
                    }
                  >
                    {p === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 mb-7">
            {[
              { value: "all" as const,     label: "All" },
              { value: "Vacant" as const,  label: "Available now" },
              { value: "shared" as const,  label: "Shared beds" },
              { value: "private" as const, label: "Private rooms" },
            ].map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setAvailabilityFilter(value)}
                className="px-4 py-1.5 rounded-full text-[12px] font-medium border transition-all"
                style={
                  availabilityFilter === value
                    ? { backgroundColor: AMBER, borderColor: AMBER, color: "#000" }
                    : { borderColor: "#e5e7eb", color: "#6b7280" }
                }
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 h-36 animate-pulse" />
              ))}
            </div>
          ) : sortedBeds.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-2xl">
              <p className="mb-2">No beds match this filter.</p>
              <button
                onClick={() => setAvailabilityFilter("all")}
                className="text-[13px] font-medium underline"
                style={{ color: AMBER }}
              >
                Clear filter
              </button>
            </div>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedBeds.map(b => (
                  <BedCard
                    key={b.id}
                    bed={b}
                    onEnquire={bed => openEnquiry(bed, bed.property)}
                  />
                ))}
              </div>
              {sortedBeds.length > 9 && (
                <div className="mt-7 text-center">
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-600 hover:text-black transition-colors"
                  >
                    {showAll ? "Show less" : `Show all ${sortedBeds.length} rooms`}
                    {showAll ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── WHY THE HUB ── */}
      <section className="py-24 px-4 sm:px-6" style={{ backgroundColor: DARK }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-[38px] sm:text-[48px] font-normal text-white mb-3"
              style={{ fontFamily: "Cinzel, serif" }}
            >
              Why Choose The Hub
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {benefits.map(({ title, desc }) => (
              <div
                key={title}
                className="rounded-2xl p-6 transition-all cursor-default"
                style={{
                  backgroundColor: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.09)",
                }}
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <span style={{ color: AMBER, fontSize: 18 }}>●</span>
                  <h3
                    className="text-[15px] font-semibold text-white"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {title}
                  </h3>
                </div>
                <p className="text-[13px] text-gray-400 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-24 px-4 sm:px-6" style={{ backgroundColor: WARM_WHITE }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-[38px] sm:text-[48px] font-normal text-black mb-3"
              style={{ fontFamily: "Cinzel, serif" }}
            >
              Transparent Pricing
            </h2>
            <p className="text-[16px] text-gray-500">No hidden charges. Everything included.</p>
          </div>

          {/* Property switcher */}
          <div className="flex justify-center mb-8">
            <div
              className="inline-flex rounded-full p-1"
              style={{ backgroundColor: "#e9e9e9" }}
            >
              {(["safina-plaza", "peepal-tree"] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPricingProperty(p)}
                  className="px-6 py-2.5 rounded-full text-[13px] font-medium transition-all"
                  style={
                    pricingProperty === p
                      ? { backgroundColor: "#fff", color: "#111", boxShadow: "0 1px 4px rgba(0,0,0,0.10)" }
                      : { color: "#6b7280" }
                  }
                >
                  {p === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"}
                </button>
              ))}
            </div>
          </div>

          {/* Pricing table */}
          <div
            className="rounded-2xl overflow-hidden bg-white"
            style={{ boxShadow: "0 4px 32px rgba(0,0,0,0.07)" }}
          >
            <div className="grid grid-cols-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-6 py-4 border-b border-gray-100">
              <span>Plan</span>
              <span>Type</span>
              <span>Monthly (Incl. GST)</span>
            </div>
            {pricingData.pricing.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-3 px-6 py-4 border-b border-gray-50 last:border-0 items-center"
                style={{ backgroundColor: i % 2 === 0 ? "#fff" : "#fafafa" }}
              >
                <div className="text-[14px] font-medium text-black pr-3">
                  {row.label}
                  {row.flat && (
                    <span
                      className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: "#f3f4f6", color: "#6b7280" }}
                    >
                      flat
                    </span>
                  )}
                </div>
                <div className="text-[13px] text-gray-500">{row.type}</div>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-bold text-black">{row.monthly}</span>
                  {row.popular && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: AMBER, color: "#000" }}
                    >
                      Popular
                    </span>
                  )}
                  {row.best && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: AMBER, color: "#000" }}
                    >
                      Best value
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-[13px] text-gray-400 mt-5">
            Prices include Wi-Fi, housekeeping, power backup, and hot water. Security deposit: 1 month&apos;s rent.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-24 px-4 sm:px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-[38px] sm:text-[48px] font-normal text-black mb-3"
              style={{ fontFamily: "Cinzel, serif" }}
            >
              Frequently Asked
            </h2>
          </div>

          <div className="divide-y divide-gray-100">
            {faqs.map((faq, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 py-5 text-left hover:opacity-70 transition-opacity"
                >
                  <span className="text-[15px] font-medium text-black">{faq.q}</span>
                  {openFaq === i
                    ? <ChevronUp className="w-4 h-4 shrink-0 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />
                  }
                </button>
                <div
                  className="overflow-hidden transition-all duration-300"
                  style={{ maxHeight: openFaq === i ? "300px" : "0px" }}
                >
                  <p className="text-[14px] text-gray-600 leading-relaxed pb-5">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 px-4 sm:px-6" style={{ backgroundColor: AMBER }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2
            className="text-[38px] sm:text-[52px] font-normal text-black mb-4 leading-tight"
            style={{ fontFamily: "Cinzel, serif" }}
          >
            Ready to find your community?
          </h2>
          <p className="text-[17px] mb-10" style={{ color: "rgba(0,0,0,0.65)" }}>
            Join residents from across India living, working and thriving at The Hub.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href={profileName ? "/book" : "/auth?next=/book"}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-[15px] font-semibold text-white"
              style={{ backgroundColor: DARK }}
            >
              Book a bed
            </a>
            <a
              href="https://wa.me/919113992047"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-[15px] font-semibold text-black bg-white"
            >
              WhatsApp us
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer
        className="py-16 px-4 sm:px-6"
        style={{ backgroundColor: DARK, borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-10 mb-12">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: AMBER }}
                >
                  <span className="text-black font-bold text-[10px]">TH</span>
                </div>
                <span
                  className="text-[18px] font-normal text-white"
                  style={{ fontFamily: "Calistoga, serif" }}
                >
                  The Hub
                </span>
              </div>
              <p className="text-[13px] leading-relaxed mb-5" style={{ color: "rgba(255,255,255,0.40)" }}>
                Live more. Stress less.
              </p>
              <a
                href="https://wa.me/919113992047"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[13px] transition-colors hover:text-white/70"
                style={{ color: "rgba(255,255,255,0.50)" }}
              >
                <Phone className="w-3.5 h-3.5" /> +91 91139 92047
              </a>
            </div>

            {/* Quick links */}
            <div>
              <div
                className="text-[11px] uppercase tracking-wider font-medium mb-4"
                style={{ color: "rgba(255,255,255,0.30)" }}
              >
                Quick Links
              </div>
              <div className="space-y-3">
                {[
                  { label: "Properties",   href: "#properties" },
                  { label: "Availability", href: "#availability" },
                  { label: "Pricing",      href: "#pricing" },
                  { label: "FAQ",          href: "#faq" },
                  { label: "Book a bed",   href: "/book" },
                ].map(({ label, href }) => (
                  <a
                    key={href}
                    href={href}
                    className="block text-[13px] transition-colors hover:text-white"
                    style={{ color: "rgba(255,255,255,0.50)" }}
                  >
                    {label}
                  </a>
                ))}
              </div>
            </div>

            {/* Addresses */}
            <div>
              <div
                className="text-[11px] uppercase tracking-wider font-medium mb-4"
                style={{ color: "rgba(255,255,255,0.30)" }}
              >
                Locations
              </div>
              <div className="space-y-5">
                {properties.map(p => (
                  <div key={p.id}>
                    <div className="text-[13px] font-medium text-white mb-1">{p.name}</div>
                    <div className="text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.40)" }}>
                      {p.address}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className="pt-8 flex flex-wrap gap-4 justify-between items-center text-[12px]"
            style={{ borderTop: "1px solid rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.30)" }}
          >
            <span>© 2025 Safina Ventures Pvt. Ltd. · All rights reserved</span>
            <div className="flex gap-5">
              <a
                href="https://safinaventures.notion.site/2d969190ee9b801ca005cfdfdcd9894f?pvs=105"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/60 transition-colors"
              >
                Rental Agreement
              </a>
              <a
                href="https://www.notion.so/safinaventures/The-Hub-Co-Living-Community-Guidelines-Plaza-2fb69190ee9b807ca11be2bb5de73007"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white/60 transition-colors"
              >
                House Rules
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
