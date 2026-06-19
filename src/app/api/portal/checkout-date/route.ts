import { NextResponse } from "next/server"
import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import { findConflictingBookingsOnRoom } from "@/lib/notion"

export const dynamic = "force-dynamic"

async function queryByEmail(notion: Client, dataSourceId: string, email: string): Promise<PageObjectResponse | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (notion.dataSources as any).query({
    data_source_id: dataSourceId,
    filter: { property: "Email", email: { equals: email } },
    page_size: 1,
  })
  for (const p of res.results) {
    if (isFullPage(p)) return p
  }
  return null
}

export async function PATCH(req: Request) {
  try {
    const { notionPageId, checkOutDate } = await req.json()

    if (!notionPageId || !checkOutDate) {
      return NextResponse.json({ error: "Missing notionPageId or checkOutDate" }, { status: 400 })
    }

    // Validate: must be at least 1 calendar month from today
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const minNoticeDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate())
    const requested = new Date(checkOutDate)

    if (requested < minNoticeDate) {
      return NextResponse.json({
        error: `Notice period is 1 calendar month. Earliest check-out date is ${minNoticeDate.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`,
      }, { status: 400 })
    }

    const notion = new Client({ auth: process.env.NOTION_TOKEN })

    // Read the existing page to get the check-in date
    const page = await notion.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse

    // Conflict check: look for any other active booking on the same room
    // whose check-in date falls within the extended window.
    const roomProp = page.properties["Room"]
    const roomText = roomProp?.type === "rich_text"
      ? roomProp.rich_text.map((r: { plain_text: string }) => r.plain_text).join("").trim()
      : null

    const existingCheckoutProp = page.properties["Check Out Date "] ?? page.properties["Check Out Date"]
    const existingCheckout = existingCheckoutProp?.type === "date" ? (existingCheckoutProp.date?.start ?? null) : null

    if (roomText && existingCheckout && checkOutDate > existingCheckout) {
      const conflicts = await findConflictingBookingsOnRoom({
        room: roomText,
        afterDate: existingCheckout,
        beforeDate: checkOutDate,
        excludePageId: notionPageId,
      })
      if (conflicts.length > 0) {
        return NextResponse.json({
          error: `Your room has an upcoming booking that starts before your requested check-out date, so we can't extend this stay automatically. Please contact the office — we'll do our best to find you another room.`,
          conflict: true,
        }, { status: 409 })
      }
    }

    // Build the update only from properties that actually exist on this page, so
    // a renamed/missing property never fails the whole request. The estimated
    // range carries the check-in start; we also set the dedicated check-out date.
    const RANGE_PROP = "📅 Check-in & Check-out Date (Estimated)"
    const existingRange = page.properties[RANGE_PROP]
    const checkInStart = existingRange?.type === "date" ? (existingRange.date?.start ?? checkOutDate) : checkOutDate

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateProps: Record<string, any> = {}
    if (existingRange?.type === "date") {
      updateProps[RANGE_PROP] = { date: { start: checkInStart, end: checkOutDate } }
    }
    // Dedicated check-out date field (trailing space matches the schema).
    if (page.properties["Check Out Date "]?.type === "date") {
      updateProps["Check Out Date "] = { date: { start: checkOutDate } }
    } else if (page.properties["Check Out Date"]?.type === "date") {
      updateProps["Check Out Date"] = { date: { start: checkOutDate } }
    }

    if (Object.keys(updateProps).length === 0) {
      return NextResponse.json(
        { error: `No check-out date property found on this record (looked for "${RANGE_PROP}" / "Check Out Date").` },
        { status: 422 },
      )
    }

    await notion.pages.update({ page_id: notionPageId, properties: updateProps })

    // Best-effort: update the room board check-out date too. Email may be stored
    // under the emoji-prefixed key (form DB) or plain "Email" (room boards).
    const emailProp = page.properties["✉️ Email"] ?? page.properties["Email"]
    const email = emailProp?.type === "email" ? emailProp.email : null

    if (email) {
      const dsPlaza = process.env.NOTION_DS_PLAZA!
      const dsPeepal = process.env.NOTION_DS_PEEPAL!

      for (const ds of [dsPlaza, dsPeepal]) {
        try {
          const bedPage = await queryByEmail(notion, ds, email)
          if (bedPage) {
            await notion.pages.update({
              page_id: bedPage.id,
              properties: {
                "Check Out Date ": { date: { start: checkOutDate } },
              },
            })
            break
          }
        } catch (e) {
          console.warn("[portal/checkout-date] Room board update failed:", e)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      checkOutDate,
      message: `Check-out date set to ${new Date(checkOutDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. Notice period begins today.`,
    })
  } catch (err) {
    console.error("[portal/checkout-date]", err)
    const detail = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Failed to update check-out date: ${detail}` }, { status: 500 })
  }
}
