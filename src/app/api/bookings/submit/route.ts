import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"

export const dynamic = "force-dynamic"

const DB_ID = "2d969190-ee9b-8025-a11b-dc5da277447f"

async function uploadFile(
  client: Client,
  file: File
): Promise<string | null> {
  try {
    // 1. Create upload session
    const upload = await client.fileUploads.create({})

    // 2. Send file content
    await client.fileUploads.send({
      file_upload_id: upload.id,
      file: {
        data: new Blob([await file.arrayBuffer()], { type: file.type }),
        filename: file.name,
      },
    })

    // 3. Complete
    await client.fileUploads.complete({ file_upload_id: upload.id })

    return upload.id
  } catch (err) {
    console.error("[bookings/submit] File upload failed:", err)
    return null
  }
}

function fileUploadProp(uploadId: string) {
  return {
    files: [
      {
        type: "file_upload" as const,
        file_upload: { id: uploadId },
      },
    ],
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const client = new Client({ auth: process.env.NOTION_TOKEN })

    // Extract files
    const photoFile = formData.get("photo") as File | null
    const idProofFile = formData.get("idProof") as File | null
    const signatureFile = formData.get("signature") as File | null

    // Upload files in parallel
    const [photoUploadId, idProofUploadId, signatureUploadId] =
      await Promise.all([
        photoFile ? uploadFile(client, photoFile) : Promise.resolve(null),
        idProofFile ? uploadFile(client, idProofFile) : Promise.resolve(null),
        signatureFile
          ? uploadFile(client, signatureFile)
          : Promise.resolve(null),
      ])

    // Extract text fields
    const guestName = formData.get("fullName") as string
    const dob = formData.get("dob") as string
    const gender = formData.get("gender") as string
    const nationality = formData.get("nationality") as string
    const permanentAddress = formData.get("permanentAddress") as string
    const email = formData.get("email") as string
    const contactNumber = formData.get("contactNumber") as string
    const roomType = formData.get("roomType") as string
    const room = formData.get("roomNumber") as string
    const checkIn = formData.get("checkIn") as string
    const checkOut = (formData.get("checkOut") as string) || null
    const orgName = formData.get("orgName") as string
    const employmentStatus = formData.get("employmentStatus") as string
    const occupation = formData.get("occupation") as string
    const workAddress = formData.get("workAddress") as string
    const placeOfWork = formData.get("placeOfWork") as string
    const linkedin = formData.get("linkedin") as string
    const idProofType = formData.get("idProofType") as string
    const idNumber = formData.get("idNumber") as string
    const emergencyName = formData.get("emergencyName") as string
    const emergencyNumber = formData.get("emergencyNumber") as string
    const emergencyRelation = formData.get("emergencyRelation") as string
    const petParent = formData.get("petParent") as string

    // Map ID proof type label to Notion value
    const idProofTypeMap: Record<string, string> = {
      Aadhaar: "Aadhar",
      PAN: "PAN",
      Passport: "Passport",
      "Driving Licence": "Driving License",
    }

    // Build properties
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: Record<string, any> = {
      "🧑‍💼 Guest Name": {
        title: [{ text: { content: guestName || "" } }],
      },
      "🎂 Date Of Birth": {
        rich_text: [{ text: { content: dob || "" } }],
      },
      "⚧️ Gender": {
        multi_select: gender ? [{ name: gender }] : [],
      },
      "🌍 Nationality": {
        rich_text: [{ text: { content: nationality || "" } }],
      },
      "🏡 Permanent Address": {
        rich_text: [{ text: { content: permanentAddress || "" } }],
      },
      "✉️ Email": {
        email: email || null,
      },
      "📞 Contact Number": {
        number: contactNumber ? parseInt(contactNumber.replace(/\D/g, ""), 10) : null,
      },
      "🛏️ Room Type": {
        multi_select: roomType ? [{ name: roomType }] : [],
      },
      Room: {
        rich_text: [{ text: { content: room || "" } }],
      },
      "📅 Check-in & Check-out Date (Estimated)": {
        date: {
          start: checkIn || new Date().toISOString().split("T")[0],
          ...(checkOut ? { end: checkOut } : {}),
        },
      },
      "Check In Date": {
        date: {
          start: checkIn || new Date().toISOString().split("T")[0],
        },
      },
      "🏢 Organisation / 🎓 College Name": {
        rich_text: [{ text: { content: orgName || "" } }],
      },
      "💼 Employment Status": {
        multi_select: employmentStatus ? [{ name: employmentStatus }] : [],
      },
      "🧩 Occupation": {
        rich_text: [{ text: { content: occupation || "" } }],
      },
      "📍 Work / Office / College Address": {
        rich_text: [{ text: { content: workAddress || "" } }],
      },
      "Place of work": {
        rich_text: [{ text: { content: placeOfWork || "" } }],
      },
      LinkedIn: {
        url: linkedin || null,
      },
      "🪪 ID Proof Type": {
        multi_select: idProofType
          ? [{ name: idProofTypeMap[idProofType] || idProofType }]
          : [],
      },
      "🔢 ID Number": {
        rich_text: [{ text: { content: idNumber || "" } }],
      },
      "🚨 Emergency Contact Name": {
        rich_text: [{ text: { content: emergencyName || "" } }],
      },
      "📲 Emergency Contact Number": {
        rich_text: [{ text: { content: emergencyNumber || "" } }],
      },
      "Emergency Contact Relation": {
        rich_text: [{ text: { content: emergencyRelation || "" } }],
      },
      "Pet Parent": {
        multi_select: petParent ? [{ name: petParent }] : [],
      },
      "📜 Rules and Regulations": {
        multi_select: [{ name: "Acceptance of Terms and Conditions" }],
      },
      Status: {
        select: { name: "Booking confirmed" },
      },
    }

    // Add file properties if uploaded successfully
    if (photoUploadId) {
      properties["📸 Recent Photograph"] = fileUploadProp(photoUploadId)
    }
    if (idProofUploadId) {
      // NOTE: trailing space in property name is intentional
      properties["📎 ID Proof "] = fileUploadProp(idProofUploadId)
    }
    if (signatureUploadId) {
      properties["✍️ Digital Signature"] = fileUploadProp(signatureUploadId)
    }

    // Create Notion page
    const page = await client.pages.create({
      parent: { database_id: DB_ID },
      properties,
    })

    return NextResponse.json({ ok: true, notionPageId: page.id })
  } catch (err) {
    console.error("[api/bookings/submit]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Submission failed" },
      { status: 500 }
    )
  }
}
