"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, User, ArrowRight } from "lucide-react"

const AMBER = "#F9A91F"

const inputClass =
  "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
const inputStyle = { "--tw-ring-color": AMBER } as React.CSSProperties

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/book"

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string }>({})
  const [saving, setSaving] = useState(false)

  // If already signed in, go straight to destination
  useEffect(() => {
    const profile = localStorage.getItem("portal_profile")
    if (profile) router.replace(next)
  }, [next, router])

  function validate() {
    const e: typeof errors = {}
    if (!name.trim()) e.name = "Name is required"
    if (!email.trim()) e.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email"
    if (!phone.trim()) e.phone = "Phone number is required"
    else if (!/^\d{10}$/.test(phone.replace(/[\s+\-()]/g, ""))) e.phone = "Enter a valid 10-digit number"
    return e
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setSaving(true)
    const profile = { name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim() }
    localStorage.setItem("portal_profile", JSON.stringify(profile))
    router.push(next)
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-4 flex items-center justify-between">
        <a href="/" className="text-xl font-normal" style={{ fontFamily: "Calistoga, serif", color: AMBER }}>
          The Hub
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-4">

          {/* New user — create profile */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#fef3d8" }}>
              <User className="w-5 h-5" style={{ color: AMBER }} />
            </div>
            <h1 className="text-2xl text-black mb-1" style={{ fontFamily: "Calistoga, serif" }}>
              Create your profile
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              Quick one-time setup before booking your bed.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: undefined })) }}
                  placeholder="Your full name"
                  className={inputClass}
                  style={inputStyle}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: undefined })) }}
                  placeholder="you@example.com"
                  className={inputClass}
                  style={inputStyle}
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: undefined })) }}
                  placeholder="+91 98765 43210"
                  className={inputClass}
                  style={inputStyle}
                />
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl text-sm font-semibold text-black flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
                style={{ backgroundColor: AMBER }}
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</>
                  : <>Continue to booking <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          </div>

          {/* Existing guest divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">Already a resident?</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <a
            href="/portal"
            className="block w-full py-3 rounded-xl text-sm font-semibold text-gray-700 text-center border border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50 transition-all"
          >
            Sign in to guest portal
          </a>
        </div>
      </main>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthContent />
    </Suspense>
  )
}
