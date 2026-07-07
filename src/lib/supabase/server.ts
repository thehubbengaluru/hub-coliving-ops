import "server-only"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!

// Server-side Supabase client for Server Components, Route Handlers, and
// Server Actions. `cookies()` is async in Next.js 16.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(URL, KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // `setAll` was called from a Server Component — safe to ignore when
          // session refresh is handled by proxy.ts.
        }
      },
    },
  })
}
