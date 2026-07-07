import { NextResponse } from "next/server"

// Best-effort in-process rate limiter for public (unauthenticated) endpoints.
//
// SCOPE / LIMITS: the counter lives in module memory, so it is per-serverless-
// instance and resets on cold start. On Vercel that means it throttles a burst
// hitting one warm instance but does NOT give a global guarantee across
// instances. It is a cheap first line of defence against casual scripted abuse
// of the booking/availability/status endpoints — not a substitute for a durable
// store. For a hard global limit, back this with Upstash Redis / @upstash/ratelimit
// (see rateLimit's TODO) — the call sites below don't change, only this module.
type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

// Evict expired buckets opportunistically so the Map can't grow unbounded under
// a spray of unique keys (e.g. spoofed X-Forwarded-For values).
function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
}

// Derives a client key from the request. X-Forwarded-For is spoofable, but on
// Vercel the left-most hop is set by the platform edge; combined with the path
// it is a reasonable throttle key. Falls back to a shared bucket when absent.
export function clientKey(req: Request, scope: string): string {
  const xff = req.headers.get("x-forwarded-for") ?? ""
  const ip = xff.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  return `${scope}:${ip}`
}

// Returns a 429 NextResponse when the key has exceeded `limit` requests within
// `windowMs`, otherwise null (caller proceeds). Fails OPEN on internal error —
// a limiter bug must never take down a public booking endpoint.
export function rateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number },
): NextResponse | null {
  try {
    const now = Date.now()
    sweep(now)
    const b = buckets.get(key)
    if (!b || b.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return null
    }
    b.count += 1
    if (b.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((b.resetAt - now) / 1000))
      return NextResponse.json(
        { error: "Too many requests. Please slow down and try again shortly." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      )
    }
    return null
  } catch {
    return null
  }
}
