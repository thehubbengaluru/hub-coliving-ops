import "server-only"
import { createClient } from "@supabase/supabase-js"

// Secure archive for guest KYC documents (Aadhaar/passport/photo/signature).
// Notion remains the team-facing copy; this bucket is the restricted-access
// system of record. The bucket is private with no RLS policies, so it is only
// reachable server-side through the secret key — never from the browser.

const BUCKET = "guest-documents"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

function serviceClient() {
  if (!URL || !SECRET_KEY) return null
  return createClient(URL, SECRET_KEY, { auth: { persistSession: false } })
}

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(-80) || "file"
}

export type GuestDocKind =
  | "photo"
  | "id-proof"
  | "signature"
  | "passport"
  | "pet-photo"
  | "second-guest-id-proof"

/**
 * Archive one guest document under `<guestKey>/<kind>-<filename>`. The guest
 * key is the guest's Notion page id, which ties the Supabase folder to the
 * Notion record. Best-effort: a failed archive logs and returns null so a
 * booking is never lost over it.
 */
export async function archiveGuestDocument(
  guestKey: string,
  kind: GuestDocKind,
  file: File,
): Promise<string | null> {
  const supabase = serviceClient()
  if (!supabase) {
    console.warn("[supabase/storage] SUPABASE_SECRET_KEY not set — skipping KYC archive for", kind)
    return null
  }
  try {
    const path = `${guestKey}/${kind}-${safeName(file.name)}`
    const { error } = await supabase.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    })
    if (error) throw error
    return path
  } catch (err) {
    console.error(`[supabase/storage] Failed to archive ${kind}:`, err)
    return null
  }
}

export type StoredGuestDocument = {
  name: string        // e.g. "id-proof-aadhaar.jpg"
  path: string        // full object path within the bucket
  size: number | null
  createdAt: string | null
  signedUrl: string   // short-lived download URL
}

// Signed URLs are minted per request and expire quickly — the bucket itself
// stays private, so a leaked link goes stale fast.
const SIGNED_URL_TTL_SECONDS = 15 * 60

/**
 * Everything stored for one guest (their folder = their Notion page id),
 * with short-lived signed URLs for viewing/downloading. Returns [] when the
 * folder is empty or the secret key isn't configured.
 */
export async function listGuestDocuments(guestKey: string): Promise<StoredGuestDocument[]> {
  const supabase = serviceClient()
  if (!supabase) {
    console.warn("[supabase/storage] SUPABASE_SECRET_KEY not set — cannot list guest documents")
    return []
  }
  const { data: files, error } = await supabase.storage.from(BUCKET).list(guestKey, { limit: 100 })
  if (error) {
    console.error("[supabase/storage] Failed to list documents for", guestKey, error)
    return []
  }
  const docs = await Promise.all(
    (files ?? [])
      .filter(f => f.name && !f.name.startsWith("."))
      .map(async f => {
        const path = `${guestKey}/${f.name}`
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS, { download: f.name })
        if (!data?.signedUrl) return null
        return {
          name: f.name,
          path,
          size: f.metadata?.size ?? null,
          createdAt: f.created_at ?? null,
          signedUrl: data.signedUrl,
        } satisfies StoredGuestDocument
      }),
  )
  return docs.filter((d): d is StoredGuestDocument => d !== null)
}

/** Archive a set of documents in parallel; skips null files, never throws. */
export async function archiveGuestDocuments(
  guestKey: string,
  docs: Partial<Record<GuestDocKind, File | null>>,
): Promise<Record<string, string>> {
  const entries = Object.entries(docs).filter((e): e is [GuestDocKind, File] => !!e[1])
  const uploaded = await Promise.all(
    entries.map(async ([kind, file]) => [kind, await archiveGuestDocument(guestKey, kind, file)] as const),
  )
  return Object.fromEntries(uploaded.filter(([, path]) => path) as [string, string][])
}
