import { type NextRequest } from "next/server"
import { updateSession } from "@/lib/supabase/proxy"

// Next.js 16 proxy (formerly middleware). Refreshes the Supabase session and
// protects /admin and /portal/dashboard.
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Run on all routes except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
