import { NextResponse } from "next/server"
import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"

export const dynamic = "force-dynamic"

const DS_FORM   = process.env.NOTION_DS_FORM!
const DS_PLAZA  = process.env.NOTION_DS_PLAZA!
const DS_PEEPAL = process.env.NOTION_DS_PEEPAL!

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

// Look up which property the guest's bed belongs to by searching both room boards.
// Falls back to room-number inference (200+ → Plaza, 100–199 → Peepal Tree) if not on a board.
async function resolveProperty(email: string, roomText?: string): Promise<string> {
  const client = new Client({ auth: process.env.NOTION_TOKEN })
  for (const [ds, label] of [[DS_PLAZA, "Safina Plaza"], [DS_PEEPAL, "Peepal Tree"]] as const) {
    if (!ds) continue
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (client.dataSources as any).query({
        data_source_id: ds,
        filter: { property: "Email", email: { equals: email } },
        page_size: 1,
      })
      if (res.results?.length > 0) return label
    } catch { /* ignore per-DS errors */ }
  }
  // Fallback: extract the first number from the room string (e.g. "Room 316 · Bed A" → 316)
  if (roomText) {
    const match = roomText.match(/\d+/)
    const n = match ? parseInt(match[0], 10) : NaN
    if (n >= 100 && n < 200) return "Peepal Tree"
    if (n >= 200) return "Safina Plaza"
  }
  return ""
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

    // "Tariff" is the monthly rate field in the form DB (no "Monthly Rate" field exists).
    // Resolve property by looking up the guest on both room boards, with room-number fallback.
    const roomText = getText(page, "Room")
    const [monthlyRate, property] = await Promise.all([
      Promise.resolve(getNumber(page, "Tariff") ?? 0),
      resolveProperty(normalised, roomText),
    ])

    return NextResponse.json({
      notionPageId: page.id,
      guestName: getText(page, "🧑‍💼 Guest Name"),
      email: getEmail(page),
      room: getText(page, "Room"),
      property,
      checkIn: getDate(page, "Check In Date"),
      checkOut,
      monthlyRate,
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
