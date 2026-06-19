// Generic transactional email via Resend's REST API (no SDK dependency).
// Used for non-payment messages: check-in form links, extend-stay reminders, etc.
// Degrades to a logged no-op when RESEND_API_KEY / EMAIL_FROM are not configured,
// so callers never fail just because email isn't wired up yet.

const RESEND_API = "https://api.resend.com/emails"

export function emailEnabled(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM
}

export async function sendEmail({
  to,
  subject,
  html,
  cc,
  replyTo,
}: {
  to: string | string[]
  subject: string
  html: string
  cc?: string | string[]
  replyTo?: string
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!emailEnabled()) {
    console.warn(`[email] Skipped (not configured): "${subject}" → ${Array.isArray(to) ? to.join(", ") : to}`)
    return { ok: false, error: "Email not configured" }
  }

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(cc ? { cc: Array.isArray(cc) ? cc : [cc] } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => "")
      console.error("[email] Resend error:", res.status, detail)
      return { ok: false, error: `Resend ${res.status}: ${detail}` }
    }

    const data = await res.json().catch(() => ({}))
    return { ok: true, id: data?.id }
  } catch (err) {
    console.error("[email] send failed:", err)
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

// Finance team CC list (comma-separated env), so deposit/refund/invoice events
// can loop in finance (Phase 4.5).
export function financeRecipients(): string[] {
  return (process.env.FINANCE_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}
