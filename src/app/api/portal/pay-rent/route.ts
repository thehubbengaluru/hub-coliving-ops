import { NextResponse } from "next/server"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import { createRentPaymentLink } from "@/lib/razorpay"
import { findMemberPageByEmail } from "@/lib/notion"
import { requirePortalGuest, authErrorResponse } from "@/lib/auth/api-guards"
import { lateFeeForDay, istDayOfMonth } from "@/lib/dunning"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

function num(page: PageObjectResponse, key: string): number | null {
  const p = page.properties[key]
  return p?.type === "number" ? p.number : null
}
function text(page: PageObjectResponse, key: string): string {
  const p = page.properties[key]
  if (p?.type === "rich_text") return p.rich_text.map((t) => t.plain_text).join("").trim()
  if (p?.type === "title") return p.title.map((t) => t.plain_text).join("").trim()
  return ""
}
function tags(page: PageObjectResponse): string[] {
  const p = page.properties["Tags"]
  return p?.type === "multi_select" ? p.multi_select.map((t) => t.name) : []
}
function phoneOf(page: PageObjectResponse): string {
  const p = page.properties["Phone"]
  return p?.type === "phone_number" ? (p.phone_number ?? "") : ""
}
function roomOf(page: PageObjectResponse): string {
  const p = page.properties["Room"]
  return p?.type === "select" ? (p.select?.name ?? "") : ""
}

// Infer property from room number (Peepal 100–199, Plaza 200+). The payment
// link MUST be created on the owning entity's Razorpay account, or the money
// lands in the wrong company's books. Defaults to Plaza when unparseable.
function inferProperty(room: string): Property {
  const match = room.match(/\d+/)
  const n = match ? parseInt(match[0], 10) : NaN
  if (!isNaN(n) && n >= 100 && n < 200) return "peepal-tree"
  return "safina-plaza"
}

// Manual rent payment from the guest portal. The amount is ALWAYS derived
// server-side from the authenticated guest's own record — never taken from the
// request body — so a caller can't mint a ₹1 link that clears their dunning
// state (or, via a forged body, anyone else's). If a dunning episode is open
// (Due Rent Base set / Overdue tag), the current late fee is included so the
// portal can't be used to dodge fees.
export async function POST(req: Request) {
  try {
    const { email } = await requirePortalGuest()
    const { callbackUrl } = (await req.json().catch(() => ({}))) as { callbackUrl?: string }

    const member = await findMemberPageByEmail(email)
    if (!member) {
      return NextResponse.json({ error: "We couldn't find your active stay. Please contact the office." }, { status: 404 })
    }

    const property: Property = inferProperty(roomOf(member))
    const guestName = text(member, "Member Name") || "Guest"
    const phone = phoneOf(member)
    if (!phone.trim()) {
      return NextResponse.json({ error: "No phone number on record — payment links need one. Please contact the office." }, { status: 422 })
    }

    const baseRate =
      num(member, "Monthly Rent") ??
      num(member, "Tariff") ??
      num(member, "Room Type Default Tariff Incl GST") ??
      num(member, "Deposit Amount (₹)") ??
      0
    if (baseRate <= 0) {
      return NextResponse.json({ error: "Your monthly rate isn't on record — please contact the office." }, { status: 422 })
    }

    // If dues are already open, bill the tracked base + today's (capped) late
    // fee; otherwise the flat monthly rate.
    const memberTags = tags(member)
    const duesOpen = memberTags.includes("Rent Overdue") || memberTags.includes("Rent Defaulted") || text(member, "Due Rent Link ID").length > 0
    const dueBase = num(member, "Due Rent Base (₹)")
    const base = duesOpen ? (dueBase ?? baseRate) : baseRate
    const fee = duesOpen ? lateFeeForDay(istDayOfMonth()).fee : 0
    const amount = base + fee

    const link = await createRentPaymentLink({
      property,
      guestName,
      email,
      phone: phone.trim(),
      amount,
      description: fee > 0 ? `Rent ₹${base.toLocaleString("en-IN")} + Late Fee ₹${fee.toLocaleString("en-IN")}` : undefined,
      notionPageId: member.id, // member page — where the webhook clears dunning state
      callbackUrl,
    })

    return NextResponse.json({ ok: true, url: link.short_url, linkId: link.id, property, amount })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[api/portal/pay-rent]", err)
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
