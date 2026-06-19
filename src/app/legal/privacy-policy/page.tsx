import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Privacy Policy — The Hub Co-Living",
  description: "How The Hub Co-Living collects, uses, and protects your personal data.",
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <a href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">← Back</a>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-900">Privacy Policy</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#F9A91F] mb-3">Legal</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            Privacy Policy
          </h1>
          <p className="text-gray-500 text-sm">Last updated: 19 June 2026 &nbsp;·&nbsp; Effective: 19 June 2026</p>
        </div>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">

          {/* Intro */}
          <section>
            <p>
              This Privacy Policy describes how <strong>Safina Hotels</strong> (operator of Safina Plaza) and{" "}
              <strong>Safina Ventures Private Limited</strong> (operator of Peepal Tree), collectively referred to as{" "}
              <strong>"The Hub", "we", "our"</strong> or <strong>"us"</strong>, collect, use, store, and share
              personal information when you interact with our website, booking platform, or co-living facilities
              located in Bengaluru, Karnataka, India.
            </p>
            <p className="mt-3">
              This policy is issued in compliance with the{" "}
              <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong>,{" "}
              the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data
              or Information) Rules, 2011 (<strong>IT SPDI Rules</strong>), and the{" "}
              Information Technology Act, 2000.
            </p>
            <p className="mt-3">
              By submitting a booking form or using our resident portal, you provide your free, specific, and
              informed consent to the collection and processing of your personal data as described in this policy.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 1 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">1. Data We Collect</h2>
            <p className="mb-3">We collect the following categories of personal data:</p>

            <div className="bg-gray-50 rounded-xl p-5 space-y-4 text-sm">
              <div>
                <p className="font-semibold text-gray-900 mb-1">Identity & Contact</p>
                <p>Full legal name, gender, email address, phone number.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-1">Government-Issued Identification</p>
                <p>
                  Aadhaar number, PAN, passport number, or driving licence number — along with the document type.
                  <span className="block mt-1 text-amber-700 font-medium">
                    ⚠ Important notice: Aadhaar numbers are stored in our database. Please see Section 6 for your
                    rights regarding this data.
                  </span>
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-1">Emergency Contact</p>
                <p>Name, phone number, and relationship of your nominated emergency contact.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-1">Professional Information</p>
                <p>Workplace name and LinkedIn profile URL (optional).</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-1">Financial Information</p>
                <p>
                  Payment records (amount, status, date). We do not store card numbers or bank account details —
                  these are processed directly by Razorpay.
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-1">Stay Information</p>
                <p>Property, room, check-in/check-out dates, booking tier, deposit status, and stay history.</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900 mb-1">Usage Data</p>
                <p>
                  Pages visited on our platform, session data, and browser/device type for operational and security
                  purposes.
                </p>
              </div>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* 2 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">2. How We Use Your Data</h2>
            <p className="mb-3">We use your personal data for the following purposes:</p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li><strong>Booking & Check-in:</strong> To verify identity, allocate accommodation, and process your arrival.</li>
              <li><strong>Payments:</strong> To generate payment links, process rent and deposit transactions, send invoices, and track outstanding dues.</li>
              <li><strong>Communications:</strong> To send payment reminders, notices, and operational announcements via SMS and email.</li>
              <li><strong>Maintenance:</strong> To link maintenance tickets to your room and contact you about resolution status.</li>
              <li><strong>Compliance:</strong> To meet legal obligations, including identity verification requirements under applicable law.</li>
              <li><strong>Safety & Security:</strong> To manage access, respond to emergencies, and enforce house rules.</li>
              <li><strong>Service Improvement:</strong> To analyse usage patterns and improve our platform and facilities.</li>
            </ul>
            <p className="mt-3 text-sm">
              We do not use your data for targeted advertising. We do not sell your personal data to any third party.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 3 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">3. Third Parties We Share Data With</h2>
            <p className="mb-3 text-sm">
              We share your data only with service providers necessary for operating our business. These are:
            </p>

            <div className="overflow-hidden rounded-xl border border-gray-200 text-sm">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Provider</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Purpose</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-900">Data Shared</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr>
                    <td className="px-4 py-3 font-medium">Razorpay</td>
                    <td className="px-4 py-3">Payment processing</td>
                    <td className="px-4 py-3">Name, email, phone, payment amount</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="px-4 py-3 font-medium">Notion</td>
                    <td className="px-4 py-3">Guest & property database</td>
                    <td className="px-4 py-3">All guest data including ID documents</td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">Zoho</td>
                    <td className="px-4 py-3">Billing & invoicing</td>
                    <td className="px-4 py-3">Name, email, phone, billing records</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-sm">
              All third-party providers are governed by their own privacy policies. We recommend reviewing{" "}
              <a href="https://razorpay.com/privacy/" target="_blank" rel="noopener noreferrer" className="text-[#F9A91F] underline">Razorpay's Privacy Policy</a>,{" "}
              <a href="https://www.notion.so/Privacy-Policy-3468d120cf614d4c9014c09f6adc9091" target="_blank" rel="noopener noreferrer" className="text-[#F9A91F] underline">Notion's Privacy Policy</a>, and{" "}
              <a href="https://www.zoho.com/privacy.html" target="_blank" rel="noopener noreferrer" className="text-[#F9A91F] underline">Zoho's Privacy Policy</a>.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 4 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">4. Data Retention</h2>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li>
                <strong>Active residents:</strong> All personal data is retained for the duration of your stay.
              </li>
              <li>
                <strong>Post check-out:</strong> Data is retained for a minimum of <strong>3 years</strong> to
                comply with financial record-keeping obligations under the Income Tax Act and GST regulations.
              </li>
              <li>
                <strong>Government ID data (including Aadhaar):</strong> Retained for the same 3-year period.
                You may request deletion of your Aadhaar number specifically after check-out; see Section 6.
              </li>
              <li>
                <strong>Leads / enquiries that did not convert:</strong> Retained for up to 12 months, then
                permanently deleted.
              </li>
            </ul>
          </section>

          <hr className="border-gray-200" />

          {/* 5 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">5. Data Security</h2>
            <p className="text-sm">
              We implement reasonable technical and organisational measures to protect your personal data from
              unauthorised access, disclosure, or destruction. Our database (Notion) is access-controlled to
              authorised staff only. Payment data is processed over encrypted connections by Razorpay and is
              never stored on our servers in raw form.
            </p>
            <p className="mt-3 text-sm">
              Despite these measures, no system is completely secure. In the event of a data breach that is
              likely to affect your rights, we will notify you as required under applicable law.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 6 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">6. Your Rights</h2>
            <p className="mb-3 text-sm">Under the DPDP Act, 2023 and IT SPDI Rules, you have the following rights:</p>
            <ul className="list-disc pl-5 space-y-2 text-sm">
              <li><strong>Right to Access:</strong> Request a copy of the personal data we hold about you.</li>
              <li><strong>Right to Correction:</strong> Request correction of inaccurate or incomplete data.</li>
              <li>
                <strong>Right to Erasure:</strong> Request deletion of your personal data, subject to our legal
                retention obligations. You may specifically request deletion of your Aadhaar number after
                check-out.
              </li>
              <li>
                <strong>Right to Withdraw Consent:</strong> Withdraw consent to processing at any time. This may
                affect our ability to provide services to you.
              </li>
              <li>
                <strong>Right to Grievance Redressal:</strong> Lodge a complaint with us or with the{" "}
                Data Protection Board of India once constituted.
              </li>
            </ul>
            <p className="mt-4 text-sm">
              To exercise any of these rights, email us at{" "}
              <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline">hello@thehubco.live</a>{" "}
              with the subject line <em>"Data Request — [Your Name]"</em>. We will respond within 30 days.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 7 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">7. Cookies & Sessions</h2>
            <p className="text-sm">
              Our resident portal uses session cookies to keep you logged in. These are functional cookies
              required for the operation of the portal and cannot be disabled while using the portal.
              We do not use third-party advertising or tracking cookies.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 8 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">8. Children's Privacy</h2>
            <p className="text-sm">
              Our services are intended for adults (18 years and above). We do not knowingly collect personal
              data from minors. If you believe a minor has submitted data to us, please contact us immediately
              so we can delete it.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 9 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">9. Changes to This Policy</h2>
            <p className="text-sm">
              We may update this Privacy Policy from time to time. When we do, we will update the "Last updated"
              date at the top of this page and, for material changes, notify active residents by email. Continued
              use of our services after an update constitutes acceptance of the revised policy.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 10 */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">10. Contact Us</h2>
            <div className="bg-gray-50 rounded-xl p-5 text-sm space-y-1">
              <p className="font-semibold text-gray-900">Safina Hotels (Safina Plaza)</p>
              <p>Email: <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline">hello@thehubco.live</a></p>
              <p className="mt-3 font-semibold text-gray-900">Safina Ventures Private Limited (Peepal Tree)</p>
              <p>Email: <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline">hello@thehubco.live</a></p>
              <p className="mt-3 text-gray-500">Jurisdiction: Bengaluru, Karnataka, India</p>
            </div>
          </section>

        </div>

        {/* Footer nav */}
        <div className="mt-12 pt-8 border-t border-gray-200 flex flex-wrap gap-4 text-sm text-gray-500">
          <a href="/legal" className="hover:text-gray-900 transition-colors">Legal Hub</a>
          <span>·</span>
          <a href="/legal/terms-and-conditions" className="hover:text-gray-900 transition-colors">Terms & Conditions</a>
          <span>·</span>
          <a href="/legal/refund-policy" className="hover:text-gray-900 transition-colors">Refund Policy</a>
          <span>·</span>
          <a href="/legal/cancellation-policy" className="hover:text-gray-900 transition-colors">Cancellation Policy</a>
        </div>
      </div>
    </div>
  )
}
