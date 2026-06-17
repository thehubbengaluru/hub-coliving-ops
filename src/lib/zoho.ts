import type { Property } from "./types"

// ─── Config ───────────────────────────────────────────────────────────────

const CLIENT_ID     = process.env.ZOHO_CLIENT_ID!
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET!
const REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN!

const ORG_IDS: Record<Property, string> = {
  "safina-plaza": process.env.ZOHO_ORG_ID_PLAZA!,
  "peepal-tree":  process.env.ZOHO_ORG_ID_PEEPAL!,
}

const ZOHO_ACCOUNTS_URL = "https://accounts.zoho.in/oauth/v2/token"
const ZOHO_BOOKS_URL    = "https://www.zohoapis.in/books/v3"

// ─── Token cache (in-process; refreshes on expiry) ────────────────────────

let cachedToken: string | null = null
let tokenExpiresAt = 0

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) return cachedToken

  const res = await fetch(ZOHO_ACCOUNTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: REFRESH_TOKEN,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    "refresh_token",
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Zoho token refresh failed: ${text}`)
  }

  const data = await res.json() as { access_token: string; expires_in: number }
  cachedToken    = data.access_token
  tokenExpiresAt = Date.now() + data.expires_in * 1000
  return cachedToken
}

async function zohoFetch(method: string, path: string, property: Property, body?: unknown) {
  const token = await getAccessToken()
  const orgId = ORG_IDS[property]
  const url   = `${ZOHO_BOOKS_URL}${path}?organization_id=${orgId}`

  const res = await fetch(url, {
    method,
    headers: {
      Authorization:  `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const data = await res.json() as Record<string, unknown>
  if (!res.ok || (data.code !== undefined && data.code !== 0)) {
    throw new Error(`Zoho API error (${path}): ${data.message ?? JSON.stringify(data)}`)
  }
  return data
}

// ─── Public types ─────────────────────────────────────────────────────────

export interface ZohoInvoice {
  invoice_id:     string
  invoice_number: string
  status:         string
  total:          number
}

export interface ZohoDepositReceipt {
  retainerinvoice_id: string
  retainerinvoice_number: string
  status: string
  total:  number
}

// ─── Contact helpers ──────────────────────────────────────────────────────

async function findOrCreateContact(property: Property, guestName: string, email: string, phone: string): Promise<string> {
  // Search for existing contact by email
  if (email) {
    const search = await zohoFetch("GET", `/contacts?email=${encodeURIComponent(email)}&contact_type=customer`, property)
    const list = (search.contacts ?? []) as Array<{ contact_id: string }>
    if (list.length > 0) return list[0].contact_id
  }

  // Create new contact
  const created = await zohoFetch("POST", "/contacts", property, {
    contact_name:  guestName,
    contact_type:  "customer",
    email_id:      email || undefined,
    mobile:        phone  || undefined,
  })
  return (created.contact as { contact_id: string }).contact_id
}

// ─── Invoice ──────────────────────────────────────────────────────────────

export async function createRentInvoice({
  property,
  guestName,
  email,
  phone,
  amount,
  checkInDate,
  description,
}: {
  property:    Property
  guestName:   string
  email:       string
  phone:       string
  amount:      number
  checkInDate: string
  description?: string
}): Promise<ZohoInvoice> {
  const contactId = await findOrCreateContact(property, guestName, email, phone)
  const propertyLabel = property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"
  const invoiceDate   = checkInDate.slice(0, 10)

  const data = await zohoFetch("POST", "/invoices", property, {
    customer_id:  contactId,
    invoice_date: invoiceDate,
    line_items: [{
      name:        description ?? `Monthly Rent — ${propertyLabel}`,
      description: `Accommodation at ${propertyLabel}`,
      rate:        amount,
      quantity:    1,
    }],
    notes:              `Hub Ops check-in: ${guestName}`,
    is_inclusive_tax:   false,
  })

  return data.invoice as ZohoInvoice
}

// ─── Send invoice to customer by email ────────────────────────────────────

export async function sendInvoice(property: Property, invoiceId: string): Promise<void> {
  await zohoFetch("POST", `/invoices/${invoiceId}/email`, property, {
    send_from_org_email_id: true,
  })
}

// ─── Mark invoice as paid ─────────────────────────────────────────────────

export async function markInvoicePaid({
  property,
  invoiceId,
  amount,
  paymentDate,
  paymentMode = "online",
  reference,
}: {
  property:    Property
  invoiceId:   string
  amount:      number
  paymentDate: string
  paymentMode?: string
  reference?:  string
}): Promise<void> {
  await zohoFetch("POST", "/customerpayments", property, {
    customer_id:   undefined, // will be resolved via invoice
    payment_mode:  paymentMode,
    amount,
    date:          paymentDate.slice(0, 10),
    reference_number: reference,
    invoices: [{ invoice_id: invoiceId, amount_applied: amount }],
  })
}

// ─── Security deposit — Retainer Invoice (advance receipt, not revenue) ───

export async function createDepositReceipt({
  property,
  guestName,
  email,
  phone,
  amount,
  date,
}: {
  property:  Property
  guestName: string
  email:     string
  phone:     string
  amount:    number
  date:      string
}): Promise<ZohoDepositReceipt> {
  const contactId     = await findOrCreateContact(property, guestName, email, phone)
  const propertyLabel = property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"

  const data = await zohoFetch("POST", "/retainerinvoices", property, {
    customer_id:    contactId,
    date:           date.slice(0, 10),
    line_items: [{
      name:        `Security Deposit — ${propertyLabel}`,
      description: "Refundable security deposit",
      rate:        amount,
      quantity:    1,
    }],
    notes: `Security deposit held for ${guestName}. Refundable on checkout.`,
  })

  return data.retainerinvoice as ZohoDepositReceipt
}

// ─── Mark retainer (deposit) as received (paid) ───────────────────────────

export async function markDepositReceived({
  property,
  retainerInvoiceId,
  amount,
  paymentDate,
  reference,
}: {
  property:          Property
  retainerInvoiceId: string
  amount:            number
  paymentDate:       string
  reference?:        string
}): Promise<void> {
  await zohoFetch("POST", `/retainerinvoices/${retainerInvoiceId}/payments`, property, {
    amount,
    date:             paymentDate.slice(0, 10),
    payment_mode:     "online",
    reference_number: reference,
  })
}
