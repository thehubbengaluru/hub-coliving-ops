import { NextResponse } from "next/server"
import { checkInGuest, BedOccupiedError } from "@/lib/notion"
import { sendEmail } from "@/lib/email"
import type { Property } from "@/lib/types"

export const dynamic = "force-dynamic"

// Minimal room-board check-in: collect only Name / Phone / Email, reserve the bed
// as an incoming hold, and send the guest a link to the front-end /book form.
// The guest-completed form is the source of truth for their full details.
export async function POST(req: Request) {
  try {
    const { notionPageId, property, guestName, phone, email, monthlyRate, gender } = await req.json() as {
      notionPageId: string
      property: Property
      guestName: string
      phone: string
      email: string
      monthlyRate?: number
      gender?: "male" | "female"
    }

    if (!guestName?.trim()) return NextResponse.json({ error: "Guest name is required" }, { status: 400 })
    if (!email?.trim() && !phone?.trim()) {
      return NextResponse.json({ error: "Email or phone is required to send the form link" }, { status: 400 })
    }

    // Reserve the bed as an incoming hold (refuses if already occupied).
    const today = new Date().toISOString().slice(0, 10)
    await checkInGuest({
      notionPageId,
      property,
      guestName: guestName.trim(),
      gender: gender ?? "male",
      phone: phone?.trim() ?? "",
      email: email?.trim() ?? "",
      checkInDate: today,
      monthlyRate: monthlyRate ?? 0,
    })

    // Build the form link from the request origin.
    const origin = req.headers.get("origin") ?? new URL(req.url).origin
    const formUrl = `${origin}/book`

    let emailSent = false
    if (email?.trim()) {
      const res = await sendEmail({
        to: email.trim(),
        subject: "Complete your booking at The Hub",
        html: `
          <p>Hi ${guestName.trim()},</p>
          <p>We've reserved a spot for you. Please complete your booking and details using the link below — this form is what we'll use as your official record:</p>
          <p><a href="${formUrl}" style="background:#F9A91F;color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Complete my booking →</a></p>
          <p>Or copy this link: ${formUrl}</p>
          <p>See you soon,<br/>The Hub team</p>
        `,
      })
      emailSent = res.ok
    }

    return NextResponse.json({ ok: true, formUrl, emailSent })
  } catch (err) {
    console.error("[api/rooms/invite]", err)
    if (err instanceof BedOccupiedError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 })
  }
}
