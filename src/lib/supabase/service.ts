import "server-only"
import { createClient } from "@supabase/supabase-js"

// Service-role Supabase client for trusted server-only contexts (webhooks,
// cron) that have NO user session and must bypass RLS. Never import this into
// anything that runs client-side. Returns null if the secret isn't configured
// so callers can degrade gracefully rather than crash.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SECRET = process.env.SUPABASE_SECRET_KEY

export function createServiceClient() {
  if (!URL || !SECRET) return null
  return createClient(URL, SECRET, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
