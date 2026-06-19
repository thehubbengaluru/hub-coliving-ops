import { NextResponse } from "next/server"
import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"

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
    const existingRange = page.properties["📅 Check-in & Check-out Date (Estimated)"]
    const checkInStart = existingRange?.type === "date" ? (existingRange.date?.start ?? checkOutDate) : checkOutDate

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await notion.pages.update({
      page_id: notionPageId,
      properties: {
        "📅 Check-in & Check-out Date (Estimated)": {
          date: { start: checkInStart, end: checkOutDate },
        },
      } as any,
    })

    // Best-effort: update the room board check-out date too
    const emailProp = page.properties["✉️ Email"]
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
    return NextResponse.json({ error: "Failed to update check-out date" }, { status: 500 })
  }
}
