import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export type SessionUser = {
  id: string
  email: string | null
  role: "admin" | "guest"
}

// Optional env allowlist (comma-separated emails). A Supabase-authenticated
// user whose email is listed is treated as admin even without a profiles row —
// belt-and-suspenders next to the `profiles.role` check below.
const ADMIN_ALLOWLIST = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
)

// Returns the authenticated user + role, or null. Memoized per render pass.
// Admin identity is now a real Supabase session with `profiles.role = 'admin'`
// (or an allowlisted email) — the old unsigned `hub_admin` cookie is gone.
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  const email = user.email ?? null
  const isAdmin =
    profile?.role === "admin" ||
    (!!email && ADMIN_ALLOWLIST.has(email.toLowerCase()))

  return { id: user.id, email, role: isAdmin ? "admin" : "guest" }
})

// Guard for the admin area: requires an authenticated admin, else redirects.
export const requireAdmin = cache(async (): Promise<SessionUser> => {
  const user = await getSessionUser()
  if (!user) redirect("/admin/login")
  if (user.role !== "admin") redirect("/admin/login?error=forbidden")
  return user
})
