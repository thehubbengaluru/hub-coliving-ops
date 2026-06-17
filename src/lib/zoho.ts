import type { Property } from "./types"

// ─── Per-account config (two separate Zoho logins) ────────────────────────

type ZohoAccount = {
  clientId:     string
  clientSecret: string
  refreshToken: string
  orgId:        string
  tokenUrl:     string
  apiBase:      string
}

function getAccount(property: Property): ZohoAccount {
  if (property === "safina-plaza") {
    return {
      clientId:     process.env.ZOHO_CLIENT_ID_PLAZA!,
      clientSecret: process.env.ZOHO_CLIENT_SECRET_PLAZA!,
      refreshToken: process.env.ZOHO_REFRESH_TOKEN_PLAZA!,
      orgId:        process.env.ZOHO_ORG_ID_PLAZA!,
      tokenUrl:     process.env.ZOHO_TOKEN_URL_PLAZA  ?? "https://accounts.zoho.in/oauth/v2/token",
      apiBase:      process.env.ZOHO_API_BASE_PLAZA   ?? "https://www.zohoapis.in/books/v3",
    }
  }
  return {
    clientId:     process.env.ZOHO_CLIENT_ID_PEEPAL!,
    clientSecret: process.env.ZOHO_CLIENT_SECRET_PEEPAL!,
    refreshToken: process.env.ZOHO_REFRESH_TOKEN_PEEPAL!,
    orgId:        process.env.ZOHO_ORG_ID_PEEPAL!,
    tokenUrl:     process.env.ZOHO_TOKEN_URL_PEEPAL  ?? "https://accounts.zoho.in/oauth/v2/token",
    apiBase:      process.env.ZOHO_API_BASE_PEEPAL   ?? "https://www.zohoapis.in/books/v3",
  }
}

// ─── Per-account token cache ───────────────────────────────────────────────

const tokenCache: Record<Property, { token: string; expiresAt: number }> = {
  "safina-plaza": { token: "", expiresAt: 0 },
  "peepal-tree":  { token: "", expiresAt: 0 },
}

async function getAccessToken(property: Property): Promise<string> {
  const cache = tokenCache[property]
  if (cache.token && Date.now() < cache.expiresAt - 60_000) return cache.token

  const acct = getAccount(property)
  const res = await fetch(acct.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: acct.refreshToken,
      client_id:     acct.clientId,
      client_secret: acct.clientSecret,
      grant_type:    "refresh_token",
    }),
  })

  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string }
  if (!data.access_token) throw new Error(`Zoho token refresh failed (${property}): ${data.error ?? JSON.stringify(data)}`)

  cache.token     = data.access_token
  cache.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000
  return cache.token
}

// ─── Core fetch helper ────────────────────────────────────────────────────

async function zohoFetch(method: string, path: string, property: Property, body?: unknown) {
  const acct  = getAccount(property)
  const token = await getAccessToken(property)
  const sep   = path.includes("?") ? "&" : "?"
  const url   = `${acct.apiBase}${path}${sep}organization_id=${acct.orgId}`

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
    throw new Error(`Zoho API error (${property} ${path}): ${data.message ?? JSON.stringify(data)}`)
  }
  return data
}

// Returns true if Zoho is configured for a given property
export function zohoEnabled(property: Property): boolean {
  const acct = getAccount(property)
  return !!(acct.clientId && acct.clientSecret && acct.refreshToken && acct.orgId)
}

// ─── Public types ─────────────────────────────────────────────────────────

export interface ZohoInvoice {
  invoice_id:     string
  invoice_number: string
  status:         string
  total:          number
}

export interface ZohoDepositReceipt {
  retainerinvoice_id:     string
  retainerinvoice_number: string
  status: string
  total:  number
}

// ─── Contact helpers ──────────────────────────────────────────────────────

async function findOrCreateContact(property: Property, guestName: string, email: string, phone: string): Promise<string> {
  if (email) {
    const search = await zohoFetch("GET", `/contacts?email=${encodeURIComponent(email)}&contact_type=customer`, property)
    const list = (search.contacts ?? []) as Array<{ contact_id: string }>
    if (list.length > 0) return list[0].contact_id
  }

  const created = await zohoFetch("POST", "/contacts", property, {
    contact_name: guestName,
    contact_type: "customer",
    email_id:     email || undefined,
    mobile:       phone  || undefined,
  })
  return (created.contact as { contact_id: string }).contact_id
}

// ─── Rent invoice ─────────────────────────────────────────────────────────

export async function createRentInvoice({
  property, guestName, email, phone, amount, checkInDate, description,
}: {
  property:     Property
  guestName:    string
  email:        string
  phone:        string
  amount:       number
  checkInDate:  string
  description?: string
}): Promise<ZohoInvoice> {
  const contactId     = await findOrCreateContact(property, guestName, email, phone)
  const propertyLabel = property === "safina-plaza" ? "Safina Plaza" : "Peepal Tree"

  const data = await zohoFetch("POST", "/invoices", property, {
    customer_id:  contactId,
    invoice_date: checkInDate.slice(0, 10),
    line_items: [{
      name:        description ?? `Monthly Rent — ${propertyLabel}`,
      description: `Accommodation at ${propertyLabel}`,
      rate:        amount,
      quantity:    1,
    }],
    notes:            `Hub Ops check-in: ${guestName}`,
    is_inclusive_tax: false,
  })

  return data.invoice as ZohoInvoice
}

// ─── Send invoice by email ────────────────────────────────────────────────

export async function sendInvoice(property: Property, invoiceId: string): Promise<void> {
  await zohoFetch("POST", `/invoices/${invoiceId}/email`, property, {
    send_from_org_email_id: true,
  })
}

// ─── Mark invoice paid ────────────────────────────────────────────────────

export async function markInvoicePaid({
  property, invoiceId, amount, paymentDate, paymentMode = "online", reference,
}: {
  property:     Property
  invoiceId:    string
  amount:       number
  paymentDate:  string
  paymentMode?: string
  reference?:   string
}): Promise<void> {
  await zohoFetch("POST", "/customerpayments", property, {
    payment_mode:     paymentMode,
    amount,
    date:             paymentDate.slice(0, 10),
    reference_number: reference,
    invoices: [{ invoice_id: invoiceId, amount_applied: amount }],
  })
}

// ─── Security deposit retainer invoice ───────────────────────────────────

export async function createDepositReceipt({
  property, guestName, email, phone, amount, date,
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
    customer_id: contactId,
    date:        date.slice(0, 10),
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

// ─── Mark deposit retainer received ──────────────────────────────────────

export async function markDepositReceived({
  property, retainerInvoiceId, amount, paymentDate, reference,
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

// ─── Fetch invoices list ──────────────────────────────────────────────────

export interface ZohoInvoiceListItem {
  invoice_id:     string
  invoice_number: string
  customer_name:  string
  status:         string   // sent | overdue | paid | draft | void | partially_paid
  total:          number
  balance:        number   // outstanding (0 if paid)
  date:           string
  due_date:       string
  email:          string
  is_emailed:     boolean
  invoice_url:    string
}

export async function listInvoices(property: Property): Promise<ZohoInvoiceListItem[]> {
  const all: ZohoInvoiceListItem[] = []
  let page = 1

  while (true) {
    const data = await zohoFetch("GET", `/invoices?page=${page}&per_page=100&sort_column=date&sort_order=D`, property)
    const items = (data.invoices ?? []) as ZohoInvoiceListItem[]
    all.push(...items)
    if (!data.page_context || !(data.page_context as {has_more_page:boolean}).has_more_page) break
    page++
  }

  return all
}

// Returns only invoices whose line items contain one of the given HSN codes.
// Fetches each invoice's details in parallel — safe for small invoice counts.
export async function listInvoicesByHsn(
  property: Property,
  hsnCodes: string[],
): Promise<ZohoInvoiceListItem[]> {
  const all = await listInvoices(property)
  if (all.length === 0) return []

  const details = await Promise.all(
    all.map(inv =>
      zohoFetch("GET", `/invoices/${inv.invoice_id}`, property)
        .then(d => {
          const lineItems = ((d.invoice as Record<string, unknown>)?.line_items ?? []) as { hsn_or_sac?: string }[]
          const match = lineItems.some(li => li.hsn_or_sac && hsnCodes.includes(li.hsn_or_sac))
          return match ? inv : null
        })
        .catch(() => null)
    )
  )

  return details.filter((x): x is ZohoInvoiceListItem => x !== null)
}

// ─── Fetch retainer invoices (security deposits) ─────────────────────────

export interface ZohoRetainerListItem {
  retainerinvoice_id:     string
  retainerinvoice_number: string
  customer_name:          string
  status:                 string   // draft | sent | paid | void
  total:                  number
  balance:                number
  date:                   string
}

export async function listRetainerInvoices(property: Property): Promise<ZohoRetainerListItem[]> {
  const all: ZohoRetainerListItem[] = []
  let page = 1

  while (true) {
    const data = await zohoFetch("GET", `/retainerinvoices?page=${page}&per_page=100`, property)
    const items = (data.retainerinvoices ?? []) as ZohoRetainerListItem[]
    all.push(...items)
    if (!data.page_context || !(data.page_context as {has_more_page:boolean}).has_more_page) break
    page++
  }

  return all
}
