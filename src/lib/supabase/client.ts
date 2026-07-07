import { createBrowserClient } from "@supabase/ssr"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

// Browser-side Supabase client (Client Components). Uses the publishable key.
export function createClient() {
  return createBrowserClient(URL, KEY)
}
