"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  MapPin, Phone, ChevronDown, ChevronUp, ArrowRight,
  X, CheckCircle2, Loader2, Wifi,
  Clock, Zap, Droplets, ShieldCheck,
  Menu, Camera, Brush, Dumbbell, Refrigerator, WashingMachine,
  Tv, CookingPot, ChefHat,
} from "lucide-react"
import { getRoomLabel, type BedListing } from "@/lib/inventory"
import { EXPLORATORY_WEEK_RENT, MAINTENANCE_FEE } from "@/lib/stay"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"

// ─── Design tokens (THB brand kit) ─────────────────────────────────────────────
const AMBER      = "#fe8d01"
const DARK       = "#000000"
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
      { label: "Deluxe sharing",            type: "Sharing", monthly: "₹25,000", flat: false, popular: true,  best: false },
      { label: "Private room",              type: "Private", monthly: "₹43,500", flat: false, popular: false, best: false },
      { label: "Deluxe private",            type: "Private", monthly: "₹50,000", flat: false, popular: false, best: false },
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

// Hero slideshow frames (from the co-living shoot). WebP, ~100KB each.
const HERO_SLIDES = [
  "/assets/hero/hero-1.webp",
  "/assets/hero/hero-2.webp",
  "/assets/hero/hero-3.webp",
  "/assets/hero/hero-4.webp",
  "/assets/hero/hero-5.webp",
  "/assets/hero/hero-6.webp",
]

// Room photos, keyed by room SIZE. The shoot covers single (private) and double
// (twin-sharing) rooms; Standard/Premium share a room layout and differ on
// finish + amenities, so both tiers draw from the same set.
const ROOM_PHOTOS: Record<"Single" | "Double", string[]> = {
  Single: [
    "/assets/rooms/single/single-1.webp",
    "/assets/rooms/single/single-2.webp",
    "/assets/rooms/single/single-3.webp",
    "/assets/rooms/single/single-4.webp",
    "/assets/rooms/single/single-5.webp",
  ],
  Double: [
    "/assets/rooms/double/double-1.webp",
    "/assets/rooms/double/double-2.webp",
    "/assets/rooms/double/double-3.webp",
    "/assets/rooms/double/double-4.webp",
    "/assets/rooms/double/double-5.webp",
  ],
}

const benefits = [
  { title: "All-Inclusive Rent",    desc: "Wi-Fi, housekeeping, power backup, hot water — all in one price." },
  { title: "Prime Locations",       desc: "Shivaji Nagar & St Johns Road, two of Bengaluru's best-connected neighbourhoods." },
  { title: "Verified Community",    desc: "Professionals, students, and creatives who value good living." },
  { title: "Zero Maintenance",      desc: "We handle it. You just live. No landlord calls, no repair stress." },
  { title: "Flexible Stays",        desc: "From 1 week to 4 months, on a monthly cycle. Renew anytime." },
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
            <h3 className="text-[17px] font-semibold text-black" style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}>
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

// ─── Room type card ───────────────────────────────────────────────────────────
// Guests choose a room TYPE (single/double × standard/premium), never an
// individual bed — listing every bed caused decision fatigue and advertised how
// much inventory sits empty. Exact room allocation happens after booking.

// The exploratory 1-week stay is private-only (mirrors the booking wizard's
// duration gate), so switching to "week" narrows the visible room types.
type StayMode = "monthly" | "week"

type RoomTypeGroup = {
  key:        string
  size:       "Single" | "Double"
  category:   "Standard" | "Premium"
  label:      string
  monthlyRate: number
  vacantNow:  number
  soonest:    string | null
  photos:     string[]
}

function RoomTypeCard({
  group, onEnquire, stayMode,
}: {
  group: RoomTypeGroup
  onEnquire: () => void
  stayMode: StayMode
}) {
  const [idx, setIdx] = useState(0)
  const n = group.photos.length
  const available = group.vacantNow > 0
  const isWeek = stayMode === "week"

  return (
    <div
      className="rounded-2xl border overflow-hidden flex flex-col bg-white"
      style={{ borderColor: "#f0f0f0", boxShadow: "0 4px 28px rgba(0,0,0,0.07)" }}
    >
      {/* Gallery */}
      <div className="relative bg-gray-100" style={{ aspectRatio: "16 / 10" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={group.photos[idx]}
          alt={`${group.label} at The Hub — photo ${idx + 1} of ${n}`}
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
        />
        {n > 1 && (
          <>
            <button
              onClick={() => setIdx(i => (i - 1 + n) % n)}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", color: "#fff" }}
            >
              ‹
            </button>
            <button
              onClick={() => setIdx(i => (i + 1) % n)}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ backgroundColor: "rgba(0,0,0,0.45)", color: "#fff" }}
            >
              ›
            </button>
            <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
              {group.photos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  aria-label={`Go to photo ${i + 1}`}
                  className="w-1.5 h-1.5 rounded-full transition-all"
                  style={{ backgroundColor: i === idx ? "#fff" : "rgba(255,255,255,0.45)" }}
                />
              ))}
            </div>
          </>
        )}
        <span
          className="absolute top-3 left-3 text-[11px] font-semibold px-2.5 py-1 rounded-full"
          style={{ backgroundColor: AMBER, color: "#000" }}
        >
          {group.category}
        </span>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col gap-3 flex-1">
        <div>
          <h3 className="text-[18px] text-black" style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}>
            {group.label}
          </h3>
          <p className="text-[13px] text-gray-500 mt-0.5">
            {group.size === "Single" ? "Private room, just yours" : "One bed in a twin-sharing room"}
          </p>
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="text-[22px] font-bold text-black">
            ₹{(isWeek ? EXPLORATORY_WEEK_RENT : group.monthlyRate).toLocaleString("en-IN")}
          </span>
          <span className="text-[13px] text-gray-400">
            {isWeek ? "flat for the week · incl. GST" : "/month · incl. GST"}
          </span>
        </div>
        {/* The exploratory week is only offered on private rooms, so the
            cross-reference line is shown on those cards only — advertising it on
            a sharing room would promise a duration checkout then refuses. */}
        <p className="text-[12px] text-gray-400 -mt-2">
          {isWeek
            ? `No deposit · ₹${MAINTENANCE_FEE.toLocaleString("en-IN")} maintenance fee`
            : group.size === "Single"
              ? `1-week stay ₹${EXPLORATORY_WEEK_RENT.toLocaleString("en-IN")} flat`
              : "Deposit: 1 month's rent"}
        </p>

        {/* Scarcity signal — a count, never a full inventory dump */}
        <p className="text-[13px]">
          {available ? (
            <span className="font-semibold text-green-700">
              {group.vacantNow} {group.vacantNow === 1 ? "room" : "rooms"} available now
            </span>
          ) : group.soonest ? (
            <span className="text-gray-500">Next available {group.soonest}</span>
          ) : (
            <span className="text-gray-400">Fully booked — join the waitlist</span>
          )}
        </p>

        <div className="mt-auto pt-2 flex gap-2">
          <a
            href="/book"
            className="flex-1 text-center px-4 py-2.5 rounded-full text-[13px] font-semibold text-black transition-opacity hover:opacity-90"
            style={{ backgroundColor: AMBER }}
          >
            Book now
          </a>
          <button
            onClick={onEnquire}
            className="px-4 py-2.5 rounded-full text-[13px] font-medium text-gray-700 border transition-colors hover:border-gray-400"
            style={{ borderColor: "#e5e7eb" }}
          >
            Enquire
          </button>
        </div>
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
    // Show as signed-in only with a real Supabase session — a stale
    // localStorage profile alone must not skip the /auth register step.
    createSupabaseClient().auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      const meta = (session.user.user_metadata ?? {}) as { name?: string }
      let storedName: string | null = null
      try {
        const stored = localStorage.getItem("portal_profile")
        if (stored) storedName = (JSON.parse(stored).name as string | undefined) ?? null
      } catch { /* ignore */ }
      setProfileName(storedName ?? meta.name ?? session.user.email ?? null)
    })
  }, [])

  // Property switcher (availability)
  const [activeProperty, setActiveProperty] = useState<"safina-plaza" | "peepal-tree">("safina-plaza")

  // Pricing tab
  const [pricingProperty, setPricingProperty] = useState<"safina-plaza" | "peepal-tree">("safina-plaza")

  // Hero slideshow
  const [heroSlide, setHeroSlide] = useState(0)

  // Stay length chosen on the availability step (1-week short stay vs monthly)
  const [stayMode, setStayMode] = useState<StayMode>("monthly")

  // FAQ
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // Enquiry modal
  const [enquiryModal, setEnquiryModal] = useState(false)
  const [enquiryTarget, setEnquiryTarget] = useState<EnquiryTarget | null>(null)

  // Availability
  const [beds, setBeds]             = useState<BedListing[]>([])
  const [loading, setLoading]       = useState(true)
  const [fetchErr, setFetchErr]     = useState<string | null>(null)

  // Scroll listener
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  // Hero slideshow. Honours prefers-reduced-motion (holds on the first frame)
  // and stops while the tab is hidden so it isn't burning cycles in background.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const id = setInterval(() => {
      if (document.hidden) return
      setHeroSlide(s => (s + 1) % HERO_SLIDES.length)
    }, 5000)
    return () => clearInterval(id)
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
  const vacantNow = propertyBeds.filter(b => b.status === "Vacant").length

  // Roll individual beds up into the four bookable room types. Guests pick a
  // type; we allocate the specific room afterwards. Types with no inventory at
  // this property simply don't appear (Peepal Tree has no Premium tier).
  const roomTypeGroups: RoomTypeGroup[] = (() => {
    const map = new Map<string, RoomTypeGroup>()
    for (const b of propertyBeds) {
      if (b.status === "Blocked") continue
      const key = `${b.category}-${b.size}`
      let g = map.get(key)
      if (!g) {
        g = {
          key,
          size: b.size,
          category: b.category,
          label: `${b.category} ${b.size === "Single" ? "Single" : "Double"} Room`,
          monthlyRate: b.monthlyRate,
          vacantNow: 0,
          soonest: null,
          photos: ROOM_PHOTOS[b.size],
        }
        map.set(key, g)
      }
      if (b.status === "Vacant") g.vacantNow++
      else if (b.availableFrom && (!g.soonest || b.availableFrom < g.soonest)) g.soonest = b.availableFrom
    }
    const order = ["Standard-Double", "Premium-Double", "Standard-Single", "Premium-Single"]
    return [...map.values()]
      .map(g => ({
        ...g,
        soonest: g.soonest
          ? new Date(g.soonest + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })
          : null,
      }))
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  })()

  // A 1-week stay is bookable on private rooms only — don't surface sharing
  // rooms under that mode or the wizard will reject the duration downstream.
  const visibleRoomTypes = stayMode === "week"
    ? roomTypeGroups.filter(g => g.size === "Single")
    : roomTypeGroups

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
        .hero-slide { transition: opacity 1.6s ease-in-out; }
        .scroll-hint { animation: scroll-bounce 2s ease-in-out infinite; position:absolute; bottom:2rem; left:50%; }
        @media (prefers-reduced-motion: reduce) { .ambient-orb, .scroll-hint { animation: none; } .hero-slide { transition: none; } }
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/assets/Hub_Logo__01.png"
              alt="The Hub Co-Living"
              className="h-7 w-auto transition-[filter] duration-300"
              style={{ filter: scrolled ? "none" : "brightness(0) invert(1)" }}
            />
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
        {/* Property slideshow — crossfades behind the headline. Purely
            decorative, so it is aria-hidden and pauses under reduced-motion. */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
          {HERO_SLIDES.map((src, i) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={src}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover hero-slide"
              style={{ opacity: i === heroSlide ? 1 : 0 }}
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : "low"}
            />
          ))}
          {/* Scrim — keeps the white/orange headline readable over any frame */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.58) 45%, rgba(0,0,0,0.80) 100%)",
            }}
          />
        </div>

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
            style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}
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

          {/* Stat line */}
          <div className="flex flex-wrap items-center gap-2.5 justify-center text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            {[
              "55+ beds across 2 properties",
              "From ₹18,550 / month",
              "Bengaluru, KA",
            ].map((text, i) => (
              <span key={text} className="flex items-center gap-2.5">
                {i > 0 && <span style={{ color: "rgba(255,255,255,0.25)" }}>·</span>}
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

      {/* ── AMENITIES ── */}
      <section className="bg-white border-y border-gray-100 py-16 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2
            className="text-[28px] sm:text-[32px] text-black mb-10"
            style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}
          >
            Amenities
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-8 gap-x-12">
            {[
              { icon: Brush,          label: "Housekeeping" },
              { icon: ShieldCheck,    label: "24x7 Security" },
              { icon: Camera,         label: "CCTV" },
              { icon: Wifi,           label: "Wi-Fi" },
              { icon: Dumbbell,       label: "Gym" },
              { icon: Refrigerator,   label: "Refrigerator" },
              { icon: WashingMachine, label: "Washing Machine" },
              { icon: Tv,             label: "TV" },
              { icon: CookingPot,     label: "Kitchen" },
              { icon: Droplets,       label: "Geyser" },
              { icon: ChefHat,        label: "Self Cooking" },
              { icon: Zap,            label: "Power Backup" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-black shrink-0" strokeWidth={1.75} />
                <span className="text-[15px] text-gray-700">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PROPERTIES ── */}
      <section id="properties" className="py-24 px-4 sm:px-6" style={{ backgroundColor: WARM_WHITE }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-[38px] sm:text-[48px] font-normal text-black mb-3"
              style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}
            >
              Our Properties
            </h2>
            <p className="text-[16px] text-gray-500">Shivaji Nagar &amp; St Johns Road</p>
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
                    style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}
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
                      onClick={() => setActiveProperty(p.id)}
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
                style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}
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
                    onClick={() => setActiveProperty(p)}
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

          {/* Stay length — short stay vs monthly, before room type is chosen */}
          <div className="mb-7">
            <div className="inline-flex rounded-full p-1" style={{ backgroundColor: "#f3f4f6" }}>
              {([
                { value: "monthly" as const, label: "Monthly stay" },
                { value: "week"    as const, label: "1-week short stay" },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setStayMode(value)}
                  className="px-5 py-2 rounded-full text-[13px] font-medium transition-all"
                  style={
                    stayMode === value
                      ? { backgroundColor: "#fff", color: "#111", boxShadow: "0 1px 4px rgba(0,0,0,0.10)" }
                      : { color: "#6b7280" }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
            {stayMode === "week" && (
              <p className="text-[12px] text-gray-500 mt-2.5">
                The 1-week exploratory stay is a flat ₹{EXPLORATORY_WEEK_RENT.toLocaleString("en-IN")} on
                private rooms only — no security deposit.
              </p>
            )}
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-gray-100 bg-gray-50 h-96 animate-pulse" />
              ))}
            </div>
          ) : visibleRoomTypes.length === 0 ? (
            <div className="text-center py-16 text-gray-400 border border-dashed border-gray-200 rounded-2xl">
              <p className="mb-2">
                {stayMode === "week"
                  ? "No private rooms free for a 1-week stay right now."
                  : "Nothing listed for this property yet."}
              </p>
              <a
                href="https://wa.me/919113992047"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-medium underline"
                style={{ color: AMBER }}
              >
                WhatsApp us to check
              </a>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-6">
              {visibleRoomTypes.map(g => (
                <RoomTypeCard
                  key={g.key}
                  group={g}
                  stayMode={stayMode}
                  onEnquire={() => openEnquiry(null, activeProperty)}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── WHY THE HUB ── */}
      <section className="py-24 px-4 sm:px-6" style={{ backgroundColor: DARK }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2
              className="text-[38px] sm:text-[48px] font-normal text-white mb-3"
              style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}
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
              style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}
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
              style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}
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
      <section className="py-24 px-4 sm:px-6" style={{ backgroundColor: DARK }}>
        <div className="max-w-3xl mx-auto text-center">
          <h2
            className="text-[38px] sm:text-[52px] font-normal text-white mb-4 leading-tight"
            style={{ fontFamily: "Inter, sans-serif", fontWeight: 900 }}
          >
            Ready to find your <span style={{ color: AMBER }}>community</span>?
          </h2>
          <p className="text-[17px] mb-10" style={{ color: "rgba(255,255,255,0.65)" }}>
            Join residents from across India living, working and thriving at The Hub.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <a
              href={profileName ? "/book" : "/auth?next=/book"}
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-[15px] font-semibold text-black"
              style={{ backgroundColor: AMBER }}
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/assets/Hub_Logo__01.png"
                  alt="The Hub Co-Living"
                  className="h-7 w-auto"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
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
              <a
                href="https://www.instagram.com/thehubbengaluru/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-[13px] mt-3 transition-colors hover:text-white/70"
                style={{ color: "rgba(255,255,255,0.50)" }}
              >
                <Camera className="w-3.5 h-3.5" /> @thehubbengaluru
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
                href="/house-rules"
                className="hover:text-white/60 transition-colors"
              >
                House Rules
              </a>
              <a
                href="/legal"
                className="hover:text-white/60 transition-colors"
              >
                Legal
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
