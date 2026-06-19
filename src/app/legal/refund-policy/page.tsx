import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Refund Policy — The Hub Co-Living",
  description: "Refund Policy for security deposits and payments at The Hub Co-Living.",
}

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">← Back</a>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-900">Refund Policy</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#F9A91F] mb-3">Legal</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            Refund Policy
          </h1>
          <p className="text-gray-500 text-sm">Last updated: 19 June 2026 &nbsp;·&nbsp; Effective: 19 June 2026</p>
        </div>

        <div className="space-y-8 text-gray-700 leading-relaxed text-sm">

          {/* Intro */}
          <section>
            <p>
              This Refund Policy applies to all payments made to <strong>Safina Hotels</strong> (Safina Plaza)
              and <strong>Safina Ventures Private Limited</strong> (Peepal Tree), collectively{" "}
              <strong>"The Hub"</strong>. Please read this policy carefully before making any payment.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 1 — Quick Reference */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Quick Reference</h2>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Payment Type</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Refundable?</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Timeline</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3">Security Deposit</td>
                    <td className="px-4 py-3 text-green-700 font-medium">Yes (subject to deductions)</td>
                    <td className="px-4 py-3">Within 7 working days after check-out</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3">Maintenance Fee (₹2,000)</td>
                    <td className="px-4 py-3 text-red-600 font-medium">No — Non-refundable</td>
                    <td className="px-4 py-3">—</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3">Monthly Rent (paid in advance)</td>
                    <td className="px-4 py-3 text-amber-700 font-medium">Partial (pro-rated)</td>
                    <td className="px-4 py-3">With final settlement after check-out</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3">Late payment fees</td>
                    <td className="px-4 py-3 text-red-600 font-medium">No</td>
                    <td className="px-4 py-3">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">1. Security Deposit</h2>

            <h3 className="font-semibold text-gray-800 mb-2">What it is</h3>
            <p className="mb-4">
              The Security Deposit is equivalent to one month's tariff and is collected at check-in. It is
              held purely as security against potential damages, unpaid dues, or rule violations. It{" "}
              <strong>cannot be adjusted against or applied to monthly rent</strong> under any circumstances.
            </p>

            <h3 className="font-semibold text-gray-800 mb-2">Refund conditions</h3>
            <p className="mb-3">
              The deposit will be refunded in full within <strong>7 working days</strong> after the
              completion of your notice period and physical check-out, provided:
            </p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>You have served the full 1-calendar-month written notice period.</li>
              <li>All outstanding rent, fees, and dues have been cleared.</li>
              <li>The room is returned in the same condition as at check-in (normal wear and tear excepted).</li>
              <li>All keys, access cards, and property items have been returned.</li>
            </ul>

            <h3 className="font-semibold text-gray-800 mb-2">Deductions from deposit</h3>
            <p className="mb-3">The following may be deducted from the deposit before refund:</p>
            <ul className="list-disc pl-5 space-y-2 mb-4">
              <li>Cost of repair or replacement of damaged furniture, fixtures, or fittings beyond normal wear.</li>
              <li>Cost of missing items inventoried at check-in.</li>
              <li>Any unpaid rent, pro-rated rent, or outstanding dues.</li>
              <li>Shortfall in notice period (see <a href="/legal/cancellation-policy" className="text-[#F9A91F] underline">Cancellation Policy</a>).</li>
              <li>Extraordinary cleaning costs if the room is left in an unsanitary condition.</li>
            </ul>
            <p>
              We will provide an itemised deduction statement before processing the refund. If the
              deductions exceed the deposit amount, the balance is payable by the guest.
            </p>

            <h3 className="font-semibold text-gray-800 mt-4 mb-2">Forfeiture of deposit</h3>
            <p>
              The deposit is forfeited entirely in the following circumstances:
            </p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>Eviction due to misconduct or violation of House Rules.</li>
              <li>Abandonment of the room without notice.</li>
              <li>Criminal activity on the premises.</li>
            </ul>
          </section>

          <hr className="border-gray-200" />

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">2. Maintenance Fee</h2>
            <p>
              The one-time Maintenance Fee of <strong>₹2,000</strong> is strictly non-refundable under all
              circumstances, including cancellation before check-in, early exit, or eviction.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">3. Monthly Rent</h2>
            <p className="mb-3">
              Monthly rent payments are not refunded once made, except in the following circumstance:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                If a guest has paid rent for a full month but checks out before the end of that month
                having served full notice, the pro-rated unused rent for the remaining days will be
                calculated and included in the final settlement.
              </li>
              <li>
                No refund is given for monthly rent if the guest exits without serving notice, or is
                evicted.
              </li>
            </ul>
          </section>

          <hr className="border-gray-200" />

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">4. Refund Method</h2>
            <p className="mb-3">
              All refunds are processed via bank transfer (NEFT/IMPS) to the account details provided by
              the guest at check-out. We do not issue refunds via cash or cheque.
            </p>
            <p>
              Processing time: up to <strong>7 working days</strong> from the date of check-out and
              completion of the settlement review. Bank transfer times are additional and vary by bank.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 6 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">5. Payment Disputes</h2>
            <p className="mb-3">
              If you believe a charge is incorrect or a refund has not been received, please contact us at{" "}
              <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline">hello@thehubco.live</a>{" "}
              within <strong>30 days</strong> of the transaction date. Include your name, property, and the
              payment reference number.
            </p>
            <p>
              For payment processing issues via Razorpay, you may also raise a dispute directly through
              your bank or card provider. We will cooperate with any valid chargeback investigation.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 7 */}
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
          <a href="/legal/cancellation-policy" className="hover:text-gray-900 transition-colors">Cancellation Policy</a>
        </div>
      </div>
    </div>
  )
}
