import "server-only"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/auth/dal"
import { ADMIN_GATE_ENABLED } from "./gate"

// Guards for Route Handlers (API routes). Unlike the DAL's `requireAdmin`,
// these NEVER redirect — they throw `AuthError`, which handlers turn into a
// JSON 401/403 via `authErrorResponse`. Page guards redirect; API guards respond.

export class AuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = "AuthError"
  }
}

// Requires an authenticated admin (Supabase session + admin role). Returns the
// admin's identity. Throws AuthError(401) if unauthenticated, (403) if not admin.
export async function requireAdminApi(): Promise<{ id: string; email: string | null }> {
  const user = await getSessionUser()
  // Gate off: admin APIs answer without a session. Without this the pages
  // would render but every data call would 401, so the removal must cover
  // this layer too. Real identity is preserved when a session exists, so
  // audit fields (e.g. refund createdBy) stay accurate for logged-in staff.
  if (!ADMIN_GATE_ENABLED) {
    return user ? { id: user.id, email: user.email } : { id: "gate-disabled", email: null }
  }
  if (!user) throw new AuthError(401, "Authentication required")
  if (user.role !== "admin") throw new AuthError(403, "Admin access required")
  return { id: user.id, email: user.email }
}

// Requires an authenticated guest and returns their verified (lowercased) email.
// Callers MUST then check this email owns the record they are about to mutate
// (see `assertOwnsBooking`) — a valid session is not authorization for an
// arbitrary notionPageId.
export async function requirePortalGuest(): Promise<{ id: string; email: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) throw new AuthError(401, "Authentication required")
  return { id: user.id, email: user.email.trim().toLowerCase() }
}

// Converts a thrown AuthError into a JSON response; returns null for other
// errors so the caller can handle them (or rethrow).
export function authErrorResponse(err: unknown): NextResponse | null {
  if (err instanceof AuthError) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  return null
}
