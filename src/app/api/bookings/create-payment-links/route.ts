import { NextResponse } from "next/server"
import { Client, isFullPage } from "@notionhq/client"
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints"
import {
  createDepositLink,
  razorpayEnabled,
  createProRatedLink,
  createRentSubscription,
} from "@/lib/razorpay"
import { computeRentSchedule, describeRentMonths } from "@/lib/rent-schedule"
import { archiveGuestDocuments } from "@/lib/supabase/storage"
import { normalizeRoomTier, rateForTier, tierFromRate, TIER_RATES } from "@/lib/pricing"
import {
  exceedsMaxStay, maxStayCheckoutISO, MAX_STAY_MONTHS, istTodayISO,
  MAINTENANCE_FEE, PET_DEPOSIT_FEE, PET_MONTHLY_FEE, COUPLE_PREMIUM_MONTHLY,
  EXPLORATORY_WEEK_RENT, isExploratoryStay, DEPOSIT_PAYMENT_WINDOW_MINUTES,
} from "@/lib/stay"
import { rateLimit, clientKey } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const DB_ID = "2d969190-ee9b-8025-a11b-dc5da277447f"

// Resolve the canonical per-bed monthly rate for a booking, so we never trust
// the rate the client posts. The wizard sends a COARSE room type ("Private" /
// "Double sharing") that spans both Standard and Deluxe tiers — for those,
// accept any canonical tariff of the matching room size (the exact rate then
// identifies the tier). An exact tier label ("Deluxe Private") validates
// strictly. Returns null when the posted rate is not a valid tariff.
function canonicalRate(property: "safina-plaza" | "peepal-tree", roomType: string, posted: number): number | null {
  const raw = roomType.trim().toLowerCase()
  if (/standard|deluxe/.test(raw)) {
    const fromTier = rateForTier(property, normalizeRoomTier(roomType))
    return fromTier > 0 && posted === fromTier ? fromTier : null
  }
  const coarse = /private/.test(raw) ? "private" as const : /shar/.test(raw) ? "sharing" as const : null
  if (coarse) {
    return tierFromRate(property, coarse, posted) ? posted : null
  }
  const validRates = Object.values(TIER_RATES[property] ?? {})
  return validRates.includes(posted) ? posted : null
}

// Is there already a live (non-cancelled) booking for this email + check-in?
// Guards against duplicate submissions (double tab / lost response) that would
// otherwise create a second Notion page, second set of links and — worst —
// a second auto-debit subscription.
async function existingActiveBooking(email: string, checkIn: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          and: [
            { property: "✉️ Email", email: { equals: email } },
            { property: "Check In Date", date: { equals: checkIn } },
          ],
        },
        page_size: 5,
      }),
    })
    if (!res.ok) return false // fail open — don't block a booking on a query error
    const data = await res.json() as { results?: PageObjectResponse[] }
    for (const p of data.results ?? []) {
      if (!isFullPage(p)) continue
      const statusProp = p.properties["Status"]
      const status = statusProp?.type === "select" ? (statusProp.select?.name ?? "") : ""
      if (/cancelled|expired/i.test(status)) continue
      // A still-pending booking past the 25-minute deposit window is dead even
      // if the payment_link.expired webhook hasn't landed yet — never block the
      // guest's restart on it.
      if (/pending/i.test(status)) {
        const ageMs = Date.now() - new Date(p.created_time).getTime()
        if (ageMs > DEPOSIT_PAYMENT_WINDOW_MINUTES * 60_000) continue
      }
      return true
    }
  } catch (e) {
    console.warn("[create-payment-links] duplicate-booking check failed (allowing):", e)
  }
  return false
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
    // No fileUploads.complete() here: that API is for multi-part uploads only.
    // A single-part send already leaves the upload in `uploaded`, ready to
    // attach — calling complete() on it throws and would drop the file.
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
    // Public, side-effecting endpoint (uploads files, creates Notion pages, mints
    // Razorpay links). Throttle per client to blunt scripted abuse before any of
    // that work runs.
    const limited = rateLimit(clientKey(req, "create-payment-links"), { limit: 8, windowMs: 60_000 })
    if (limited) return limited

    // A body larger than the proxy buffer cap (next.config.ts
    // proxyClientMaxBodySize) reaches us truncated, and formData() throws.
    // Surface that as a clear 413 instead of a generic 500.
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json(
        { error: "Your uploaded files are too large. Please keep the total upload under 50MB (compress photos if needed) and try again." },
        { status: 413 }
      )
    }

    const property = formData.get("property") as "safina-plaza" | "peepal-tree"
    const fullName = formData.get("fullName") as string
    const email = (formData.get("email") as string)?.trim().toLowerCase()
    const contactNumber = ((formData.get("contactNumber") as string) ?? "").replace(/\D/g, "")
    const postedRate = parseInt(formData.get("monthlyRate") as string, 10)
    const checkIn = formData.get("checkIn") as string
    const checkOut = (formData.get("checkOut") as string) || null
    const roomTypeRaw = (formData.get("roomType") as string) || ""

    if (!property || !fullName || !email || !contactNumber || !postedRate || !checkIn) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Refuse early if this property has no Razorpay account configured — before
    // any booking record is written. Otherwise the guest completes the form and
    // the flow dies at link creation, leaving an orphan booking behind.
    if (!razorpayEnabled(property)) {
      console.error(`[create-payment-links] Razorpay not configured for ${property} — set RZP_KEY_ID/SECRET for it`)
      return NextResponse.json(
        { error: "Online booking isn't available for this property yet. Please WhatsApp us on +91 91139 92047 and we'll set it up for you." },
        { status: 503 },
      )
    }

    // ── Money integrity: derive the rate server-side; never trust the client ──
    if (!Number.isInteger(postedRate) || postedRate <= 0) {
      return NextResponse.json({ error: "Invalid monthly rate." }, { status: 400 })
    }
    const monthlyRate = canonicalRate(property, roomTypeRaw, postedRate)
    if (monthlyRate === null) {
      return NextResponse.json({ error: "Monthly rate does not match the selected room's tariff." }, { status: 400 })
    }

    // House rule: pets are only allowed in private rooms. The wizard enforces
    // this too — this is the server-side backstop against direct submissions.
    if ((formData.get("petParent") as string) === "Yes" && !/private/i.test(roomTypeRaw)) {
      return NextResponse.json({ error: "Pets are only allowed in private rooms. Please choose a private room to book with a pet." }, { status: 400 })
    }

    // 1 Week Exploratory Stay (≤7 nights): flat ₹25,000 rent, NO security
    // deposit, private rooms only. Derived from the dates so a hand-crafted
    // request can't pick a week-long stay at the pro-rated monthly price.
    const exploratory = isExploratoryStay(checkIn, checkOut)
    if (exploratory && !/private/i.test(roomTypeRaw)) {
      return NextResponse.json({ error: "The 1 Week Exploratory Stay is available for private rooms only. Please choose a private room or a longer stay." }, { status: 400 })
    }

    // ── Stay-length validation: a missing/invalid checkOut would make the rent
    // schedule open-ended and mint a 120-month auto-debit mandate. Require a
    // real end date, after check-in and within the 4-month cap. ──
    if (!checkOut) {
      return NextResponse.json({ error: "A check-out date is required." }, { status: 400 })
    }
    if (checkOut <= checkIn) {
      return NextResponse.json({ error: "Check-out must be after check-in." }, { status: 400 })
    }
    if (exceedsMaxStay(checkIn, checkOut)) {
      return NextResponse.json({
        error: `A single booking is capped at ${MAX_STAY_MONTHS} months (through ${maxStayCheckoutISO(checkIn)}). To stay longer, book up to the cap and extend or re-apply.`,
      }, { status: 400 })
    }

    // Authoritative check-in date validation (IST). checkInMin/checkInMax are the
    // bed's availability window forwarded by the client; combined with the
    // bed-vacancy guard below, they help prevent booking a date the room isn't free.
    const checkInMin = (formData.get("checkInMin") as string) || ""
    const checkInMax = (formData.get("checkInMax") as string) || ""
    if (checkIn < istTodayISO()) {
      return NextResponse.json({ error: "Check-in date cannot be in the past." }, { status: 400 })
    }
    if (checkInMin && checkIn < checkInMin) {
      return NextResponse.json({ error: `This room is not available until ${checkInMin}.` }, { status: 400 })
    }
    // checkInMax is the next promised occupant's check-in — the whole stay
    // (through check-out) must end on or before it, not just the check-in day.
    if (checkInMax && checkIn >= checkInMax) {
      return NextResponse.json({ error: `This room is only available until ${checkInMax}.` }, { status: 400 })
    }
    if (checkInMax && checkOut > checkInMax) {
      return NextResponse.json({ error: `This room is booked from ${checkInMax}; please shorten your stay to end by then.` }, { status: 400 })
    }

    // Idempotency: refuse a duplicate submission for the same email + check-in
    // (a live booking already exists — the guest should use its existing links).
    if (await existingActiveBooking(email, checkIn)) {
      return NextResponse.json({
        error: "You already have a booking in progress for this check-in date. Please check your email for the payment links, or contact us if you need help.",
      }, { status: 409 })
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
    const workReference = (formData.get("workReference") as string) || ""
    const idProofType = formData.get("idProofType") as string
    const idNumber = formData.get("idNumber") as string
    const emergencyName = formData.get("emergencyName") as string
    const emergencyNumber = formData.get("emergencyNumber") as string
    const emergencyRelation = formData.get("emergencyRelation") as string
    const inspectionConsent = (formData.get("inspectionConsent") as string) || ""
    const petParent = formData.get("petParent") as string
    const petType = (formData.get("petType") as string) || ""
    const petName = (formData.get("petName") as string) || ""
    const petAge = (formData.get("petAge") as string) || ""
    const petBreed = (formData.get("petBreed") as string) || ""
    const petGender = (formData.get("petGender") as string) || ""
    const petVaccinated = (formData.get("petVaccinated") as string) || ""
    const petNeutered = (formData.get("petNeutered") as string) || ""
    const petHealthConcerns = (formData.get("petHealthConcerns") as string) || ""
    const petTrained = (formData.get("petTrained") as string) || ""
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
      "📜 Rules and Regulations": {
        multi_select: [
          { name: "Acceptance of Terms and Conditions" },
          ...(inspectionConsent === "Yes" ? [{ name: "Consent to Room Inspections" }] : []),
        ],
      },
      Status: { select: { name: "Deposit Pending" } },
      "Tariff": { number: monthlyRate },
      // Ops marker: exploratory stays collected NO security deposit — nothing
      // to refund at checkout, and the flat ₹25k rent is their only rent.
      ...(exploratory ? { Tags: { multi_select: [{ name: "Exploratory" }] } } : {}),
    }

    if (photoUploadId) properties["📸 Recent Photograph"] = fileUploadProp(photoUploadId)
    if (passportUploadId) properties["🛂 Passport"] = fileUploadProp(passportUploadId)
    if (idProofUploadId) properties["📎 ID Proof "] = fileUploadProp(idProofUploadId)
    if (signatureUploadId) properties["✍️ Digital Signature"] = fileUploadProp(signatureUploadId)

    // Pet details (when a Pet Parent) are written as page content blocks so we
    // never fail the booking on a missing Notion property. Tag stays on "Pet Parent".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = []
    if (workReference.trim()) {
      children.push({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: [{ type: "text", text: { content: `🔎 Work reference (verification): ${workReference}` } }] },
      })
    }
    if (petParent === "Yes") {
      const petLines = [
        `Pet type: ${petType}`,
        `Pet name: ${petName}`,
        `Age: ${petAge}`,
        `Breed: ${petBreed}`,
        `Gender: ${petGender}`,
        `Vaccinated: ${petVaccinated}`,
        `Spayed/Neutered: ${petNeutered}`,
        `Professionally trained: ${petTrained || "No"}`,
        `Health concerns: ${petHealthConcerns || "None"}`,
        `Pet fee: ₹25,000 one-time deposit + ₹5,000/month recurring`,
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

    // 2b — Archive KYC documents to the restricted Supabase bucket, keyed by
    // the guest's Notion page id. Notion keeps the team-facing copy; Supabase
    // is the locked-down system of record for sensitive documents.
    await archiveGuestDocuments(notionPageId, {
      photo: photoFile,
      "id-proof": idProofFile,
      signature: signatureFile,
      passport: passportFile,
      "pet-photo": petParent === "Yes" ? petPhotoFile : null,
      "second-guest-id-proof": hasSecondGuest ? g2IdProofFile : null,
    })

    // 3 — Room board: deliberately NOT touched here. An unpaid booking must
    // never hold a bed — the bed is assigned by the Razorpay webhook via
    // assignBedForBooking() only once the deposit link is actually PAID.
    // Until then the room stays bookable by others; first paid deposit wins.

    // 4 — Create deposit + maintenance Payment Link.
    // Pet parents pay a one-time ₹25,000 pet deposit on top; the ₹5,000/mo pet
    // fee (and any couple premium) fold into the effective monthly rate below so
    // they're actually collected by the upfront link + subscription — not just
    // written as page text. The stored Tariff stays the RENT rate so the
    // deposit refund at checkout (= 1 month's rent) is unaffected.
    const petDeposit = petParent === "Yes" ? PET_DEPOSIT_FEE : 0
    const petMonthly = petParent === "Yes" ? PET_MONTHLY_FEE : 0
    const couplePremium = hasSecondGuest ? COUPLE_PREMIUM_MONTHLY : 0
    const scheduleRate = monthlyRate + petMonthly + couplePremium
    // Exploratory week: no security deposit — Payment Link 1 is just the
    // maintenance fee (+ pet deposit); the flat rent is the only rent charge.
    const depositAmount = (exploratory ? 0 : monthlyRate) + MAINTENANCE_FEE + petDeposit
    const reqUrl = new URL(req.url)
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? `${reqUrl.protocol}//${reqUrl.host}`
    const depositCallbackUrl = `${baseUrl}/book/confirm?pageId=${notionPageId}&property=${property}&type=deposit`

    // If link creation fails after the guest page already exists, archive it so
    // a retry doesn't leave an orphaned "Deposit Pending" page with no way to
    // pay. (No bed to revert — beds are only assigned after the deposit is paid.)
    async function rollback() {
      try { await client.pages.update({ page_id: notionPageId, archived: true }) }
      catch (e) { console.error("[create-payment-links] rollback: archive page failed:", e) }
    }

    // Exploratory week: the flat rent replaces the whole schedule — no
    // pro-rating, no subscription, no final month (and no pet monthly; the
    // flat price is all-in on rent, the pet deposit is still collected above).
    const schedule = exploratory
      ? { upfront: [], upfrontAmount: EXPLORATORY_WEEK_RENT, subscription: null, finalMonth: null }
      : computeRentSchedule(checkIn, checkOut, scheduleRate)
    const rentDescription = exploratory
      ? `1 Week Exploratory Stay — ${checkIn} to ${checkOut} (flat rate, incl. GST)`
      : describeRentMonths(schedule.upfront, scheduleRate)
        + (petMonthly || couplePremium ? ` (incl. ${[petMonthly ? "₹5,000 pet fee" : "", couplePremium ? "couple premium" : ""].filter(Boolean).join(" + ")}/mo)` : "")
    // The guest has a fixed window to pay the deposit; the link expires after
    // it and the booking is void (payment_link.expired webhook marks it
    // Expired) — they must restart the process.
    const depositExpiresAtUnix = Math.floor(Date.now() / 1000) + DEPOSIT_PAYMENT_WINDOW_MINUTES * 60

    let depositLink: { id: string; short_url: string }
    let proRatedLink: { id: string; short_url: string } | null = null
    try {
      depositLink = await createDepositLink({
        property,
        guestName: fullName,
        email,
        phone: contactNumber,
        amount: depositAmount,
        notionPageId,
        callbackUrl: depositCallbackUrl,
        expireByUnix: depositExpiresAtUnix,
        ...(exploratory ? { description: "Booking Fee (maintenance, no deposit) — Safina Plaza" } : {}),
      })

      // 5 — Upfront rent Payment Link: pro-rated check-in month (or the full
      // month when checking in on the 1st), plus the next month when a short
      // (≤10-day) stub bundles it. Everything on this link is EXCLUDED from the
      // subscription so the guest is never double-charged.
      if (schedule.upfrontAmount > 0) {
        const proRatedCallbackUrl = `${baseUrl}/book/confirm?pageId=${notionPageId}&property=${property}&type=prorated`
        proRatedLink = await createProRatedLink({
          property,
          guestName: fullName,
          email,
          phone: contactNumber,
          amount: schedule.upfrontAmount,
          description: rentDescription,
          notionPageId,
          callbackUrl: proRatedCallbackUrl,
        })
      }
    } catch (linkErr) {
      console.error("[create-payment-links] link creation failed — rolling back:", linkErr)
      await rollback()
      return NextResponse.json({ error: "Could not create the payment links. Please try again." }, { status: 502 })
    }

    // 6 — Monthly auto-debit subscription: starts after the last upfront-paid
    // month and runs for exactly the number of fully-covered months, so it
    // stops itself at the check-out date. Skipped entirely when the upfront
    // link(s) already cover the whole stay; a partial final month is collected
    // by payment link closer to the date (see cron/extend-stay-reminders).
    let subscriptionId: string | undefined
    let subscriptionStartDate: string | undefined
    if (schedule.subscription) {
      try {
        const sub = await createRentSubscription({
          property,
          guestName: fullName,
          email,
          phone: contactNumber,
          monthlyRate: scheduleRate, // rent + pet/couple monthly, so it's actually debited
          startISO: schedule.subscription.startISO,
          totalCount: schedule.subscription.cycles,
        })
        subscriptionId = sub.id
        subscriptionStartDate = new Date(schedule.subscription.startISO + "T00:00:00")
          .toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
      } catch (err) {
        console.error("[create-payment-links] Subscription creation failed:", err)
      }
    }

    // Persist the Razorpay ids on the booking page so the payment_link.expired
    // webhook can cancel the sibling rent link + unauthorised subscription when
    // the deposit window lapses. Best-effort.
    try {
      await client.pages.update({
        page_id: notionPageId,
        properties: {
          "Razorpay IDs": { rich_text: [{ text: { content: JSON.stringify({
            deposit: depositLink.id,
            prorated: proRatedLink?.id ?? null,
            subscription: subscriptionId ?? null,
          }) } }] },
        },
      })
    } catch (e) { console.warn("[create-payment-links] could not store Razorpay IDs:", e) }

    return NextResponse.json({
      ok: true,
      notionPageId,
      property,
      depositLink: depositLink.short_url,
      depositLinkId: depositLink.id,
      depositAmount,
      depositExpiresAt: depositExpiresAtUnix,
      depositWindowMinutes: DEPOSIT_PAYMENT_WINDOW_MINUTES,
      proRatedLink: proRatedLink?.short_url ?? null,
      proRatedLinkId: proRatedLink?.id ?? null,
      proRatedAmount: proRatedLink ? schedule.upfrontAmount : null,
      proRatedDescription: proRatedLink ? rentDescription : null,
      subscriptionId,
      subscriptionStartDate,
      subscriptionCycles: schedule.subscription?.cycles ?? null,
      finalMonthAmount: schedule.finalMonth?.amount ?? null,
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
