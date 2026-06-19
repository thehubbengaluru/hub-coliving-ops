import { NextResponse } from "next/server"
import { getRooms } from "@/lib/notion"
import type { BedListing, BedCategory, BedSize, AvailabilityStatus } from "@/lib/inventory"

export const dynamic = "force-dynamic"
export const revalidate = 0

function inferCategory(roomNumber: string, property: "safina-plaza" | "peepal-tree"): BedCategory {
  if (property === "peepal-tree") return "Standard"
  const n = parseInt(roomNumber, 10)
  return n >= 200 && n < 300 ? "Premium" : "Standard"
}

const WEEKLY_RATE = 25000

const MONTHLY_RATES: Record<"safina-plaza" | "peepal-tree", Record<`${BedCategory}-${BedSize}`, number>> = {
  "safina-plaza": {
    "Premium-Double":  30000,
    "Premium-Single":  60000,
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

export async function GET() {
  try {
    const rooms = await getRooms()
    const beds: BedListing[] = []

    for (const room of rooms) {
      const category = inferCategory(room.number, room.property)
      const size: BedSize = room.type === "private" ? "Single" : "Double"

      const today = new Date(); today.setHours(0, 0, 0, 0)

      for (const bed of room.beds) {
        const bedLabel = room.type === "sharing"
          ? (bed.bedNumber === 1 ? "A" : "B")
          : null

        const monthlyRate = MONTHLY_RATES[room.property][`${category}-${size}`]

        // Blocked beds whose block starts in the future are temporarily available.
        // Only applies to Peepal Tree where "blocked" is a staff-set status with a
        // future block date. On Plaza, "blocked" means the room is being serviced —
        // no block-start date semantics apply, so it is always truly blocked.
        if (bed.status === "blocked") {
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
              weeklyRate: WEEKLY_RATE,
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
              weeklyRate: WEEKLY_RATE,
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

        beds.push({
          id: bedLabel ? `${room.number}-${bedLabel}` : room.number,
          property: room.property,
          roomNumber: room.number,
          bedLabel,
          category,
          size,
          status,
          availableFrom: status === "Occupied" && bed.checkOut ? bed.checkOut : null,
          availableUntil: null,
          isTemporarilyAvailable: false,
          blockStartDate: null,
          monthlyRate,
          weeklyRate: WEEKLY_RATE,
        })
      }
    }

    return NextResponse.json(beds)
  } catch (err) {
    console.error("[api/rooms/availability]", err)
    return NextResponse.json({ error: "Failed to fetch availability" }, { status: 500 })
  }
}
