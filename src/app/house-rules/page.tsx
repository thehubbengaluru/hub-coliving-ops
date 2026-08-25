import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "House Rules — The Hub Co-Living",
  description: "Community guidelines, house rules, and the room package comparison for The Hub Co-Living (Safina Plaza).",
}

const roomPackageRows: { label: string; values: [string, string, string, string] }[] = [
  {
    label: "Tariff (effective 1 March 2026)",
    values: ["₹43,500 (incl. 5% GST)", "₹21,500 (incl. 5% GST)", "₹25,000 (incl. 5% GST)", "₹50,000 (incl. 5% GST)"],
  },
  { label: "Maintenance support", values: ["✅", "✅", "✅", "✅"] },
  { label: "Wi-Fi", values: ["✅", "✅", "✅", "✅"] },
  { label: "TV", values: ["❌", "❌", "✅", "✅"] },
  { label: "Payments and billing", values: ["Due by 3rd", "Due by 3rd", "Due by 3rd", "Due by 3rd"] },
  { label: "Late fee", values: ["₹500/day + 18% GST", "₹500/day + 18% GST", "₹500/day + 18% GST", "₹500/day + 18% GST"] },
  { label: "Maintenance one-time payment", values: ["₹2,000", "₹2,000", "₹2,000", "₹2,000"] },
  { label: "Key loss penalty", values: ["₹2,000 per lost key", "₹2,000 per lost key", "₹2,000 per lost key", "₹2,000 per lost key"] },
  { label: "Security deposit", values: ["1 month's rent", "1 month's rent", "1 month's rent", "1 month's rent"] },
  { label: "Quiet hours", values: ["11 PM–8 AM", "11 PM–8 AM", "11 PM–8 AM", "11 PM–8 AM"] },
  { label: "Move-out / extensions", values: ["30 days / 1 month", "30 days / 1 month", "30 days / 1 month", "30 days / 1 month"] },
  {
    label: "Room finish",
    values: ["Comfortable standard setup", "Comfortable standard setup", "Refreshed interiors + added amenities", "Refreshed interiors + added amenities"],
  },
]

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-6">
      <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
        <span>{emoji}</span> {title}
      </h3>
      <div className="text-sm text-gray-700 leading-relaxed space-y-2">{children}</div>
    </div>
  )
}

export default function HouseRulesPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">← Back</Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-medium text-gray-900">House Rules</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Title */}
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#F9A91F] mb-3">Community Guidelines</p>
          <h1 className="text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: "var(--font-heading)" }}>
            The Hub Co-Living Community Guidelines
          </h1>
          <p className="text-gray-500">
            Welcome to The Hub Co-Living. We&apos;re so glad you&apos;re here! This is a space built by and for people
            who love connection, creativity, and community — these guidelines help us all thrive together.
          </p>
        </div>

        <div className="prose prose-gray max-w-none space-y-8 text-gray-700 leading-relaxed">

          {/* Community team */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">🤝 Your Community Team</h2>
            <p className="mb-3">We&apos;re here to help, fix things, and keep the vibe right:</p>
            <div className="bg-gray-50 rounded-xl p-5 space-y-1 text-sm">
              <p><strong>Community Manager:</strong> Mr. Benjamin</p>
              <p><strong>Managing Partner:</strong> Shirley Lalrinsangi</p>
              <p><strong>Head of People &amp; Culture:</strong> Richa Chakrabarty</p>
              <p><strong>Co-living Supervisor:</strong> Mannan</p>
              <p className="pt-2">📞 <a href="tel:+919113992047" className="text-[#F9A91F] underline">+91 91139 92047</a></p>
              <p>📧 <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline">hello@thehubco.live</a></p>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* Essentials */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">📋 The Essentials</h2>
            <div className="grid gap-4">
              <Section emoji="🔧" title="Maintenance requests">
                <p>Something broken or not working? Submit a request through our maintenance form with what&apos;s
                  broken, where it is, how urgent it is, and photos if you can.</p>
                <p>Common areas are cleaned daily. Room cleaning follows a shared schedule — keep your things
                  organised so our team can do their job.</p>
              </Section>

              <Section emoji="📅" title="Extensions & moving out">
                <p><strong>Want to extend your stay?</strong> Give us 1 month advance notice so we can hold your
                  room, and email <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline">hello@thehubco.live</a> to confirm extension terms.</p>
                <p><strong>Moving out?</strong> 30 days advance notice is required via our check-out form. Rent
                  must be paid for the entire notice period — your security deposit cannot be adjusted towards
                  your last month&apos;s rent. Less than 30 days notice means remaining dues for the notice period
                  are deducted from your deposit. The form also handles your deposit refund and final feedback.
                  Your deposit is refundable when you move out, minus any damages or unpaid dues.</p>
              </Section>

              <Section emoji="💰" title="Rent payments">
                <p>Rent must be paid by the <strong>3rd of each month</strong>. Late payments attract a fee of
                  <strong> ₹500 per day of delay</strong>.</p>
                <p>Questions about billing, deposits, or payments — reach our team at
                  <a href="mailto:hello@thehubco.live" className="text-[#F9A91F] underline"> hello@thehubco.live</a> or
                  <a href="tel:+919113992047" className="text-[#F9A91F] underline"> +91 91139 92047</a>.</p>
              </Section>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* House rules */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-1">🏠 House Rules</h2>
            <p className="text-sm text-gray-500 mb-4">
              These simple agreements keep our space comfortable and respectful for everyone.
            </p>
            <div className="grid gap-4">
              <Section emoji="🛋️" title="Shared spaces">
                <p>Common areas belong to everyone: clean as you go, leave it better than you found it, and keep
                  noise considerate — especially during work hours.</p>
              </Section>

              <Section emoji="🍳" title="Kitchen">
                <p>Clean fully after cooking (utensils, appliances, counters, stove), toss expired food regularly,
                  and label your food with your name and date.</p>
              </Section>

              <Section emoji="🧺" title="Laundry">
                <p>Remove clothes promptly after your cycle ends, clean the lint filter after using the dryer, and
                  report broken machines right away. Be mindful of others waiting to use the machines.</p>
              </Section>

              <Section emoji="🌐" title="Wi-Fi">
                <p>Credentials are shared at check-in. Restart your device first if you have issues, then submit a
                  maintenance request with details. Be mindful of heavy downloads during peak hours.</p>
              </Section>

              <Section emoji="💤" title="Quiet hours">
                <p><strong>11:00 PM – 8:00 AM.</strong> Keep music, calls, and conversations at a volume that
                  respects people who are sleeping, working, or winding down. Planning something louder?
                  Coordinate with the team first.</p>
              </Section>

              <Section emoji="🔐" title="Your room, work areas, and guests">
                <p><strong>Your room</strong> is your private space — keep it clean and lock it when you leave.</p>
                <p><strong>Day guests:</strong> welcome during daytime hours, must check in at reception with valid
                  ID, and must depart by 11:00 PM. Notifying the community team in advance is appreciated but not
                  mandatory.</p>
                <p><strong>Overnight guests:</strong> allowed for single room residents (guests check in at the
                  front desk with valid ID). Not permitted for double room residents, to protect roommate comfort
                  and privacy.</p>
                <p><strong>Work areas:</strong> use the designated workspace in the lobby, and keep work materials
                  and equipment in appropriate zones.</p>
              </Section>

              <Section emoji="🛡️" title="Safety & security">
                <p>Always lock your room. Don&apos;t share keys, codes, or access with anyone. Report safety
                  concerns immediately — broken locks, suspicious activity, fire hazards. Fire equipment is for
                  emergencies only.</p>
                <p><strong>Lost keys:</strong> inform the community team immediately — a replacement fee of
                  ₹2,000 is charged per lost key.</p>
                <p><strong>Security cameras</strong> cover the building entrance, ground-floor lobby, and shared
                  corridor/landing on each floor — entry points and shared passageways only. There are no cameras
                  inside guest rooms, bathrooms, or any private space, and none record audio.</p>
              </Section>

              <Section emoji="🚭" title="Smoking & alcohol">
                <p>No smoking indoors. Alcohol is permitted in private rooms and must be consumed responsibly.
                  Illegal substances are strictly prohibited with zero tolerance.</p>
              </Section>

              <Section emoji="🐕" title="Pets">
                <p>This is a pet-friendly property — check with the team in advance before bringing a pet. Once
                  approved, you&apos;re fully responsible for care, behaviour, cleanliness, and keeping common
                  areas clean.</p>
              </Section>

              <Section emoji="🔧" title="Equipment: care & damages">
                <p>Use equipment responsibly and follow posted instructions. Report damage or malfunctions
                  immediately, even if accidental. If damage is caused by misuse or negligence, the responsible
                  member covers repair or replacement costs. Accidents happen — we just ask that you let us know
                  right away so we can fix things quickly.</p>
              </Section>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* Community standards */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">⚖️ Community Standards</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-emerald-50 rounded-xl p-5 text-sm">
                <p className="font-semibold text-emerald-800 mb-2">✨ We value</p>
                <ul className="list-disc pl-5 space-y-1 text-emerald-800">
                  <li>Respect for residents, staff, and shared property</li>
                  <li>Speaking up early when something&apos;s off</li>
                  <li>Shared ownership of the space</li>
                </ul>
              </div>
              <div className="bg-red-50 rounded-xl p-5 text-sm">
                <p className="font-semibold text-red-800 mb-2">🚫 Zero tolerance for</p>
                <ul className="list-disc pl-5 space-y-1 text-red-800">
                  <li>Harassment, discrimination, or bullying</li>
                  <li>Theft or property damage</li>
                  <li>Violence or threats</li>
                  <li>Repeatedly ignoring these guidelines</li>
                </ul>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-3">
              Violations can lead to warnings or termination of residency. We&apos;ll always try to work things out
              constructively first.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* Room package comparison */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-4">🧾 Room Package Comparison</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left font-semibold text-gray-900 py-2 pr-4">Included / Policy</th>
                    <th className="text-left font-semibold text-gray-900 py-2 pr-4">Single Standard</th>
                    <th className="text-left font-semibold text-gray-900 py-2 pr-4">Double Standard</th>
                    <th className="text-left font-semibold text-gray-900 py-2 pr-4">Single Premium</th>
                    <th className="text-left font-semibold text-gray-900 py-2">Double Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {roomPackageRows.map((row) => (
                    <tr key={row.label} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4 font-medium text-gray-900 whitespace-nowrap">{row.label}</td>
                      {row.values.map((v, i) => (
                        <td key={i} className="py-2 pr-4 text-gray-600 whitespace-nowrap">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200 text-sm text-gray-400 space-y-2">
          <p>
            Questions or feedback? These guidelines are here to make co-living smoother and more joyful.{" "}
            📧 <a href="mailto:community@thehubco.live" className="text-[#F9A91F] underline">community@thehubco.live</a>
            {" "}·{" "}
            📞 <a href="tel:+919113992047" className="text-[#F9A91F] underline">+91 91139 92047</a>
          </p>
          <p className="text-xs">
            These guidelines constitute part of your residency agreement and may be updated at any time at the sole
            discretion of The Hub Co-Living management. By residing on this property, you agree to comply with all
            guidelines as amended from time to time. The Hub Co-Living reserves the right to take immediate action,
            including but not limited to warnings, fines, or termination of residency, against any resident who
            violates these guidelines. Continued residence on the property signifies your acceptance of these terms
            and any subsequent modifications.
          </p>
          <p>Last updated: July 2026</p>
        </div>
      </div>
    </div>
  )
}
