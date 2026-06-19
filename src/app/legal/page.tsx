import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Legal — The Hub Co-Living",
  description: "Legal documents for The Hub Co-Living — Privacy Policy, Terms & Conditions, Refund Policy, Cancellation Policy, and Cookie & Session Policy.",
}

const documents = [
  {
    title: "Privacy Policy",
    description: "How we collect, use, store, and share your personal data — including Aadhaar, government IDs, and payment information.",
    href: "/legal/privacy-policy",
    tag: "DPDP Act 2023",
  },
  {
    title: "Terms & Conditions",
    description: "The rules governing your stay, payments, liability, dispute resolution, and your relationship with The Hub.",
    href: "/legal/terms-and-conditions",
    tag: "Governing law: Karnataka",
  },
  {
    title: "Refund Policy",
    description: "When and how your security deposit is refunded, what deductions apply, and how payment disputes are handled.",
    href: "/legal/refund-policy",
    tag: "Razorpay compliant",
  },
  {
    title: "Cancellation Policy",
    description: "What happens if you cancel before check-in, leave early without notice, or are evicted.",
    href: "/legal/cancellation-policy",
    tag: "1-month notice period",
  },
  {
    title: "Cookie & Session Policy",
    description: "How we use cookies, browser storage, and login sessions on our website and resident portal.",
    href: "/legal/cookie-policy",
    tag: "Essential & preference",
  },
]

export default function LegalIndexPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">← Back</a>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-900">Legal</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#F9A91F] mb-3">The Hub Co-Living</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            Legal Documents
          </h1>
          <p className="text-gray-500">
            Our legal documents for residents, guests, and visitors. All documents are governed by Indian law
            and apply to both <strong>Safina Plaza</strong> and <strong>Peepal Tree</strong>.
          </p>
        </div>

        <div className="space-y-4">
          {documents.map((doc) => (
            <a
              key={doc.href}
              href={doc.href}
              className="block border border-gray-200 rounded-2xl p-6 hover:border-[#F9A91F] hover:shadow-sm transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-lg font-bold text-gray-900 group-hover:text-[#F9A91F] transition-colors">
                      {doc.title}
                    </h2>
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">
                      {doc.tag}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">{doc.description}</p>
                </div>
                <span className="text-gray-400 group-hover:text-[#F9A91F] text-xl mt-1 transition-colors">→</span>
              </div>
            </a>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 text-sm text-gray-400">
          <p>Last updated: 19 June 2026 · Jurisdiction: Bengaluru, Karnataka, India</p>
          <p className="mt-1">
            Questions?{" "}
            <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline">hello@thehubco.live</a>
          </p>
        </div>
      </div>
    </div>
  )
}
