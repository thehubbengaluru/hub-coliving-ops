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

// ─── Guest Info Form (from Lovable booking site) ──────────────────────────

const DS_FORM = process.env.NOTION_DS_FORM!

export type PendingBooking = {
  notionPageId: string
  guestName: string
  gender: "male" | "female" | "other"
  email: string
  phone: string
  room: string
  property: "safina-plaza" | "peepal-tree" | null
  checkInDate: string | null
  checkOutDate: string | null
  tariff: number
  status: string | null
  submittedAt: string
  idProofType: string | null
  organisation: string | null
  occupation: string | null
  emergencyContact: string | null
  petParent: boolean
  rulesAccepted: boolean
}

function inferProperty(room: string): "safina-plaza" | "peepal-tree" | null {
  const base = room.trim().replace(/\s*[AB]+$/i, "").replace("AB", "")
  const n = parseInt(base, 10)
  if (isNaN(n)) return null
  if (n >= 100 && n < 200) return "peepal-tree"
  if (n >= 200) return "safina-plaza"
  return null
}

function formBooking(page: PageObjectResponse): PendingBooking {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = page.properties as Record<string, any>

  const guestName = p["🧑‍💼 Guest Name"]?.title?.map((t: { plain_text: string }) => t.plain_text).join("").trim() ?? ""
  const genderRaw = p["⚧️ Gender"]?.multi_select?.[0]?.name?.toLowerCase() ?? "male"
  const gender: "male" | "female" | "other" = genderRaw === "female" ? "female" : genderRaw === "other" ? "other" : "male"
  const email = p["✉️ Email"]?.email ?? ""
  const phone = p["📞 Contact Number"]?.number ? String(p["📞 Contact Number"].number) : ""
  const room = p["Room"]?.rich_text?.map((t: { plain_text: string }) => t.plain_text).join("").trim() ?? ""
  const tariff = p["Tariff"]?.number ?? 0
  const status = p["Status"]?.select?.name ?? null
  const submittedAt = p["Submission time"]?.created_time ?? page.created_time
  const checkInDate = p["date:Check In Date:start"] ?? p["Check In Date"]?.date?.start ?? null
  const checkOutDate = p["date:Check Out Date:start"] ?? p["Check Out Date"]?.date?.start ?? null
  const idProofType = p["🪪 ID Proof Type"]?.multi_select?.[0]?.name ?? null
  const organisation = p["🏢 Organisation / 🎓 College Name"]?.rich_text?.map((t: { plain_text: string }) => t.plain_text).join("") ?? null
  const occupation = p["🧩 Occupation"]?.rich_text?.map((t: { plain_text: string }) => t.plain_text).join("") ?? null
  const emergencyContact = p["🚨 Emergency Contact Name"]?.rich_text?.map((t: { plain_text: string }) => t.plain_text).join("") ?? null
  const petParent = p["Pet Parent"]?.multi_select?.[0]?.name === "Yes"
  const rulesAccepted = (p["📜 Rules and Regulations"]?.multi_select?.length ?? 0) > 0

  return {
    notionPageId: page.id,
    guestName,
    gender,
    email,
    phone,
    room,
    property: room ? inferProperty(room) : null,
    checkInDate,
    checkOutDate,
    tariff,
    status,
    submittedAt,
    idProofType,
    organisation,
    occupation,
    emergencyContact,
    petParent,
    rulesAccepted,
  }
}

export async function getPendingBookings(): Promise<PendingBooking[]> {
  const pages = await queryAll(DS_FORM)
  return pages
    .map(formBooking)
    .filter(b => {
      // Show only bookings that haven't been fully activated yet
      const skip = ["checked in ( welcome chit sheet)", "Done"]
      return b.guestName && !skip.includes(b.status ?? "")
    })
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
}

export async function activateBooking(formPageId: string): Promise<{
  ok: boolean
  property?: string
  depositLinkUrl?: string
  subscriptionUrl?: string
  error?: string
}> {
  // 1. Read the form page
  const page = await notion.pages.retrieve({ page_id: formPageId }) as PageObjectResponse
  const booking = formBooking(page)

  if (!booking.guestName) return { ok: false, error: "No guest name on form" }
  if (!booking.room) return { ok: false, error: "No room specified on form" }
  if (!booking.property) return { ok: false, error: `Cannot determine property from room "${booking.room}"` }

  // 2. Find the matching vacant bed page in the Active Members DB
  const targetDS = booking.property === "safina-plaza" ? DS_PLAZA : DS_PEEPAL
  const allPages = await queryAll(targetDS)

  const matchPage = allPages.find(p => {
    const roomProp = p.properties["Room"]
    const roomVal = roomProp?.type === "select" ? (roomProp.select?.name ?? "") : ""
    return roomVal.trim().toLowerCase() === booking.room.trim().toLowerCase()
  })

  if (!matchPage) return { ok: false, error: `Room "${booking.room}" not found in ${booking.property} database` }

  // 3. Write guest info to the Active Members DB page
  await checkInGuest({
    notionPageId: matchPage.id,
    property: booking.property,
    guestName: booking.guestName,
    gender: booking.gender === "other" ? "male" : booking.gender,
    phone: booking.phone,
    email: booking.email,
    checkInDate: booking.checkInDate ?? new Date().toISOString().slice(0, 10),
    checkOutDate: booking.checkOutDate ?? undefined,
    monthlyRate: booking.tariff,
  })

  // 4. Update form page status to "pre-check in + arrival"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await notion.pages.update({
    page_id: formPageId,
    properties: { Status: { select: { name: "pre-check in + arrival" } } } as any,
  })

  const results: { ok: boolean; property?: string; depositLinkUrl?: string; subscriptionUrl?: string } = {
    ok: true,
    property: booking.property,
  }

  // 5. Send Razorpay deposit link if phone available
  if (booking.phone) {
    try {
      const { createDepositLink } = await import("./razorpay")
      const link = await createDepositLink({
        property: booking.property,
        guestName: booking.guestName,
        email: booking.email,
        phone: booking.phone,
        amount: booking.tariff,
        notionPageId: matchPage.id,
      })
      results.depositLinkUrl = link.short_url
    } catch { /* non-fatal */ }
  }

  // 6. Create rent subscription if phone + tariff available
  if (booking.phone && booking.tariff > 0) {
    try {
      const { createRentSubscription } = await import("./razorpay")
      const sub = await createRentSubscription({
        property: booking.property,
        guestName: booking.guestName,
        email: booking.email,
        phone: booking.phone,
        monthlyRate: booking.tariff,
      })
      results.subscriptionUrl = sub.short_url
    } catch { /* non-fatal */ }
  }

  return results
}
