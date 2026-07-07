"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2, User, ArrowRight } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const AMBER = "#F9A91F"

const inputClass =
  "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
const inputStyle = { "--tw-ring-color": AMBER } as React.CSSProperties

type Mode = "register" | "signin"

// Pre-booking account gate. New bookers REGISTER a real Supabase account
// (name/phone ride along as user metadata and prefill the booking wizard);
// returning bookers sign in. Unlike /portal, there is deliberately NO
// "existing booking" check here — this runs BEFORE a booking exists.
function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const next = searchParams.get("next") ?? "/book"

  const [mode, setMode] = useState<Mode>("register")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<{ name?: string; email?: string; phone?: string; password?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isRegister = mode === "register"

  // Already signed in → go straight to the destination.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(next)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, router])

  function validate() {
    const e: typeof errors = {}
    if (isRegister && !name.trim()) e.name = "Name is required"
    if (!email.trim()) e.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Enter a valid email"
    if (isRegister) {
      if (!phone.trim()) e.phone = "Phone number is required"
      else if (!/^\d{10}$/.test(phone.replace(/[\s+\-()]/g, ""))) e.phone = "Enter a valid 10-digit number"
    }
    if (!password) e.password = "Password is required"
    else if (isRegister && password.length < 8) e.password = "Password must be at least 8 characters"
    return e
  }

  // Prefill for the booking wizard — kept alongside the real session.
  function storeProfile(profileName: string, profileEmail: string, profilePhone: string) {
    try {
      localStorage.setItem("portal_profile", JSON.stringify({
        name: profileName.trim(),
        email: profileEmail.trim().toLowerCase(),
        phone: profilePhone.trim(),
      }))
    } catch { /* ignore */ }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setFormError(null)
    setNotice(null)
    setSaving(true)
    const addr = email.trim().toLowerCase()

    try {
      if (isRegister) {
        const { data, error: signErr } = await supabase.auth.signUp({
          email: addr,
          password,
          options: { data: { name: name.trim(), phone: phone.trim() } },
        })
        if (signErr) {
          setFormError(
            /already registered/i.test(signErr.message)
              ? "An account with this email already exists — please sign in instead."
              : signErr.message,
          )
          return
        }
        storeProfile(name, addr, phone)
        if (data.session) {
          router.push(next)
        } else {
          // Email confirmation is required by the Supabase project settings.
          setNotice("Account created! Check your email to confirm your address, then sign in below to continue your booking.")
          setMode("signin")
          setPassword("")
        }
      } else {
        const { data, error: authErr } = await supabase.auth.signInWithPassword({ email: addr, password })
        if (authErr) { setFormError("Invalid email or password."); return }
        const meta = (data.user?.user_metadata ?? {}) as { name?: string; phone?: string }
        storeProfile(meta.name ?? "", addr, meta.phone ?? "")
        router.push(next)
      }
    } catch {
      setFormError("Network error. Please try again.")
    } finally {
      setSaving(false)
    }
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

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="w-10 h-10 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "#fef3d8" }}>
              <User className="w-5 h-5" style={{ color: AMBER }} />
            </div>
            <h1 className="text-2xl text-black mb-1" style={{ fontFamily: "Calistoga, serif" }}>
              {isRegister ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-gray-500 mb-6">
              {isRegister
                ? "Quick one-time setup before booking your bed."
                : "Sign in to continue your booking."}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: undefined })) }}
                    placeholder="Your full name"
                    autoComplete="name"
                    className={inputClass}
                    style={inputStyle}
                  />
                  {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: undefined })); setFormError(null) }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className={inputClass}
                  style={inputStyle}
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
              </div>

              {isRegister && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setErrors(p => ({ ...p, phone: undefined })) }}
                    placeholder="+91 98765 43210"
                    autoComplete="tel"
                    className={inputClass}
                    style={inputStyle}
                  />
                  {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErrors(p => ({ ...p, password: undefined })); setFormError(null) }}
                  placeholder="••••••••"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  className={inputClass}
                  style={inputStyle}
                />
                {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password}</p>}
              </div>

              {formError && <p className="text-sm text-red-500">{formError}</p>}
              {notice && <p className="text-sm text-green-600">{notice}</p>}

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl text-sm font-semibold text-black flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
                style={{ backgroundColor: AMBER }}
              >
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> {isRegister ? "Creating account…" : "Signing in…"}</>
                  : <>{isRegister ? "Create account & continue" : "Sign in & continue"} <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>

            <button
              type="button"
              onClick={() => { setMode(isRegister ? "signin" : "register"); setFormError(null); setNotice(null); setErrors({}) }}
              className="w-full text-center text-sm text-gray-500 mt-5 hover:text-gray-700 cursor-pointer"
            >
              {isRegister
                ? "Already have an account? Sign in"
                : "New here? Create an account"}
            </button>
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
