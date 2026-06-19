import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"
import {
  createDepositLink,
  createProRatedLink,
  createRentSubscription,
  calcProRatedRent,
} from "@/lib/razorpay"
import { checkInGuest, findBedPageId } from "@/lib/notion"

export const dynamic = "force-dynamic"

const DB_ID = "2d969190-ee9b-8025-a11b-dc5da277447f"
const MAINTENANCE_FEE = 2000

async function uploadFile(client: Client, file: File): Promise<string | null> {
  try {
    const upload = await client.fileUploads.create({})
    await client.fileUploads.send({
      file_upload_id: upload.id,
      file: {
        data: new Blob([await file.arrayBuffer()], { type: file.type }),
        filename: file.name,
      },
    })
    await client.fileUploads.complete({ file_upload_id: upload.id })
    return upload.id
  } catch (err) {
    console.error("[create-payment-links] File upload failed:", err)
    return null
  }
}

function fileUploadProp(uploadId: string) {
  return { files: [{ type: "file_upload" as const, file_upload: { id: uploadId } }] }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()

    const property = formData.get("property") as "safina-plaza" | "peepal-tree"
    const fullName = formData.get("fullName") as string
    const email = formData.get("email") as string
    const contactNumber = (formData.get("contactNumber") as string).replace(/\D/g, "")
    const monthlyRate = parseInt(formData.get("monthlyRate") as string, 10)
    const checkIn = formData.get("checkIn") as string
    const checkOut = (formData.get("checkOut") as string) || null

    if (!property || !fullName || !email || !contactNumber || !monthlyRate || !checkIn) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const client = new Client({ auth: process.env.NOTION_TOKEN })

    // 1 — Upload files to Notion
    const photoFile = formData.get("photo") as File | null
    const idProofFile = formData.get("idProof") as File | null
    const signatureFile = formData.get("signature") as File | null
    const passportFile = formData.get("passport") as File | null

    const [photoUploadId, idProofUploadId, signatureUploadId, passportUploadId] = await Promise.all([
      photoFile ? uploadFile(client, photoFile) : Promise.resolve(null),
      idProofFile ? uploadFile(client, idProofFile) : Promise.resolve(null),
      signatureFile ? uploadFile(client, signatureFile) : Promise.resolve(null),
      passportFile ? uploadFile(client, passportFile) : Promise.resolve(null),
    ])

    // 2 — Create Notion Guest Info page (status: "Payment Pending")
    const dob = formData.get("dob") as string
    const gender = formData.get("gender") as string
    const nationality = formData.get("nationality") as string
    const permanentAddress = formData.get("permanentAddress") as string
    const roomType = formData.get("roomType") as string
    const room = formData.get("roomNumber") as string
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

    const idProofTypeMap: Record<string, string> = {
      Aadhaar: "Aadhar", PAN: "PAN", Passport: "Passport", "Driving Licence": "Driving License",
      "Local ID (Home Country)": "Local ID (Home Country)",
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: Record<string, any> = {
      "🧑‍💼 Guest Name": { title: [{ text: { content: fullName } }] },
      "🎂 Date Of Birth": { rich_text: [{ text: { content: dob } }] },
      "⚧️ Gender": { multi_select: gender ? [{ name: gender }] : [] },
      "🌍 Nationality": { rich_text: [{ text: { content: nationality } }] },
      "🏡 Permanent Address": { rich_text: [{ text: { content: permanentAddress } }] },
      "✉️ Email": { email: email || null },
      "📞 Contact Number": { number: contactNumber ? parseInt(contactNumber, 10) : null },
      "🛏️ Room Type": { multi_select: roomType ? [{ name: roomType }] : [] },
      Room: { rich_text: [{ text: { content: room } }] },
      "📅 Check-in & Check-out Date (Estimated)": {
        date: { start: checkIn, ...(checkOut ? { end: checkOut } : {}) },
      },
      "Check In Date": { date: { start: checkIn } },
      "🏢 Organisation / 🎓 College Name": { rich_text: [{ text: { content: orgName } }] },
      "💼 Employment Status": { multi_select: employmentStatus ? [{ name: employmentStatus }] : [] },
      "🧩 Occupation": { rich_text: [{ text: { content: occupation } }] },
      "📍 Work / Office / College Address": { rich_text: [{ text: { content: workAddress } }] },
      "Place of work": { rich_text: [{ text: { content: placeOfWork } }] },
      LinkedIn: { url: linkedin || null },
      "🪪 ID Proof Type": { multi_select: idProofType ? [{ name: idProofTypeMap[idProofType] || idProofType }] : [] },
      "🔢 ID Number": { rich_text: [{ text: { content: idNumber } }] },
      "🚨 Emergency Contact Name": { rich_text: [{ text: { content: emergencyName } }] },
      "📲 Emergency Contact Number": { rich_text: [{ text: { content: emergencyNumber } }] },
      "Emergency Contact Relation": { rich_text: [{ text: { content: emergencyRelation } }] },
      "Pet Parent": { multi_select: petParent ? [{ name: petParent }] : [] },
      "📜 Rules and Regulations": { multi_select: [{ name: "Acceptance of Terms and Conditions" }] },
      Status: { select: { name: "Payment Pending" } },
    }

    if (photoUploadId) properties["📸 Recent Photograph"] = fileUploadProp(photoUploadId)
    if (passportUploadId) properties["🛂 Passport"] = fileUploadProp(passportUploadId)
    if (idProofUploadId) properties["📎 ID Proof "] = fileUploadProp(idProofUploadId)
    if (signatureUploadId) properties["✍️ Digital Signature"] = fileUploadProp(signatureUploadId)

    const guestPage = await client.pages.create({
      parent: { database_id: DB_ID },
      properties,
    })
    const notionPageId = guestPage.id

    // 3 — Update room board (mark as incoming)
    const roomMatch = room.match(/Room (\d+)(?:\s*·\s*Bed\s*([AB]))?/)
    const parsedRoom = roomMatch?.[1] ?? room
    const parsedBed = roomMatch?.[2] ?? null

    const bedPageId = await findBedPageId(property, parsedRoom, parsedBed)
    if (bedPageId) {
      await checkInGuest({
        notionPageId: bedPageId,
        property,
        guestName: fullName,
        gender: gender.toLowerCase() === "female" ? "female" : "male",
        phone: contactNumber,
        email,
        checkInDate: checkIn,
        checkOutDate: checkOut ?? undefined,
        monthlyRate,
      })
    }

    // 4 — Create deposit + maintenance Payment Link
    const depositAmount = monthlyRate + MAINTENANCE_FEE
    const depositLink = await createDepositLink({
      property,
      guestName: fullName,
      email,
      phone: contactNumber,
      amount: depositAmount,
      notionPageId,
    })

    // 5 — Calculate pro-rated rent for current month (if check-in is not on the 1st)
    const proRated = calcProRatedRent(checkIn, monthlyRate)
    let proRatedLink: { id: string; short_url: string } | null = null

    if (proRated) {
      proRatedLink = await createProRatedLink({
        property,
        guestName: fullName,
        email,
        phone: contactNumber,
        amount: proRated.amount,
        description: proRated.description,
        notionPageId,
      })
    }

    // 6 — Create monthly subscription (starts 1st of month after check-in)
    let subscriptionId: string | undefined
    let subscriptionStartDate: string | undefined
    try {
      const sub = await createRentSubscription({
        property,
        guestName: fullName,
        email,
        phone: contactNumber,
        monthlyRate,
        checkInDate: checkIn,
      })
      subscriptionId = sub.id

      // Calculate the subscription start date label for the UI
      const base = new Date(checkIn + "T00:00:00")
      const start = new Date(base.getFullYear(), base.getMonth() + 1, 1)
      subscriptionStartDate = start.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    } catch (err) {
      console.error("[create-payment-links] Subscription creation failed:", err)
    }

    return NextResponse.json({
      ok: true,
      notionPageId,
      depositLink: depositLink.short_url,
      depositAmount,
      proRatedLink: proRatedLink?.short_url ?? null,
      proRatedAmount: proRated?.amount ?? null,
      proRatedDescription: proRated?.description ?? null,
      subscriptionId,
      subscriptionStartDate,
      monthlyRate,
    })
  } catch (err) {
    console.error("[api/bookings/create-payment-links]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process booking" },
      { status: 500 }
    )
  }
}
