import { NextResponse } from "next/server"
import { getRooms, getPendingBookings } from "@/lib/notion"
import type { BedListing, BedCategory, BedSize, AvailabilityStatus } from "@/lib/inventory"
import { rateLimit, clientKey } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"
export const revalidate = 0

function inferCategory(roomNumber: string, property: "safina-plaza" | "peepal-tree"): BedCategory {
  if (property === "peepal-tree") return "Standard"
  const n = parseInt(roomNumber, 10)
  return n >= 200 && n < 300 ? "Premium" : "Standard"
}

// Earliest FUTURE check-in promised for each bed, from non-cancelled bookings in
// the Guest Info DB — this is the upper bound (availableUntil) of the window a
// new guest may book a bed for. Keyed by "roomNumber|bedLabel" (bedLabel "" for
// private rooms), with a room-level fallback key "roomNumber".
async function nextBookingStarts(): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const todayISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
  try {
    const bookings = await getPendingBookings()
    for (const b of bookings) {
      const status = (b.status ?? "").toLowerCase()
      if (status.includes("cancel") || status.includes("expired") || status.includes("checked-out")) continue
      // Unpaid bookings ("Deposit Pending"/"Payment Pending") never block the
      // room — only a PAID deposit reserves the bed and caps the window.
      if (status.includes("pending")) continue
      if (!b.checkInDate || b.checkInDate < todayISO) continue
      const m = b.room.match(/(\d+)(?:\s*·\s*Bed\s*([AB]))?/i)
      if (!m) continue
      const keys = [`${m[1]}|${(m[2] ?? "").toUpperCase()}`, m[1]]
      for (const k of keys) {
        const prev = map.get(k)
        if (!prev || b.checkInDate < prev) map.set(k, b.checkInDate)
      }
    }
  } catch (e) {
    console.warn("[availability] next-booking scan failed:", e)
  }
  return map
}

// A 1-week stay is billed as 7 days pro-rated from the monthly rate (see
// rent-schedule), NOT a flat ₹25,000 — that legacy figure was higher than the
// Standard Sharing monthly and was never used by the schedule math. Derive the
// displayed weekly from the monthly so it matches what's actually charged.
const weeklyFor = (monthly: number) => Math.round((monthly / 30) * 7)

const MONTHLY_RATES: Record<"safina-plaza" | "peepal-tree", Record<`${BedCategory}-${BedSize}`, number>> = {
  "safina-plaza": {
    "Premium-Double":  25000,
    "Premium-Single":  50000,
    "Standard-Double": 21500,
    "Standard-Single": 43500,
  },
  "peepal-tree": {
    "Standard-Double": 18550,
    "Standard-Single": 39100,
    "Premium-Double":  18550,
    "Premium-Single":  39100,
  },
}

export async function GET(req: Request) {
  try {
    const limited = rateLimit(clientKey(req, "availability"), { limit: 60, windowMs: 60_000 })
    if (limited) return limited

    const rooms = await getRooms()
    const nextStarts = await nextBookingStarts()
    const beds: BedListing[] = []

    for (const room of rooms) {
      const category = inferCategory(room.number, room.property)
      const size: BedSize = room.type === "private" ? "Single" : "Double"

      for (const bed of room.beds) {
        const bedLabel = room.type === "sharing"
          ? (bed.bedNumber === 1 ? "A" : "B")
          : null

        const monthlyRate = MONTHLY_RATES[room.property][`${category}-${size}`]

        // Gender of the existing occupant in the OTHER bed of a sharing room.
        // null when the room is empty → no gender restriction on this bed.
        let roommateGender: "male" | "female" | "other" | null = null
        if (room.type === "sharing") {
          const sibling = room.beds.find((b) => b.bedNumber !== bed.bedNumber)
          const siblingOccupied = sibling && (sibling.status === "occupied" || sibling.status === "incoming" || sibling.status === "special")
          if (siblingOccupied && sibling) {
            // Preserve the real value including "other" (was coerced to male).
            roommateGender = sibling.genderRestriction === "female" ? "female"
              : sibling.genderRestriction === "other" ? "other" : "male"
          }
        }

        // Blocked beds whose block starts in the future are temporarily available.
        // Only applies to Peepal Tree where "blocked" is a staff-set status with a
        // future block date. On Plaza, "blocked" means the room is being serviced —
        // no block-start date semantics apply, so it is always truly blocked.
        if (bed.status === "blocked") {
          const today = new Date(); today.setHours(0, 0, 0, 0)
          const blockDate = room.property === "peepal-tree" && bed.checkIn
            ? new Date(bed.checkIn + "T00:00:00")
            : null
          const isTemporarilyAvailable = blockDate !== null && blockDate > today
          if (isTemporarilyAvailable && blockDate) {
            const availableUntil = new Date(blockDate.getTime() - 86400000).toISOString().slice(0, 10)
            beds.push({
              id: bedLabel ? `${room.number}-${bedLabel}` : room.number,
              property: room.property,
              roomNumber: room.number,
              bedLabel,
              category,
              size,
              status: "Vacant",
              availableFrom: null,
              availableUntil,
              isTemporarilyAvailable: true,
              blockStartDate: bed.checkIn ?? null,
              monthlyRate,
              weeklyRate: weeklyFor(monthlyRate),
            })
          } else {
            beds.push({
              id: bedLabel ? `${room.number}-${bedLabel}` : room.number,
              property: room.property,
              roomNumber: room.number,
              bedLabel,
              category,
              size,
              status: "Blocked",
              availableFrom: null,
              availableUntil: null,
              isTemporarilyAvailable: false,
              blockStartDate: null,
              monthlyRate,
              weeklyRate: weeklyFor(monthlyRate),
            })
          }
          continue
        }

        let status: AvailabilityStatus
        if (bed.status === "vacant") {
          status = "Vacant"
        } else {
          // occupied, incoming, special all mean not available right now
          status = "Occupied"
        }

        // Upper bound: the next promised occupant's check-in for this bed (or
        // the room, for private). Null when nothing is booked after it.
        let availableUntil = nextStarts.get(`${room.number}|${bedLabel ?? ""}`) ?? nextStarts.get(room.number) ?? null

        let availableFrom = status === "Occupied" && bed.checkOut ? bed.checkOut : null
        // Conflicting data: a promised booking that starts on/before the current
        // occupant's departure leaves NO bookable window. Don't emit an
        // impossible from/until pair (it bricks the wizard's date input) —
        // treat the bed as "date TBC" until ops resolves the overlap.
        if (availableFrom && availableUntil && availableUntil <= availableFrom) {
          console.warn(`[availability] room ${room.number}${bedLabel ? " bed " + bedLabel : ""}: next booking (${availableUntil}) starts before occupant leaves (${availableFrom}) — hiding window`)
          availableFrom = null
          availableUntil = null
        }

        beds.push({
          id: bedLabel ? `${room.number}-${bedLabel}` : room.number,
          property: room.property,
          roomNumber: room.number,
          bedLabel,
          category,
          size,
          status,
          availableFrom,
          availableUntil,
          isTemporarilyAvailable: false,
          blockStartDate: null,
          monthlyRate,
          weeklyRate: weeklyFor(monthlyRate),
          roommateGender,
        })
      }
    }

    return NextResponse.json(beds)
  } catch (err) {
    console.error("[api/rooms/availability]", err)
    return NextResponse.json({ error: "Failed to fetch availability" }, { status: 500 })
  }
}
