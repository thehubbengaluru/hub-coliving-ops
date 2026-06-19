import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"

export const dynamic = "force-dynamic"

export async function PATCH(req: Request) {
  try {
    const { notionPageId, contactNumber, orgName, occupation, workAddress, emergencyName, emergencyNumber, emergencyRelation } = await req.json()

    if (!notionPageId) return NextResponse.json({ error: "Missing notionPageId" }, { status: 400 })

    const client = new Client({ auth: process.env.NOTION_TOKEN })

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
    console.error("[portal/update-info]", err)
    return NextResponse.json({ error: "Failed to update information" }, { status: 500 })
  }
}
