// One-time backfill: copy every guest KYC attachment out of Notion into the
// private Supabase `guest-documents` bucket, one folder per Notion page id —
// the same layout the booking flow writes for new guests.
//
// Covers both places legacy documents live:
//   1. Guest Info form DB   (new-flow submissions)
//   2. Plaza members DB     (legacy Photo / Aadhar / PAN / Passport / Visa props)
// plus form-page content blocks (pet photo images, second-guest ID files).
//
// Idempotent: uploads use upsert, so re-running just overwrites same-named files.
//
//   node --env-file=.env.local scripts/backfill-kyc-to-supabase.mjs --dry-run
//   node --env-file=.env.local scripts/backfill-kyc-to-supabase.mjs

import { createClient } from "@supabase/supabase-js"

const DRY_RUN = process.argv.includes("--dry-run")
const NOTION_TOKEN = process.env.NOTION_TOKEN
const FORM_DB = "2d969190-ee9b-8025-a11b-dc5da277447f"
const MEMBERS_DB = process.env.NOTION_DB_PLAZA

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
})
const BUCKET = "guest-documents"

// Notion file property → document kind (used as the filename prefix)
const FORM_PROPS = {
  "📸 Recent Photograph": "photo",
  "📎 ID Proof ": "id-proof", // trailing space is real
  "✍️ Digital Signature": "signature",
  "🛂 Passport": "passport",
  "PAN Card": "pan-card",
  "Contract": "contract",
}
const MEMBER_PROPS = {
  "Photo": "photo",
  "Aadhar Card": "aadhaar",
  "PAN Card": "pan-card",
  "Passport (If International)": "passport",
  "Indian Visa (If International)": "visa",
}

async function notionFetch(path, body) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Notion ${path}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function* allPages(dbId) {
  let cursor
  do {
    const data = await notionFetch(`/databases/${dbId}/query`, {
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    })
    yield* data.results
    cursor = data.has_more ? data.next_cursor : undefined
  } while (cursor)
}

function safeName(name) {
  return (name || "file").replace(/[^\w.\-]+/g, "_").slice(-80)
}

// Files in a Notion `files` property. `file.url` is a ~1h presigned S3 URL.
function filesFromProp(page, propName) {
  const p = page.properties?.[propName]
  if (p?.type !== "files") return []
  return p.files
    .map(f => ({ name: f.name, url: f.type === "file" ? f.file?.url : f.type === "external" ? f.external?.url : null }))
    .filter(f => f.url)
}

// Pet photo (image block) and second-guest ID (file block) live in page content.
async function filesFromBlocks(pageId) {
  const out = []
  try {
    const data = await notionFetch(`/blocks/${pageId}/children?page_size=100`)
    for (const b of data.results ?? []) {
      if (b.type === "image" && b.image?.type === "file") {
        out.push({ kind: "pet-photo", name: "pet-photo", url: b.image.file.url })
      }
      if (b.type === "file" && b.file?.type === "file") {
        out.push({ kind: "second-guest-id-proof", name: b.file.name || "id", url: b.file.file.url })
      }
    }
  } catch (e) {
    console.warn(`  ! could not read blocks of ${pageId}: ${e.message}`)
  }
  return out
}

async function upload(folder, kind, name, url) {
  const path = `${folder}/${kind}-${safeName(name)}`
  if (DRY_RUN) return { path, ok: true, dry: true }
  const res = await fetch(url)
  if (!res.ok) return { path, ok: false, err: `download ${res.status}` }
  const body = Buffer.from(await res.arrayBuffer())
  if (body.length > 25 * 1024 * 1024) return { path, ok: false, err: `too large (${(body.length / 1048576).toFixed(1)} MB)` }
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    upsert: true,
  })
  return error ? { path, ok: false, err: error.message } : { path, ok: true }
}

function pageTitle(page, prop) {
  return page.properties?.[prop]?.title?.map(t => t.plain_text).join("").trim() ?? ""
}

async function backfillDb(label, dbId, titleProp, propMap, { includeBlocks = false, skipVacant = false } = {}) {
  let pages = 0, files = 0, uploaded = 0, failed = 0
  for await (const page of allPages(dbId)) {
    const name = pageTitle(page, titleProp)
    if (skipVacant && (!name || name.startsWith("Vacant"))) continue
    const docs = Object.entries(propMap).flatMap(([prop, kind]) =>
      filesFromProp(page, prop).map(f => ({ kind, ...f })),
    )
    if (includeBlocks) docs.push(...await filesFromBlocks(page.id))
    if (!docs.length) continue
    pages++
    files += docs.length
    for (const d of docs) {
      const r = await upload(page.id, d.kind, d.name, d.url)
      if (r.ok) uploaded++
      else { failed++; console.warn(`  ✗ ${name || page.id}: ${r.path} — ${r.err}`) }
    }
    console.log(`  ${DRY_RUN ? "(dry)" : "✓"} ${name || page.id}: ${docs.length} file(s)`)
  }
  console.log(`— ${label}: ${pages} pages with documents, ${files} files, ${uploaded} uploaded, ${failed} failed\n`)
  return { pages, files, uploaded, failed }
}

console.log(`${DRY_RUN ? "DRY RUN — " : ""}Backfilling KYC documents → Supabase bucket "${BUCKET}"\n`)
console.log("Guest Info form DB:")
const a = await backfillDb("form DB", FORM_DB, "🧑‍💼 Guest Name", FORM_PROPS, { includeBlocks: true })
console.log("Plaza members DB:")
const b = await backfillDb("members DB", MEMBERS_DB, "Member Name", MEMBER_PROPS, { skipVacant: true })
console.log(`TOTAL: ${a.files + b.files} files across ${a.pages + b.pages} pages · ${a.uploaded + b.uploaded} uploaded · ${a.failed + b.failed} failed`)
