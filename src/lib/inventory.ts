// Static bed inventory — update when room status changes
// Last synced: 17 Jun 2026

export type BedCategory = "Premium" | "Standard"
export type BedSize    = "Single" | "Double"
export type AvailabilityStatus = "Vacant" | "Occupied" | "Blocked"

export interface BedListing {
  id:                   string
  property:             "safina-plaza"
  roomNumber:           string
  bedLabel:             string | null  // "A" | "B" | null for single/whole-room listings
  category:             BedCategory
  size:                 BedSize        // Single = private room, Double = shared-room bed
  status:               AvailabilityStatus
  availableFrom:        string | null  // ISO date, null = immediate (Vacant) or TBC (Occupied)
  availableUntil:       string | null  // ISO date — set for Blocked beds whose block starts in the future
  isTemporarilyAvailable: boolean      // true when Blocked but block hasn't started yet
  blockStartDate:       string | null  // raw block-start date for Blocked beds; derived fields computed at call time
  monthlyRate:          number
  weeklyRate:           number
  // For a vacant bed in a SHARING room: the gender of the existing occupant in
  // the other bed, or null if the room is empty (no gender restriction applies).
  // "other" is preserved so a non-binary occupant only matches another "other".
  roommateGender?:      "male" | "female" | "other" | null
}

// ─── Price matrix (INR, GST inclusive) ───────────────────────────────────────

const RATES: Record<"safina-plaza", Partial<Record<`${BedCategory}-${BedSize}`, { monthly: number; weekly: number }>>> = {
  "safina-plaza": {
    "Premium-Double":   { monthly: 25000, weekly: 25000 },
    "Premium-Single":   { monthly: 50000, weekly: 25000 },
    "Standard-Double":  { monthly: 21500, weekly: 25000 },
    "Standard-Single":  { monthly: 43500, weekly: 25000 },
  },
}

function bed(
  property:      BedListing["property"],
  roomNumber:    string,
  bedLabel:      string | null,
  category:      BedCategory,
  size:          BedSize,
  status:        AvailabilityStatus,
  // For Occupied beds: date from which this bed is available (guest check-out date)
  // For Blocked beds:  date from which this bed becomes blocked (block start date)
  dateField:     string | null,
): BedListing {
  const r = RATES[property][`${category}-${size}`] ?? { monthly: 0, weekly: 0 }

  // Store raw data — derived fields (isTemporarilyAvailable, availableUntil, status override)
  // are computed at call time in the helper functions so they never go stale.
  return {
    id: bedLabel ? `${roomNumber}-${bedLabel}` : roomNumber,
    property,
    roomNumber,
    bedLabel,
    category,
    size,
    status,
    availableFrom:          status === "Occupied" ? dateField : null,
    blockStartDate:         status === "Blocked"  ? dateField : null,
    availableUntil:         null,  // resolved at call time
    isTemporarilyAvailable: false, // resolved at call time
    monthlyRate: r.monthly,
    weeklyRate:  r.weekly,
  }
}

// ─── Safina Plaza ─────────────────────────────────────────────────────────────
// 2nd floor — Premium | 3rd floor — Standard

export const safinaPlazaBeds: BedListing[] = [
  // 2F — Premium Double (shared)
  bed("safina-plaza", "201", null, "Premium", "Double",  "Occupied", "2026-09-09"),
  bed("safina-plaza", "202", "A",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "202", "B",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "205", "A",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "205", "B",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "206", "A",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "206", "B",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "207", "A",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "207", "B",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "208", "A",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "208", "B",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "209", "A",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "209", "B",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "210", "A",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "210", "B",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "211", "A",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "211", "B",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "212", "A",  "Premium", "Double",  "Vacant",   null),
  bed("safina-plaza", "212", "B",  "Premium", "Double",  "Vacant",   null),
  // 2F — Premium Single (private)
  bed("safina-plaza", "203", null, "Premium", "Single",  "Vacant",   null),
  bed("safina-plaza", "214", null, "Premium", "Single",  "Vacant",   null),
  bed("safina-plaza", "216", null, "Premium", "Single",  "Vacant",   null),
  bed("safina-plaza", "217", null, "Premium", "Single",  "Vacant",   null),
  bed("safina-plaza", "218", null, "Premium", "Single",  "Occupied", "2026-10-01"),
  // 3F — Standard Double (shared)
  bed("safina-plaza", "301", "A",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "301", "B",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "302", "A",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "302", "B",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "303", "A",  "Standard", "Double", "Occupied", "2026-09-20"),
  bed("safina-plaza", "303", "B",  "Standard", "Double", "Occupied", "2026-07-01"),
  bed("safina-plaza", "305", "A",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "305", "B",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "306", "A",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "306", "B",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "307", "A",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "307", "B",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "308", "A",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "308", "B",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "309", "A",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "309", "B",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "310", "A",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "310", "B",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "312", "A",  "Standard", "Double", "Occupied", "2026-06-30"),
  bed("safina-plaza", "312", "B",  "Standard", "Double", "Occupied", "2026-06-22"),
  bed("safina-plaza", "314", "A",  "Standard", "Double", "Vacant",   null),
  bed("safina-plaza", "314", "B",  "Standard", "Double", "Vacant",   null),
  bed("safina-plaza", "315", "A",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "315", "B",  "Standard", "Double", "Vacant",   null),
  bed("safina-plaza", "316", "B",  "Standard", "Double", "Occupied", null),
  bed("safina-plaza", "317", "A",  "Standard", "Double", "Vacant",   null),
  bed("safina-plaza", "317", "B",  "Standard", "Double", "Occupied", null),
  // 3F — Standard Single (private)
  bed("safina-plaza", "304", null, "Standard", "Single", "Occupied", null),
  bed("safina-plaza", "311", null, "Standard", "Single", "Blocked",  null),
  bed("safina-plaza", "316", "A",  "Standard", "Single", "Occupied", "2026-07-31"),
  bed("safina-plaza", "318", null, "Standard", "Single", "Occupied", null),
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const allBeds: BedListing[] = [...safinaPlazaBeds]

function todayMidnight(): Date {
  const t = new Date(); t.setHours(0, 0, 0, 0); return t
}

function resolveBlocked(bed: BedListing): { isTemporarilyAvailable: boolean; availableUntil: string | null; effectiveStatus: AvailabilityStatus } {
  if (bed.status !== "Blocked" || !bed.blockStartDate) {
    return { isTemporarilyAvailable: bed.isTemporarilyAvailable, availableUntil: bed.availableUntil, effectiveStatus: bed.status }
  }
  const today = todayMidnight()
  const blockDate = new Date(bed.blockStartDate + "T00:00:00")
  const isTemporarilyAvailable = blockDate > today
  const availableUntil = isTemporarilyAvailable
    ? new Date(blockDate.getTime() - 86400000).toISOString().slice(0, 10)
    : null
  return { isTemporarilyAvailable, availableUntil, effectiveStatus: isTemporarilyAvailable ? "Vacant" : "Blocked" }
}

export function getAvailableBeds(property?: BedListing["property"]): BedListing[] {
  return allBeds.filter((b) => {
    if (property != null && b.property !== property) return false
    if (b.status === "Vacant") return true
    if (b.status === "Occupied" && b.availableFrom !== null) return true
    if (b.status === "Blocked" && b.blockStartDate) {
      return resolveBlocked(b).isTemporarilyAvailable
    }
    return false
  })
}

export function getVacantCount(property: BedListing["property"]): number {
  const today = todayMidnight()
  return allBeds.filter((b) => {
    if (b.property !== property) return false
    if (b.status === "Vacant") return true
    if (b.status === "Blocked" && b.blockStartDate) {
      return new Date(b.blockStartDate + "T00:00:00") > today
    }
    return false
  }).length
}

export function formatAvailableFrom(bed: BedListing): string {
  const { isTemporarilyAvailable, availableUntil } = resolveBlocked(bed)
  if (isTemporarilyAvailable && availableUntil) {
    const d = new Date(availableUntil)
    return `Available until ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
  }
  if (bed.status === "Vacant")  return "Available now"
  if (bed.status === "Blocked") return "Not available"
  if (!bed.availableFrom)       return "Date TBC"
  const d = new Date(bed.availableFrom)
  return `From ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
}

export function getRoomLabel(bed: BedListing): string {
  if (bed.bedLabel) return `Room ${bed.roomNumber} · Bed ${bed.bedLabel}`
  return `Room ${bed.roomNumber}`
}
