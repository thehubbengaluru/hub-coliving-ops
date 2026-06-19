"use client"

import { useState, useRef } from "react"

const AMBER = "#F9A91F"

const HOUSE_RULES = `1. Identification & Check-In
All guests must provide valid government-issued photo ID at check-in. Only registered guests are permitted to stay overnight. Any change in occupancy must be informed to management in advance.

2. Stay Duration & Check-Out
Check-in and check-out times must be strictly followed. Late check-outs may incur additional charges. Extension of stay is subject to availability and prior approval. Notice to vacate the property is 30 days.

3. Payments & Security Deposit
Full payment must be completed as per the agreed terms. Security deposit will be refunded after check-out, subject to inspection. Deductions may be made for damages, missing items, or unpaid dues. To secure your spot the following must be cleared 24 hours before arrival: Security Deposit equivalent to 1 month's tariff + Maintenance fee (non-refundable one-time fee of ₹2,000).

4. Use of Premises
Rooms and common areas must be used responsibly. Any damage to property, furniture, or fixtures will be chargeable. Rearranging furniture without permission is not allowed.

5. Cleanliness & Hygiene
Guests are expected to maintain cleanliness in their rooms and common areas. Regular housekeeping schedules must be respected. Waste should be disposed of only in designated bins.

6. Noise & Conduct
Quiet hours must be observed, especially during night hours. Loud music, parties, or disruptive behavior are strictly prohibited. Respect the privacy and comfort of other residents at all times.

7. Visitors & Overnight Guests
Visitors are allowed only during designated hours. Overnight visitors are permitted only with prior approval and may incur extra charges. Management reserves the right to deny visitor access if rules are violated.

8. Safety & Security
Smoking, alcohol consumption, and illegal substances are strictly prohibited unless explicitly permitted. Fire safety equipment must not be tampered with. Guests must follow all safety guidelines displayed on the premises.

9. Prohibited Activities
Illegal activities of any kind are strictly forbidden. Cooking inside rooms, tampering with utilities, or subletting is prohibited.

10. Loss & Liability
Management is not responsible for loss or theft of personal belongings. Guests are advised to keep valuables secure at all times.

11. Internet & Utilities
Internet access is provided for personal use only. Excessive or illegal usage may result in restricted access. Utilities should be used responsibly.

12. Rule Violations & Termination of Stay
Violation of any rules may lead to penalties or immediate termination of stay. No refunds will be issued in case of eviction due to misconduct. Management's decision in such matters will be final.

13. Acceptance of Terms
By submitting this form, the guest confirms they have read, understood, and agreed to all the above rules and regulations.`

type FormData = {
  // Step 1
  fullName: string
  dob: string
  gender: string
  nationality: string
  permanentAddress: string
  email: string
  contactNumber: string
  photo: File | null
  // Step 2
  property: string
  roomType: string
  roomNumber: string
  checkIn: string
  checkOut: string
  // Step 3
  orgName: string
  employmentStatus: string
  occupation: string
  workAddress: string
  placeOfWork: string
  linkedin: string
  // Step 4
  idProofType: string
  idNumber: string
  idProof: File | null
  emergencyName: string
  emergencyNumber: string
  emergencyRelation: string
  petParent: string
  // Step 5
  rulesAccepted: boolean
  signature: File | null
}

type Errors = Partial<Record<keyof FormData, string>>

const INITIAL: FormData = {
  fullName: "",
  dob: "",
  gender: "",
  nationality: "",
  permanentAddress: "",
  email: "",
  contactNumber: "",
  photo: null,
  property: "",
  roomType: "",
  roomNumber: "",
  checkIn: "",
  checkOut: "",
  orgName: "",
  employmentStatus: "",
  occupation: "",
  workAddress: "",
  placeOfWork: "",
  linkedin: "",
  idProofType: "",
  idNumber: "",
  idProof: null,
  emergencyName: "",
  emergencyNumber: "",
  emergencyRelation: "",
  petParent: "",
  rulesAccepted: false,
  signature: null,
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {children}
      {required && (
        <span className="ml-1 font-semibold" style={{ color: AMBER }}>*</span>
      )}
    </label>
  )
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null
  return <p className="mt-1 text-xs text-red-500">{msg}</p>
}

const inputClass =
  "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:border-transparent transition-all"
const inputStyle = { "--tw-ring-color": AMBER } as React.CSSProperties

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  error,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  error?: string
}) {
  return (
    <div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
        style={{ ...inputStyle, borderColor: error ? "#ef4444" : undefined }}
      />
      <FieldError msg={error} />
    </div>
  )
}

function TextareaInput({
  value,
  onChange,
  placeholder,
  error,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  error?: string
}) {
  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className={inputClass}
        style={{ ...inputStyle, borderColor: error ? "#ef4444" : undefined }}
      />
      <FieldError msg={error} />
    </div>
  )
}

function SelectInput({
  value,
  onChange,
  options,
  error,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  error?: string
}) {
  return (
    <div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        style={{ ...inputStyle, borderColor: error ? "#ef4444" : undefined }}
      >
        <option value="">Select...</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <FieldError msg={error} />
    </div>
  )
}

function ButtonGroup({
  options,
  value,
  onChange,
  error,
}: {
  options: string[]
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all border"
              style={
                selected
                  ? {
                      backgroundColor: AMBER,
                      color: "#000",
                      borderColor: AMBER,
                    }
                  : {
                      backgroundColor: "#f3f4f6",
                      color: "#4b5563",
                      borderColor: "#e5e7eb",
                    }
              }
            >
              {opt}
            </button>
          )
        })}
      </div>
      <FieldError msg={error} />
    </div>
  )
}

function FileInput({
  accept,
  onChange,
  value,
  error,
}: {
  accept: string
  onChange: (f: File | null) => void
  value: File | null
  error?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div>
      <div
        onClick={() => ref.current?.click()}
        className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-gray-300 cursor-pointer hover:border-amber-400 transition-all bg-gray-50"
        style={{ borderColor: error ? "#ef4444" : undefined }}
      >
        <svg
          className="w-5 h-5 text-gray-400 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
          />
        </svg>
        <span className="text-sm text-gray-500 truncate">
          {value ? value.name : "Click to choose file"}
        </span>
      </div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <FieldError msg={error} />
    </div>
  )
}

function validateStep(step: number, data: FormData): Errors {
  const errors: Errors = {}

  if (step === 1) {
    if (!data.fullName.trim()) errors.fullName = "Full name is required"
    if (!data.dob) errors.dob = "Date of birth is required"
    if (!data.gender) errors.gender = "Gender is required"
    if (!data.nationality.trim()) errors.nationality = "Nationality is required"
    if (!data.permanentAddress.trim())
      errors.permanentAddress = "Address is required"
    if (!data.email.trim()) {
      errors.email = "Email is required"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.email = "Enter a valid email address"
    }
    if (!data.contactNumber.trim()) {
      errors.contactNumber = "Contact number is required"
    } else if (!/^\d+$/.test(data.contactNumber.replace(/[\s+\-()]/g, ""))) {
      errors.contactNumber = "Contact number must be numeric"
    }
    if (!data.photo) errors.photo = "Recent photograph is required"
  }

  if (step === 2) {
    if (!data.property) errors.property = "Property is required"
    if (!data.roomType) errors.roomType = "Room type is required"
    if (!data.roomNumber.trim()) errors.roomNumber = "Room number is required"
    if (!data.checkIn) errors.checkIn = "Check-in date is required"
  }

  if (step === 3) {
    if (!data.orgName.trim())
      errors.orgName = "Organisation / College name is required"
    if (!data.employmentStatus)
      errors.employmentStatus = "Employment status is required"
    if (!data.occupation.trim()) errors.occupation = "Occupation is required"
    if (!data.workAddress.trim()) errors.workAddress = "Work address is required"
    if (!data.placeOfWork.trim())
      errors.placeOfWork = "Place of work is required"
    if (!data.linkedin.trim()) {
      errors.linkedin = "LinkedIn profile URL is required"
    } else if (!/^https?:\/\/.+/.test(data.linkedin)) {
      errors.linkedin = "Enter a valid URL starting with http:// or https://"
    }
  }

  if (step === 4) {
    if (!data.idProofType) errors.idProofType = "ID proof type is required"
    if (!data.idNumber.trim()) errors.idNumber = "ID number is required"
    if (!data.idProof) errors.idProof = "ID proof upload is required"
    if (!data.emergencyName.trim())
      errors.emergencyName = "Emergency contact name is required"
    if (!data.emergencyNumber.trim()) {
      errors.emergencyNumber = "Emergency contact number is required"
    } else if (
      !/^\d+$/.test(data.emergencyNumber.replace(/[\s+\-()]/g, ""))
    ) {
      errors.emergencyNumber = "Emergency contact number must be numeric"
    }
    if (!data.emergencyRelation.trim())
      errors.emergencyRelation = "Relation is required"
    if (!data.petParent) errors.petParent = "Please select an option"
  }

  if (step === 5) {
    if (!data.rulesAccepted)
      errors.rulesAccepted = "You must accept the house rules to continue"
    if (!data.signature) errors.signature = "Signature upload is required"
  }

  return errors
}

const STEPS = [
  "Personal Info",
  "Stay Details",
  "Professional",
  "ID & Emergency",
  "Rules & Sign",
]

export default function BookPage() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<FormData>(INITIAL)
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setData((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function handleNext() {
    const errs = validateStep(step, data)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    setErrors({})
    setStep((s) => s + 1)
  }

  async function handleSubmit() {
    const errs = validateStep(5, data)
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      const fd = new FormData()
      fd.append("fullName", data.fullName)
      fd.append("dob", data.dob)
      fd.append("gender", data.gender)
      fd.append("nationality", data.nationality)
      fd.append("permanentAddress", data.permanentAddress)
      fd.append("email", data.email)
      fd.append("contactNumber", data.contactNumber)
      if (data.photo) fd.append("photo", data.photo)
      fd.append("property", data.property)
      fd.append("roomType", data.roomType)
      fd.append("roomNumber", data.roomNumber)
      fd.append("checkIn", data.checkIn)
      if (data.checkOut) fd.append("checkOut", data.checkOut)
      fd.append("orgName", data.orgName)
      fd.append("employmentStatus", data.employmentStatus)
      fd.append("occupation", data.occupation)
      fd.append("workAddress", data.workAddress)
      fd.append("placeOfWork", data.placeOfWork)
      fd.append("linkedin", data.linkedin)
      fd.append("idProofType", data.idProofType)
      fd.append("idNumber", data.idNumber)
      if (data.idProof) fd.append("idProof", data.idProof)
      fd.append("emergencyName", data.emergencyName)
      fd.append("emergencyNumber", data.emergencyNumber)
      fd.append("emergencyRelation", data.emergencyRelation)
      fd.append("petParent", data.petParent)
      if (data.signature) fd.append("signature", data.signature)

      const res = await fetch("/api/bookings/submit", {
        method: "POST",
        body: fd,
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || "Submission failed. Please try again.")
      }

      setSubmitted(true)
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center py-16">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ backgroundColor: "#fef3d8" }}
          >
            <svg
              className="w-8 h-8"
              style={{ color: AMBER }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2
            className="text-3xl text-black mb-3"
            style={{ fontFamily: "Calistoga, serif" }}
          >
            Booking Received!
          </h2>
          <p className="text-gray-600 mb-8">
            Thank you for choosing The Hub. Our team will review your details
            and reach out to you shortly.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold text-black transition-all hover:opacity-90"
            style={{ backgroundColor: AMBER }}
          >
            Back to Home
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <span
              className="text-xl font-normal"
              style={{ fontFamily: "Calistoga, serif", color: AMBER }}
            >
              The Hub
            </span>
          </a>
          <span className="text-sm text-gray-500">
            Step {step} of {STEPS.length}
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${(step / STEPS.length) * 100}%`,
              backgroundColor: AMBER,
            }}
          />
        </div>
      </div>

      {/* Step pills */}
      <div className="max-w-2xl mx-auto px-4 py-6 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {STEPS.map((label, i) => {
            const num = i + 1
            const isActive = num === step
            const isDone = num < step
            return (
              <div key={label} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                    style={
                      isActive
                        ? { backgroundColor: AMBER, color: "#000" }
                        : isDone
                        ? { backgroundColor: "#d1fae5", color: "#065f46" }
                        : { backgroundColor: "#f3f4f6", color: "#9ca3af" }
                    }
                  >
                    {isDone ? "✓" : num}
                  </div>
                  <span
                    className="text-xs font-medium whitespace-nowrap"
                    style={{ color: isActive ? "#000" : "#9ca3af" }}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="w-6 h-px bg-gray-200 shrink-0" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Form card */}
      <div className="max-w-2xl mx-auto px-4 pb-16">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 sm:p-8">
          {/* Step 1: Personal Info */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2
                  className="text-2xl text-black mb-1"
                  style={{ fontFamily: "Calistoga, serif" }}
                >
                  Personal Information
                </h2>
                <p className="text-sm text-gray-500">
                  Tell us about yourself
                </p>
              </div>

              <div>
                <Label required>Full legal name</Label>
                <TextInput
                  value={data.fullName}
                  onChange={(v) => set("fullName", v)}
                  placeholder="As per your ID"
                  error={errors.fullName}
                />
              </div>

              <div>
                <Label required>Date of birth</Label>
                <TextInput
                  type="date"
                  value={data.dob}
                  onChange={(v) => set("dob", v)}
                  error={errors.dob}
                />
              </div>

              <div>
                <Label required>Gender</Label>
                <ButtonGroup
                  options={["Male", "Female", "Other"]}
                  value={data.gender}
                  onChange={(v) => set("gender", v)}
                  error={errors.gender}
                />
              </div>

              <div>
                <Label required>Nationality</Label>
                <TextInput
                  value={data.nationality}
                  onChange={(v) => set("nationality", v)}
                  placeholder="e.g. Indian"
                  error={errors.nationality}
                />
              </div>

              <div>
                <Label required>Permanent address</Label>
                <TextareaInput
                  value={data.permanentAddress}
                  onChange={(v) => set("permanentAddress", v)}
                  placeholder="Full address including city, state and PIN"
                  error={errors.permanentAddress}
                />
              </div>

              <div>
                <Label required>Email</Label>
                <TextInput
                  type="email"
                  value={data.email}
                  onChange={(v) => set("email", v)}
                  placeholder="you@example.com"
                  error={errors.email}
                />
              </div>

              <div>
                <Label required>Contact number</Label>
                <TextInput
                  type="tel"
                  value={data.contactNumber}
                  onChange={(v) => set("contactNumber", v)}
                  placeholder="+91 98765 43210"
                  error={errors.contactNumber}
                />
              </div>

              <div>
                <Label required>Recent photograph (JPG or PNG)</Label>
                <FileInput
                  accept="image/*"
                  value={data.photo}
                  onChange={(f) => set("photo", f)}
                  error={errors.photo}
                />
              </div>
            </div>
          )}

          {/* Step 2: Stay Details */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2
                  className="text-2xl text-black mb-1"
                  style={{ fontFamily: "Calistoga, serif" }}
                >
                  Stay Details
                </h2>
                <p className="text-sm text-gray-500">
                  Where and when are you staying?
                </p>
              </div>

              <div>
                <Label required>Property</Label>
                <ButtonGroup
                  options={[
                    "The Hub Bengaluru – Safina Plaza",
                    "Peepal Tree @ The Hub",
                  ]}
                  value={data.property}
                  onChange={(v) => set("property", v)}
                  error={errors.property}
                />
              </div>

              <div>
                <Label required>Room type</Label>
                <ButtonGroup
                  options={["Single Sharing", "Double sharing"]}
                  value={data.roomType}
                  onChange={(v) => set("roomType", v)}
                  error={errors.roomType}
                />
              </div>

              <div>
                <Label required>Room number</Label>
                <TextInput
                  value={data.roomNumber}
                  onChange={(v) => set("roomNumber", v)}
                  placeholder="e.g. 202 A"
                  error={errors.roomNumber}
                />
              </div>

              <div>
                <Label required>Estimated check-in date</Label>
                <TextInput
                  type="date"
                  value={data.checkIn}
                  onChange={(v) => set("checkIn", v)}
                  error={errors.checkIn}
                />
              </div>

              <div>
                <Label>
                  Estimated check-out (leave blank for open-ended)
                </Label>
                <TextInput
                  type="date"
                  value={data.checkOut}
                  onChange={(v) => set("checkOut", v)}
                  error={errors.checkOut}
                />
              </div>
            </div>
          )}

          {/* Step 3: Professional Info */}
          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2
                  className="text-2xl text-black mb-1"
                  style={{ fontFamily: "Calistoga, serif" }}
                >
                  Professional Information
                </h2>
                <p className="text-sm text-gray-500">
                  Tell us about your work or studies
                </p>
              </div>

              <div>
                <Label required>Organisation / College name</Label>
                <TextInput
                  value={data.orgName}
                  onChange={(v) => set("orgName", v)}
                  placeholder="e.g. Infosys, IIM Bangalore"
                  error={errors.orgName}
                />
              </div>

              <div>
                <Label required>Employment status</Label>
                <SelectInput
                  value={data.employmentStatus}
                  onChange={(v) => set("employmentStatus", v)}
                  options={[
                    "Employed",
                    "Student",
                    "Self-Employed",
                    "Freelancer",
                    "Unemployed",
                  ]}
                  error={errors.employmentStatus}
                />
              </div>

              <div>
                <Label required>Occupation</Label>
                <TextInput
                  value={data.occupation}
                  onChange={(v) => set("occupation", v)}
                  placeholder="e.g. Software Engineer, MBA Student"
                  error={errors.occupation}
                />
              </div>

              <div>
                <Label required>Work / Office / College address</Label>
                <TextareaInput
                  value={data.workAddress}
                  onChange={(v) => set("workAddress", v)}
                  placeholder="Full address"
                  error={errors.workAddress}
                />
              </div>

              <div>
                <Label required>Place of work</Label>
                <TextInput
                  value={data.placeOfWork}
                  onChange={(v) => set("placeOfWork", v)}
                  placeholder="City / Area"
                  error={errors.placeOfWork}
                />
              </div>

              <div>
                <Label required>LinkedIn profile URL</Label>
                <TextInput
                  type="url"
                  value={data.linkedin}
                  onChange={(v) => set("linkedin", v)}
                  placeholder="https://linkedin.com/in/yourname"
                  error={errors.linkedin}
                />
              </div>
            </div>
          )}

          {/* Step 4: ID & Emergency Contact */}
          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2
                  className="text-2xl text-black mb-1"
                  style={{ fontFamily: "Calistoga, serif" }}
                >
                  ID & Emergency Contact
                </h2>
                <p className="text-sm text-gray-500">
                  For verification and safety purposes
                </p>
              </div>

              <div>
                <Label required>ID proof type</Label>
                <ButtonGroup
                  options={["Aadhaar", "PAN", "Passport", "Driving Licence"]}
                  value={data.idProofType}
                  onChange={(v) => set("idProofType", v)}
                  error={errors.idProofType}
                />
              </div>

              <div>
                <Label required>ID number</Label>
                <TextInput
                  value={data.idNumber}
                  onChange={(v) => set("idNumber", v)}
                  placeholder="Enter your ID number"
                  error={errors.idNumber}
                />
              </div>

              <div>
                <Label required>
                  Upload ID proof (front + back, JPG/PDF)
                </Label>
                <FileInput
                  accept="image/*,application/pdf"
                  value={data.idProof}
                  onChange={(f) => set("idProof", f)}
                  error={errors.idProof}
                />
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p
                  className="text-sm font-semibold text-black mb-4"
                  style={{ fontFamily: "Calistoga, serif" }}
                >
                  Emergency Contact
                </p>

                <div className="space-y-4">
                  <div>
                    <Label required>Emergency contact name</Label>
                    <TextInput
                      value={data.emergencyName}
                      onChange={(v) => set("emergencyName", v)}
                      placeholder="Full name"
                      error={errors.emergencyName}
                    />
                  </div>

                  <div>
                    <Label required>Emergency contact number</Label>
                    <TextInput
                      type="tel"
                      value={data.emergencyNumber}
                      onChange={(v) => set("emergencyNumber", v)}
                      placeholder="+91 98765 43210"
                      error={errors.emergencyNumber}
                    />
                  </div>

                  <div>
                    <Label required>Relation</Label>
                    <TextInput
                      value={data.emergencyRelation}
                      onChange={(v) => set("emergencyRelation", v)}
                      placeholder="e.g. Parent, Spouse, Sibling"
                      error={errors.emergencyRelation}
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label required>Are you a pet parent?</Label>
                <ButtonGroup
                  options={["Yes", "No"]}
                  value={data.petParent}
                  onChange={(v) => set("petParent", v)}
                  error={errors.petParent}
                />
              </div>
            </div>
          )}

          {/* Step 5: House Rules & Agreement */}
          {step === 5 && (
            <div className="space-y-5">
              <div>
                <h2
                  className="text-2xl text-black mb-1"
                  style={{ fontFamily: "Calistoga, serif" }}
                >
                  House Rules & Agreement
                </h2>
                <p className="text-sm text-gray-500">
                  Please read and accept our house rules
                </p>
              </div>

              <div
                className="rounded-lg border border-gray-200 bg-gray-50 p-4 overflow-y-scroll text-xs text-gray-600 leading-relaxed whitespace-pre-wrap"
                style={{ maxHeight: "16rem" }}
              >
                {HOUSE_RULES}
              </div>

              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={data.rulesAccepted}
                    onChange={(e) => set("rulesAccepted", e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 shrink-0"
                    style={{ accentColor: AMBER }}
                  />
                  <span className="text-sm text-gray-700">
                    I have read and agree to the House Rules,{" "}
                    <a href="/legal/terms-and-conditions" target="_blank" rel="noopener noreferrer" style={{ color: AMBER }} className="underline">Terms &amp; Conditions</a>,{" "}
                    <a href="/legal/refund-policy" target="_blank" rel="noopener noreferrer" style={{ color: AMBER }} className="underline">Refund Policy</a>, and{" "}
                    <a href="/legal/cancellation-policy" target="_blank" rel="noopener noreferrer" style={{ color: AMBER }} className="underline">Cancellation Policy</a>
                    <span className="ml-1 font-semibold" style={{ color: AMBER }}>
                      *
                    </span>
                  </span>
                </label>
                <FieldError msg={errors.rulesAccepted} />
              </div>

              <div>
                <Label required>
                  Upload your signature (photo/scan of handwritten signature)
                </Label>
                <FileInput
                  accept="image/*"
                  value={data.signature}
                  onChange={(f) => set("signature", f)}
                  error={errors.signature}
                />
              </div>

              {submitError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-sm text-red-600">{submitError}</p>
                </div>
              )}
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all"
              >
                Back
              </button>
            ) : (
              <div />
            )}

            {step < 5 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold text-black transition-all hover:opacity-90"
                style={{ backgroundColor: AMBER }}
              >
                Next step
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2.5 rounded-lg text-sm font-semibold text-black transition-all hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: AMBER }}
              >
                {submitting ? "Submitting…" : "Submit booking"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
