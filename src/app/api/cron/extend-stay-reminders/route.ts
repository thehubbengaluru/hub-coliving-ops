import { NextResponse } from "next/server"
import { getUpcomingCheckouts } from "@/lib/notion"
import { sendEmail } from "@/lib/email"

export const dynamic = "force-dynamic"

// Daily cron: 2 weeks before a guest's check-out, ask whether they want to
// extend, requesting confirmation by 10 days before check-out. Schedule an
// external daily GET to this endpoint (e.g. Vercel Cron / GitHub Action).
// Optional shared-secret guard via CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const checkouts = await getUpcomingCheckouts()

    // 14-day nudge: ask if they want to extend; give them until 10 days before to confirm.
    const at14 = checkouts.filter((c) => c.daysUntil === 14 && c.email)
    // 10-day follow-up: last chance reminder for those who haven't responded.
    const at10 = checkouts.filter((c) => c.daysUntil === 10 && c.email)

    const results: { name: string; email: string; wave: 14 | 10; sent: boolean }[] = []

    for (const c of at14) {
      const confirmBy = new Date(new Date(c.checkOut + "T00:00:00").getTime() - 10 * 86_400_000)
        .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      const checkOutLabel = new Date(c.checkOut + "T00:00:00")
        .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })

      const res = await sendEmail({
        to: c.email!,
        subject: "Your check-out is coming up — would you like to stay longer?",
        html: `
          <p>Hi ${c.name},</p>
          <p>Your current check-out date is <strong>${checkOutLabel}</strong>. If you'd like to extend your stay,
          please let us know by <strong>${confirmBy}</strong> so we can check what's available.</p>
          <p>You can reply to this email or update your intended check-out date in your guest portal.
          Extensions are subject to availability.</p>
          <p>If you're all set to move on, no action needed — we'll be in touch closer to the date.</p>
          <p>— The Hub team</p>
        `,
      })
      results.push({ name: c.name, email: c.email!, wave: 14, sent: res.ok })
    }

    for (const c of at10) {
      const checkOutLabel = new Date(c.checkOut + "T00:00:00")
        .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })

      const res = await sendEmail({
        to: c.email!,
        subject: "Heads up — your check-out is in 10 days",
        html: `
          <p>Hi ${c.name},</p>
          <p>A quick heads-up that your check-out date is <strong>${checkOutLabel}</strong>, which is 10 days away.</p>
          <p>If you'd like to extend, please reply to this email and we'll let you know what's available.
          Extensions are always subject to availability.</p>
          <p>If you're checking out as planned, no action is needed. We'll share check-out details soon.</p>
          <p>— The Hub team</p>
        `,
      })
      results.push({ name: c.name, email: c.email!, wave: 10, sent: res.ok })
    }

    return NextResponse.json({ ok: true, scanned: checkouts.length, emailed: results.length, results })
  } catch (err) {
    console.error("[cron/extend-stay-reminders]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
