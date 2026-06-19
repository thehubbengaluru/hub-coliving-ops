import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Cancellation Policy — The Hub Co-Living",
  description: "Cancellation Policy for bookings and stays at The Hub Co-Living.",
}

export default function CancellationPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">← Back</a>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-900">Cancellation Policy</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#F9A91F] mb-3">Legal</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            Cancellation Policy
          </h1>
          <p className="text-gray-500 text-sm">Last updated: 19 June 2026 &nbsp;·&nbsp; Effective: 19 June 2026</p>
        </div>

        <div className="space-y-8 text-gray-700 leading-relaxed text-sm">

          {/* Intro */}
          <section>
            <p>
              This Cancellation Policy applies to all bookings at <strong>Safina Hotels</strong> (Safina Plaza)
              and <strong>Safina Ventures Private Limited</strong> (Peepal Tree), collectively{" "}
              <strong>"The Hub"</strong>. It sets out the rules for cancelling a booking before check-in,
              and for vacating before the end of a stay.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* Quick Reference */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Reference</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Scenario</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Deposit</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Maintenance Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3">Cancel before check-in (7+ days notice)</td>
                    <td className="px-4 py-3 text-green-700 font-medium">Full refund</td>
                    <td className="px-4 py-3 text-red-600 font-medium">Non-refundable</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3">Cancel before check-in (&lt;7 days notice)</td>
                    <td className="px-4 py-3 text-red-600 font-medium">Forfeited</td>
                    <td className="px-4 py-3 text-red-600 font-medium">Non-refundable</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Early exit with full 1-month notice</td>
                    <td className="px-4 py-3 text-green-700 font-medium">Refunded (less deductions)</td>
                    <td className="px-4 py-3 text-red-600 font-medium">Non-refundable</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3">Early exit without notice / partial notice</td>
                    <td className="px-4 py-3 text-amber-700 font-medium">Shortfall deducted</td>
                    <td className="px-4 py-3 text-red-600 font-medium">Non-refundable</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Eviction (misconduct / rule violation)</td>
                    <td className="px-4 py-3 text-red-600 font-medium">Forfeited</td>
                    <td className="px-4 py-3 text-red-600 font-medium">Non-refundable</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">1. Cancellation Before Check-In</h2>

            <div className="space-y-4">
              <div className="border border-green-200 bg-green-50 rounded-xl p-4">
                <p className="font-semibold text-green-800 mb-1">7 or more days before check-in</p>
                <p className="text-green-700">
                  Your security deposit will be refunded in full within 7 working days.
                  The Maintenance Fee (₹2,000) is non-refundable.
                </p>
              </div>

              <div className="border border-red-200 bg-red-50 rounded-xl p-4">
                <p className="font-semibold text-red-800 mb-1">Less than 7 days before check-in</p>
                <p className="text-red-700">
                  Your security deposit is forfeited. The Maintenance Fee is also non-refundable.
                  This reflects the cost of holding the accommodation and turning away other potential guests.
                </p>
              </div>
            </div>

            <p className="mt-4">
              To cancel, notify us in writing at{" "}
              <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline">hello@thehubco.live</a>{" "}
              with your name and booking reference. Cancellations are effective from the date we receive
              written notice.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">2. Notice Period During Stay</h2>
            <p className="mb-3">
              All residents must provide a minimum of <strong>1 full calendar month's written notice</strong>{" "}
              before vacating. Notice must be:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Submitted through the resident portal, or</li>
              <li>Sent in writing (email) to management at{" "}
                <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline">hello@thehubco.live</a>
              </li>
            </ul>
            <p>
              The notice period begins on the date management receives and acknowledges your written notice.
              Verbal communication does not constitute notice.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">3. Early Exit — Without Full Notice</h2>
            <p className="mb-3">
              If you vacate the property before completing the full 1-month notice period, a{" "}
              <strong>shortfall deduction</strong> will apply:
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <p className="font-semibold text-amber-800 mb-2">How the shortfall is calculated</p>
              <p className="text-amber-700">
                Shortfall = (Number of days remaining in the 1-month notice period) × (Daily rate based on
                your monthly tariff ÷ 30)
              </p>
              <p className="text-amber-700 mt-2">
                This amount is deducted from your security deposit. If the shortfall exceeds the deposit,
                the balance is payable by you.
              </p>
            </div>
            <p>
              Example: If your monthly rent is ₹15,000 and you leave 15 days before the end of your
              notice period, the shortfall is ₹7,500 (15 days × ₹500/day).
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">4. No-Show</h2>
            <p>
              If you do not check in on the confirmed date and do not communicate with us, your booking will
              be treated as a last-minute cancellation (&lt;7 days) and your deposit will be forfeited. We
              will attempt to contact you on the check-in day before taking this action.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">5. Cancellations by The Hub</h2>
            <p className="mb-3">
              In the rare event that we must cancel your confirmed booking (e.g., due to property damage,
              force majeure, or circumstances beyond our control):
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>We will give you as much notice as possible.</li>
              <li>Your full security deposit will be refunded within 7 working days.</li>
              <li>The Maintenance Fee will also be refunded in this specific scenario.</li>
              <li>We will endeavour to offer an alternative room or property where available.</li>
            </ul>
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
