import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import type { Room, Bed, BedStatus, Floor, Gender } from "./types"

const notion = new Client({ auth: process.env.NOTION_TOKEN })

// Data source IDs (collection IDs — used with dataSources.query)
const DS_PLAZA  = process.env.NOTION_DS_PLAZA!   // ea069190-ee9b-83d3-89f2-078173496d03
const DS_PEEPAL = process.env.NOTION_DS_PEEPAL!  // b8769190-ee9b-8395-94c4-87624c3211f0

// ─── Property extractors ───────────────────────────────────────────────────

function getTitle(page: PageObjectResponse, prop: string): string {
  const p = page.properties[prop]
  if (p?.type === "title") return p.title.map(t => t.plain_text).join("").trim()
  return ""
}

function getSelect(page: PageObjectResponse, prop: string): string | null {
  const p = page.properties[prop]
  if (p?.type === "select") return p.select?.name ?? null
  return null
}

function getNumber(page: PageObjectResponse, prop: string): number | null {
  const p = page.properties[prop]
  if (p?.type === "number") return p.number ?? null
  return null
}

function getCheckbox(page: PageObjectResponse, prop: string): boolean {
  const p = page.properties[prop]
  if (p?.type === "checkbox") return p.checkbox
  return false
}

function getDate(page: PageObjectResponse, prop: string): string | null {
  const p = page.properties[prop]
  if (p?.type === "date") return p.date?.start ?? null
  return null
}

// ─── Room number parsing ───────────────────────────────────────────────────
// Handles: "301A", "301 A", "302AB", "105B", "304"

type BedLabel = "A" | "B" | "AB" | null

function parseRoom(raw: string): { base: string; bed: BedLabel } {
  const s = raw.trim()

  // "302AB" → private room with +1 guest
  if (/^\d+AB$/.test(s)) return { base: s.replace("AB", ""), bed: "AB" }

  // "301 A" / "305 B" (space-separated)
  const spaced = s.match(/^(\d+)\s+([AB])$/)
  if (spaced) return { base: spaced[1], bed: spaced[2] as "A" | "B" }

  // "301A" / "105B" (no space)
  const joined = s.match(/^(\d+)([AB])$/)
  if (joined) return { base: joined[1], bed: joined[2] as "A" | "B" }

  // plain "304" → private
  return { base: s, bed: null }
}

function floorFromBase(base: string): Floor {
  const n = parseInt(base, 10)
  if (n >= 300) return "3rd"
  if (n >= 200) return "2nd"
  return "1st"
}

// ─── Fetch all pages from a data source (handles pagination) ──────────────

async function queryAll(dataSourceId: string): Promise<PageObjectResponse[]> {
  const results: PageObjectResponse[] = []
  let cursor: string | undefined

  do {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (notion.dataSources as any).query({
      data_source_id: dataSourceId,
      start_cursor: cursor,
      page_size: 100,
    })
    for (const p of res.results) {
      if (isFullPage(p)) results.push(p)
    }
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined
  } while (cursor)

  return results
}

// ─── Plaza bed transformer ─────────────────────────────────────────────────
// Plaza has no Status field — vacancy is encoded in Member Name

function plazaBed(page: PageObjectResponse, bed: BedLabel): Bed {
  const name     = getTitle(page, "Member Name")
  const gender   = getSelect(page, "Gender")
  const depPaid  = getCheckbox(page, "Deposit Paid ✓")
  const checkIn  = getDate(page, "Check In Date")
  const checkOut = getDate(page, "Check Out Date ")

  const isVacant   = name.startsWith("Vacant")
  const isServiced = name.includes("serviced")
  const isAirbnb   = name.toLowerCase().includes("airbnb")

  let status: BedStatus
  if (isServiced)              status = "blocked"
  else if (isVacant && depPaid) status = "incoming"
  else if (isVacant)           status = "vacant"
  else if (isAirbnb)           status = "special"
  else                         status = "occupied"

  return {
    id: `plaza-${page.id}`,
    bedNumber: bed === "B" ? 2 : 1,
    status,
    depositPaid: depPaid,
    guestId:   (!isVacant && status !== "blocked") ? page.id : undefined,
    guestName: (!isVacant && status !== "blocked") ? name    : undefined,
    checkIn:   checkIn  ?? undefined,
    checkOut:  checkOut ?? undefined,
    genderRestriction: (gender?.toLowerCase() as Gender) ?? "male",
    tier: checkOut ? "monthly" : "open-ended",
  }
}

// ─── Peepal bed transformer ────────────────────────────────────────────────
// Peepal has an explicit Status field: Occupied / Vacant / Blocked / Checked-Out

function peepalBed(page: PageObjectResponse, bed: BedLabel): Bed {
  const name         = getTitle(page, "Member Name")
  const gender       = getSelect(page, "Gender")
  const notionStatus = getSelect(page, "Status")
  const tariff       = getNumber(page, "Tariff with GST")
  const checkIn      = getDate(page, "Check In Date")
  const checkOut     = getDate(page, "Check Out Date ")

  let status: BedStatus
  if (notionStatus === "Occupied") {
    // Zero-tariff guests are special bookings (owner's guests / co-builders)
    status = tariff === 0 ? "special" : "occupied"
  } else if (notionStatus === "Blocked") {
    status = "blocked"
  } else {
    // Vacant or Checked-Out → vacant
    status = "vacant"
  }

  const isVacant = name === "Vacant" || !name

  return {
    id: `peepal-${page.id}`,
    bedNumber: bed === "B" ? 2 : 1,
    status,
    depositPaid: undefined,
    guestId:   (status === "occupied" || status === "special") ? page.id : undefined,
    guestName: (!isVacant && status !== "blocked") ? name : undefined,
    checkIn:   checkIn  ?? undefined,
    checkOut:  checkOut ?? undefined,
    genderRestriction: (gender?.toLowerCase() as Gender) ?? "male",
    tier: checkOut ? "monthly" : "open-ended",
  }
}

// ─── Group pages into Room objects ─────────────────────────────────────────

type BedFn = (page: PageObjectResponse, bed: BedLabel) => Bed

function groupRooms(
  pages: PageObjectResponse[],
  property: "safina-plaza" | "peepal-tree",
  entity: "feazzo" | "safina-ventures",
  bedFn: BedFn,
  tariffField: string | null,
  depositField: string | null,
): Room[] {
  const map = new Map<string, Array<{ page: PageObjectResponse; bed: BedLabel }>>()

  for (const page of pages) {
    const raw = getSelect(page, "Room")
    if (!raw) continue
    const { base, bed } = parseRoom(raw)
    if (!map.has(base)) map.set(base, [])
    map.get(base)!.push({ page, bed })
  }

  const rooms: Room[] = []

  for (const [base, entries] of map) {
    const isSharing = entries.some(e => e.bed === "A" || e.bed === "B")
    const floor     = floorFromBase(base)

    // Sort beds: A before B
    const sorted = [...entries].sort((a, b) => (a.bed ?? "").localeCompare(b.bed ?? ""))
    const beds   = sorted.map(e => bedFn(e.page, e.bed))

    // Monthly rate calculation
    let monthlyRate = 0
    if (tariffField && isSharing) {
      // Sharing room: sum both bed tariffs
      monthlyRate = entries.reduce((s, e) => s + (getNumber(e.page, tariffField) ?? 0), 0)
    } else if (tariffField) {
      monthlyRate = getNumber(entries[0].page, tariffField) ?? 0
    } else if (depositField) {
      // Plaza: use deposit amount of first occupied bed as proxy (deposit = 1 month rate)
      const occupied = entries.find(e => !getTitle(e.page, "Member Name").startsWith("Vacant"))
      monthlyRate = getNumber((occupied ?? entries[0]).page, depositField) ?? 0
    }

    const blocked = beds.some(b => b.status === "blocked")
    const airbnb  = beds.some(b => b.status === "special") && beds.some(b => {
      const name = b.guestName?.toLowerCase() ?? ""
      return name.includes("airbnb")
    })

    rooms.push({
      id: `${property}-${base}`,
      number: base,
      property,
      floor,
      type: isSharing ? "sharing" : "private",
      entity,
      beds,
      monthlyRate,
      weeklyRate: 0,
      isBlocked: blocked,
      blockReason: blocked ? "Under maintenance — bed being serviced" : undefined,
      specialBookingType: airbnb ? "airbnb" : undefined,
    })
  }

  return rooms.sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10))
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function getRooms(): Promise<Room[]> {
  const [plazaPages, peepalPages] = await Promise.all([
    queryAll(DS_PLAZA),
    queryAll(DS_PEEPAL),
  ])

  const plaza  = groupRooms(plazaPages,  "safina-plaza", "feazzo",          plazaBed,  null,            "Deposit Amount (₹)")
  const peepal = groupRooms(peepalPages, "peepal-tree",  "safina-ventures", peepalBed, "Tariff with GST", null)

  return [...plaza, ...peepal]
}

// ─── Guest contact (email + phone for Razorpay) ───────────────────────────

export async function getGuestContact(notionPageId: string): Promise<{ email: string | null; phone: string | null }> {
  const page = await notion.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse

  function getProp(key: string): string | null {
    const p = (page.properties as Record<string, unknown>)[key] as { type: string; email?: string; phone_number?: string; rich_text?: { plain_text: string }[] } | undefined
    if (!p) return null
    if (p.type === "email") return p.email ?? null
    if (p.type === "phone_number") return p.phone_number ?? null
    if (p.type === "rich_text") return p.rich_text?.map((t) => t.plain_text).join("").trim() || null
    return null
  }

  return { email: getProp("Email"), phone: getProp("Phone") }
}

// ─── Notion write-back ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props = Record<string, any>

export async function checkInGuest({
  notionPageId, property, guestName, gender, phone, email,
  checkInDate, checkOutDate, monthlyRate,
}: {
  notionPageId: string
  property: "safina-plaza" | "peepal-tree"
  guestName: string
  gender: "male" | "female"
  phone: string
  email: string
  checkInDate: string
  checkOutDate?: string
  monthlyRate: number
}) {
  const genderLabel = gender === "male" ? "Male" : "Female"
  const props: Props = {
    "Member Name":    { title: [{ text: { content: guestName } }] },
    "Gender":         { select: { name: genderLabel } },
    "Check In Date":  { date: { start: checkInDate } },
    "Check Out Date ": checkOutDate ? { date: { start: checkOutDate } } : { date: null },
    "Phone":          { phone_number: phone },
    "Email":          { email },
  }
  if (property === "safina-plaza") {
    props["Deposit Amount (₹)"] = { number: monthlyRate }
    props["Deposit Paid ✓"]     = { checkbox: false }
  } else {
    props["Tariff with GST"] = { number: monthlyRate }
    props["Status"]          = { select: { name: "Occupied" } }
  }
  await notion.pages.update({ page_id: notionPageId, properties: props })
}

export async function checkOutGuest({
  notionPageId, property, checkOutDate,
}: {
  notionPageId: string
  property: "safina-plaza" | "peepal-tree"
  checkOutDate: string
}) {
  const props: Props = {
    "Check Out Date ": { date: { start: checkOutDate } },
  }
  if (property === "safina-plaza") {
    props["Member Name"] = { title: [{ text: { content: "Vacant" } }] }
  } else {
    props["Status"] = { select: { name: "Checked-Out" } }
  }
  await notion.pages.update({ page_id: notionPageId, properties: props })
}

export async function markDepositPaid(notionPageId: string) {
  await notion.pages.update({
    page_id: notionPageId,
    properties: { "Deposit Paid ✓": { checkbox: true } },
  })
}
