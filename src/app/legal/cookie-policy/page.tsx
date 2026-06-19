import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cookie & Session Policy — The Hub Co-Living",
  description: "How The Hub Co-Living uses cookies, sessions, and local storage on our website and resident portal.",
}

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">← Back</a>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-900">Cookie & Session Policy</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#F9A91F] mb-3">Legal</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            Cookie &amp; Session Policy
          </h1>
          <p className="text-gray-500 text-sm">Last updated: 19 June 2026 &nbsp;·&nbsp; Effective: 19 June 2026</p>
        </div>

        <div className="space-y-8 text-gray-700 leading-relaxed text-sm">

          {/* Intro */}
          <section>
            <p>
              This Cookie &amp; Session Policy explains how <strong>Safina Hotels</strong> (Safina Plaza)
              and <strong>Safina Ventures Private Limited</strong> (Peepal Tree), collectively{" "}
              <strong>"The Hub"</strong>, use cookies, browser storage, and login sessions on our website
              and resident portal. It should be read alongside our{" "}
              <a href="/legal/privacy-policy" className="text-[#F9A91F] underline">Privacy Policy</a>.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">1. What Are Cookies &amp; Sessions?</h2>
            <p className="mb-3">
              <strong>Cookies</strong> are small text files stored on your device by your browser.{" "}
              <strong>Local storage</strong> and <strong>session storage</strong> are similar browser
              mechanisms that let a website remember information between pages and visits. A{" "}
              <strong>session</strong> is the period during which you are signed in to your account.
            </p>
            <p>
              We use these technologies to keep you signed in, remember your booking progress, and keep
              the site secure. We do <strong>not</strong> use them to build advertising profiles or sell
              your data.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">2. How We Use Them</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Purpose</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Required?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3 font-medium">Essential / Session</td>
                    <td className="px-4 py-3">Keep you signed in, secure your account, and remember your booking-form progress.</td>
                    <td className="px-4 py-3 text-green-700 font-medium">Yes</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3 font-medium">Preference</td>
                    <td className="px-4 py-3">Remember choices such as your selected property or display settings.</td>
                    <td className="px-4 py-3 text-amber-700 font-medium">No</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">Payment</td>
                    <td className="px-4 py-3">Set by our payment provider (Razorpay) to process payments securely.</td>
                    <td className="px-4 py-3 text-green-700 font-medium">Yes</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">3. Third-Party Services</h2>
            <p className="mb-3">
              Some cookies and storage are set by trusted third parties we rely on to run our service:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Razorpay</strong> — payment processing and fraud prevention.</li>
              <li><strong>Supabase</strong> — authentication and secure login sessions (where enabled).</li>
            </ul>
            <p className="mt-3">
              These providers process data under their own privacy and cookie policies. We do not control
              cookies set directly by these third parties.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">4. Managing Cookies &amp; Sessions</h2>
            <p className="mb-3">
              You can control or delete cookies and browser storage at any time through your browser
              settings. Most browsers let you block or clear them under Settings → Privacy.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-amber-800">
                Please note: blocking <strong>essential</strong> or <strong>session</strong> cookies will
                prevent you from signing in or completing a booking, as these are required for the site to
                function.
              </p>
            </div>
            <p className="mt-3">
              You can end your session at any time by signing out of the resident portal. Sessions also
              expire automatically after a period of inactivity for your security.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">5. Changes to This Policy</h2>
            <p>
              We may update this policy as our website and the technologies we use evolve. The "Last
              updated" date above reflects the most recent revision. Material changes will be communicated
              through the website or portal.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 6 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">6. Contact</h2>
            <div className="bg-gray-50 rounded-xl p-5 space-y-1">
              <p className="font-semibold text-gray-900">The Hub Co-Living</p>
              <p>Email: <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline">hello@thehubco.live</a></p>
              <p className="text-gray-500 mt-2">Bengaluru, Karnataka, India</p>
            </div>
          </section>

        </div>

        {/* Footer nav */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex flex-wrap gap-4 text-sm text-gray-500">
          <a href="/legal" className="hover:text-gray-900 transition-colors">Legal Hub</a>
          <span>·</span>
          <a href="/legal/privacy-policy" className="hover:text-gray-900 transition-colors">Privacy Policy</a>
          <span>·</span>
          <a href="/legal/terms-and-conditions" className="hover:text-gray-900 transition-colors">Terms & Conditions</a>
          <span>·</span>
          <a href="/legal/refund-policy" className="hover:text-gray-900 transition-colors">Refund Policy</a>
        </div>
      </div>
    </div>
  )
}
