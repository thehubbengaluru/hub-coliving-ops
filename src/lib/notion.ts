import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import type { Room, Bed, BedStatus, Floor, Gender } from "./types"
import { normalizeRoomTier, rateForTier, tierFromRate } from "./pricing"

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
  // "Default tariff by room type" style fields are usually a formula or rollup.
  if (p?.type === "formula" && p.formula.type === "number") return p.formula.number ?? null
  if (p?.type === "rollup"  && p.rollup.type  === "number") return p.rollup.number ?? null
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

function getRichText(page: PageObjectResponse, prop: string): string | null {
  const p = page.properties[prop]
  if (p?.type === "rich_text") return p.rich_text.map(t => t.plain_text).join("").trim() || null
  return null
}

function getMultiSelect(page: PageObjectResponse, prop: string): string[] {
  const p = page.properties[prop]
  if (p?.type === "multi_select") return p.multi_select.map(o => o.name)
  return []
}

// "Room Type" is a single-select in the member DBs (e.g. "Deluxe Sharing"), but
// tolerate multi_select too so this keeps working if the schema changes.
function getRoomTypeName(page: PageObjectResponse): string | null {
  const p = page.properties["Room Type"]
  if (p?.type === "select")       return p.select?.name ?? null
  if (p?.type === "multi_select") return p.multi_select[0]?.name ?? null
  return null
}

function getEmail(page: PageObjectResponse, prop: string): string | null {
  const p = page.properties[prop]
  if (p?.type === "email") return p.email ?? null
  return null
}

function getPhone(page: PageObjectResponse, prop: string): string | null {
  const p = page.properties[prop]
  if (p?.type === "phone_number") return p.phone_number ?? null
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

// Surface the occupant's gender as a leading tag (e.g. "Male" / "Female"),
// but only for beds that actually hold a guest.
function genderTag(gender: string | null | undefined, hasGuest: boolean): string[] {
  if (!gender || !hasGuest) return []
  return [gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase()]
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

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const checkInDate = checkIn ? new Date(checkIn + "T00:00:00") : null

  let status: BedStatus
  if (isServiced)                                                       status = "blocked"
  else if (isVacant && depPaid)                                         status = "incoming"
  else if (isVacant)                                                    status = "vacant"
  else if (isAirbnb)                                                    status = "special"
  else if (!isVacant && checkInDate && checkInDate > today)             status = "incoming"
  else                                                                  status = "occupied"

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
    subscriptionId: getRichText(page, "Razorpay Subscription ID") ?? undefined,
    roomTier: normalizeRoomTier(getRoomTypeName(page)) ?? undefined,
    tags: [...genderTag(gender, !isVacant && status !== "blocked"), ...getMultiSelect(page, "Tags"), ...getMultiSelect(page, "Type")],
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

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const checkInDate = checkIn ? new Date(checkIn + "T00:00:00") : null

  let status: BedStatus
  if (notionStatus === "Incoming") {
    status = "incoming"
  } else if (notionStatus === "Occupied") {
    // If check-in date is in the future, treat as incoming booking
    if (checkInDate && checkInDate > today) {
      status = "incoming"
    } else {
      // Zero-tariff guests are special bookings (owner's guests / co-builders)
      status = tariff === 0 ? "special" : "occupied"
    }
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
    subscriptionId: getRichText(page, "Razorpay Subscription ID") ?? undefined,
    roomTier: normalizeRoomTier(getRoomTypeName(page)) ?? undefined,
    tags: [...genderTag(gender, !isVacant && status !== "blocked"), ...getMultiSelect(page, "Tags"), ...getMultiSelect(page, "Type")],
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
      // Plaza: deposit = 1 month rate. Prefer occupied bed (field is filled on booking),
      // fall back to Monthly Rent / Tariff which may be pre-filled on vacant private rooms.
      const occupied = entries.find(e => !getTitle(e.page, "Member Name").startsWith("Vacant"))
      const target   = occupied ?? entries[0]
      monthlyRate =
        getNumber(target.page, depositField) ??
        getNumber(target.page, "Monthly Rent") ??
        getNumber(target.page, "Tariff") ??
        // last resort: check all entries
        entries.reduce<number | null>((found, e) =>
          found ?? getNumber(e.page, depositField) ?? getNumber(e.page, "Monthly Rent") ?? getNumber(e.page, "Tariff"), null
        ) ?? 0
    }

    const blocked = beds.some(b => b.status === "blocked")
    const airbnb  = beds.some(b => b.status === "special") && beds.some(b => {
      const name = b.guestName?.toLowerCase() ?? ""
      return name.includes("airbnb")
    })

    // Canonical room tier from the Notion "Room Type" tag — prefer an occupied
    // bed (its tag reflects the booked tier), else any bed that carries one.
    let roomTier =
      beds.find(b => b.guestName && b.roomTier)?.roomTier ??
      beds.find(b => b.roomTier)?.roomTier

    // When Notion has no booked rate yet (e.g. a vacant room), fall back to the
    // per-room-type default tariff configured on the page, then to the code-side
    // tier map — so pricing always reflects the room type instead of "TBD".
    if (monthlyRate === 0) {
      monthlyRate =
        entries.map(e => getNumber(e.page, "Room Type Default Tariff Incl GST")).find(v => v && v > 0) ?? 0
    }
    if (monthlyRate === 0 && roomTier) {
      monthlyRate = rateForTier(property, roomTier)
    }
    // If the tag was missing but we have a rate, recover the tier from it so the
    // room is still recognised as a fixed tier (no manual tier selection).
    if (!roomTier && monthlyRate > 0) {
      roomTier = tierFromRate(property, isSharing ? "sharing" : "private", monthlyRate) ?? undefined
    }

    rooms.push({
      id: `${property}-${base}`,
      number: base,
      property,
      floor,
      type: isSharing ? "sharing" : "private",
      roomTier,
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

/**
 * Thrown when a check-in is attempted on a bed that is still occupied by a
 * different live guest. Callers should surface this as a 409, never overwrite.
 */
export class BedOccupiedError extends Error {
  constructor(public occupantName: string) {
    super(
      `Bed is already occupied by "${occupantName}". Check them out (which archives them to Alumni) before assigning a new guest.`,
    )
    this.name = "BedOccupiedError"
  }
}

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "")
}

/**
 * Reads a bed page and refuses if it is currently held by a *different* live
 * guest. A bed is assignable only when it is Vacant, being serviced, marked
 * Checked-Out, or already belongs to the same incoming guest. "Same guest" is
 * matched on email OR phone, so a phone-only room-board invite is still
 * recognised when the guest later completes the booking form with their email.
 * This is the single guard that prevents a check-in from silently overwriting —
 * and thereby destroying — an existing tenant's record.
 */
export async function assertBedVacant(notionPageId: string, incomingEmail: string, incomingPhone?: string): Promise<void> {
  const existing = await notion.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse
  const existingName   = getTitle(existing, "Member Name")
  const existingEmail  = getEmail(existing, "Email")
  const existingPhone  = getPhone(existing, "Phone")
  const existingStatus = getSelect(existing, "Status") // Peepal only

  const isVacant     = !existingName || existingName.startsWith("Vacant")
  const isServiced   = existingName.toLowerCase().includes("serviced")
  const isCheckedOut = existingStatus === "Checked-Out"

  const emailMatch = !!existingEmail && !!incomingEmail &&
                     existingEmail.trim().toLowerCase() === incomingEmail.trim().toLowerCase()
  const phoneMatch = !!digits(existingPhone) && !!digits(incomingPhone) &&
                     digits(existingPhone) === digits(incomingPhone)
  const sameGuest  = emailMatch || phoneMatch

  const occupiedByOther = !isVacant && !isServiced && !isCheckedOut && !sameGuest
  if (occupiedByOther) throw new BedOccupiedError(existingName)
}

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
  // Guard: never overwrite a bed still held by a different live guest.
  await assertBedVacant(notionPageId, email, phone)

  const genderLabel = gender === "male" ? "Male" : "Female"
  const props: Props = {
    "Member Name":    { title: [{ text: { content: guestName } }] },
    "Gender":         { select: { name: genderLabel } },
    "Check In Date":  { date: { start: checkInDate } },
    "Check Out Date ": checkOutDate ? { date: { start: checkOutDate } } : { date: null },
    "Phone":          { phone_number: phone },
    "Email":          { email },
  }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const isIncomingBooking = new Date(checkInDate) > today

  if (property === "safina-plaza") {
    props["Deposit Amount (₹)"] = { number: monthlyRate }
    props["Deposit Paid ✓"]     = { checkbox: false }
  } else {
    props["Tariff with GST"] = { number: monthlyRate }
    props["Status"]          = { select: { name: isIncomingBooking ? "Incoming" : "Occupied" } }
  }
  await notion.pages.update({ page_id: notionPageId, properties: props })
}

// ─── Alumni sync ──────────────────────────────────────────────────────────

const DB_ALUMNI = "2c469190ee9b80dc8fc1fa71efb15d96"

export async function syncGuestToAlumni({
  notionPageId,
  property,
  checkOutDate,
  roomNumber,
  bedLabel,
  roomType,
  noticePeriodLastDate,
  refundDueDate,
  checkedOutBy,
  damagesNote,
  checklistSummary,
}: {
  notionPageId: string
  property: "safina-plaza" | "peepal-tree"
  checkOutDate: string
  roomNumber?: string
  bedLabel?: string | null
  roomType?: "private" | "sharing"
  noticePeriodLastDate?: string | null
  refundDueDate?: string | null
  checkedOutBy?: string
  damagesNote?: string
  checklistSummary?: string
}): Promise<string> {
  // Read the member page before we clear it. If we cannot read it, abort —
  // the caller must NOT proceed to clear the bed, or the guest is lost.
  const raw = await notion.pages.retrieve({ page_id: notionPageId })
  if (!isFullPage(raw)) {
    throw new Error(`Cannot archive guest to Alumni: member page ${notionPageId} not found or inaccessible. Aborting checkout so the record is not lost.`)
  }

  const name       = getTitle(raw, "Member Name")
  const email      = getEmail(raw, "Email")
  const phone      = getPhone(raw, "Phone")
  const gender     = getSelect(raw, "Gender")
  const floor      = getSelect(raw, "Floor")
  const checkIn    = getDate(raw, "Check In Date")
  const depPaid    = getCheckbox(raw, "Deposit Paid ✓")
  const depAmount  = getNumber(raw, "Deposit Amount (₹)")
  const tariff     = getNumber(raw, "Room Tariff")
  const org        = getRichText(raw, "Organisation / College")
  const workplace  = getRichText(raw, "Place of work")
  const designation = getRichText(raw, "Designation")
  const address    = getRichText(raw, "Permanent Address")
  const nationality = getRichText(raw, "Nationality")
  const notes      = getRichText(raw, "Notes")
  // "Room Type" on the member page: Standard/Deluxe × Sharing/Private (single-select).
  const roomTypeName = getRoomTypeName(raw)

  // Compute length of stay
  let lengthOfStay = ""
  if (checkIn && checkOutDate) {
    const days = Math.round((new Date(checkOutDate).getTime() - new Date(checkIn).getTime()) / 86_400_000)
    const months = Math.floor(days / 30)
    lengthOfStay = months >= 1
      ? `${months} month${months > 1 ? "s" : ""} (${days} days)`
      : `${days} days`
  }

  // Room label: e.g. "215 B"
  const roomLabel = roomNumber
    ? bedLabel ? `${roomNumber} ${bedLabel}` : roomNumber
    : null

  const props: Props = {
    "Member Name": { title: [{ text: { content: name || "Unknown" } }] },
    "Status":      { select: { name: "Checked-Out" } },
    "Property":    { select: { name: property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree" } },
    "Check Out Date ": { date: { start: checkOutDate } },
    "Security Deposit Paid ": { checkbox: depPaid },
  }
  if (email)        props["Email"]                  = { email }
  if (phone)        props["Phone"]                  = { phone_number: phone }
  if (gender)       props["Gender"]                 = { select: { name: gender } }
  if (floor)        props["Floor"]                  = { select: { name: floor } }
  if (checkIn)      props["Check In Date"]          = { date: { start: checkIn } }
  if (tariff)       props["Room Tariff"]            = { number: tariff }
  if (depAmount)    props["Deposit Amount (₹)"]     = { number: depAmount }
  if (org)          props["Organisation / College"] = { rich_text: [{ text: { content: org } }] }
  if (workplace)    props["Place of work"]          = { rich_text: [{ text: { content: workplace } }] }
  if (designation)  props["Designation"]            = { rich_text: [{ text: { content: designation } }] }
  if (address)      props["Permanent Address"]      = { rich_text: [{ text: { content: address } }] }
  if (nationality)  props["Nationality"]            = { rich_text: [{ text: { content: nationality } }] }
  if (lengthOfStay) props["Length Of Stay"]         = { rich_text: [{ text: { content: lengthOfStay } }] }
  if (notes)        props["Notes"]                  = { rich_text: [{ text: { content: notes } }] }
  if (roomLabel)    props["Room"]                   = { select: { name: roomLabel } }
  // Copy Room Type from the member page (Standard/Deluxe × Sharing/Private).
  // Fall back to deriving from roomType param for legacy records without it.
  if (roomTypeName) {
    props["Room Type"] = { multi_select: [{ name: roomTypeName }] }
  } else if (roomType) {
    const effectiveTariff = depAmount ?? tariff ?? 0
    const isDeluxe = property === "safina-plaza" && (
      (roomType === "sharing" && effectiveTariff > 25000) ||
      (roomType === "private" && effectiveTariff > 50000)
    )
    const tier = `${isDeluxe ? "Deluxe" : "Standard"} ${roomType === "private" ? "Private" : "Sharing"}`
    props["Room Type"] = { multi_select: [{ name: tier }] }
  }
  if (noticePeriodLastDate) props["Notice Period Last Date"] = { date: { start: noticePeriodLastDate } }
  if (refundDueDate)        props["Deposit Refund Due"]      = { date: { start: refundDueDate } }
  if (checkedOutBy)         props["Checked Out By"]          = { rich_text: [{ text: { content: checkedOutBy } }] }

  // Checkout/damages checklist captured as page content (schema-safe).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const children: any[] = []
  if (checklistSummary) {
    children.push({ object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: "✅ Check-out Checklist" } }] } })
    children.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: checklistSummary } }] } })
  }
  if (damagesNote) {
    children.push({ object: "block", type: "heading_3", heading_3: { rich_text: [{ type: "text", text: { content: "🛠️ Damages" } }] } })
    children.push({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: damagesNote } }] } })
  }

  // Best-effort: don't fail the archive if a bespoke property is missing.
  let created
  try {
    created = await notion.pages.create({
      parent: { database_id: DB_ALUMNI },
      properties: props,
      ...(children.length ? { children } : {}),
    })
  } catch (e) {
    console.warn("[syncGuestToAlumni] retry without optional props:", e)
    // Retry with only the core props that are known to exist.
    delete props["Notice Period Last Date"]
    delete props["Deposit Refund Due"]
    delete props["Checked Out By"]
    created = await notion.pages.create({
      parent: { database_id: DB_ALUMNI },
      properties: props,
      ...(children.length ? { children } : {}),
    })
  }
  return created.id
}

/**
 * Make a bed unavailable (Blocked) with reason, duration, and the team member
 * who blocked it. Refuses to block a bed currently held by a live guest.
 * Peepal uses the Status field; Plaza encodes "serviced" in Member Name. Block
 * metadata is appended as page content so we never depend on bespoke properties.
 */
export async function blockBed({
  notionPageId, property, reason, fromDate, untilDate, blockedBy,
}: {
  notionPageId: string
  property: "safina-plaza" | "peepal-tree"
  reason: string
  fromDate?: string
  untilDate?: string
  blockedBy: string
}): Promise<void> {
  const page = await notion.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse
  if (isFullPage(page)) {
    const name = getTitle(page, "Member Name")
    const status = getSelect(page, "Status")
    const liveGuest = name && !name.startsWith("Vacant") && status !== "Checked-Out" && !name.toLowerCase().includes("serviced")
    if (liveGuest) {
      throw new BedOccupiedError(name)
    }
  }

  const props: Props = {}
  if (property === "peepal-tree") {
    props["Status"] = { select: { name: "Blocked" } }
    props["Member Name"] = { title: [{ text: { content: "Vacant — blocked" } }] }
  } else {
    props["Member Name"] = { title: [{ text: { content: "Vacant — serviced" } }] }
  }
  await notion.pages.update({ page_id: notionPageId, properties: props })

  const detail = [
    `Reason: ${reason}`,
    fromDate ? `From: ${fromDate}` : null,
    untilDate ? `Until: ${untilDate}` : null,
    `Blocked by: ${blockedBy}`,
  ].filter(Boolean).join("  •  ")
  await notion.blocks.children.append({
    block_id: notionPageId,
    children: [{
      object: "block",
      type: "callout",
      callout: { rich_text: [{ type: "text", text: { content: `🚫 Unavailable — ${detail}` } }], icon: { emoji: "🚫" } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any],
  })
}

/** Reverse blockBed: return a blocked/serviced bed to Vacant. */
export async function unblockBed({
  notionPageId, property,
}: {
  notionPageId: string
  property: "safina-plaza" | "peepal-tree"
}): Promise<void> {
  const props: Props = { "Member Name": { title: [{ text: { content: "Vacant" } }] } }
  if (property === "peepal-tree") props["Status"] = { select: { name: "Vacant" } }
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

// Active members with a scheduled check-out date, for extend-stay reminders.
export type UpcomingCheckout = {
  notionPageId: string
  property: "safina-plaza" | "peepal-tree"
  name: string
  email: string | null
  checkOut: string
  daysUntil: number
}

export async function getUpcomingCheckouts(): Promise<UpcomingCheckout[]> {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const out: UpcomingCheckout[] = []

  for (const [property, ds] of [["safina-plaza", DS_PLAZA], ["peepal-tree", DS_PEEPAL]] as const) {
    const pages = await queryAll(ds)
    for (const page of pages) {
      const name = getTitle(page, "Member Name")
      if (!name || name.startsWith("Vacant")) continue
      const checkOut = getDate(page, "Check Out Date ")
      if (!checkOut) continue
      const co = new Date(checkOut + "T00:00:00")
      const daysUntil = Math.round((co.getTime() - today.getTime()) / 86_400_000)
      if (daysUntil < 0) continue
      out.push({ notionPageId: page.id, property, name, email: getEmail(page, "Email"), checkOut, daysUntil })
    }
  }
  return out
}

/**
 * Record a created Razorpay subscription id on the member page so the ops UI can
 * tell a subscription already exists (and avoid creating a duplicate). Best-effort:
 * if the "Razorpay Subscription ID" property doesn't exist yet, it logs and skips.
 */
export async function markSubscriptionCreated(notionPageId: string, subscriptionId: string): Promise<void> {
  try {
    await notion.pages.update({
      page_id: notionPageId,
      properties: { "Razorpay Subscription ID": { rich_text: [{ text: { content: subscriptionId } }] } },
    })
  } catch (e) {
    console.warn("[markSubscriptionCreated] could not write subscription id (add a 'Razorpay Subscription ID' text property in Notion):", e)
  }
}

/** Set the guest tags (multi_select "Tags") on a member page. Best-effort. */
export async function setGuestTags(notionPageId: string, tags: string[]): Promise<void> {
  await notion.pages.update({
    page_id: notionPageId,
    properties: { "Tags": { multi_select: tags.map((name) => ({ name })) } },
  })
}

export async function markDepositPaid(notionPageId: string) {
  await notion.pages.update({
    page_id: notionPageId,
    properties: {
      "Deposit Paid ✓": { checkbox: true },
    },
  })
}

/**
 * Returns the page only if it is a room-board bed page (titled "Member Name").
 * Guest-info form pages title their name "🧑‍💼 Guest Name", so this safely
 * returns null for them — preventing webhook-driven mutations from corrupting
 * the wrong record when a notes.notion_page_id is ambiguous.
 */
async function loadBedPage(notionPageId: string): Promise<PageObjectResponse | null> {
  try {
    const page = await notion.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse
    if (!isFullPage(page)) return null
    if (page.properties["Member Name"]?.type !== "title") return null
    return page
  } catch {
    return null
  }
}

/**
 * Confirm a bed as Occupied once payment lands. Peepal: flip Incoming → Occupied.
 * Plaza derives occupancy from Member Name (already written at check-in), so this
 * is a no-op there. Safe no-op if the page is not a bed page.
 */
export async function confirmBedOccupied(notionPageId: string): Promise<void> {
  const page = await loadBedPage(notionPageId)
  if (!page) return
  if (getSelect(page, "Status") === "Incoming") {
    await notion.pages.update({
      page_id: notionPageId,
      properties: { Status: { select: { name: "Occupied" } } },
    })
  }
}

/**
 * Revert a bed allotment back to Vacant when a payment fails or is refunded —
 * "our room allotment status should go back". Only reverts a hold for the SAME
 * guest (never evicts a different live occupant), and no-ops on non-bed pages.
 * Returns true if a bed was reverted.
 */
export async function revertBedAllotment(notionPageId: string, guestName?: string): Promise<boolean> {
  const page = await loadBedPage(notionPageId)
  if (!page) return false

  const currentName = getTitle(page, "Member Name")
  if (!currentName || currentName.startsWith("Vacant")) return false
  // Only undo the hold we created for this same guest.
  if (guestName && currentName.trim().toLowerCase() !== guestName.trim().toLowerCase()) return false

  const isPlaza = page.properties["Deposit Paid ✓"] !== undefined
  const props: Props = {
    "Member Name":     { title: [{ text: { content: "Vacant" } }] },
    "Check In Date":   { date: null },
    "Check Out Date ": { date: null },
  }
  if (isPlaza) {
    props["Deposit Paid ✓"] = { checkbox: false }
  } else {
    props["Status"] = { select: { name: "Vacant" } }
  }
  await notion.pages.update({ page_id: notionPageId, properties: props })
  return true
}

/**
 * Revert a bed allotment found by the guest's email — used by the refund/failed
 * webhook, where Razorpay's refund/payment entity notes do NOT carry the original
 * payment-link's notion_page_id, so we can't rely on the id. Searches both member
 * data sources for the guest's bed and reverts it (same-guest guard applies).
 */
export async function revertBedAllotmentByEmail(email: string, guestName?: string): Promise<boolean> {
  if (!email?.trim()) return false
  for (const ds of [DS_PLAZA, DS_PEEPAL]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (notion.dataSources as any).query({
        data_source_id: ds,
        filter: { property: "Email", email: { equals: email.trim() } },
        page_size: 1,
      })
      const page = res.results?.find((p: unknown) => isFullPage(p as PageObjectResponse))
      if (page) {
        const reverted = await revertBedAllotment(page.id, guestName)
        if (reverted) return true
      }
    } catch (e) {
      console.warn("[revertBedAllotmentByEmail] query failed:", e)
    }
  }
  return false
}

// Structural fields that describe the BED/ROOM, not the guest — these never
// move with a guest and are never wiped on checkout-by-move.
const BED_OWNED_FIELDS = new Set<string>([
  "Room", "Floor", "Room Type",
  "Room Type Default Tariff Incl GST", "Tariff without GST",
])
// Occupancy fields handled explicitly (not via the generic copy/clear loop).
const OCCUPANCY_FIELDS = new Set<string>(["Member Name", "Status"])

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function copyPropValue(p: any): any | null {
  switch (p?.type) {
    case "title":        return { title: p.title.map((t: { plain_text: string }) => ({ text: { content: t.plain_text } })) }
    case "rich_text":    return { rich_text: p.rich_text.map((t: { plain_text: string }) => ({ text: { content: t.plain_text } })) }
    case "number":       return { number: p.number ?? null }
    case "select":       return { select: p.select ? { name: p.select.name } : null }
    case "multi_select": return { multi_select: p.multi_select.map((o: { name: string }) => ({ name: o.name })) }
    case "date":         return { date: p.date ? { start: p.date.start, end: p.date.end ?? null } : null }
    case "checkbox":     return { checkbox: p.checkbox }
    case "email":        return { email: p.email ?? null }
    case "phone_number": return { phone_number: p.phone_number ?? null }
    case "url":          return { url: p.url ?? null }
    case "people":       return { people: p.people.map((u: { id: string }) => ({ id: u.id })) }
    default:             return null   // formula / rollup / files / created_* are read-only or unsafe to copy
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function emptyPropValue(p: any): any | null {
  switch (p?.type) {
    case "title":        return { title: [] }
    case "rich_text":    return { rich_text: [] }
    case "number":       return { number: null }
    case "select":       return { select: null }
    case "multi_select": return { multi_select: [] }
    case "date":         return { date: null }
    case "checkbox":     return { checkbox: false }
    case "email":        return { email: null }
    case "phone_number": return { phone_number: null }
    case "url":          return { url: null }
    case "people":       return { people: [] }
    // NOTE: "files" deliberately omitted — see reassignBed. Notion-hosted file
    // URLs expire and can't be reliably re-attached to another page via the API,
    // so we neither move nor clear ID-document files here.
    default:             return null
  }
}

/**
 * Reassign a guest from their current bed to a different bed.
 * Steps:
 *  1. Assert the target bed is vacant (throws BedOccupiedError if not).
 *  2. Copy EVERY guest-owned field from the old bed to the new bed (only fields
 *     that also exist on the target schema, so cross-property moves are safe).
 *  3. Wipe EVERY guest-owned field on the old bed back to empty / Vacant.
 *  4. Update the guest-info form page Room field to the new room label.
 */
export async function reassignBed({
  oldBedPageId,
  newBedPageId,
  newRoomLabel,
  property,
  formPageId,
}: {
  oldBedPageId: string
  newBedPageId: string
  newRoomLabel: string
  property: "safina-plaza" | "peepal-tree"
  formPageId?: string
}): Promise<void> {
  // 1 — Read both bed pages. We need the target schema so we only write fields
  //     it actually has (Plaza and Peepal have different property sets).
  const oldPage = await loadBedPage(oldBedPageId)
  if (!oldPage) throw new Error("Source bed page not found")
  const newPage = await loadBedPage(newBedPageId)
  if (!newPage) throw new Error("Destination bed page not found")

  const guestName = getTitle(oldPage, "Member Name")
  const email     = getEmail(oldPage, "Email")
  const phone     = getPhone(oldPage, "Phone")
  const checkIn   = getDate(oldPage, "Check In Date")
  const incoming  = checkIn ? new Date(checkIn) > new Date() : false

  // 2 — Assert new bed is empty (never overwrite a live guest)
  if (email) await assertBedVacant(newBedPageId, email, phone ?? undefined)

  // 3 — Move EVERY guest-owned field to the new bed. A field moves only if the
  //     target page has the same property + type, so cross-property moves carry
  //     just the common fields instead of erroring on unknown properties.
  const moveProps: Props = {}
  for (const [name, prop] of Object.entries(oldPage.properties)) {
    if (BED_OWNED_FIELDS.has(name) || OCCUPANCY_FIELDS.has(name)) continue
    const target = newPage.properties[name]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!target || (target as any).type !== (prop as any).type) continue
    const payload = copyPropValue(prop)
    if (payload) moveProps[name] = payload
  }
  moveProps["Member Name"] = { title: [{ text: { content: guestName } }] }
  if (newPage.properties["Status"]) {
    moveProps["Status"] = { select: { name: incoming ? "Incoming" : "Occupied" } }
  }
  await notion.pages.update({ page_id: newBedPageId, properties: moveProps })

  // 4 — Wipe EVERY guest-owned field on the old bed back to empty / Vacant.
  const clearProps: Props = {}
  for (const [name, prop] of Object.entries(oldPage.properties)) {
    if (BED_OWNED_FIELDS.has(name) || OCCUPANCY_FIELDS.has(name)) continue
    const payload = emptyPropValue(prop)
    if (payload) clearProps[name] = payload
  }
  clearProps["Member Name"] = { title: [{ text: { content: "Vacant" } }] }
  if (oldPage.properties["Status"]) clearProps["Status"] = { select: { name: "Vacant" } }
  await notion.pages.update({ page_id: oldBedPageId, properties: clearProps })

  // 5 — Update the guest-info form page Room field (best-effort)
  if (formPageId) {
    try {
      await notion.pages.update({
        page_id: formPageId,
        properties: { "Room": { rich_text: [{ text: { content: newRoomLabel } }] } },
      })
    } catch (e) {
      console.warn("[reassignBed] Failed to update form page room:", e)
    }
  }
}

/** Best-effort: set the booking/member page Status select (Notion auto-creates the option). */
export async function markGuestStatus(notionPageId: string, status: string): Promise<void> {
  try {
    await notion.pages.update({
      page_id: notionPageId,
      properties: { "Status": { select: { name: status } } },
    })
  } catch (e) {
    console.warn(`[markGuestStatus] could not set Status="${status}":`, e)
  }
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

  // 3. Write guest info to the Active Members DB page.
  //    If the matched bed is still occupied, refuse rather than overwrite.
  try {
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
  } catch (e) {
    if (e instanceof BedOccupiedError) return { ok: false, error: e.message }
    throw e
  }

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

// ─── Leads ────────────────────────────────────────────────────────────────

const DB_LEADS        = "2d369190-ee9b-808a-bc09-e7e15340663d"
const DB_MAINTENANCE  = "1d269190-ee9b-8096-a27c-f902861bba4e"

// Direct REST query for databases shared via standard integration (not dataSources)
async function queryDatabase(databaseId: string): Promise<PageObjectResponse[]> {
  const results: PageObjectResponse[] = []
  let cursor: string | undefined

  do {
    const body: Record<string, unknown> = {
      sorts: [{ timestamp: "created_time", direction: "descending" }],
      page_size: 100,
    }
    if (cursor) body.start_cursor = cursor

    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const data = await res.json() as { results: PageObjectResponse[]; has_more: boolean; next_cursor: string | null }
    for (const p of data.results) {
      if (isFullPage(p)) results.push(p)
    }
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined
  } while (cursor)

  return results
}

export type Lead = {
  notionPageId: string
  name: string
  phone: string
  gender: "male" | "female" | "other"
  property: "safina-plaza" | "peepal-tree" | null
  roomType: "private" | "sharing" | null
  status: "yet-to-confirm" | "won" | "lost"
  leadAmount: number | null
  leadDate: string | null
  responseDate: string | null
  conversionDate: string | null
  createdAt: string
}

function mapLeadProperty(raw: string | null): "safina-plaza" | "peepal-tree" | null {
  if (!raw) return null
  const l = raw.toLowerCase()
  if (l.includes("peepal")) return "peepal-tree"
  return "safina-plaza" // "Hub Co" → Plaza (default)
}

function mapLeadStatus(raw: string | null): Lead["status"] {
  if (raw === "Won")  return "won"
  if (raw === "Lost") return "lost"
  return "yet-to-confirm"
}

export async function getLeads(): Promise<Lead[]> {
  const pages = await queryDatabase(DB_LEADS)

  return pages.map(p => {
      const props = p.properties
      const g = (k: string, t: string): string => {
        const v = props[k]
        if (!v) return ""
        if (t === "title")        return (v as {type:"title";title:{plain_text:string}[]}).title.map(r => r.plain_text).join("").trim()
        if (t === "rich_text")    return (v as {type:"rich_text";rich_text:{plain_text:string}[]}).rich_text.map(r => r.plain_text).join("").trim()
        if (t === "select")       return (v as {type:"select";select:{name:string}|null}).select?.name ?? ""
        if (t === "phone_number") return (v as {type:"phone_number";phone_number:string|null}).phone_number ?? ""
        if (t === "number")       return String((v as {type:"number";number:number|null}).number ?? "")
        if (t === "date")         return (v as {type:"date";date:{start:string}|null}).date?.start ?? ""
        if (t === "created_time") return (v as {type:"created_time";created_time:string}).created_time
        return ""
      }
      const genderRaw = g("Gender ", "select").toLowerCase()
      return {
        notionPageId: p.id,
        name:           g("Lead Name", "title"),
        phone:          g("Phone", "phone_number"),
        gender:         (genderRaw === "male" || genderRaw === "female") ? genderRaw : "other",
        property:       mapLeadProperty(g("Property name ", "select")),
        roomType:       g("Room Type ", "select").toLowerCase() === "single" ? "private" : g("Room Type ", "select") ? "sharing" : null,
        status:         mapLeadStatus(g("Status ", "select")),
        leadAmount:     g("Lead Amount ", "number") ? Number(g("Lead Amount ", "number")) : null,
        leadDate:       g("Lead Date", "date") || g("Lead Date ", "date") || null,
        responseDate:   g("Response Date", "date") || null,
        conversionDate: g("Conversion Date", "date") || null,
        createdAt:      g("Created by", "created_time") || p.created_time,
      } satisfies Lead
    })
}

export async function updateLeadStatus(notionPageId: string, status: Lead["status"]): Promise<void> {
  const map: Record<Lead["status"], string> = {
    "yet-to-confirm": "Yet to confirm",
    "won":  "Won",
    "lost": "Lost",
  }
  await notion.pages.update({
    page_id: notionPageId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: { "Status ": { select: { name: map[status] } } } as any,
  })
}

// ─── Maintenance tickets ──────────────────────────────────────────────────

export type MaintenanceTicket = {
  notionPageId: string
  guestName: string
  room: string
  description: string
  category: string[]
  location: string[]
  isUrgent: boolean
  resolved: boolean
  assignedStaff: string[]
  cost: number | null
  fixType: string | null
  resolutionDate: string | null
  comment: string
  submittedAt: string
}

export async function getMaintenanceTickets(): Promise<MaintenanceTicket[]> {
  const pages = await queryDatabase(DB_MAINTENANCE)

  return pages.map(p => {
      const props = p.properties
      const rt  = (k: string) => (props[k] as {type:"rich_text";rich_text:{plain_text:string}[]}|undefined)?.rich_text.map(r => r.plain_text).join("").trim() ?? ""
      const ms  = (k: string) => ((props[k] as {type:"multi_select";multi_select:{name:string}[]}|undefined)?.multi_select ?? []).map(o => o.name)
      const sel = (k: string) => (props[k] as {type:"select";select:{name:string}|null}|undefined)?.select?.name ?? ""
      const num = (k: string) => (props[k] as {type:"number";number:number|null}|undefined)?.number ?? null
      const chk = (k: string) => (props[k] as {type:"checkbox";checkbox:boolean}|undefined)?.checkbox ?? false
      const dt  = (k: string) => (props[k] as {type:"date";date:{start:string}|null}|undefined)?.date?.start ?? null
      const ct  = (k: string) => (props[k] as {type:"created_time";created_time:string}|undefined)?.created_time ?? ""

      const urgencyOptions = ms("Is It Urgent?")
      const isUrgent = urgencyOptions.some(o => o.toLowerCase().includes("immediate"))

      return {
        notionPageId:   p.id,
        guestName:      rt("Name"),
        room:           String(num("Room Number") ?? ""),
        description:    rt("Describe The Issue"),
        category:       ms("What's Up?"),
        location:       ms("Where Is The Issue?"),
        isUrgent,
        resolved:       chk("Status"),
        assignedStaff:  ms("HK Staff "),
        cost:           num("Cost incurred"),
        fixType:        sel("Fix Type") || null,
        resolutionDate: dt("Date of resolution"),
        comment:        rt("Comment"),
        submittedAt:    ct("Submission time"),
      } satisfies MaintenanceTicket
    })
}

export async function resolveTicket(notionPageId: string, comment?: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: any = {
    "Status": { checkbox: true },
    "Date of resolution": { date: { start: new Date().toISOString().slice(0, 10) } },
  }
  if (comment) updates["Comment"] = { rich_text: [{ text: { content: comment } }] }
  await notion.pages.update({ page_id: notionPageId, properties: updates })
}

export async function assignTicket(notionPageId: string, staffNames: string[]): Promise<void> {
  await notion.pages.update({
    page_id: notionPageId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: { "HK Staff ": { multi_select: staffNames.map(n => ({ name: n })) } } as any,
  })
}

// ─── Bed page lookup (for confirm route) ─────────────────────────────────────

/**
 * Returns the name + check-in date of any active booking in the guest-info DB
 * that targets the same room and has a check-in date strictly after `afterDate`
 * and on or before `beforeDate`, excluding the current guest's own page.
 */
export async function findConflictingBookingsOnRoom({
  room, afterDate, beforeDate, excludePageId,
}: {
  room: string
  afterDate: string
  beforeDate: string
  excludePageId: string
}): Promise<{ guestName: string; checkIn: string }[]> {
  const DS_FORM = process.env.NOTION_DS_FORM!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (notion.dataSources as any).query({
    data_source_id: DS_FORM,
    filter: {
      and: [
        { property: "Room", rich_text: { contains: room.replace(/^Room\s*/i, "").trim() } },
        { property: "Check In Date", date: { after: afterDate } },
        { property: "Check In Date", date: { on_or_before: beforeDate } },
        { property: "Status", select: { does_not_equal: "Cancelled" } },
      ],
    },
    page_size: 10,
  })

  const conflicts: { guestName: string; checkIn: string }[] = []
  for (const p of res.results) {
    if (!isFullPage(p)) continue
    if (p.id === excludePageId) continue
    const name = getTitle(p, "🧑‍💼 Guest Name") || getRichText(p, "Guest Name") || "Unknown guest"
    const checkIn = getDate(p, "Check In Date")
    if (checkIn) conflicts.push({ guestName: name, checkIn })
  }
  return conflicts
}

export async function findBedPageId(
  property: "safina-plaza" | "peepal-tree",
  roomNumber: string,
  bedLabel: string | null
): Promise<string | null> {
  const dataSourceId = property === "safina-plaza" ? DS_PLAZA : DS_PEEPAL
  const pages = await queryAll(dataSourceId)

  // The Room select field stores values like "202 A", "301", "105B", "302AB"
  // Build the target string to match against what parseRoom would reconstruct
  const target = bedLabel ? `${roomNumber} ${bedLabel}` : roomNumber

  for (const page of pages) {
    const raw = getSelect(page, "Room")
    if (!raw) continue
    const { base, bed } = parseRoom(raw)
    // Reconstruct to canonical form for comparison
    const canonical = bed ? `${base} ${bed}` : base
    if (canonical.toLowerCase() === target.toLowerCase()) {
      return page.id
    }
  }

  return null
}
