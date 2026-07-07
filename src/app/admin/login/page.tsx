"use client"

import { Suspense } from "react"
import { useActionState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, Lock, Building2 } from "lucide-react"
import { signInAdmin, type LoginState } from "./actions"

function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/admin/dashboard"
  const forbidden = searchParams.get("error") === "forbidden"

  const [state, action, pending] = useActionState<LoginState, FormData>(signInAdmin, undefined)

  return (
    <div className="min-h-dvh bg-muted/30 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-background rounded-2xl border border-border shadow-sm p-8">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="w-8 h-8 rounded-md bg-foreground flex items-center justify-center">
            <Building2 className="w-4 h-4 text-background" />
          </div>
          <div>
            <span className="text-sm font-semibold text-foreground tracking-tight">Hub Ops</span>
            <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Staff sign-in</p>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-1">Sign in</h1>
        <p className="text-sm text-muted-foreground mb-6">Enter your staff credentials to continue.</p>

        <form action={action} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email</label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="you@thehubco.live"
              className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Password</label>
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full px-3 py-2.5 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>

          {(state?.error || forbidden) && (
            <p className="text-sm text-red-500">
              {state?.error ?? "You don't have access to the admin area."}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full py-3 rounded-xl text-sm font-semibold bg-foreground text-background flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60 cursor-pointer"
          >
            {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : <><Lock className="w-4 h-4" /> Sign in</>}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
