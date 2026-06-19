import { NextResponse } from "next/server"
import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"

export const dynamic = "force-dynamic"

const DS_FORM = process.env.NOTION_DS_FORM!

function getEmail(page: PageObjectResponse): string | null {
  const p = page.properties["✉️ Email"]
  if (!p || p.type !== "email") return null
  return p.email
}
function getText(page: PageObjectResponse, key: string): string {
  const p = page.properties[key]
  if (!p) return ""
  if (p.type === "title") return p.title.map(r => r.plain_text).join("").trim()
  if (p.type === "rich_text") return p.rich_text.map(r => r.plain_text).join("").trim()
  return ""
}
function getSelect(page: PageObjectResponse, key: string): string {
  const p = page.properties[key]
  if (!p || p.type !== "select") return ""
  return p.select?.name ?? ""
}
function getDate(page: PageObjectResponse, key: string): string | null {
  const p = page.properties[key]
  if (!p || p.type !== "date") return null
  return p.date?.start ?? null
}
function getNumber(page: PageObjectResponse, key: string): number | null {
  const p = page.properties[key]
  if (!p || p.type !== "number") return null
  return p.number
}

async function findGuestByEmail(email: string): Promise<PageObjectResponse | null> {
  // DS_FORM is a Notion data source — query via dataSources.query
  const client = new Client({ auth: process.env.NOTION_TOKEN })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client.dataSources as any).query({
    data_source_id: DS_FORM,
    filter: { property: "✉️ Email", email: { equals: email } },
    sorts: [{ timestamp: "created_time", direction: "descending" }],
    page_size: 5,
  })
  for (const p of res.results) {
    if (isFullPage(p)) {
      const pageEmail = getEmail(p)
      if (pageEmail?.toLowerCase() === email) return p
    }
  }
  return null
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })

    const normalised = email.trim().toLowerCase()
    const page = await findGuestByEmail(normalised)

    if (!page) {
      return NextResponse.json({ error: "No booking found for this email." }, { status: 404 })
    }

    const checkOutDateRange = page.properties["📅 Check-in & Check-out Date (Estimated)"]
    const checkOut = checkOutDateRange?.type === "date" ? (checkOutDateRange.date?.end ?? null) : null

    return NextResponse.json({
      notionPageId: page.id,
      guestName: getText(page, "🧑‍💼 Guest Name"),
      email: getEmail(page),
      room: getText(page, "Room"),
      property: getSelect(page, "🏠 Property"),
      checkIn: getDate(page, "Check In Date"),
      checkOut,
      monthlyRate: getNumber(page, "Monthly Rate") ?? 0,
      status: getSelect(page, "Status"),
      contactNumber: getNumber(page, "📞 Contact Number"),
      orgName: getText(page, "🏢 Organisation / 🎓 College Name"),
      occupation: getText(page, "🧩 Occupation"),
      workAddress: getText(page, "📍 Work / Office / College Address"),
      emergencyName: getText(page, "🚨 Emergency Contact Name"),
      emergencyNumber: getText(page, "📲 Emergency Contact Number"),
      emergencyRelation: getText(page, "Emergency Contact Relation"),
    })
  } catch (err) {
    console.error("[portal/auth]", err)
    return NextResponse.json({ error: "Failed to look up booking" }, { status: 500 })
  }
}
