import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import { reassignBed, findBedPageId, BedOccupiedError } from "@/lib/notion"
import { createDepositLink } from "@/lib/razorpay"

export const dynamic = "force-dynamic"

function getNumber(page: PageObjectResponse, key: string): number | null {
  const p = page.properties[key]
  if (p?.type === "number") return p.number ?? null
  return null
}

export async function POST(req: Request) {
  try {
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

    await reassignBed({
      oldBedPageId,
      newBedPageId,
      newRoomLabel: newRoomLabel ?? `Room ${newRoom}${newBed ? ` · Bed ${newBed}` : ""}`,
      property,
      formPageId,
    })

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

    return NextResponse.json({ ok: true, newBedPageId, depositDiff, depositDiffLink, newBedRate })
  } catch (e) {
    if (e instanceof BedOccupiedError) {
      return NextResponse.json({ error: `Target bed is already occupied: ${e.message}` }, { status: 409 })
    }
    console.error("[api/rooms/reassign]", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "Reassign failed" }, { status: 500 })
  }
}
