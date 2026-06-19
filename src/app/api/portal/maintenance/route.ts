import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"

export const dynamic = "force-dynamic"

const DB_MAINTENANCE = "1d269190-ee9b-8096-a27c-f902861bba4e"

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const notionPageId = formData.get("notionPageId") as string
    const guestName = formData.get("guestName") as string
    const room = formData.get("room") as string
    const category = formData.get("category") as string
    const description = formData.get("description") as string
    const photoFile = formData.get("photo") as File | null

    if (!notionPageId || !guestName || !category || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Maintenance requests require an occupied room.
    if (!room || !room.trim()) {
      return NextResponse.json({ error: "Maintenance requests require an assigned room." }, { status: 403 })
    }

    const client = new Client({ auth: process.env.NOTION_TOKEN })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: Record<string, any> = {
      "Name": { title: [{ text: { content: guestName } }] },
      "Describe The Issue": { rich_text: [{ text: { content: description } }] },
      "What's Up?": { multi_select: [{ name: category }] },
      "Where Is The Issue?": { multi_select: room ? [{ name: room }] : [] },
      "Is It Urgent?": { multi_select: [{ name: "Not Urgent" }] },
    }

    // Upload photo if provided
    if (photoFile) {
      try {
        const upload = await client.fileUploads.create({})
        await client.fileUploads.send({
          file_upload_id: upload.id,
          file: {
            data: new Blob([await photoFile.arrayBuffer()], { type: photoFile.type }),
            filename: photoFile.name,
          },
        })
        await client.fileUploads.complete({ file_upload_id: upload.id })
        properties["Photo"] = { files: [{ type: "file_upload", file_upload: { id: upload.id } }] }
      } catch (e) {
        console.error("[portal/maintenance] Photo upload failed:", e)
      }
    }

    await client.pages.create({
      parent: { database_id: DB_MAINTENANCE },
      properties,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[portal/maintenance]", err)
    return NextResponse.json({ error: "Failed to create maintenance ticket" }, { status: 500 })
  }
}
