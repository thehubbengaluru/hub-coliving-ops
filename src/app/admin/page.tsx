import { redirect } from "next/navigation"

// Bare /admin has never had a page of its own — the section's entry point used
// to be /admin/login, which forwarded to the dashboard after sign-in. With the
// auth gate removed there is no longer any such landing step, so /admin dead-
// ended in a 404. Send it to the dashboard instead.
export default function AdminIndexPage() {
  redirect("/admin/dashboard")
}
