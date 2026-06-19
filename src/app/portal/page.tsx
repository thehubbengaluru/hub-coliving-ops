"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

const AMBER = "#F9A91F"

export default function PortalLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/portal/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.")
        return
      }

      // Store guest session in localStorage
      localStorage.setItem("portal_guest", JSON.stringify(data))
      router.push("/portal/dashboard")
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col">
      <header className="border-b border-gray-100 bg-white px-4 py-4">
        <a href="/" className="text-xl font-normal" style={{ fontFamily: "Calistoga, serif", color: AMBER }}>
          The Hub
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h1 className="text-2xl text-black mb-1" style={{ fontFamily: "Calistoga, serif" }}>
            Guest Portal
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Enter the email address you used when booking to access your account.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{ "--tw-ring-color": AMBER } as React.CSSProperties}
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold text-black flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
              style={{ backgroundColor: AMBER }}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Looking up…</> : "Access my account"}
            </button>
          </form>

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
