"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

// Shared sign-out used by both the admin shell and the guest portal. Both are
// now Supabase sessions, so a single signOut clears either.
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/")
}
