import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"
import {
  createDepositLink,
  createProRatedLink,
  createRentSubscription,
  calcProRatedRent,
} from "@/lib/razorpay"
import { checkInGuest, findBedPageId, BedOccupiedError } from "@/lib/notion"

export const dynamic = "force-dynamic"

const DB_ID = "2d969190-ee9b-8025-a11b-dc5da277447f"
const MAINTENANCE_FEE = 2000

// Local YYYY-MM-DD for "today" (server-side past-date guard).
function todayStr(): string {
  const d = new Date()
  const tz = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - tz).toISOString().slice(0, 10)
}

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

    // Authoritative check-in date validation. checkInMin/checkInMax are the bed's
    // availability window forwarded by the client; combined with the bed-vacancy
    // guard below, they prevent booking a room for a date it isn't actually free.
    const checkInMin = (formData.get("checkInMin") as string) || ""
    const checkInMax = (formData.get("checkInMax") as string) || ""
    if (checkIn < todayStr()) {
      return NextResponse.json({ error: "Check-in date cannot be in the past." }, { status: 400 })
    }
    if (checkInMin && checkIn < checkInMin) {
      return NextResponse.json({ error: `This room is not available until ${checkInMin}.` }, { status: 400 })
    }
    if (checkInMax && checkIn > checkInMax) {
      return NextResponse.json({ error: `This room is only available until ${checkInMax}.` }, { status: 400 })
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
    const petType = (formData.get("petType") as string) || ""
    const petName = (formData.get("petName") as string) || ""
    const petAge = (formData.get("petAge") as string) || ""
    const petBreed = (formData.get("petBreed") as string) || ""
    const petGender = (formData.get("petGender") as string) || ""
    const petVaccinated = (formData.get("petVaccinated") as string) || ""
    const petNeutered = (formData.get("petNeutered") as string) || ""
    const petPhotoFile = formData.get("petPhoto") as File | null
    const petPhotoUploadId = petParent === "Yes" && petPhotoFile ? await uploadFile(client, petPhotoFile) : null

    // Second guest (private room, single billing) — identity/compliance only.
    const guestCount = (formData.get("guestCount") as string) || "1"
    const hasSecondGuest = guestCount === "2"
    const g2 = {
      fullName: (formData.get("g2FullName") as string) || "",
      dob: (formData.get("g2Dob") as string) || "",
      gender: (formData.get("g2Gender") as string) || "",
      email: (formData.get("g2Email") as string) || "",
      contact: (formData.get("g2Contact") as string) || "",
      idProofType: (formData.get("g2IdProofType") as string) || "",
      idNumber: (formData.get("g2IdNumber") as string) || "",
      emergencyName: (formData.get("g2EmergencyName") as string) || "",
      emergencyNumber: (formData.get("g2EmergencyNumber") as string) || "",
      emergencyRelation: (formData.get("g2EmergencyRelation") as string) || "",
    }
    const g2IdProofFile = formData.get("g2IdProof") as File | null
    const g2IdProofUploadId = hasSecondGuest && g2IdProofFile ? await uploadFile(client, g2IdProofFile) : null

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
      Status: { select: { name: "Deposit Pending" } },
      "Tariff": { number: monthlyRate },
    }

    if (photoUploadId) properties["📸 Recent Photograph"] = fileUploadProp(photoUploadId)
    if (passportUploadId) properties["🛂 Passport"] = fileUploadProp(passportUploadId)
    if (idProofUploadId) properties["📎 ID Proof "] = fileUploadProp(idProofUploadId)
    if (signatureUploadId) properties["✍️ Digital Signature"] = fileUploadProp(signatureUploadId)

    // Pet details (when a Pet Parent) are written as page content blocks so we
    // never fail the booking on a missing Notion property. Tag stays on "Pet Parent".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = []
    if (petParent === "Yes") {
      const petLines = [
        `Pet type: ${petType}`,
        `Pet name: ${petName}`,
        `Age: ${petAge}`,
        `Breed: ${petBreed}`,
        `Gender: ${petGender}`,
        `Vaccinated: ${petVaccinated}`,
        `Spayed/Neutered: ${petNeutered}`,
      ].join("\n")
      children.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: "🐾 Pet Details" } }] },
      })
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: petLines } }] },
      })
      if (petPhotoUploadId) {
        children.push({
          object: "block",
          type: "image",
          image: { type: "file_upload", file_upload: { id: petPhotoUploadId } },
        })
      }
    }

    if (hasSecondGuest) {
      const g2Lines = [
        `Name: ${g2.fullName}`,
        `DOB: ${g2.dob}`,
        `Gender: ${g2.gender}`,
        `Email: ${g2.email}`,
        `Contact: ${g2.contact}`,
        `ID proof: ${g2.idProofType} — ${g2.idNumber}`,
        `Emergency contact: ${g2.emergencyName} (${g2.emergencyRelation}) — ${g2.emergencyNumber}`,
      ].join("\n")
      children.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: "👥 Second Guest (single billing under primary)" } }] },
      })
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: g2Lines } }] },
      })
      if (g2IdProofUploadId) {
        children.push({
          object: "block",
          type: "file",
          file: { type: "file_upload", file_upload: { id: g2IdProofUploadId } },
        })
      }
    }

    const guestPage = await client.pages.create({
      parent: { database_id: DB_ID },
      properties,
      ...(children.length ? { children } : {}),
    })
    const notionPageId = guestPage.id

    // 3 — Update room board (mark as incoming)
    const roomMatch = room.match(/Room (\d+)(?:\s*·\s*Bed\s*([AB]))?/)
    const parsedRoom = roomMatch?.[1] ?? room
    const parsedBed = roomMatch?.[2] ?? null

    const bedPageId = await findBedPageId(property, parsedRoom, parsedBed)
    let bedAssignmentDeferred = false
    if (bedPageId) {
      try {
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
      } catch (e) {
        // Bed is still held by the current occupant (a future-dated booking into
        // an "available from" room). Do NOT overwrite them — keep the booking and
        // payment, and let ops assign the bed once the current guest checks out.
        if (e instanceof BedOccupiedError) {
          bedAssignmentDeferred = true
          console.warn("[create-payment-links] Bed assignment deferred:", e.message)
        } else {
          throw e
        }
      }
    }

    // 4 — Create deposit + maintenance Payment Link
    const depositAmount = monthlyRate + MAINTENANCE_FEE
    const reqUrl = new URL(req.url)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `${reqUrl.protocol}//${reqUrl.host}`
    const depositCallbackUrl = `${baseUrl}/book/confirm?pageId=${notionPageId}&property=${property}&type=deposit`

    const depositLink = await createDepositLink({
      property,
      guestName: fullName,
      email,
      phone: contactNumber,
      amount: depositAmount,
      notionPageId,
      callbackUrl: depositCallbackUrl,
    })

    // 5 — Calculate pro-rated rent for current month (if check-in is not on the 1st)
    const proRated = calcProRatedRent(checkIn, monthlyRate)
    let proRatedLink: { id: string; short_url: string } | null = null

    if (proRated) {
      const proRatedCallbackUrl = `${baseUrl}/book/confirm?pageId=${notionPageId}&property=${property}&type=prorated`
      proRatedLink = await createProRatedLink({
        property,
        guestName: fullName,
        email,
        phone: contactNumber,
        amount: proRated.amount,
        description: proRated.description,
        notionPageId,
        callbackUrl: proRatedCallbackUrl,
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
      property,
      depositLink: depositLink.short_url,
      depositLinkId: depositLink.id,
      depositAmount,
      proRatedLink: proRatedLink?.short_url ?? null,
      proRatedLinkId: proRatedLink?.id ?? null,
      proRatedAmount: proRated?.amount ?? null,
      proRatedDescription: proRated?.description ?? null,
      subscriptionId,
      subscriptionStartDate,
      monthlyRate,
      bedAssignmentDeferred,
    })
  } catch (err) {
    console.error("[api/bookings/create-payment-links]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to process booking" },
      { status: 500 }
    )
  }
}
