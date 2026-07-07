import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// OAuth (Google) callback. Exchanges the PKCE code for a Supabase session,
// then sends the guest to the dashboard. The Notion-booking gate is enforced
// on the dashboard (a Google account with no booking is signed out there).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/portal/dashboard"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host")
      const isLocal = process.env.NODE_ENV === "development"
      if (!isLocal && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/portal?error=oauth`)
}
