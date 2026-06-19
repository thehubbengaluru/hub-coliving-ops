import { NextResponse } from "next/server"
import { Client } from "@notionhq/client"
import { verifyPaymentSignature, getRzpInstance } from "@/lib/razorpay"
import { checkInGuest, findBedPageId } from "@/lib/notion"

export const dynamic = "force-dynamic"

const DB_ID = "2d969190-ee9b-8025-a11b-dc5da277447f"

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
    console.error("[bookings/confirm] File upload failed:", err)
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

    // Step 1 — Verify payment signature
    const razorpay_payment_id = formData.get("razorpay_payment_id") as string
    const razorpay_order_id = formData.get("razorpay_order_id") as string
    const razorpay_signature = formData.get("razorpay_signature") as string
    const property = formData.get("property") as "safina-plaza" | "peepal-tree"

    if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, property)) {
      return NextResponse.json({ error: "Payment verification failed" }, { status: 400 })
    }

    const client = new Client({ auth: process.env.NOTION_TOKEN })

    // Step 2 — Upload files to Notion
    const photoFile = formData.get("photo") as File | null
    const idProofFile = formData.get("idProof") as File | null
    const signatureFile = formData.get("signature") as File | null

    const [photoUploadId, idProofUploadId, signatureUploadId] = await Promise.all([
      photoFile ? uploadFile(client, photoFile) : Promise.resolve(null),
      idProofFile ? uploadFile(client, idProofFile) : Promise.resolve(null),
      signatureFile ? uploadFile(client, signatureFile) : Promise.resolve(null),
    ])

    // Step 3 — Create Notion Guest Info page
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
    const monthlyRateStr = formData.get("monthlyRate") as string
    const monthlyRateNum = parseInt(monthlyRateStr, 10)

    const idProofTypeMap: Record<string, string> = {
      Aadhaar: "Aadhar",
      PAN: "PAN",
      Passport: "Passport",
      "Driving Licence": "Driving License",
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: Record<string, any> = {
      "🧑‍💼 Guest Name": { title: [{ text: { content: guestName || "" } }] },
      "🎂 Date Of Birth": { rich_text: [{ text: { content: dob || "" } }] },
      "⚧️ Gender": { multi_select: gender ? [{ name: gender }] : [] },
      "🌍 Nationality": { rich_text: [{ text: { content: nationality || "" } }] },
      "🏡 Permanent Address": { rich_text: [{ text: { content: permanentAddress || "" } }] },
      "✉️ Email": { email: email || null },
      "📞 Contact Number": {
        number: contactNumber ? parseInt(contactNumber.replace(/\D/g, ""), 10) : null,
      },
      "🛏️ Room Type": { multi_select: roomType ? [{ name: roomType }] : [] },
      Room: { rich_text: [{ text: { content: room || "" } }] },
      "📅 Check-in & Check-out Date (Estimated)": {
        date: {
          start: checkIn || new Date().toISOString().split("T")[0],
          ...(checkOut ? { end: checkOut } : {}),
        },
      },
      "Check In Date": {
        date: { start: checkIn || new Date().toISOString().split("T")[0] },
      },
      "🏢 Organisation / 🎓 College Name": {
        rich_text: [{ text: { content: orgName || "" } }],
      },
      "💼 Employment Status": {
        multi_select: employmentStatus ? [{ name: employmentStatus }] : [],
      },
      "🧩 Occupation": { rich_text: [{ text: { content: occupation || "" } }] },
      "📍 Work / Office / College Address": {
        rich_text: [{ text: { content: workAddress || "" } }],
      },
      "Place of work": { rich_text: [{ text: { content: placeOfWork || "" } }] },
      LinkedIn: { url: linkedin || null },
      "🪪 ID Proof Type": {
        multi_select: idProofType
          ? [{ name: idProofTypeMap[idProofType] || idProofType }]
          : [],
      },
      "🔢 ID Number": { rich_text: [{ text: { content: idNumber || "" } }] },
      "🚨 Emergency Contact Name": {
        rich_text: [{ text: { content: emergencyName || "" } }],
      },
      "📲 Emergency Contact Number": {
        rich_text: [{ text: { content: emergencyNumber || "" } }],
      },
      "Emergency Contact Relation": {
        rich_text: [{ text: { content: emergencyRelation || "" } }],
      },
      "Pet Parent": { multi_select: petParent ? [{ name: petParent }] : [] },
      "📜 Rules and Regulations": {
        multi_select: [{ name: "Acceptance of Terms and Conditions" }],
      },
      Status: { select: { name: "Booking confirmed" } },
      "💳 Payment ID": { rich_text: [{ text: { content: razorpay_payment_id } }] },
      "🏠 Property": {
        rich_text: [
          {
            text: {
              content:
                property === "safina-plaza"
                  ? "The Hub Bengaluru – Safina Plaza"
                  : "Peepal Tree @ The Hub",
            },
          },
        ],
      },
    }

    if (photoUploadId) properties["📸 Recent Photograph"] = fileUploadProp(photoUploadId)
    if (idProofUploadId) properties["📎 ID Proof "] = fileUploadProp(idProofUploadId)
    if (signatureUploadId) properties["✍️ Digital Signature"] = fileUploadProp(signatureUploadId)

    const guestPage = await client.pages.create({
      parent: { database_id: DB_ID },
      properties,
    })

    // Step 4 — Update room board in Notion
    const roomNumber = formData.get("roomNumber") as string
    const roomMatch = roomNumber.match(/Room (\d+)(?:\s*·\s*Bed\s*([AB]))?/)
    const parsedRoom = roomMatch?.[1] ?? roomNumber
    const parsedBed = roomMatch?.[2] ?? null

    const bedPageId = await findBedPageId(property, parsedRoom, parsedBed)
    if (bedPageId) {
      const fullName = formData.get("fullName") as string
      const genderField = formData.get("gender") as string
      const phone = formData.get("contactNumber") as string
      const emailField = formData.get("email") as string
      const checkInField = formData.get("checkIn") as string
      const checkOutField = (formData.get("checkOut") as string) || undefined

      await checkInGuest({
        notionPageId: bedPageId,
        property,
        guestName: fullName,
        gender: genderField.toLowerCase() === "female" ? "female" : "male",
        phone,
        email: emailField,
        checkInDate: checkInField,
        checkOutDate: checkOutField,
        monthlyRate: monthlyRateNum,
      })
    }

    // Step 5 — Create Razorpay subscription
    let subscriptionId: string | undefined
    try {
      const rzp = getRzpInstance(property)
      const checkInDate = new Date(checkIn)
      const startDate = new Date(checkInDate)
      startDate.setDate(startDate.getDate() - 7)
      const startAt = Math.floor(startDate.getTime() / 1000)
      const minStart = Math.floor(Date.now() / 1000 + 2 * 24 * 60 * 60)
      const finalStartAt = Math.max(startAt, minStart)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const plan = await (rzp.plans as any).create({
        period: "monthly",
        interval: 1,
        item: {
          name: `The Hub Co-Living – ${property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"}`,
          amount: monthlyRateNum * 100,
          currency: "INR",
          description: "Monthly co-living rent",
        },
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscription = await (rzp.subscriptions as any).create({
        plan_id: plan.id,
        total_count: 120,
        quantity: 1,
        start_at: finalStartAt,
        notify_info: {
          notify_phone: (formData.get("contactNumber") as string).replace(/\D/g, ""),
          notify_email: formData.get("email") as string,
        },
      })

      subscriptionId = subscription.id
    } catch (err) {
      console.error("[bookings/confirm] Subscription creation failed (non-critical):", err)
    }

    return NextResponse.json({
      ok: true,
      subscriptionId,
      notionPageId: guestPage.id,
    })
  } catch (err) {
    console.error("[api/bookings/confirm]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Confirmation failed" },
      { status: 500 }
    )
  }
}
