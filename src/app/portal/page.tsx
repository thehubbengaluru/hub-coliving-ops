"use client"

import { useState, Suspense } from "react"
import { Loader2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

const AMBER = "#F9A91F"

const inputClass =
  "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
const inputStyle = { "--tw-ring-color": AMBER } as React.CSSProperties

type Mode = "signin" | "register"

// Messages bounced back from the OAuth callback / dashboard booking gate.
const PARAM_ERRORS: Record<string, string> = {
  nobooking: "We couldn't find a booking for that account. Sign in with the email you booked with.",
  oauth: "Google sign-in didn't complete. Please try again.",
}

function PortalLogin() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Prefer an in-session error; otherwise fall back to a redirect message.
  const displayError = error ?? PARAM_ERRORS[searchParams.get("error") ?? ""] ?? null

  async function handleGoogle() {
    setError(null); setNotice(null); setGoogleLoading(true)
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/portal/auth/callback` },
      })
      if (oauthErr) { setError("Could not start Google sign-in."); setGoogleLoading(false) }
      // On success the browser is redirected to Google.
    } catch {
      setError("Could not start Google sign-in."); setGoogleLoading(false)
    }
  }

  // Fetches the guest's Notion booking (resolved server-side from the
  // authenticated session) and stores it, then opens the dashboard. Must be
  // called only AFTER a Supabase session exists.
  async function loadBookingAndContinue() {
    const res = await fetch("/api/portal/auth", { method: "POST" })
    const data = await res.json()
    if (!res.ok) {
      // Authenticated, but no booking found in Notion (the source of truth).
      await supabase.auth.signOut()
      setError(data.error ?? "No booking found for this email.")
      return
    }
    localStorage.setItem("portal_guest", JSON.stringify(data))
    router.push("/portal/dashboard")
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!addr || !password) return
    setLoading(true); setError(null); setNotice(null)
    try {
      const { error: authErr } = await supabase.auth.signInWithPassword({ email: addr, password })
      if (authErr) { setError("Invalid email or password."); return }
      await loadBookingAndContinue()
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    const addr = email.trim().toLowerCase()
    if (!addr || !password) return
    if (password.length < 8) { setError("Password must be at least 8 characters."); return }
    setLoading(true); setError(null); setNotice(null)
    try {
      // 1. Create the Supabase credential. (The Notion booking gate now runs
      //    server-side after authentication — see step 2 — so the pre-auth
      //    PII-leaking lookup is gone.)
      const { data, error: signErr } = await supabase.auth.signUp({ email: addr, password })
      if (signErr) {
        setError(
          /already registered/i.test(signErr.message)
            ? "An account already exists. Please sign in instead."
            : signErr.message,
        )
        return
      }

      // 2. If a session was created, verify a booking exists (server-side,
      //    from the session) and go in; loadBookingAndContinue signs the user
      //    back out if there's no booking. Otherwise email confirmation is
      //    required and the booking gate runs at first sign-in.
      if (data.session) {
        await loadBookingAndContinue()
      } else {
        setNotice("Account created. Check your email to confirm, then sign in.")
        setMode("signin")
        setPassword("")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const isRegister = mode === "register"

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-4">
        <Link href="/" className="text-xl font-normal" style={{ fontFamily: "Calistoga, serif", color: AMBER }}>
          The Hub
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-2xl text-black mb-1" style={{ fontFamily: "Calistoga, serif" }}>
            {isRegister ? "Set up your account" : "Guest Portal"}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {isRegister
              ? "Use the email you booked with and choose a password."
              : "Sign in with your email and password to access your account."}
          </p>

          <form onSubmit={isRegister ? handleRegister : handleSignIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className={inputClass}
                style={inputStyle}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null) }}
                placeholder="••••••••"
                required
                autoComplete={isRegister ? "new-password" : "current-password"}
                className={inputClass}
                style={inputStyle}
              />
            </div>

            {displayError && <p className="text-sm text-red-500">{displayError}</p>}
            {notice && <p className="text-sm text-green-600">{notice}</p>}

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full py-3 rounded-xl text-sm font-semibold text-black flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: AMBER }}
            >
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {isRegister ? "Creating…" : "Signing in…"}</>
                : (isRegister ? "Create account" : "Sign in")}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || loading}
            className="w-full py-3 rounded-xl text-sm font-semibold text-gray-700 border border-gray-200 bg-white flex items-center justify-center gap-2 hover:border-gray-400 hover:bg-gray-50 transition-all disabled:opacity-60 cursor-pointer"
          >
            {googleLoading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting…</>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                  <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z" />
                </svg>
                Continue with Google
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => { setMode(isRegister ? "signin" : "register"); setError(null); setNotice(null) }}
            className="w-full text-center text-sm text-gray-500 mt-5 hover:text-gray-700"
          >
            {isRegister
              ? "Already have an account? Sign in"
              : "First time here? Set up your account"}
          </button>

          <p className="text-xs text-gray-400 mt-6 text-center">
            Having trouble? Contact us at{" "}
            <a href="mailto:thehubco.live@gmail.com" className="underline hover:text-gray-600">
              thehubco.live@gmail.com
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}

export default function PortalLoginPage() {
  return (
    <Suspense fallback={null}>
      <PortalLogin />
    </Suspense>
  )
}
