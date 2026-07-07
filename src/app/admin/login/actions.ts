"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getSessionUser } from "@/lib/auth/dal"

export type LoginState = { error?: string } | undefined

// Admin sign-in via Supabase (email + password). Access requires the
// authenticated account to resolve to the `admin` role (profiles.role or the
// ADMIN_EMAILS allowlist). Replaces the old unsigned email-only cookie.
export async function signInAdmin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const next = String(formData.get("next") ?? "/admin/dashboard")

  if (!email || !password) return { error: "Email and password are required." }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { error: "Invalid email or password." }

  // Signed in — but only admins may enter. Reject (and drop the session) otherwise.
  const user = await getSessionUser()
  if (!user || user.role !== "admin") {
    await supabase.auth.signOut()
    return { error: "This account is not authorized for admin access." }
  }

  redirect(next.startsWith("/admin") ? next : "/admin/dashboard")
}
