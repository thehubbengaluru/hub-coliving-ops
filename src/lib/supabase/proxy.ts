import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { ADMIN_GATE_ENABLED } from "@/lib/auth/gate"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

// Routes that require an authenticated session.
const ADMIN_PREFIX = "/admin"
const ADMIN_LOGIN = "/admin/login"
const PORTAL_PROTECTED = "/portal/dashboard"
const PORTAL_LOGIN = "/portal"

// Refreshes the Supabase session cookie on every request and gates protected
// routes. Runs in proxy.ts (the Next.js 16 replacement for middleware).
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Fail SOFT on missing Supabase config: this proxy runs on EVERY route, so a
  // hard throw here would take down the public site and the login page too.
  // Let the request through (auth simply won't gate) rather than 500 everything.
  if (!URL || !KEY) {
    console.error("[proxy] Supabase env not configured — skipping session gating")
    return response
  }

  const supabase = createServerClient(URL, KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        )
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Admin area: require a Supabase session. The `admin` ROLE is enforced at the
  // page/route layer (requireAdmin / requireAdminApi) — this edge gate only
  // ensures a logged-in user, matching the portal pattern below.
  if (
    ADMIN_GATE_ENABLED &&
    pathname.startsWith(ADMIN_PREFIX) &&
    pathname !== ADMIN_LOGIN &&
    !user
  ) {
    const url = request.nextUrl.clone()
    url.pathname = ADMIN_LOGIN
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  // Guest portal dashboard: require a session.
  if (pathname.startsWith(PORTAL_PROTECTED) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = PORTAL_LOGIN
    return NextResponse.redirect(url)
  }

  return response
}
