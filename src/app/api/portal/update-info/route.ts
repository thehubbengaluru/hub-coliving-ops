import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"
import { requirePortalGuest, authErrorResponse } from "@/lib/auth/api-guards"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"

export const dynamic = "force-dynamic"

export async function PATCH(req: Request) {
  try {
    const { email: sessionEmail } = await requirePortalGuest()

    const { notionPageId, contactNumber, orgName, occupation, workAddress, emergencyName, emergencyNumber, emergencyRelation } = await req.json()

    if (!notionPageId) return NextResponse.json({ error: "Missing notionPageId" }, { status: 400 })

    const client = new Client({ auth: process.env.NOTION_TOKEN })

    // Ownership: only edit a record whose email matches the session.
    const existing = await client.pages.retrieve({ page_id: notionPageId }) as PageObjectResponse
    const ownerProp = existing.properties["✉️ Email"] ?? existing.properties["Email"]
    const ownerEmail = ownerProp?.type === "email" ? (ownerProp.email ?? "") : ""
    if (!ownerEmail || ownerEmail.trim().toLowerCase() !== sessionEmail) {
      return NextResponse.json({ error: "This record is not associated with your account." }, { status: 403 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: Record<string, any> = {}

    if (contactNumber !== undefined) {
      const cleaned = String(contactNumber).replace(/\D/g, "")
      properties["📞 Contact Number"] = { number: cleaned ? parseInt(cleaned, 10) : null }
    }
    if (orgName !== undefined) properties["🏢 Organisation / 🎓 College Name"] = { rich_text: [{ text: { content: orgName } }] }
    if (occupation !== undefined) properties["🧩 Occupation"] = { rich_text: [{ text: { content: occupation } }] }
    if (workAddress !== undefined) properties["📍 Work / Office / College Address"] = { rich_text: [{ text: { content: workAddress } }] }
    if (emergencyName !== undefined) properties["🚨 Emergency Contact Name"] = { rich_text: [{ text: { content: emergencyName } }] }
    if (emergencyNumber !== undefined) properties["📲 Emergency Contact Number"] = { rich_text: [{ text: { content: emergencyNumber } }] }
    if (emergencyRelation !== undefined) properties["Emergency Contact Relation"] = { rich_text: [{ text: { content: emergencyRelation } }] }

    if (!Object.keys(properties).length) return NextResponse.json({ error: "No fields to update" }, { status: 400 })

    await client.pages.update({ page_id: notionPageId, properties })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const authRes = authErrorResponse(err)
    if (authRes) return authRes
    console.error("[portal/update-info]", err)
    return NextResponse.json({ error: "Failed to update information" }, { status: 500 })
  }
}
