import { NextResponse } from "next/server"
import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import { findMemberPageByEmail, getRooms, checkInGuest, markSubscriptionCreated, BedOccupiedError } from "@/lib/notion"
import { createRentSubscription, createProRatedLink, createDepositLink } from "@/lib/razorpay"
import { computeRentSchedule, describeRentMonths, type RentSchedule } from "@/lib/rent-schedule"
import { STAY_DURATIONS, checkoutForDuration, extendStayWindowOpen, EXTEND_STAY_WINDOW_DAYS, exceedsMaxStay, maxStayCheckoutISO, MAX_STAY_MONTHS, type StayDurationKey } from "@/lib/stay"
import { rateForTier } from "@/lib/pricing"
import { sendEmail } from "@/lib/email"
import { requirePortalGuest, authErrorResponse } from "@/lib/auth/api-guards"
import type { Property, Room } from "@/lib/types"

export const dynamic = "force-dynamic"

// Stay extension — treated as a FRESH booking with a fresh contract:
//   · the guest picks one of the standard durations (1w/1m/2m/3m/4m) starting
//     from their current booked check-out date
//   · the same rent schedule applies to the added period: pro-rated/upfront
//     months by payment link now, fully-covered months via a NEW auto-debit
//     subscription, a partial final month by link closer to the date (cron)
//   · the security deposit carries forward and is mapped to the new contract;
//     moving to a pricier room adds a deposit top-up link for the difference
//   · same room if it's free for the extension window, otherwise the guest
//     picks from currently-available beds
//
// GET  ?email=&duration=  → availability + payment-plan preview
// POST { email, duration, room: "same" | { roomNumber, bedLabel }, acceptTerms }

const GUEST_DB_ID = "2d969190-ee9b-8025-a11b-dc5da277447f"

function getText(page: PageObjectResponse, prop: string): string {
  const p = page.properties[prop]
  if (p?.type === "rich_text") return p.rich_text.map((t) => t.plain_text).join("")
  if (p?.type === "title") return p.title.map((t) => t.plain_text).join("")
  return ""
}

function getDateProp(page: PageObjectResponse, prop: string): string | null {
  const p = page.properties[prop]
  return p?.type === "date" ? (p.date?.start ?? null) : null
}

function getSelectProp(page: PageObjectResponse, prop: string): string | null {
  const p = page.properties[prop]
  return p?.type === "select" ? (p.select?.name ?? null) : null
}

function getNumberProp(page: PageObjectResponse, prop: string): number | null {
  const p = page.properties[prop]
  return p?.type === "number" ? p.number : null
}

type MemberContext = {
  memberPage: PageObjectResponse
  property: Property
  name: string
  phone: string
  gender: "male" | "female"
  roomLabel: string       // e.g. "316" (select on the room board)
  currentRate: number
  checkIn: string | null
  oldCheckOut: string
  hasDueRentLink: boolean // final-month stub already issued by the dunning cron
}

async function loadMember(email: string): Promise<MemberContext | { error: string; status: number }> {
  const memberPage = await findMemberPageByEmail(email)
  if (!memberPage) return { error: "We couldn't find your active stay. Please contact the office.", status: 404 }

  const oldCheckOut = getDateProp(memberPage, "Check Out Date ")
  if (!oldCheckOut) return { error: "Your booking has no end date on record — please contact the office to extend.", status: 422 }

  // Self-serve extension only opens once the 14-day "check-out coming up"
  // reminder has gone out — never earlier in the tenancy. Mirrors the cron's
  // reminder trigger via the shared EXTEND_STAY_WINDOW_DAYS constant.
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
  if (!extendStayWindowOpen(oldCheckOut, todayISO)) {
    return {
      error: `Extensions open ${EXTEND_STAY_WINDOW_DAYS} days before your check-out date. Check back closer to then, or contact the office.`,
      status: 403,
    }
  }

  const phoneProp = memberPage.properties["Phone"]
  const phone = phoneProp?.type === "phone_number" ? (phoneProp.phone_number ?? "") : ""
  const currentRate =
    getNumberProp(memberPage, "Monthly Rent") ??
    getNumberProp(memberPage, "Tariff") ??
    getNumberProp(memberPage, "Deposit Amount (₹)") ??
    0
  if (currentRate <= 0) return { error: "Your monthly rate isn't on record — please contact the office to extend.", status: 422 }

  // No extensions while a rent-dunning episode is open — paying the extension
  // link would otherwise clear the dunning state while the older debt link is
  // still unpaid. Clear dues first, then extend.
  const tagsProp = memberPage.properties["Tags"]
  const tags = tagsProp?.type === "multi_select" ? tagsProp.multi_select.map((t) => t.name) : []
  const hasOpenDues = tags.includes("Rent Overdue") || tags.includes("Rent Defaulted") || getText(memberPage, "Due Rent Link ID").trim().length > 0
  if (hasOpenDues) {
    return { error: "You have an outstanding rent payment. Please clear it (check your email for the payment link) before extending your stay.", status: 409 }
  }

  return {
    memberPage,
    property: "safina-plaza",
    name: getText(memberPage, "Member Name"),
    phone,
    gender: (getSelectProp(memberPage, "Gender") ?? "Male").toLowerCase() === "female" ? "female" : "male",
    roomLabel: getSelectProp(memberPage, "Room") ?? "",
    currentRate,
    checkIn: getDateProp(memberPage, "Check In Date"),
    oldCheckOut,
    hasDueRentLink: getText(memberPage, "Due Rent Link ID").trim().length > 0,
  }
}

// The original tenancy's pro-rated final-month stub (e.g. May 1–19 for a
// 20 May check-out), if the dunning cron hasn't issued its link yet. Once the
// check-out date moves, the cron would never see this stub again — so an
// extension must collect it upfront alongside the extension rent.
function uncollectedPriorStub(ctx: MemberContext) {
  if (ctx.hasDueRentLink || !ctx.checkIn) return null
  return computeRentSchedule(ctx.checkIn, ctx.oldCheckOut, ctx.currentRate).finalMonth
}

// A bed offered for the extension window.
type BedOption = {
  roomNumber: string
  bedLabel: string | null
  label: string
  monthlyRate: number
  type: "sharing" | "private"
}

function bedRate(room: Room): number {
  return (room.roomTier ? rateForTier(room.property, room.roomTier) : 0) || room.monthlyRate || 0
}

// Is the guest's own bed claimed by another booking during [from, to)?
// Future bookings live in the Guest Info DB with a "Room 316 · Bed A"-style
// Room text and a Check In Date; any non-cancelled booking whose check-in
// falls inside the window means the bed is promised to someone else.
async function ownBedConflicts(email: string, roomLabel: string, from: string, to: string): Promise<boolean> {
  if (!roomLabel) return false
  try {
    // Direct REST query — the guest DB is shared via a standard integration
    // (database id, not a data source), same pattern as lib/notion queryDatabase.
    const res = await fetch(`https://api.notion.com/v1/databases/${GUEST_DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: { property: "Check In Date", date: { on_or_after: from } },
        page_size: 100,
      }),
    })
    const data = await res.json() as { results?: PageObjectResponse[] }
    for (const p of data.results ?? []) {
      if (!isFullPage(p)) continue
      const page = p as PageObjectResponse
      const checkIn = getDateProp(page, "Check In Date")
      if (!checkIn || checkIn >= to) continue
      const status = (getSelectProp(page, "Status") ?? "").toLowerCase()
      if (status.includes("cancel")) continue
      const emailProp = page.properties["✉️ Email"]
      const bookingEmail = emailProp?.type === "email" ? (emailProp.email ?? "") : ""
      if (bookingEmail.trim().toLowerCase() === email.trim().toLowerCase()) continue
      const roomText = getText(page, "Room")
      const roomNum = roomLabel.match(/\d+/)?.[0]
      if (roomNum && roomText.includes(roomNum)) return true
    }
  } catch (e) {
    console.warn("[portal/extend-stay] own-bed conflict check failed (assuming free):", e)
  }
  return false
}

async function listAlternatives(gender: "male" | "female", excludeRoomLabel: string): Promise<BedOption[]> {
  const rooms = await getRooms()
  const options: BedOption[] = []
  const excludeNum = excludeRoomLabel.match(/\d+/)?.[0]
  for (const room of rooms) {
    if (room.isBlocked) continue
    if (excludeNum && room.number === excludeNum) continue
    for (const bed of room.beds) {
      if (bed.status !== "vacant") continue
      // Sharing rooms: only offer beds whose current roommate matches the guest's gender.
      if (room.type === "sharing") {
        const sibling = room.beds.find((b) => b.bedNumber !== bed.bedNumber)
        const siblingOccupied = sibling && sibling.status !== "vacant"
        if (siblingOccupied && sibling.genderRestriction !== gender) continue
      }
      const bedLabel = room.type === "sharing" ? (bed.bedNumber === 1 ? "A" : "B") : null
      options.push({
        roomNumber: room.number,
        bedLabel,
        label: `Room ${room.number}${bedLabel ? ` · Bed ${bedLabel}` : ""}`,
        monthlyRate: bedRate(room),
        type: room.type,
      })
    }
  }
  return options.filter((o) => o.monthlyRate > 0)
}

function schedulePreview(schedule: RentSchedule) {
  return {
    upfront: schedule.upfront.map((m) => ({ label: m.monthLabel, fromISO: m.fromISO, toISO: m.toISO, days: m.days, full: m.full, amount: m.amount })),
    upfrontAmount: schedule.upfrontAmount,
    subscription: schedule.subscription,
    finalMonth: schedule.finalMonth
      ? { fromISO: schedule.finalMonth.fromISO, toISO: schedule.finalMonth.toISO, days: schedule.finalMonth.days, amount: schedule.finalMonth.amount }
      : null,
  }
}

export async function GET(req: Request) {
  try {
    // Use the authenticated session email — never the query param — so a guest
    // can only preview/act on their OWN stay.
    const { email } = await requirePortalGuest()
    const url = new URL(req.url)
    const duration = (url.searchParams.get("duration") ?? "") as StayDurationKey
    if (!STAY_DURATIONS.some((d) => d.key === duration)) {
      return NextResponse.json({ error: "Invalid duration" }, { status: 400 })
    }

    const ctx = await loadMember(email)
    if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })

    const newCheckOut = checkoutForDuration(ctx.oldCheckOut, duration)

    // Enforce the hard 4-month cap per tenancy — beyond it the guest must
    // re-apply (fresh contract; deposit carries forward).
    if (ctx.checkIn && exceedsMaxStay(ctx.checkIn, newCheckOut)) {
      return NextResponse.json({
        error: `A single stay is capped at ${MAX_STAY_MONTHS} months (through ${maxStayCheckoutISO(ctx.checkIn)}). To stay longer you'll need to re-apply — your deposit carries forward.`,
        capped: true,
      }, { status: 409 })
    }
    const conflict = await ownBedConflicts(email, ctx.roomLabel, ctx.oldCheckOut, newCheckOut)
    const alternatives = conflict ? await listAlternatives(ctx.gender, ctx.roomLabel) : []
    const priorStub = uncollectedPriorStub(ctx)

    return NextResponse.json({
      ok: true,
      oldCheckOut: ctx.oldCheckOut,
      newCheckOut,
      priorStub: priorStub
        ? { fromISO: priorStub.fromISO, toISO: priorStub.toISO, days: priorStub.days, amount: priorStub.amount }
        : null,
      sameRoom: {
        available: !conflict,
        label: ctx.roomLabel ? `Room ${ctx.roomLabel}` : "your current room",
        monthlyRate: ctx.currentRate,
        schedule: schedulePreview(computeRentSchedule(ctx.oldCheckOut, newCheckOut, ctx.currentRate)),
        depositTopUp: 0,
      },
      alternatives: alternatives.map((o) => ({
        ...o,
        schedule: schedulePreview(computeRentSchedule(ctx.oldCheckOut, newCheckOut, o.monthlyRate)),
        depositTopUp: Math.max(0, o.monthlyRate - ctx.currentRate),
      })),
    })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[portal/extend-stay GET]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { email } = await requirePortalGuest()
    const { duration, room, acceptTerms } = await req.json() as {
      duration: StayDurationKey
      room: "same" | { roomNumber: string; bedLabel: string | null }
      acceptTerms: boolean
    }
    if (!STAY_DURATIONS.some((d) => d.key === duration) || !room) {
      return NextResponse.json({ error: "Missing duration or room" }, { status: 400 })
    }
    if (!acceptTerms) {
      return NextResponse.json({ error: "Please accept the Terms & Conditions — an extension is a fresh contract." }, { status: 400 })
    }

    const ctx = await loadMember(email)
    if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
    if (!ctx.phone) return NextResponse.json({ error: "No phone number on record — payment links need one. Please contact the office." }, { status: 422 })

    const newCheckOut = checkoutForDuration(ctx.oldCheckOut, duration)

    // Hard 4-month cap per tenancy (same guard as GET, re-checked server-side).
    if (ctx.checkIn && exceedsMaxStay(ctx.checkIn, newCheckOut)) {
      return NextResponse.json({
        error: `A single stay is capped at ${MAX_STAY_MONTHS} months. To stay longer you'll need to re-apply — your deposit carries forward.`,
        capped: true,
      }, { status: 409 })
    }

    // Re-validate availability server-side (never trust the preview).
    let rate = ctx.currentRate
    let roomChosen = ctx.roomLabel ? `Room ${ctx.roomLabel}` : "current room"
    let targetBed: BedOption | null = null
    if (room === "same") {
      if (await ownBedConflicts(email, ctx.roomLabel, ctx.oldCheckOut, newCheckOut)) {
        return NextResponse.json({ error: "Your room is booked by someone else for those dates — please pick another available room." }, { status: 409 })
      }
    } else {
      const options = await listAlternatives(ctx.gender, ctx.roomLabel)
      targetBed = options.find((o) => o.roomNumber === room.roomNumber && (o.bedLabel ?? null) === (room.bedLabel ?? null)) ?? null
      if (!targetBed) {
        return NextResponse.json({ error: "That room is no longer available — please pick another." }, { status: 409 })
      }
      rate = targetBed.monthlyRate
      roomChosen = targetBed.label
    }
    const depositTopUp = Math.max(0, rate - ctx.currentRate)

    // Payment plan for the added period [old check-out, new check-out).
    const schedule = computeRentSchedule(ctx.oldCheckOut, newCheckOut, rate)
    const reqUrl = new URL(req.url)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `${reqUrl.protocol}//${reqUrl.host}`

    // 1 — upfront rent link (due now to confirm the extension). Any
    // still-uncollected final-month stub of the ORIGINAL tenancy rides along:
    // once the check-out date moves, the cron can no longer see that stub.
    const priorStub = uncollectedPriorStub(ctx)
    const upfrontTotal = schedule.upfrontAmount + (priorStub?.amount ?? 0)
    let rentLink: { id: string; short_url: string } | null = null
    if (upfrontTotal > 0) {
      const parts = [
        ...(priorStub ? [describeRentMonths([priorStub], ctx.currentRate)] : []),
        ...(schedule.upfrontAmount > 0 ? [describeRentMonths(schedule.upfront, rate)] : []),
      ]
      rentLink = await createProRatedLink({
        property: ctx.property,
        guestName: ctx.name,
        email,
        phone: ctx.phone,
        amount: upfrontTotal,
        description: `Stay extension — ${parts.join(" + ")}`,
        notionPageId: ctx.memberPage.id,
        callbackUrl: `${baseUrl}/portal/dashboard`,
      })
    }

    // 2 — deposit top-up when moving to a pricier room (deposit stays = 1 month's current rent)
    let depositLink: { id: string; short_url: string } | null = null
    if (depositTopUp > 0) {
      depositLink = await createDepositLink({
        property: ctx.property,
        guestName: ctx.name,
        email,
        phone: ctx.phone,
        amount: depositTopUp,
        notionPageId: ctx.memberPage.id,
        callbackUrl: `${baseUrl}/portal/dashboard`,
      })
    }

    // 3 — fresh auto-debit subscription for the extension's fully-covered months
    let subscriptionId: string | undefined
    let subscriptionUrl: string | undefined
    if (schedule.subscription) {
      const sub = await createRentSubscription({
        property: ctx.property,
        guestName: ctx.name,
        email,
        phone: ctx.phone,
        monthlyRate: rate,
        startISO: schedule.subscription.startISO,
        totalCount: schedule.subscription.cycles,
      })
      subscriptionId = sub.id
      subscriptionUrl = sub.short_url
      await markSubscriptionCreated(ctx.memberPage.id, sub.id)
    }

    const notion = new Client({ auth: process.env.NOTION_TOKEN })

    // 4 — room change: hold the new bed from the extension start (same pattern
    // as a future-dated booking); ops physically moves the guest on the day.
    let bedHoldDeferred = false
    if (targetBed) {
      try {
        const { findBedPageId } = await import("@/lib/notion")
        const newBedPageId = await findBedPageId(ctx.property, targetBed.roomNumber, targetBed.bedLabel)
        if (newBedPageId) {
          await checkInGuest({
            notionPageId: newBedPageId,
            property: ctx.property,
            guestName: ctx.name,
            gender: ctx.gender,
            phone: ctx.phone,
            email,
            checkInDate: ctx.oldCheckOut,
            checkOutDate: newCheckOut,
            monthlyRate: rate,
          })
        }
      } catch (e) {
        if (e instanceof BedOccupiedError) {
          bedHoldDeferred = true
          console.warn("[portal/extend-stay] new bed hold deferred:", e.message)
        } else throw e
      }
    } else {
      // Same room: simply push the member's check-out date out.
      await notion.pages.update({
        page_id: ctx.memberPage.id,
        properties: { "Check Out Date ": { date: { start: newCheckOut } } },
      })
    }

    // 5 — contract record: append the extension terms-acceptance to the page.
    const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
    try {
      await notion.blocks.children.append({
        block_id: ctx.memberPage.id,
        children: [{
          object: "block",
          type: "paragraph",
          paragraph: {
            rich_text: [{
              type: "text",
              text: {
                content:
                  `🔁 Stay extension (fresh contract): ${ctx.oldCheckOut} → ${newCheckOut} (${duration}), ${roomChosen} @ ₹${rate.toLocaleString("en-IN")}/mo. ` +
                  `T&C accepted via guest portal on ${todayISO}. Security deposit carried forward to this contract` +
                  (depositTopUp > 0 ? ` + ₹${depositTopUp.toLocaleString("en-IN")} top-up link issued` : "") +
                  `. Rent link: ${rentLink?.id ?? "n/a"}; subscription: ${subscriptionId ?? "none (covered by links)"}.`,
              },
            }],
          },
        }],
      })
    } catch (e) { console.warn("[portal/extend-stay] extension note append failed:", e) }

    // 6 — confirmation email with the payment plan
    try {
      const fmt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      const lines: string[] = []
      if (rentLink) {
        const stubNote = priorStub ? `${describeRentMonths([priorStub], ctx.currentRate)} + ` : ""
        lines.push(`<li>${stubNote}${describeRentMonths(schedule.upfront, rate)} — <strong>₹${upfrontTotal.toLocaleString("en-IN")}</strong>: <a href="${rentLink.short_url}">pay now</a></li>`)
      }
      if (depositLink) lines.push(`<li>Security deposit top-up (new room rate) — <strong>₹${depositTopUp.toLocaleString("en-IN")}</strong>: <a href="${depositLink.short_url}">pay now</a></li>`)
      if (subscriptionUrl && schedule.subscription) lines.push(`<li>Auto-debit mandate for ${schedule.subscription.cycles} month${(schedule.subscription.cycles ?? 0) > 1 ? "s" : ""} from ${fmt(schedule.subscription.startISO)} — <a href="${subscriptionUrl}">authorise here</a></li>`)
      if (schedule.finalMonth) lines.push(`<li>Final pro-rated month (${fmt(schedule.finalMonth.fromISO)} – ${fmt(schedule.finalMonth.toISO)}, ₹${schedule.finalMonth.amount.toLocaleString("en-IN")}) — payment link arrives before that month starts</li>`)
      await sendEmail({
        to: email,
        subject: `Stay extension confirmed — new check-out ${fmt(newCheckOut)}`,
        html: `<p>Hi ${ctx.name},</p>
<p>Your stay extension is confirmed as a fresh contract: <strong>${roomChosen}</strong>, ${fmt(ctx.oldCheckOut)} → <strong>${fmt(newCheckOut)}</strong> at ₹${rate.toLocaleString("en-IN")}/mo. Your security deposit carries forward to this contract.</p>
<ul>${lines.join("")}</ul>
<p>— The Hub team</p>`,
      })
    } catch (e) { console.warn("[portal/extend-stay] confirmation email failed:", e) }

    return NextResponse.json({
      ok: true,
      newCheckOut,
      roomChosen,
      monthlyRate: rate,
      rentLink: rentLink?.short_url ?? null,
      rentAmount: upfrontTotal,
      priorStub: priorStub ? { fromISO: priorStub.fromISO, toISO: priorStub.toISO, amount: priorStub.amount } : null,
      depositTopUp,
      depositLink: depositLink?.short_url ?? null,
      subscriptionUrl: subscriptionUrl ?? null,
      subscriptionStart: schedule.subscription?.startISO ?? null,
      subscriptionCycles: schedule.subscription?.cycles ?? null,
      finalMonth: schedule.finalMonth ? { fromISO: schedule.finalMonth.fromISO, toISO: schedule.finalMonth.toISO, amount: schedule.finalMonth.amount } : null,
      bedHoldDeferred,
    })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[portal/extend-stay POST]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to extend stay" }, { status: 500 })
  }
}
