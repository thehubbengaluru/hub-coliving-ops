import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import type { Room, Bed, BedStatus, Floor, Gender, Property } from "./types"
import { normalizeRoomTier, rateForTier, tierFromRate } from "./pricing"
import { cancelPaymentLink } from "./razorpay"

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
    guestEmail: (!isVacant && status !== "blocked") ? (getEmail(page, "Email") ?? undefined) : undefined,
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
  property: Property,
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
    // NOTION_DS_PEEPAL isn't configured yet — skip rather than throw, so Plaza
    // data still loads. Set the env var to bring Peepal Tree onto the board.
    DS_PEEPAL ? queryAll(DS_PEEPAL) : Promise.resolve([]),
  ])

  const plaza  = groupRooms(plazaPages,  "safina-plaza", "feazzo",          plazaBed,  null,              "Deposit Amount (₹)")
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
  const existingStatus = getSelect(existing, "Status")

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
  notionPageId, guestName, gender, phone, email,
  checkInDate, checkOutDate, monthlyRate,
}: {
  notionPageId: string
  property: Property
  guestName: string
  gender: "male" | "female" | "other"
  phone: string
  email: string
  checkInDate: string
  checkOutDate?: string
  monthlyRate: number
}) {
  // Guard: never overwrite a bed still held by a different live guest.
  await assertBedVacant(notionPageId, email, phone)

  // Preserve the real gender on the board — never coerce "Other" to "Male", or
  // the sharing-room roommate filter (which matches on this value) is corrupted.
  const genderLabel = gender === "male" ? "Male" : gender === "female" ? "Female" : "Other"
  const props: Props = {
    "Member Name":    { title: [{ text: { content: guestName } }] },
    "Gender":         { select: { name: genderLabel } },
    "Check In Date":  { date: { start: checkInDate } },
    "Check Out Date ": checkOutDate ? { date: { start: checkOutDate } } : { date: null },
    "Phone":          { phone_number: phone },
    "Email":          { email },
  }
  props["Deposit Amount (₹)"] = { number: monthlyRate }
  props["Deposit Paid ✓"]     = { checkbox: false }
  await notion.pages.update({ page_id: notionPageId, properties: props })
}

// ─── Alumni sync ──────────────────────────────────────────────────────────

const DB_ALUMNI = "2c469190ee9b80dc8fc1fa71efb15d96"

export async function syncGuestToAlumni({
  notionPageId,
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
  property: Property
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
    "Property":    { select: { name: "Safina Plaza" } },
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
  // NOTE: the Alumni DB's "Room Type" is a single-SELECT — writing multi_select
  // makes Notion reject the archive and aborts the whole checkout.
  if (roomTypeName) {
    props["Room Type"] = { select: { name: roomTypeName } }
  } else if (roomType) {
    const effectiveTariff = depAmount ?? tariff ?? 0
    const isDeluxe =
      (roomType === "sharing" && effectiveTariff > 25000) ||
      (roomType === "private" && effectiveTariff > 50000)
    const tier = `${isDeluxe ? "Deluxe" : "Standard"} ${roomType === "private" ? "Private" : "Sharing"}`
    props["Room Type"] = { select: { name: tier } }
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

  // Idempotency: if checkout ran before (e.g. the bed-clear step failed and it
  // was retried), an Alumni record for this guest + check-out date already
  // exists — return it instead of creating a duplicate.
  if (email) {
    try {
      const res = await fetchNotionWithRetry(`https://api.notion.com/v1/databases/${DB_ALUMNI}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: {
            and: [
              { property: "Email", email: { equals: email } },
              { property: "Check Out Date ", date: { equals: checkOutDate } },
            ],
          },
          page_size: 1,
        }),
      })
      if (res.ok) {
        const data = await res.json() as { results?: { id: string }[] }
        if (data.results && data.results.length) {
          console.log("[syncGuestToAlumni] existing Alumni record found — skipping duplicate:", data.results[0].id)
          return data.results[0].id
        }
      }
    } catch (e) {
      console.warn("[syncGuestToAlumni] dedup check failed (proceeding to create):", e)
    }
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
 * Plaza encodes "serviced" in Member Name. Block metadata is appended as page
 * content so we never depend on bespoke properties.
 */
export async function blockBed({
  notionPageId, reason, fromDate, untilDate, blockedBy,
}: {
  notionPageId: string
  property?: Property
  reason: string
  fromDate?: string
  untilDate?: string
  blockedBy: string
}): Promise<void> {
  const page = await notion.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse
  if (isFullPage(page)) {
    const name = getTitle(page, "Member Name")
    const status = getSelect(page, "Status")
    const namedGuest = !!name && !name.startsWith("Vacant") && status !== "Checked-Out" && !name.toLowerCase().includes("serviced")
    // An "incoming" soft hold still reads "Vacant" as its title but has the
    // deposit paid — it's a real reservation and must not be blocked out from
    // under the guest. Treat a deposit-paid or future-dated hold as live too.
    const depositPaidProp = page.properties["Deposit Paid ✓"]
    const depositHeld = depositPaidProp?.type === "checkbox" && depositPaidProp.checkbox === true
    if (namedGuest || depositHeld) {
      throw new BedOccupiedError(name || "incoming reservation")
    }
  }

  const props: Props = {
    "Member Name": { title: [{ text: { content: "Vacant — serviced" } }] },
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
  notionPageId,
}: {
  notionPageId: string
  property?: Property
}): Promise<void> {
  const props: Props = { "Member Name": { title: [{ text: { content: "Vacant" } }] } }
  await notion.pages.update({ page_id: notionPageId, properties: props })
}

export async function checkOutGuest({
  notionPageId, checkOutDate,
}: {
  notionPageId: string
  property?: Property
  checkOutDate: string
}) {
  const props: Props = {
    "Check Out Date ": { date: { start: checkOutDate } },
    "Member Name": { title: [{ text: { content: "Vacant" } }] },
  }
  await notion.pages.update({ page_id: notionPageId, properties: props })
}

// Active members with a scheduled check-out date, for extend-stay reminders
// and the final pro-rated rent link.
export type UpcomingCheckout = {
  notionPageId: string
  property: Property
  name: string
  email: string | null
  phone: string | null
  checkIn: string | null
  checkOut: string
  daysUntil: number
  monthlyRate: number
  tags: string[]
}

export async function getUpcomingCheckouts(): Promise<UpcomingCheckout[]> {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const out: UpcomingCheckout[] = []

  for (const [property, ds] of [["safina-plaza", DS_PLAZA]] as const) {
    const pages = await queryAll(ds)
    for (const page of pages) {
      const name = getTitle(page, "Member Name")
      if (!name || name.startsWith("Vacant")) continue
      const checkOut = getDate(page, "Check Out Date ")
      if (!checkOut) continue
      const co = new Date(checkOut + "T00:00:00")
      const daysUntil = Math.round((co.getTime() - today.getTime()) / 86_400_000)
      if (daysUntil < 0) continue
      const monthlyRate =
        getNumber(page, "Monthly Rent") ??
        getNumber(page, "Tariff") ??
        getNumber(page, "Room Type Default Tariff Incl GST") ??
        getNumber(page, "Deposit Amount (₹)") ??
        0
      out.push({
        notionPageId: page.id, property, name,
        email: getEmail(page, "Email"),
        phone: getPhone(page, "Phone"),
        checkIn: getDate(page, "Check In Date"),
        checkOut, daysUntil, monthlyRate,
        tags: [...getMultiSelect(page, "Tags"), ...getMultiSelect(page, "Type")],
      })
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

/**
 * Append a dated, attributed note to a member's page in the active members
 * directory. Written as a page-content callout block (never a bespoke property)
 * so notes accumulate non-destructively and can never overwrite the guest record.
 */
export async function addGuestNote({
  notionPageId, note, author,
}: {
  notionPageId: string
  note: string
  author: string
}): Promise<void> {
  const stamp = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
  await notion.blocks.children.append({
    block_id: notionPageId,
    children: [{
      object: "block",
      type: "callout",
      callout: {
        rich_text: [{ type: "text", text: { content: `${note}\n— ${author} · ${stamp}` } }],
        icon: { emoji: "📝" },
      },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any],
  })
}

/** Set the guest tags (multi_select "Tags") on a member page. Best-effort. */
export async function setGuestTags(notionPageId: string, tags: string[]): Promise<void> {
  await notion.pages.update({
    page_id: notionPageId,
    properties: { "Tags": { multi_select: tags.map((name) => ({ name })) } },
  })
}

// ─── Rent auto-debit failure tracking (webhook-driven) ─────────────────────
// Policy: auto-debit retries 4 times; the 5th failure triggers a late fee +
// one-off payment link. The counter lives on the member page ("Rent Failure
// Count", number) so it survives across stateless webhook invocations, and is
// reset to 0 on every successful charge. The "Rent Overdue" tag doubles as the
// idempotency marker so escalation (link + late fee) happens at most once per
// overdue episode.

const RENT_FAILURE_PROP = "Rent Failure Count"
export const RENT_OVERDUE_TAG = "Rent Overdue"

export async function findMemberPageByEmail(email: string): Promise<PageObjectResponse | null> {
  if (!email?.trim()) return null
  for (const ds of [DS_PLAZA]) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await (notion.dataSources as any).query({
        data_source_id: ds,
        filter: { property: "Email", email: { equals: email.trim() } },
        page_size: 1,
      })
      const page = res.results?.find((p: unknown) => isFullPage(p as PageObjectResponse))
      if (page) return page as PageObjectResponse
    } catch (e) {
      console.warn("[findMemberPageByEmail] query failed:", e)
    }
  }
  return null
}

/**
 * Increment the guest's rent-failure counter and return the new count.
 * count is null when the member page can't be found or the DB lacks the
 * "Rent Failure Count" number property (callers then rely on Razorpay's
 * subscription.halted event as the escalation backstop).
 */
export async function recordRentChargeFailure(email: string): Promise<{
  count: number | null
  pageId: string | null
  alreadyOverdue: boolean
}> {
  const page = await findMemberPageByEmail(email)
  if (!page) return { count: null, pageId: null, alreadyOverdue: false }

  const alreadyOverdue = getMultiSelect(page, "Tags").includes(RENT_OVERDUE_TAG)
  const prop = page.properties[RENT_FAILURE_PROP]
  if (prop?.type !== "number") {
    console.warn(`[recordRentChargeFailure] add a number property "${RENT_FAILURE_PROP}" to the member DB to enable retry counting`)
    return { count: null, pageId: page.id, alreadyOverdue }
  }

  const count = (prop.number ?? 0) + 1
  await notion.pages.update({
    page_id: page.id,
    properties: { [RENT_FAILURE_PROP]: { number: count } },
  })
  return { count, pageId: page.id, alreadyOverdue }
}

/** Look up overdue state without incrementing (used by subscription.halted). */
export async function getRentOverdueState(email: string): Promise<{ pageId: string | null; alreadyOverdue: boolean }> {
  const page = await findMemberPageByEmail(email)
  if (!page) return { pageId: null, alreadyOverdue: false }
  return { pageId: page.id, alreadyOverdue: getMultiSelect(page, "Tags").includes(RENT_OVERDUE_TAG) }
}

/** Add the "Rent Overdue" tag, preserving the guest's other tags. Best-effort. */
export async function markRentOverdue(notionPageId: string): Promise<void> {
  try {
    const page = await notion.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse
    const tags = getMultiSelect(page, "Tags")
    if (tags.includes(RENT_OVERDUE_TAG)) return
    await setGuestTags(notionPageId, [...tags, RENT_OVERDUE_TAG])
  } catch (e) {
    console.warn("[markRentOverdue] failed:", e)
  }
}

/** Zero the failure counter and drop the "Rent Overdue" tag after a successful charge. Best-effort. */
export async function resetRentChargeFailures(email: string): Promise<void> {
  const page = await findMemberPageByEmail(email)
  if (!page) return
  await clearRentDunningState(page.id, page)
}

// ─── Daily rent dunning (cron-driven) ───────────────────────────────────────
// The webhook opens an overdue episode (5 failed debits → link + tag); the
// daily cron then owns the timeline: reminder emails through the 3rd, a
// cancelled-and-reissued link with a growing ₹500/day late fee from the 4th,
// and a default (vacate notice, deposit forfeited) on the 10th. The current
// link id + fee-free base amount live on the member page so the stateless cron
// can cancel yesterday's link and issue today's.

const DUE_RENT_LINK_PROP = "Due Rent Link ID"   // rich_text
const DUE_RENT_BASE_PROP = "Due Rent Base (₹)"  // number — amount owed before late fees
export const RENT_DEFAULTED_TAG = "Rent Defaulted"

export type RentDunningMember = {
  pageId: string
  property: Property
  name: string
  email: string | null
  phone: string | null
  checkIn: string | null
  checkOut: string | null
  monthlyRate: number
  dueLinkId: string | null
  dueBase: number | null
  overdue: boolean
  defaulted: boolean
}

/** One pass over active members with everything the daily dunning sweep needs. */
export async function getRentDunningSnapshot(): Promise<RentDunningMember[]> {
  const out: RentDunningMember[] = []
  for (const [property, ds] of [["safina-plaza", DS_PLAZA]] as const) {
    const pages = await queryAll(ds)
    for (const page of pages) {
      const name = getTitle(page, "Member Name")
      if (!name || name.startsWith("Vacant")) continue
      const tags = getMultiSelect(page, "Tags")
      const monthlyRate =
        getNumber(page, "Monthly Rent") ??
        getNumber(page, "Tariff") ??
        getNumber(page, "Room Type Default Tariff Incl GST") ??
        getNumber(page, "Deposit Amount (₹)") ??
        0
      const dueLinkProp = page.properties[DUE_RENT_LINK_PROP]
      const dueLinkId = dueLinkProp?.type === "rich_text"
        ? (dueLinkProp.rich_text.map((t) => t.plain_text).join("").trim() || null)
        : null
      out.push({
        pageId: page.id,
        property,
        name,
        email: getEmail(page, "Email"),
        phone: getPhone(page, "Phone"),
        checkIn: getDate(page, "Check In Date"),
        checkOut: getDate(page, "Check Out Date "),
        monthlyRate,
        dueLinkId,
        dueBase: getNumber(page, DUE_RENT_BASE_PROP),
        overdue: tags.includes(RENT_OVERDUE_TAG),
        defaulted: tags.includes(RENT_DEFAULTED_TAG),
      })
    }
  }
  return out
}

/**
 * Record the currently-live due-rent link. Returns true on success, false if
 * the write failed (e.g. the member DB lacks the tracking properties) — callers
 * MUST treat false as "the link pointer was NOT persisted" and avoid issuing
 * another link they can't later cancel (otherwise stale links accumulate).
 */
export async function setDueRentLink(pageId: string, linkId: string, baseAmount: number): Promise<boolean> {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        [DUE_RENT_LINK_PROP]: { rich_text: [{ text: { content: linkId } }] },
        [DUE_RENT_BASE_PROP]: { number: baseAmount },
      },
    })
    return true
  } catch (e) {
    console.warn(`[setDueRentLink] add "${DUE_RENT_LINK_PROP}" (text) and "${DUE_RENT_BASE_PROP}" (number) to the member DB to enable dunning link tracking:`, e)
    return false
  }
}

/** Tag the member as defaulted (10th of the month, rent still unpaid). Idempotent, best-effort. */
export async function markRentDefaulted(pageId: string): Promise<void> {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId }) as PageObjectResponse
    const tags = getMultiSelect(page, "Tags")
    if (tags.includes(RENT_DEFAULTED_TAG)) return
    await setGuestTags(pageId, [...tags, RENT_DEFAULTED_TAG])
    // Record the deposit as forfeited per policy — the day-10 emails already
    // assert it, but nothing used to write the state (types had it, dunning
    // never set it). This makes forfeiture a real, visible ledger fact.
    await setDepositStatus(pageId, "forfeited")
  } catch (e) {
    console.warn("[markRentDefaulted] failed:", e)
  }
}

/**
 * Close a dunning episode after payment: zero the failure counter, drop the
 * overdue/defaulted tags and clear the stored link. Best-effort.
 */
export async function clearRentDunningState(pageId: string, preloaded?: PageObjectResponse): Promise<void> {
  try {
    const page = preloaded ?? await notion.pages.retrieve({ page_id: pageId }) as PageObjectResponse

    // Cancel the still-live dunning link BEFORE we blank its pointer. Otherwise
    // the link (created with reminder_enable) keeps nudging the guest to pay a
    // debt they've already settled — and once the pointer is cleared, nothing
    // can ever find it to cancel it (double-payment / orphan link). Best-effort.
    const dueLinkProp = page.properties[DUE_RENT_LINK_PROP]
    const dueLinkId = dueLinkProp?.type === "rich_text"
      ? dueLinkProp.rich_text.map((t) => t.plain_text).join("").trim()
      : ""
    if (dueLinkId) {
      try { await cancelPaymentLink("safina-plaza", dueLinkId) }
      catch (e) { console.warn("[clearRentDunningState] link cancel failed:", e) }
    }

    const props: Props = {}
    if (page.properties[RENT_FAILURE_PROP]?.type === "number" && (getNumber(page, RENT_FAILURE_PROP) ?? 0) !== 0) {
      props[RENT_FAILURE_PROP] = { number: 0 }
    }
    const tags = getMultiSelect(page, "Tags")
    const wasDefaulted = tags.includes(RENT_DEFAULTED_TAG)
    if (tags.includes(RENT_OVERDUE_TAG) || wasDefaulted) {
      props["Tags"] = {
        multi_select: tags.filter((t) => t !== RENT_OVERDUE_TAG && t !== RENT_DEFAULTED_TAG).map((name) => ({ name })),
      }
    }
    // A redeemed defaulter's deposit is no longer forfeited — restore "held".
    if (wasDefaulted && page.properties["Deposit Status"]?.type === "select") {
      props["Deposit Status"] = { select: { name: "Held" } }
    }
    if (page.properties[DUE_RENT_LINK_PROP]?.type === "rich_text") {
      props[DUE_RENT_LINK_PROP] = { rich_text: [] }
    }
    if (page.properties[DUE_RENT_BASE_PROP]?.type === "number") {
      props[DUE_RENT_BASE_PROP] = { number: null }
    }
    if (Object.keys(props).length === 0) return
    await notion.pages.update({ page_id: page.id, properties: props })
  } catch (e) {
    console.warn("[clearRentDunningState] failed:", e)
  }
}

export const EVICTION_TAG = "Eviction"

// Record a failed inspection: increment the strike counter and, on the 3rd,
// tag the member for eviction. Returns the new count + whether eviction is due.
// Best-effort on the counter (needs a "Failed Inspections" number property).
export async function recordFailedInspection(pageId: string, strikesForEviction: number): Promise<{ count: number; evict: boolean }> {
  const PROP = "Failed Inspections"
  const page = await notion.pages.retrieve({ page_id: pageId }) as PageObjectResponse
  const prop = page.properties[PROP]
  const prev = prop?.type === "number" ? (prop.number ?? 0) : 0
  const count = prev + 1
  const evict = count >= strikesForEviction
  try {
    if (prop?.type === "number") {
      await notion.pages.update({ page_id: pageId, properties: { [PROP]: { number: count } } })
    } else {
      console.warn(`[recordFailedInspection] add a "${PROP}" number property to track strikes`)
    }
    if (evict) {
      const tags = getMultiSelect(page, "Tags")
      if (!tags.includes(EVICTION_TAG)) await setGuestTags(pageId, [...tags, EVICTION_TAG])
    }
  } catch (e) {
    console.warn("[recordFailedInspection] failed:", e)
  }
  return { count, evict }
}

export type DepositStatus = "held" | "refunded" | "forfeited"

// Best-effort write of the deposit lifecycle state to a member page. Mirrors the
// authoritative ledger state so ops can see it in Notion. No-ops (with a warn)
// if the DB lacks a "Deposit Status" select — never fails the caller.
export async function setDepositStatus(pageId: string, status: DepositStatus): Promise<void> {
  try {
    const page = await notion.pages.retrieve({ page_id: pageId }) as PageObjectResponse
    if (page.properties["Deposit Status"]?.type !== "select") {
      console.warn(`[setDepositStatus] add a "Deposit Status" select to the member DB to record ${status}`)
      return
    }
    await notion.pages.update({
      page_id: pageId,
      properties: { "Deposit Status": { select: { name: status.charAt(0).toUpperCase() + status.slice(1) } } },
    })
  } catch (e) {
    console.warn("[setDepositStatus] failed:", e)
  }
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
 * Confirm a bed as Occupied once payment lands. Plaza derives occupancy from
 * Member Name (already written at check-in), so this is a no-op there. Safe
 * no-op if the page is not a bed page.
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
  for (const ds of [DS_PLAZA]) {
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
  formPageId,
}: {
  oldBedPageId: string
  newBedPageId: string
  newRoomLabel: string
  property?: Property
  formPageId?: string
}): Promise<void> {
  // 1 — Read both bed pages. We need the target schema so we only write fields
  //     it actually has.
  const oldPage = await loadBedPage(oldBedPageId)
  if (!oldPage) throw new Error("Source bed page not found")
  const newPage = await loadBedPage(newBedPageId)
  if (!newPage) throw new Error("Destination bed page not found")

  const guestName = getTitle(oldPage, "Member Name")
  const email     = getEmail(oldPage, "Email")
  const phone     = getPhone(oldPage, "Phone")
  const checkIn   = getDate(oldPage, "Check In Date")
  const incoming  = checkIn ? new Date(checkIn) > new Date() : false

  // 2 — Assert the new bed is empty (never overwrite a live guest). Always run
  //     the guard — even for a phone-only guest (room-board invites have no
  //     email) — so a phone-only move can't silently overwrite an occupant.
  //     assertBedVacant matches the incoming guest by email OR phone digits.
  await assertBedVacant(newBedPageId, email ?? "", phone ?? undefined)

  // Also refuse a bed that is currently blocked for servicing — reassigning
  // onto it would silently clear the block. The block must be lifted first.
  if (getTitle(newPage, "Member Name").toLowerCase().includes("serviced")) {
    throw new BedOccupiedError("Vacant — serviced (blocked)")
  }

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

  // 6 — ID-document files are NOT moved (Notion-hosted file URLs expire and
  //     can't be re-attached to another page via the API). If the old bed held
  //     any files, flag ops on the NEW bed to re-attach them so KYC isn't lost.
  const hadFiles = Object.values(oldPage.properties).some(
    (p) => p.type === "files" && Array.isArray(p.files) && p.files.length > 0,
  )
  if (hadFiles) {
    try {
      await notion.blocks.children.append({
        block_id: newBedPageId,
        children: [{
          object: "block",
          type: "callout",
          callout: {
            rich_text: [{ type: "text", text: { content: `📎 ID documents did not transfer automatically on the room move from the previous bed — please re-attach ${guestName}'s KYC files here (they remain on the old bed record until it's reused).` } }],
            icon: { emoji: "📎" },
          },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any],
      })
    } catch (e) {
      console.warn("[reassignBed] ID-doc reattach note failed:", e)
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
  property: Property | null
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

function inferProperty(room: string): Property | null {
  const base = room.trim().replace(/\s*[AB]+$/i, "").replace("AB", "")
  const n = parseInt(base, 10)
  if (isNaN(n)) return null
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

/**
 * All Guest Info Form pages submitted with this email, newest first. A guest
 * who has booked more than once has one page (and one KYC document folder in
 * Supabase, keyed by the page id) per booking.
 */
export async function findGuestFormPages(email: string): Promise<{ pageId: string; guestName: string; submittedAt: string }[]> {
  const needle = email.trim().toLowerCase()
  if (!needle) return []
  const pages = await queryAll(DS_FORM)
  return pages
    .map(formBooking)
    .filter(b => b.email.trim().toLowerCase() === needle)
    .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
    .map(b => ({ pageId: b.notionPageId, guestName: b.guestName, submittedAt: b.submittedAt }))
}

/**
 * Plaza member pages for this email. Legacy guests (pre-portal) exist only
 * here, and their backfilled KYC documents live under the member page id —
 * the document lookup checks these folders alongside the form pages.
 */
export async function findMemberPagesByEmail(email: string): Promise<{ pageId: string; guestName: string; submittedAt: string }[]> {
  const needle = email.trim().toLowerCase()
  if (!needle) return []
  const pages = await queryAll(DS_PLAZA)
  return pages
    .filter(p => (getEmail(p, "Email") ?? "").trim().toLowerCase() === needle)
    .map(p => ({ pageId: p.id, guestName: getTitle(p, "Member Name"), submittedAt: getDate(p, "Check In Date") ?? "" }))
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
  const targetDS = DS_PLAZA
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
  await notion.pages.update({
    page_id: formPageId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // 6. Create rent subscription if phone + tariff available — bounded by the
  // stay window so it never auto-debits past check-out or a month collected
  // outside the mandate. Skipped when the stay has no fully-covered months.
  if (booking.phone && booking.tariff > 0) {
    try {
      const { createRentSubscription } = await import("./razorpay")
      const { computeRentSchedule } = await import("./rent-schedule")
      const schedule = computeRentSchedule(
        booking.checkInDate ?? new Date().toISOString().slice(0, 10),
        booking.checkOutDate,
        booking.tariff,
      )
      if (schedule.subscription) {
        const sub = await createRentSubscription({
          property: booking.property,
          guestName: booking.guestName,
          email: booking.email,
          phone: booking.phone,
          monthlyRate: booking.tariff,
          startISO: schedule.subscription.startISO,
          totalCount: schedule.subscription.cycles,
        })
        results.subscriptionUrl = sub.short_url
      }
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

    const res = await fetchNotionWithRetry(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    // Surface Notion's real error (429 rate-limit, 401 auth, …) instead of the
    // confusing "Cannot read properties of undefined (results)" that results
    // from blindly reading data.results off a non-2xx body.
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Notion query failed (${res.status}) for ${databaseId}: ${text.slice(0, 300)}`)
    }

    const data = await res.json() as { results: PageObjectResponse[]; has_more: boolean; next_cursor: string | null }
    for (const p of data.results) {
      if (isFullPage(p)) results.push(p)
    }
    cursor = data.has_more ? (data.next_cursor ?? undefined) : undefined
  } while (cursor)

  return results
}

// fetch() wrapper that retries Notion's 429 (rate-limit) a few times, honouring
// the Retry-After header. Notion allows ~3 req/s; a burst otherwise 429s and
// the whole sweep fails.
async function fetchNotionWithRetry(url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let res = await fetch(url, init)
  for (let i = 0; i < attempts && res.status === 429; i++) {
    const retryAfter = parseFloat(res.headers.get("retry-after") ?? "1")
    await new Promise((r) => setTimeout(r, Math.max(0.25, retryAfter) * 1000))
    res = await fetch(url, init)
  }
  return res
}

export type Lead = {
  notionPageId: string
  name: string
  phone: string
  gender: "male" | "female" | "other"
  property: Property | null
  roomType: "private" | "sharing" | null
  status: "yet-to-confirm" | "won" | "lost"
  // Which revenue stream this lead belongs to — co-living (the /book portal)
  // or residency (marketed through THP). Read from the Notion "Lead Type"
  // select; untagged legacy leads default to co-living.
  leadType: "co-living" | "residency"
  leadAmount: number | null
  leadDate: string | null
  responseDate: string | null
  conversionDate: string | null
  createdAt: string
}

function mapLeadProperty(raw: string | null): Property | null {
  if (!raw) return null
  return "safina-plaza"
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
        leadType:       g("Lead Type", "select").toLowerCase() === "residency" ? "residency" : "co-living",
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

export async function updateLeadType(notionPageId: string, leadType: Lead["leadType"]): Promise<void> {
  await notion.pages.update({
    page_id: notionPageId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: { "Lead Type": { select: { name: leadType === "residency" ? "Residency" : "Co-living" } } } as any,
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

/**
 * Razorpay artifact ids stored on a booking form page at link creation, so the
 * payment_link.expired webhook can cancel the sibling rent link and the
 * unauthorised subscription when the deposit window lapses.
 */
export async function getBookingRazorpayIds(formPageId: string): Promise<{ deposit?: string | null; prorated?: string | null; subscription?: string | null }> {
  try {
    const page = await notion.pages.retrieve({ page_id: formPageId }) as PageObjectResponse
    if (!isFullPage(page)) return {}
    const raw = getRichText(page, "Razorpay IDs")
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

/**
 * Assign the room-board bed for a booking, reading everything it needs from
 * the guest-info form page. Called by the Razorpay webhook once the DEPOSIT is
 * PAID — an unpaid booking must never hold a bed ("if the deposit is not paid
 * the room is not blocked"). Returns:
 *  - "assigned":  bed written (and Exploratory tag mirrored when applicable)
 *  - "deferred":  bed still held by a live occupant (future-dated booking) or
 *                 no matching bed page — ops assigns manually at turnover
 *  - "skipped":   the page isn't a guest-info form page
 */
export async function assignBedForBooking(formPageId: string): Promise<"assigned" | "deferred" | "skipped"> {
  const page = await notion.pages.retrieve({ page_id: formPageId }) as PageObjectResponse
  if (!isFullPage(page) || page.properties["🧑‍💼 Guest Name"]?.type !== "title") return "skipped"

  const guestName = getTitle(page, "🧑‍💼 Guest Name")
  const room      = getRichText(page, "Room") ?? ""
  const email     = getEmail(page, "✉️ Email") ?? ""
  const phoneNum  = page.properties["📞 Contact Number"]
  const phone     = phoneNum?.type === "number" && phoneNum.number != null ? String(phoneNum.number) : ""
  const genderRaw = getMultiSelect(page, "⚧️ Gender")[0]?.toLowerCase() ?? ""
  const checkIn   = getDate(page, "Check In Date")
  const stayRange = page.properties["📅 Check-in & Check-out Date (Estimated)"]
  const checkOut  = stayRange?.type === "date" ? stayRange.date?.end ?? null : null
  const tariff    = getNumber(page, "Tariff") ?? 0
  const tags      = getMultiSelect(page, "Tags")

  if (!guestName || !room || !checkIn) return "deferred"

  const roomMatch = room.match(/(\d+)(?:\s*·\s*Bed\s*([AB]))?/i)
  const bedPageId = await findBedPageId("safina-plaza", roomMatch?.[1] ?? room, roomMatch?.[2]?.toUpperCase() ?? null)
  if (!bedPageId) {
    console.warn("[assignBedForBooking] no bed page found for room:", room)
    return "deferred"
  }

  try {
    await checkInGuest({
      notionPageId: bedPageId,
      property: "safina-plaza",
      guestName,
      gender: genderRaw === "female" ? "female" : genderRaw === "other" ? "other" : "male",
      phone,
      email,
      checkInDate: checkIn,
      checkOutDate: checkOut ?? undefined,
      monthlyRate: tariff,
    })
  } catch (e) {
    if (e instanceof BedOccupiedError) {
      // Future-dated booking into a room whose occupant hasn't left yet — the
      // deposit is paid and the booking stands; ops assigns the bed at turnover.
      console.warn("[assignBedForBooking] deferred (bed still occupied):", e.message)
      return "deferred"
    }
    throw e
  }

  // The bed is paid for — mark it Occupied/Incoming as confirmed.
  try { await confirmBedOccupied(bedPageId) }
  catch (e) { console.warn("[assignBedForBooking] confirmBedOccupied failed:", e) }

  if (tags.includes("Exploratory")) {
    // Exploratory stays collect NO security deposit — clear the amount
    // checkInGuest wrote and tag the bed so ops knows nothing is refundable.
    try {
      await notion.pages.update({ page_id: bedPageId, properties: { "Deposit Amount (₹)": { number: null } } })
      await setGuestTags(bedPageId, ["Exploratory"])
    } catch (e) { console.warn("[assignBedForBooking] exploratory bed marking failed:", e) }
  } else {
    // This runs on deposit payment, so reflect it on the board.
    try { await markDepositPaid(bedPageId) }
    catch (e) { console.warn("[assignBedForBooking] markDepositPaid on bed failed:", e) }
  }
  return "assigned"
}

export async function findBedPageId(
  property: Property,
  roomNumber: string,
  bedLabel: string | null
): Promise<string | null> {
  void property
  const dataSourceId = DS_PLAZA
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
