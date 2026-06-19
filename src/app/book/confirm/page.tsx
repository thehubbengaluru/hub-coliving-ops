"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

const AMBER = "#F9A91F"

interface PaymentInfo {
  notionPageId: string
  property: string
  depositLink: string
  depositLinkId: string
  depositAmount: number
  proRatedLink: string | null
  proRatedLinkId: string | null
  proRatedAmount: number | null
  proRatedDescription: string | null
  subscriptionStartDate: string | undefined
  monthlyRate: number
}

function ConfirmContent() {
  const params = useSearchParams()
  const pageId         = params.get("pageId") ?? ""
  const property       = params.get("property") ?? "safina-plaza"
  const type           = params.get("type") ?? "deposit" // "deposit" | "prorated"

  const [info, setInfo] = useState<PaymentInfo | null>(null)
  const [depositPaid, setDepositPaid] = useState(false)
  const [proRatedPaid, setProRatedPaid] = useState(false)
  const [checking, setChecking] = useState(false)

  // Read payment info from localStorage (saved by booking wizard when links were generated).
  useEffect(() => {
    if (!pageId) return
    try {
      const raw = localStorage.getItem(`hub_payment_${pageId}`)
      if (raw) setInfo(JSON.parse(raw) as PaymentInfo)
    } catch { /* ignore */ }
  }, [pageId])

  const check = useCallback(async (showSpinner = false) => {
    if (!pageId || !info) return
    if (showSpinner) setChecking(true)
    try {
      const p = new URLSearchParams({
        pageId,
        property,
        depositLinkId: info.depositLinkId,
        ...(info.proRatedLinkId ? { proRatedLinkId: info.proRatedLinkId } : {}),
      })
      const r = await fetch(`/api/bookings/payment-status?${p}`)
      const d = await r.json()
      if (d.depositPaid) setDepositPaid(true)
      if (d.proRatedPaid) setProRatedPaid(true)
    } catch { /* ignore */ }
    finally { if (showSpinner) setChecking(false) }
  }, [pageId, property, info])

  // Initial check on mount, then poll every 6s.
  useEffect(() => {
    if (!info) return
    // Optimistically mark the payment that triggered the redirect as paid.
    if (type === "deposit") setDepositPaid(true)
    if (type === "prorated") setProRatedPaid(true)

    check()
    const id = setInterval(() => check(), 6000)
    return () => clearInterval(id)
  }, [info, type, check])

  const allPaid = depositPaid && (!info?.proRatedLinkId || proRatedPaid)

  if (!pageId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <p className="text-gray-500 text-sm">Invalid confirmation link.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-lg mx-auto px-4 py-10 space-y-5">
        {/* Header */}
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "#fef3d8" }}>
          <svg className="w-6 h-6" style={{ color: AMBER }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="text-2xl text-black mb-1" style={{ fontFamily: "Calistoga, serif" }}>
            {allPaid ? "Welcome to the community! 🎉" : "Booking registered!"}
          </h2>
          <p className="text-sm text-gray-500">
            {allPaid
              ? "Your payments are confirmed and your bed is locked in. We can't wait to have you."
              : "Complete the payments below to confirm your bed. Our team will be in touch once payments are received."}
          </p>
        </div>

        {/* Welcome note — shown only when ALL payments are done */}
        {allPaid && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-4">
            <div>
              <p className="text-sm text-gray-700 leading-relaxed">
                You didn&rsquo;t just book a room. You joined a floor full of people who are mid-build — on a company, a project, a version of themselves that isn&rsquo;t done yet.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed mt-3">
                We don&rsquo;t manufacture community here. We just create the culture. The rest is you.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed mt-3">
                Come say hi when you arrive. 🚀
              </p>
              <p className="text-sm font-semibold text-gray-800 mt-3">— Azaan, The Hub Co-Living</p>
            </div>
            <div className="flex flex-wrap gap-3 pt-1 border-t border-green-200">
              <a href="https://www.instagram.com/azaan_sait/" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-green-700 hover:underline">Instagram</a>
              <a href="https://www.linkedin.com/in/azaanferozsait" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-green-700 hover:underline">LinkedIn</a>
              <a href="https://chat.whatsapp.com/thehub" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-green-700 hover:underline">WhatsApp Community</a>
            </div>
            <a href="/portal" className="inline-block text-sm font-semibold text-black px-4 py-2 rounded-lg" style={{ backgroundColor: AMBER }}>
              Go to your Guest Portal →
            </a>
          </div>
        )}

        {/* Payment 1 — Deposit */}
        {info && (
          <div className="rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Payment 1 — Due now</p>
                <p className="font-semibold text-gray-900 mt-0.5">Security deposit + maintenance fee</p>
                <p className="text-xs text-gray-500 mt-0.5">Deposit: ₹{(info.depositAmount - 2000).toLocaleString("en-IN")} · Maintenance: ₹2,000</p>
              </div>
              <span className="text-lg font-bold text-gray-900 whitespace-nowrap">₹{info.depositAmount.toLocaleString("en-IN")}</span>
            </div>
            {depositPaid ? (
              <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Paid
              </div>
            ) : (
              <a
                href={info.depositLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold text-black transition-opacity hover:opacity-90"
                style={{ backgroundColor: AMBER }}
              >
                Pay ₹{info.depositAmount.toLocaleString("en-IN")} →
              </a>
            )}
          </div>
        )}

        {/* Payment 2 — Pro-rated */}
        {info?.proRatedLink && info.proRatedAmount && (
          <div className="rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Payment 2 — Due before check-in</p>
                <p className="font-semibold text-gray-900 mt-0.5">Pro-rated rent</p>
                <p className="text-xs text-gray-500 mt-0.5">{info.proRatedDescription}</p>
              </div>
              <span className="text-lg font-bold text-gray-900 whitespace-nowrap">₹{info.proRatedAmount.toLocaleString("en-IN")}</span>
            </div>
            {proRatedPaid ? (
              <div className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold text-white bg-green-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Paid
              </div>
            ) : (
              <a
                href={info.proRatedLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-semibold text-black transition-opacity hover:opacity-90"
                style={{ backgroundColor: AMBER }}
              >
                Pay ₹{info.proRatedAmount.toLocaleString("en-IN")} →
              </a>
            )}
          </div>
        )}

        {/* Subscription info */}
        {info?.subscriptionStartDate && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
            <span className="font-semibold">Monthly subscription:</span> ₹{info.monthlyRate.toLocaleString("en-IN")}/mo (Incl. GST) from {info.subscriptionStartDate}.
            {" "}A mandate authorisation link will be sent to your phone and email.
          </div>
        )}

        {/* Manual check status (while payments pending) */}
        {!allPaid && (
          <button
            type="button"
            onClick={() => check(true)}
            disabled={checking}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-all disabled:opacity-60"
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            I&rsquo;ve completed payment — check status
          </button>
        )}

        <a href="/" className="block text-center text-sm text-gray-400 hover:text-gray-600 transition-colors mt-2">
          Back to home
        </a>
      </div>
    </div>
  )
}

export default function BookConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    }>
      <ConfirmContent />
    </Suspense>
  )
}
