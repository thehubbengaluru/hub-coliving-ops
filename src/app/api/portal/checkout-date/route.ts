import { NextResponse } from "next/server"
import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import { requirePortalGuest, authErrorResponse } from "@/lib/auth/api-guards"
import { earliestEarlyCheckoutISO, istTodayISO, EARLY_CHECKOUT_NOTICE_MONTHS } from "@/lib/stay"

export const dynamic = "force-dynamic"

async function queryByEmail(notion: Client, dataSourceId: string, email: string): Promise<PageObjectResponse | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (notion.dataSources as any).query({
    data_source_id: dataSourceId,
    filter: { property: "Email", email: { equals: email } },
    page_size: 1,
  })
  for (const p of res.results) {
    if (isFullPage(p)) return p
  }
  return null
}

export async function PATCH(req: Request) {
  try {
    const { email: sessionEmail } = await requirePortalGuest()

    const { notionPageId, checkOutDate } = await req.json()

    if (!notionPageId || !checkOutDate) {
      return NextResponse.json({ error: "Missing notionPageId or checkOutDate" }, { status: 400 })
    }

    // Validate: at least 1 calendar month notice from today (IST). ISO-string
    // comparison avoids the UTC/local-midnight + month-rollover distortion of
    // constructing Date objects with different midnight bases.
    const earliest = earliestEarlyCheckoutISO(istTodayISO())
    if (checkOutDate < earliest) {
      return NextResponse.json({
        error: `Notice period is ${EARLY_CHECKOUT_NOTICE_MONTHS} calendar month. Earliest check-out date is ${new Date(earliest + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.`,
      }, { status: 400 })
    }

    const notion = new Client({ auth: process.env.NOTION_TOKEN })

    // Read the existing page to get the booked check-out date.
    const page = await notion.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse

    // Ownership: the page must belong to the authenticated session email.
    const ownerProp = page.properties["✉️ Email"] ?? page.properties["Email"]
    const ownerEmail = ownerProp?.type === "email" ? (ownerProp.email ?? "") : ""
    if (!ownerEmail || ownerEmail.trim().toLowerCase() !== sessionEmail) {
      return NextResponse.json({ error: "This booking is not associated with your account." }, { status: 403 })
    }

    // Only an active booking can set an early-checkout date.
    const statusProp = page.properties["Status"]
    const status = statusProp?.type === "select" ? (statusProp.select?.name ?? "") : ""
    if (/cancelled|checked-out/i.test(status)) {
      return NextResponse.json({ error: `This booking is ${status.toLowerCase()} and can no longer be modified.` }, { status: 400 })
    }

    const existingCheckoutProp = page.properties["Check Out Date "] ?? page.properties["Check Out Date"]
    const existingCheckout = existingCheckoutProp?.type === "date" ? (existingCheckoutProp.date?.start ?? null) : null

    // Stays are capped at the booked end date. Extending is not self-service —
    // a guest must re-apply (the deposit carries forward to the new tenancy).
    // This endpoint only ever brings a check-out *forward* (early check-out).
    if (existingCheckout && checkOutDate > existingCheckout) {
      return NextResponse.json({
        error: `You can't extend your stay here — your booked check-out is ${new Date(existingCheckout + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. To stay longer, re-apply for a new tenancy (your deposit carries forward).`,
      }, { status: 400 })
    }

    // Build the update only from properties that actually exist on this page, so
    // a renamed/missing property never fails the whole request. The estimated
    // range carries the check-in start; we also set the dedicated check-out date.
    const RANGE_PROP = "📅 Check-in & Check-out Date (Estimated)"
    const existingRange = page.properties[RANGE_PROP]
    const checkInStart = existingRange?.type === "date" ? (existingRange.date?.start ?? checkOutDate) : checkOutDate

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateProps: Record<string, any> = {}
    if (existingRange?.type === "date") {
      updateProps[RANGE_PROP] = { date: { start: checkInStart, end: checkOutDate } }
    }
    // Dedicated check-out date field (trailing space matches the schema).
    if (page.properties["Check Out Date "]?.type === "date") {
      updateProps["Check Out Date "] = { date: { start: checkOutDate } }
    } else if (page.properties["Check Out Date"]?.type === "date") {
      updateProps["Check Out Date"] = { date: { start: checkOutDate } }
    }

    if (Object.keys(updateProps).length === 0) {
      return NextResponse.json(
        { error: `No check-out date property found on this record (looked for "${RANGE_PROP}" / "Check Out Date").` },
        { status: 422 },
      )
    }

    await notion.pages.update({ page_id: notionPageId, properties: updateProps })

    // Best-effort: update the room board check-out date too. Email may be stored
    // under the emoji-prefixed key (form DB) or plain "Email" (room boards).
    const emailProp = page.properties["✉️ Email"] ?? page.properties["Email"]
    const email = emailProp?.type === "email" ? emailProp.email : null

    if (email) {
      const dsPlaza = process.env.NOTION_DS_PLAZA!

      for (const ds of [dsPlaza]) {
        try {
          const bedPage = await queryByEmail(notion, ds, email)
          if (bedPage) {
            await notion.pages.update({
              page_id: bedPage.id,
              properties: {
                "Check Out Date ": { date: { start: checkOutDate } },
              },
            })
            break
          }
        } catch (e) {
          console.warn("[portal/checkout-date] Room board update failed:", e)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      checkOutDate,
      message: `Check-out date set to ${new Date(checkOutDate).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. Notice period begins today.`,
    })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[portal/checkout-date]", err)
    const detail = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: `Failed to update check-out date: ${detail}` }, { status: 500 })
  }
}
