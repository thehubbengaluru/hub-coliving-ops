import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Terms & Conditions — The Hub Co-Living",
  description: "Terms and Conditions governing your stay and use of The Hub Co-Living platform.",
}

export default function TermsAndConditionsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">← Back</a>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-900">Terms & Conditions</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#F9A91F] mb-3">Legal</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            Terms & Conditions
          </h1>
          <p className="text-gray-500 text-sm">Last updated: 19 June 2026 &nbsp;·&nbsp; Effective: 19 June 2026</p>
        </div>

        <div className="space-y-8 text-gray-700 leading-relaxed text-sm">

          {/* Intro */}
          <section>
            <p>
              These Terms and Conditions (<strong>"Terms"</strong>) govern your use of the co-living facilities,
              booking platform, and resident portal operated by <strong>Safina Hotels</strong> (Safina Plaza) and{" "}
              <strong>Safina Ventures Private Limited</strong> (Peepal Tree), collectively referred to as{" "}
              <strong>"The Hub"</strong>, <strong>"we"</strong>, or <strong>"us"</strong>.
            </p>
            <p className="mt-3">
              By submitting a booking form, making a payment, or residing at any of our properties, you
              (<strong>"Guest"</strong> or <strong>"you"</strong>) agree to be bound by these Terms. If you do
              not agree, do not proceed with a booking.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 1 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">1. Eligibility</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You must be at least 18 years of age to make a booking.</li>
              <li>You must provide a valid, government-issued photo ID at check-in.</li>
              <li>You must provide accurate, complete, and truthful information in the booking form. Any
                misrepresentation may result in immediate termination of stay without refund.</li>
            </ul>
          </section>

          <hr className="border-gray-200" />

          {/* 2 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">2. Bookings & Confirmation</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                A booking is considered confirmed only upon receipt of the Security Deposit and one-time
                Maintenance Fee in full, at least 24 hours before the scheduled check-in date.
              </li>
              <li>
                We reserve the right to decline or cancel a booking at our discretion, including if the
                accommodation becomes unavailable or if eligibility requirements are not met.
              </li>
              <li>
                Booking confirmation is specific to the property, room type, and check-in date stated at the
                time of booking. Changes are subject to availability and management approval.
              </li>
            </ul>
          </section>

          <hr className="border-gray-200" />

          {/* 3 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">3. Payments & Rent</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Rent is due on the <strong>1st of each calendar month</strong>. A late payment fee may be
                applied for payments received after the due date, as communicated on your invoice.
              </li>
              <li>
                All payments are processed in Indian Rupees (INR) via Razorpay. We accept UPI, net banking,
                debit/credit cards, and Razorpay-supported payment methods.
              </li>
              <li>
                The <strong>Security Deposit</strong> is equivalent to one month's tariff and is held as
                security against potential damages and unpaid dues. It cannot under any circumstances be
                applied or adjusted against monthly rent.
              </li>
              <li>
                The <strong>Maintenance Fee</strong> of ₹2,000 (one-time, non-refundable) is payable at
                check-in and covers basic maintenance services during the stay.
              </li>
              <li>
                Pro-rated rent applies when a guest checks in on a date other than the 1st of the month, calculated
                proportionally for the remaining days of that month.
              </li>
            </ul>
          </section>

          <hr className="border-gray-200" />

          {/* 4 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">4. House Rules</h2>
            <p className="mb-2">
              All guests are required to comply with the House Rules provided during booking. Key obligations include:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Maintaining cleanliness and respectful conduct in rooms and common areas.</li>
              <li>Observing quiet hours (as posted on premises).</li>
              <li>Not engaging in illegal activities, subletting, or unauthorized cooking in rooms.</li>
              <li>Not permitting overnight visitors without prior management approval.</li>
              <li>Smoking and alcohol are strictly prohibited on the premises.</li>
              <li>Not tampering with fire safety equipment, utilities, or fixtures.</li>
            </ul>
            <p className="mt-3">
              Violation of House Rules may result in penalties, eviction, or forfeiture of the security deposit,
              at management's sole discretion.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 5 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">5. Notice Period & Check-Out</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Guests must provide a minimum of <strong>1 calendar month's written notice</strong> before
                vacating. Notice must be submitted via the resident portal or in writing to management.
              </li>
              <li>
                Check-out must be completed by the agreed check-out date. Late check-outs without prior
                approval will incur additional charges at the daily pro-rated rate.
              </li>
              <li>
                The room must be returned in the same condition as at check-in. Any damage beyond normal
                wear and tear will be deducted from the security deposit.
              </li>
              <li>
                See the <a href="/legal/cancellation-policy" className="text-[#F9A91F] underline">Cancellation Policy</a> for
                deposit consequences of early exit.
              </li>
            </ul>
          </section>

          <hr className="border-gray-200" />

          {/* 6 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">6. Liability & Loss</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                The Hub is not responsible for loss, theft, or damage to personal belongings on the premises.
                Guests are advised to keep valuables secure and obtain personal property insurance if required.
              </li>
              <li>
                Our liability for any claim arising out of or in connection with your stay or use of our
                platform is limited to the amount of rent paid by you in the month in which the claim arises.
              </li>
              <li>
                We are not liable for any indirect, consequential, or punitive damages, including loss of
                income, loss of data, or business interruption.
              </li>
              <li>
                We reserve the right to modify, suspend, or discontinue any service or facility at any time
                with reasonable notice.
              </li>
              <li>
                <strong>Guests of residents (private rooms only):</strong> an additional guest may stay with a
                resident only in a private room and only once approved by management, at our sole discretion and
                subject to withdrawal at any time. The primary tenant assumes full responsibility and liability
                for their guest's conduct, payments, and any damage or rule violation, and the guest's stay
                remains subject to all house rules and management's ongoing approval.
              </li>
            </ul>
          </section>

          <hr className="border-gray-200" />

          {/* 7 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">7. Force Majeure</h2>
            <p>
              The Hub shall not be liable for any failure to perform its obligations where such failure results
              from circumstances beyond our reasonable control, including but not limited to natural disasters,
              government-imposed restrictions, civil unrest, pandemics, utility outages, or acts of God.
              In such events, we will endeavour to provide reasonable notice and alternative arrangements where
              possible.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 8 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">8. Intellectual Property</h2>
            <p>
              All content on our booking platform and website, including text, graphics, logos, and software, is
              the property of The Hub or its licensors and is protected under applicable intellectual property
              laws. You may not reproduce, distribute, or create derivative works without our prior written consent.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 9 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">9. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless The Hub, its employees, agents, and management from any
              claims, losses, liabilities, or expenses (including legal fees) arising out of your violation of
              these Terms, your misconduct on the premises, or your infringement of any third party's rights.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 10 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">10. Modifications to Terms</h2>
            <p>
              We reserve the right to update these Terms at any time. Changes will be posted on this page with
              an updated effective date. For material changes, we will notify active residents by email at least
              14 days before the changes take effect. Continued occupation or use of our services after that
              date constitutes acceptance.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 11 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">11. Governing Law & Dispute Resolution</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                These Terms are governed by and construed in accordance with the laws of India, and the specific
                laws of the State of Karnataka.
              </li>
              <li>
                Any dispute arising out of or relating to these Terms or your stay shall first be attempted to
                be resolved through good-faith negotiation between the parties.
              </li>
              <li>
                If unresolved within 30 days, disputes shall be submitted to binding arbitration under the
                Arbitration and Conciliation Act, 1996, with the seat of arbitration in Bengaluru, Karnataka.
              </li>
              <li>
                The courts of Bengaluru, Karnataka shall have exclusive jurisdiction over any proceedings not
                subject to arbitration.
              </li>
            </ul>
          </section>

          <hr className="border-gray-200" />

          {/* 12 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">12. Severability</h2>
            <p>
              If any provision of these Terms is found to be unenforceable or invalid under applicable law,
              that provision shall be modified to the minimum extent necessary to make it enforceable, and the
              remaining provisions shall continue in full force and effect.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 13 */}
          <section>
            <h2 className="text-lg font-bold text-gray-900 mb-3">13. Contact</h2>
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
          <a href="/legal/refund-policy" className="hover:text-gray-900 transition-colors">Refund Policy</a>
          <span>·</span>
          <a href="/legal/cancellation-policy" className="hover:text-gray-900 transition-colors">Cancellation Policy</a>
        </div>
      </div>
    </div>
  )
}
