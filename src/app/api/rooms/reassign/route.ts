import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import { reassignBed, findBedPageId, markSubscriptionCreated, BedOccupiedError } from "@/lib/notion"
import { createDepositLink, createRentSubscription, cancelSubscription } from "@/lib/razorpay"
import { computeRentSchedule } from "@/lib/rent-schedule"
import { istTodayISO } from "@/lib/stay"
import { requireAdminApi, authErrorResponse } from "@/lib/auth/api-guards"

export const dynamic = "force-dynamic"

function getNumber(page: PageObjectResponse, key: string): number | null {
  const p = page.properties[key]
  if (p?.type === "number") return p.number ?? null
  return null
}

function getRichText(page: PageObjectResponse, key: string): string {
  const p = page.properties[key]
  if (p?.type === "rich_text") return p.rich_text.map((t) => t.plain_text).join("").trim()
  return ""
}

function getDate(page: PageObjectResponse, key: string): string | null {
  const p = page.properties[key]
  return p?.type === "date" ? (p.date?.start ?? null) : null
}

export async function POST(req: Request) {
  try {
    await requireAdminApi()

    const {
      oldBedPageId,
      property,
      newRoom,
      newBed,
      newRoomLabel,
      formPageId,
      oldMonthlyRate,
      newMonthlyRate,
      guestName,
      guestEmail,
      guestPhone,
      sendDepositDiff,
    } = await req.json()

    if (!oldBedPageId || !property || !newRoom) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const newBedPageId = await findBedPageId(property, newRoom, newBed ?? null)
    if (!newBedPageId) {
      return NextResponse.json({ error: `Room ${newRoom}${newBed ? ` Bed ${newBed}` : ""} not found in ${property}` }, { status: 404 })
    }

    if (newBedPageId === oldBedPageId) {
      return NextResponse.json({ error: "New room is the same as the current room" }, { status: 400 })
    }

    // Read new bed to determine its tariff if not provided
    const notion = new Client({ auth: process.env.NOTION_TOKEN })
    const newPage = await notion.pages.retrieve({ page_id: newBedPageId }) as PageObjectResponse
    const newBedRate = newMonthlyRate
      ?? getNumber(newPage, "Deposit Amount (₹)")
      ?? getNumber(newPage, "Tariff with GST")
      ?? 0

    const depositDiff = oldMonthlyRate && newBedRate > oldMonthlyRate
      ? newBedRate - oldMonthlyRate
      : 0

    // Read the old bed's dates + subscription id BEFORE the move (reassignBed
    // copies them to the new bed, but we want them regardless of ordering).
    const oldPage = await notion.pages.retrieve({ page_id: oldBedPageId }) as PageObjectResponse
    const checkOut = getDate(oldPage, "Check Out Date ")
    const oldSubId = getRichText(oldPage, "Razorpay Subscription ID")

    await reassignBed({
      oldBedPageId,
      newBedPageId,
      newRoomLabel: newRoomLabel ?? `Room ${newRoom}${newBed ? ` · Bed ${newBed}` : ""}`,
      property,
      formPageId,
    })

    // Update the auto-debit mandate to the new rate: the old subscription keeps
    // debiting the OLD amount forever otherwise. Cancel it and create a fresh
    // mandate at the new rate for the full months remaining to check-out (the
    // partial move-month is settled by the room-move credit/top-up, not here).
    let mandateUpdated: string | null = null
    if (oldSubId && newBedRate > 0 && oldMonthlyRate && newBedRate !== oldMonthlyRate && (guestEmail || guestPhone)) {
      try {
        await cancelSubscription(property, oldSubId)
        const sched = checkOut ? computeRentSchedule(istTodayISO(), checkOut, newBedRate) : null
        if (sched?.subscription) {
          const sub = await createRentSubscription({
            property,
            guestName: guestName ?? "Guest",
            email: guestEmail ?? "",
            phone: guestPhone ?? "",
            monthlyRate: newBedRate,
            startISO: sched.subscription.startISO,
            totalCount: sched.subscription.cycles,
          })
          await markSubscriptionCreated(newBedPageId, sub.id)
          mandateUpdated = sub.id
        }
      } catch (e) {
        console.error("[reassign] mandate update failed — old mandate cancelled, recreate manually:", e)
      }
    }

    // If rates differ and admin wants a deposit top-up link, generate one
    let depositDiffLink: string | null = null
    if (sendDepositDiff && depositDiff > 0 && guestName && (guestEmail || guestPhone)) {
      try {
        const reqUrl = new URL(req.url)
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `${reqUrl.protocol}//${reqUrl.host}`
        const link = await createDepositLink({
          property,
          guestName,
          email: guestEmail ?? "",
          phone: guestPhone ?? "",
          amount: depositDiff,
          notionPageId: newBedPageId,
          callbackUrl: `${baseUrl}/admin/payments`,
        })
        depositDiffLink = link.short_url
      } catch (e) {
        console.warn("[reassign] deposit diff link failed:", e)
      }
    }

    return NextResponse.json({ ok: true, newBedPageId, depositDiff, depositDiffLink, newBedRate, mandateUpdated })
  } catch (e) {
    const authRes = authErrorResponse(e)
    if (authRes) return authRes
    if (e instanceof BedOccupiedError) {
      return NextResponse.json({ error: `Target bed is already occupied: ${e.message}` }, { status: 409 })
    }
    console.error("[api/rooms/reassign]", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "Reassign failed" }, { status: 500 })
  }
}
