/**
 * Master switch for the admin authentication gate.
 *
 * DISABLED by request (Aug 2026). While off, /admin/* is reachable with NO
 * login on every environment, production included: the edge session check, the
 * page-level role check, and the admin API role check all stand down.
 *
 * What that exposes: resident PII (names, emails, phone numbers, deposit and
 * payment status) and destructive controls — check-in/check-out, room blocking
 * and reassignment, and refund issuing.
 *
 * Kept as one constant, imported by all three layers, so restoring protection
 * is a single change: set ADMIN_GATE_ENABLED=1 (no code edit required).
 *
 * NOTE: plain module with no side effects and no `server-only` import, because
 * proxy.ts consumes it from the edge runtime.
 */
export const ADMIN_GATE_ENABLED = process.env.ADMIN_GATE_ENABLED === "1"
