import { NextResponse } from "next/server"
import {
  getUpcomingCheckouts, getRentDunningSnapshot, setDueRentLink,
  markRentDefaulted, clearRentDunningState, getPendingBookings,
  revertBedAllotmentByEmail, markGuestStatus, type RentDunningMember,
} from "@/lib/notion"
import { sendEmail, financeRecipients } from "@/lib/email"
import { createRentPaymentLink, cancelPaymentLink, fetchPaymentLink } from "@/lib/razorpay"
import { computeRentSchedule, describeRentMonths, ordinal } from "@/lib/rent-schedule"
import { EXTEND_STAY_WINDOW_DAYS, RESIDENCY_CYCLE_MONTHS, streamFromTags, daysUntilISO, SECOND_PAYMENT_DUE_DAYS } from "@/lib/stay"
import { claimDunningSweep } from "@/lib/webhook-dedupe"
import { rentPaidByEmail } from "@/lib/ledger"
import { dunningDay, LATE_FEE_PER_DAY, LATE_FEE_GRACE_DAY as GRACE_DAY } from "@/lib/dunning"

const NO_SHOW_GRACE_DAYS = 1 // flag a no-show this many days after a passed check-in

export const dynamic = "force-dynamic"

// Daily cron with two jobs:
//
// 1. Extend-stay reminders — 14 and 10 days before a guest's check-out.
//
// 2. Rent dunning — owns the whole unpaid-rent timeline for both a failed
//    auto-debit month (episode opened by the Razorpay webhook) and the final
//    pro-rated month of a mid-month check-out (link created here, 3 days
//    before that month starts, with catch-up if a day is missed):
//      · through the 3rd  — daily "rent due / payment failed" reminder email
//      · 4th – 9th        — cancel & reissue the link with ₹500/day late fee;
//                           the 8th and 9th use a final-warning tone
//      · 10th             — guest becomes a defaulter: link reissued at rent
//                           + ₹3,500, vacate notice (deposit forfeited) sent,
//                           finance copied; no further reissues after this
//    Paying at any point clears the episode (webhook + a sweep backstop here).
//
// Schedule an external daily GET to this endpoint (e.g. Vercel Cron / GitHub
// Action). Optional shared-secret guard via CRON_SECRET.

// Late-fee ladder, dunningDay + constants now live in @/lib/dunning so the
// webhook (5th-failure escalation) and this cron share one capped implementation.

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`

function istTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
}

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(y, m - 1, d + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

type Tone = "due" | "late" | "final-warning" | "default"

function toneFor(day: number): Tone {
  if (day <= GRACE_DAY) return "due"
  if (day <= 7) return "late"
  if (day <= 9) return "final-warning"
  return "default"
}

function dunningEmail({
  tone, name, base, fee, total, url, rentMonthLabel,
}: {
  tone: Tone; name: string; base: number; fee: number; total: number; url: string; rentMonthLabel: string
}): { subject: string; html: string } {
  const amounts = fee > 0
    ? `<p>Rent (${rentMonthLabel}): <strong>${inr(base)}</strong><br/>Late fee so far: <strong>${inr(fee)}</strong> (${inr(LATE_FEE_PER_DAY)}/day from the 4th)<br/>Total due today: <strong>${inr(total)}</strong></p>`
    : `<p>Rent (${rentMonthLabel}): <strong>${inr(base)}</strong></p>`
  const pay = `<p><a href="${url}">Pay now</a></p>`

  switch (tone) {
    case "due":
      return {
        subject: `Rent payment pending — ${rentMonthLabel}`,
        html: `<p>Hi ${name},</p><p>Your rent for ${rentMonthLabel} hasn't been received yet. Please pay by the 3rd to avoid the late fee of ${inr(LATE_FEE_PER_DAY)} per day that applies from the 4th.</p>${amounts}${pay}<p>— The Hub team</p>`,
      }
    case "late":
      return {
        subject: `Rent overdue — late fee accruing (${rentMonthLabel})`,
        html: `<p>Hi ${name},</p><p>Your rent for ${rentMonthLabel} is overdue. As per your agreement, a late fee of ${inr(LATE_FEE_PER_DAY)} per day applies from the 4th of the month.</p>${amounts}${pay}<p>The late fee grows by ${inr(LATE_FEE_PER_DAY)} every day — please clear this today.</p><p>— The Hub team</p>`,
      }
    case "final-warning":
      return {
        subject: `FINAL WARNING — rent unpaid, vacate notice on the 10th`,
        html: `<p>Hi ${name},</p><p><strong>This is a final warning.</strong> Your rent for ${rentMonthLabel} remains unpaid. If it is not cleared by the <strong>10th</strong>, as per the terms you agreed to at booking you will be required to <strong>vacate the premises on the 10th</strong> and your <strong>security deposit will be forfeited</strong>.</p>${amounts}${pay}<p>Please treat this as urgent.</p><p>— The Hub team</p>`,
      }
    case "default":
      return {
        subject: `Notice to vacate — rent default (${rentMonthLabel})`,
        html: `<p>Hi ${name},</p><p>Despite repeated reminders, your rent for ${rentMonthLabel} remains unpaid as of the 10th. As per the terms you agreed to at booking:</p><ul><li>You are required to <strong>vacate the premises today</strong>.</li><li>Your <strong>security deposit stands forfeited</strong>.</li><li>The amount below remains payable in full.</li></ul>${amounts}${pay}<p>Please contact the office immediately to arrange your check-out.</p><p>— The Hub team</p>`,
      }
  }
}

export async function GET(req: Request) {
  // Fail CLOSED: this endpoint sends dunning/vacate emails and cancels/reissues
  // real payment links, so it must never be publicly triggerable. A missing
  // CRON_SECRET is a misconfiguration, not "open to everyone".
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set — refusing to run (endpoint would be public)")
    return NextResponse.json({ error: "Cron not configured" }, { status: 503 })
  }
  const auth = req.headers.get("authorization")
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const checkouts = await getUpcomingCheckouts()

    // ── 1. Extend-stay reminder waves ──────────────────────────────────────
    const at14 = checkouts.filter((c) => c.daysUntil === EXTEND_STAY_WINDOW_DAYS && c.email)
    const at10 = checkouts.filter((c) => c.daysUntil === 10 && c.email)

    const results: { name: string; email: string; wave: 14 | 10; stream: "co-living" | "residency"; sent: boolean }[] = []

    for (const c of at14) {
      const stream = streamFromTags(c.tags)
      const confirmBy = fmtDate(addDays(c.checkOut, -10))
      // Residency runs in fixed cycles: at cycle end the resident re-applies
      // through the standard flow and the Hub decides renewal terms. Co-living
      // guests get the self-serve extension nudge instead.
      const res = await sendEmail({
        to: c.email!,
        subject: stream === "residency"
          ? "Your residency cycle ends soon — re-apply to continue"
          : "Your check-out is coming up — would you like to stay longer?",
        html: stream === "residency"
          ? `
          <p>Hi ${c.name},</p>
          <p>Your current ${RESIDENCY_CYCLE_MONTHS}-month residency cycle ends on <strong>${fmtDate(c.checkOut)}</strong>.</p>
          <p>Residencies run in fixed cycles — to continue staying with us, please re-apply through the application
          flow by <strong>${confirmBy}</strong>. Renewals are subject to availability and pricing may be revised for
          the new cycle; your security deposit carries forward if renewed.</p>
          <p>If you're moving on, no action is needed — we'll share check-out details closer to the date.</p>
          <p>— The Hub team</p>
        `
          : `
          <p>Hi ${c.name},</p>
          <p>Your current check-out date is <strong>${fmtDate(c.checkOut)}</strong>. If you'd like to extend your stay,
          you can do it right from your guest portal — pick a duration and we'll show you what's available (your
          current room if it's free, or another available room). Please confirm by <strong>${confirmBy}</strong>.</p>
          <p>Extensions are treated as a fresh booking with a fresh contract; your security deposit carries forward.</p>
          <p>If you're all set to move on, no action needed — we'll be in touch closer to the date.</p>
          <p>— The Hub team</p>
        `,
      })
      results.push({ name: c.name, email: c.email!, wave: 14, stream, sent: res.ok })
    }

    for (const c of at10) {
      const stream = streamFromTags(c.tags)
      const res = await sendEmail({
        to: c.email!,
        subject: stream === "residency"
          ? "Last call — your residency cycle ends in 10 days"
          : "Heads up — your check-out is in 10 days",
        html: stream === "residency"
          ? `
          <p>Hi ${c.name},</p>
          <p>A quick reminder that your residency cycle ends on <strong>${fmtDate(c.checkOut)}</strong> — 10 days from now.</p>
          <p>If you'd like to stay for another cycle, please re-apply through the application flow today.
          Renewals are subject to availability and may be repriced.</p>
          <p>If you're checking out as planned, no action is needed. We'll share check-out details soon.</p>
          <p>— The Hub team</p>
        `
          : `
          <p>Hi ${c.name},</p>
          <p>A quick heads-up that your check-out date is <strong>${fmtDate(c.checkOut)}</strong>, which is 10 days away.</p>
          <p>If you'd like to extend, head to your guest portal and pick a duration — extensions are always subject to availability.</p>
          <p>If you're checking out as planned, no action is needed. We'll share check-out details soon.</p>
          <p>— The Hub team</p>
        `,
      })
      results.push({ name: c.name, email: c.email!, wave: 10, stream, sent: res.ok })
    }

    // ── 2. Rent dunning sweep ──────────────────────────────────────────────
    const todayISO = istTodayISO()
    const members = await getRentDunningSnapshot()
    const financeTo = financeRecipients()
    const dunning: { name: string; action: string; amount?: number }[] = []

    for (const m of members) {
      try {
        const outcome = await sweepMember(m, todayISO, financeTo)
        if (outcome) dunning.push({ name: m.name, ...outcome })
      } catch (err) {
        console.error("[cron/dunning] sweep failed for", m.name, err)
        dunning.push({ name: m.name, action: "error" })
      }
    }

    // ── 3. Lifecycle sweep ─────────────────────────────────────────────────
    // Automates the "no code does this" gaps: abandoned bookings (deposit never
    // paid), no-shows, and unpaid upfront rent. Each nudge fires at most once
    // per day per booking (claimDunningSweep guard, composite key).
    const lifecycle: { name: string; action: string }[] = []
    try {
      const bookings = await getPendingBookings()
      const opsTo = financeTo
      for (const b of bookings) {
        try {
          if (!b.guestName) continue
          const ageDays = -daysUntilISO((b.submittedAt || "").slice(0, 10), todayISO) // today − created
          const status = (b.status ?? "").toLowerCase()

          // (a) Abandoned: deposit never paid past the securing deadline →
          //     release the bed + cancel the booking so the room frees up.
          if (status.includes("deposit pending") && ageDays >= SECOND_PAYMENT_DUE_DAYS) {
            if (b.email) { try { await revertBedAllotmentByEmail(b.email, undefined) } catch { /* best-effort */ } }
            await markGuestStatus(b.notionPageId, "Cancelled")
            if (b.email) {
              await sendEmail({
                to: b.email,
                subject: "Your booking has expired — deposit not received",
                html: `<p>Hi ${b.guestName},</p><p>We didn't receive your deposit within ${SECOND_PAYMENT_DUE_DAYS} days, so your booking has been released and the bed reopened. If you'd still like to stay with us, please book again from your portal.</p><p>— The Hub team</p>`,
              })
            }
            lifecycle.push({ name: b.guestName, action: "abandoned booking released" })
            continue
          }

          if (status.includes("booking confirmed")) {
            // (b) No-show: check-in date passed (+grace) but the guest was never
            //     marked arrived. Flag ops — bed stays held until they clear it.
            if (b.checkInDate && daysUntilISO(b.checkInDate, todayISO) <= -NO_SHOW_GRACE_DAYS) {
              if (await claimDunningSweep(`${b.notionPageId}:noshow`, todayISO) && opsTo.length) {
                await sendEmail({
                  to: opsTo,
                  subject: `Possible no-show — ${b.guestName} (${b.room || "bed"})`,
                  html: `<p><strong>${b.guestName}</strong>'s check-in was <strong>${b.checkInDate}</strong> but they haven't been marked arrived. Confirm the no-show and release the bed if appropriate. No refund applies to a no-show.</p>`,
                })
                lifecycle.push({ name: b.guestName, action: "no-show flagged" })
              }
            }
            // (c) Upfront rent unpaid past the deadline (deposit paid, no rent
            //     payment in the ledger) → nudge ops to chase.
            else if (ageDays >= SECOND_PAYMENT_DUE_DAYS && b.email && !(await rentPaidByEmail(b.email))) {
              if (await claimDunningSweep(`${b.notionPageId}:upfront`, todayISO) && opsTo.length) {
                await sendEmail({
                  to: opsTo,
                  subject: `Upfront rent unpaid — ${b.guestName}`,
                  html: `<p><strong>${b.guestName}</strong> paid the deposit but the upfront rent hasn't landed ${ageDays} days on. Chase the guest or release the room per policy.</p>`,
                })
                lifecycle.push({ name: b.guestName, action: "upfront-rent chase" })
              }
            }
          }
        } catch (e) {
          console.error("[cron/lifecycle] failed for", b.guestName, e)
        }
      }
    } catch (e) {
      console.error("[cron/lifecycle] sweep failed:", e)
    }

    return NextResponse.json({ ok: true, scanned: checkouts.length, emailed: results.length, results, dunning, lifecycle })
  } catch (err) {
    console.error("[cron/extend-stay-reminders]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}

// One member's daily dunning step. Returns a summary for the cron response,
// or null when there's nothing to do for them today.
async function sweepMember(
  m: RentDunningMember,
  todayISO: string,
  financeTo: string[],
): Promise<{ action: string; amount?: number } | null> {
  // Double-run guard: if this member was already swept today (a second cron run
  // in the same IST day), skip so we don't double-email or double-reissue. The
  // paid-link backstop below is idempotent, but the reissue/email steps are not.
  if (!(await claimDunningSweep(m.pageId, todayISO))) return null

  // Paid-link backstop runs even for a DEFAULTED member: if the guest paid the
  // day-10 link but the webhook delivery failed, the tags/counter/pointer would
  // otherwise stay set forever, freezing a guest who has actually paid.
  if (m.dueLinkId) {
    const link = await fetchPaymentLink(m.property, m.dueLinkId)
    if (link?.status === "paid") {
      await clearRentDunningState(m.pageId) // cancels the link + drops tags
      return { action: "cleared (paid)" }
    }
    if (m.defaulted) return null // paid check done; frozen otherwise — ops settles
    if (!link) return null // transient fetch failure — retry tomorrow

    // ── Existing live, unpaid link: advance the timeline ───────────────────
    const rentMonth = link.notes["rent_month"] || todayISO.slice(0, 7)
    const base = m.dueBase ?? m.monthlyRate
    const step = dunningDay(todayISO, rentMonth)
    if (!step || base <= 0) return null // rent month hasn't started
    const tone = toneFor(step.day)
    const rentMonthLabel = new Date(rentMonth + "-01T00:00:00").toLocaleString("en-IN", { month: "long", year: "numeric" })

    // Through the 3rd: same link, daily nudge only.
    if (tone === "due") {
      if (m.email) {
        const mail = dunningEmail({ tone, name: m.name, base, fee: 0, total: base, url: link.short_url, rentMonthLabel })
        await sendEmail({ to: m.email, ...mail })
      }
      return { action: "reminded", amount: base }
    }

    // 4th onwards: reissue at base + today's fee. Create the fresh link FIRST,
    // then cancel yesterday's — so a create failure never leaves the guest with
    // no payable link, and if we can't persist the new pointer we cancel the
    // fresh link rather than orphan it (a stale live link the sweep can't find).
    const total = base + step.fee
    if (!m.phone) return { action: "skipped (no phone)" }
    const fresh = await createRentPaymentLink({
      property: m.property,
      guestName: m.name,
      email: m.email ?? "",
      phone: m.phone,
      amount: total,
      description: `Overdue Rent ${inr(base)} + Late Fee ${inr(step.fee)} (${step.feeDays} day${step.feeDays === 1 ? "" : "s"} @ ${inr(LATE_FEE_PER_DAY)}/day) — ${rentMonthLabel}`,
      notionPageId: m.pageId,
      rentMonth,
    })
    const stored = await setDueRentLink(m.pageId, fresh.id, base)
    if (!stored) {
      // Can't track the new link — cancel it and keep yesterday's live so we
      // don't accumulate an untracked link. Alert finance to reissue manually.
      await cancelPaymentLink(m.property, fresh.id)
      if (financeTo.length) {
        await sendEmail({
          to: financeTo,
          subject: `Dunning link tracking failed — ${m.name} (${m.property})`,
          html: `<p>Could not persist the dunning link pointer for <strong>${m.name}</strong> (missing "Due Rent Link ID" / "Due Rent Base (₹)" property?). Reissue manually from the admin payments page.</p>`,
        })
      }
      return { action: "skipped (link pointer not persisted)" }
    }
    await cancelPaymentLink(m.property, m.dueLinkId)
    if (m.email) {
      const mail = dunningEmail({ tone, name: m.name, base, fee: step.fee, total, url: fresh.short_url, rentMonthLabel })
      await sendEmail({ to: m.email, ...mail })
    }

    if (tone === "default") {
      await markRentDefaulted(m.pageId)
      if (financeTo.length) {
        await sendEmail({
          to: financeTo,
          subject: `RENT DEFAULT — ${m.name} (${m.property}) — vacate notice sent`,
          html: `<p><strong>${m.name}</strong> has not paid rent for ${rentMonthLabel} by the 10th.</p>
<p>Automatic actions taken: vacate notice emailed to the guest, security deposit marked forfeited per terms, page tagged "Rent Defaulted".</p>
<p>Outstanding: rent ${inr(base)} + late fees ${inr(step.fee)} = <strong>${inr(total)}</strong>. Link: <a href="${fresh.short_url}">${fresh.short_url}</a></p>
<p>Please coordinate the check-out and final settlement.</p>`,
        })
      }
      return { action: "defaulted (vacate notice)", amount: total }
    }
    return { action: `reissued (${tone})`, amount: total }
  }

  // A defaulted member with no live link is frozen — ops settles at checkout.
  // (Guard needed now that the top-level defaulted early-return was removed so
  // the paid-link backstop above can still run.)
  if (m.defaulted) return null

  // ── No live link: does one need to be created? ───────────────────────────
  // (a) Webhook opened an overdue episode but couldn't store the link id
  //     (missing Notion property / legacy escalation): adopt it now.
  if (m.overdue) {
    if (!m.phone || m.monthlyRate <= 0) return { action: "skipped (no phone/rate)" }
    const rentMonth = todayISO.slice(0, 7)
    const step = dunningDay(todayISO, rentMonth)!
    const total = m.monthlyRate + step.fee
    const rentMonthLabel = new Date(rentMonth + "-01T00:00:00").toLocaleString("en-IN", { month: "long", year: "numeric" })
    const fresh = await createRentPaymentLink({
      property: m.property,
      guestName: m.name,
      email: m.email ?? "",
      phone: m.phone,
      amount: total,
      description: step.fee > 0
        ? `Overdue Rent ${inr(m.monthlyRate)} + Late Fee ${inr(step.fee)} — ${rentMonthLabel}`
        : `Overdue Rent ${inr(m.monthlyRate)} — ${rentMonthLabel}`,
      notionPageId: m.pageId,
      rentMonth,
    })
    await setDueRentLink(m.pageId, fresh.id, m.monthlyRate)
    if (m.email) {
      const mail = dunningEmail({ tone: toneFor(step.day), name: m.name, base: m.monthlyRate, fee: step.fee, total, url: fresh.short_url, rentMonthLabel })
      await sendEmail({ to: m.email, ...mail })
    }
    return { action: "adopted overdue episode", amount: total }
  }

  // (b) Final pro-rated month of a mid-month check-out: create the link from
  //     3 days before that month starts. Any later day catches up too (the
  //     amount then includes the fee already accrued).
  if (!m.checkOut || m.monthlyRate <= 0) return null
  const schedule = computeRentSchedule(m.checkIn ?? m.checkOut, m.checkOut, m.monthlyRate)
  const finalMonth = schedule.finalMonth
  if (!finalMonth) return null
  const windowStart = addDays(finalMonth.fromISO, -3)
  if (todayISO < windowStart || todayISO > finalMonth.toISO) return null
  if (!m.phone) return { action: "skipped (no phone)" }

  const rentMonth = finalMonth.fromISO.slice(0, 7)
  const step = dunningDay(todayISO, rentMonth)
  const fee = step?.fee ?? 0
  const total = finalMonth.amount + fee
  const description = describeRentMonths([finalMonth], m.monthlyRate) + (fee > 0 ? ` + Late Fee ${inr(fee)}` : "")

  const fresh = await createRentPaymentLink({
    property: m.property,
    guestName: m.name,
    email: m.email ?? "",
    phone: m.phone,
    amount: total,
    description,
    notionPageId: m.pageId,
    rentMonth,
  })
  await setDueRentLink(m.pageId, fresh.id, finalMonth.amount)
  if (m.email) {
    await sendEmail({
      to: m.email,
      subject: `Your final month's rent — pro-rated to your check-out`,
      html: `<p>Hi ${m.name},</p>
<p>Since you're checking out on <strong>${fmtDate(m.checkOut)}</strong>, your last month is pro-rated:
<strong>${fmtDate(finalMonth.fromISO)} – ${fmtDate(finalMonth.toISO)}</strong> (${finalMonth.days} days,
${ordinal(parseInt(finalMonth.fromISO.slice(8, 10), 10))}–${ordinal(parseInt(finalMonth.toISO.slice(8, 10), 10))}) =
<strong>${inr(finalMonth.amount)}</strong>${fee > 0 ? ` plus ${inr(fee)} late fee already accrued` : ""}. No auto-debit will run for this month.</p>
<p>Please pay using this link${fee > 0 ? " today" : " before the 1st"}: <a href="${fresh.short_url}">${fresh.short_url}</a></p>
<p>Rent is payable without late fee up to the 3rd; from the 4th a late fee of ${inr(LATE_FEE_PER_DAY)}/day applies.</p>
<p>— The Hub team</p>`,
    })
  }
  return { action: "final-month link created", amount: total }
}
