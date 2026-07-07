import Sidebar from "@/components/layout/sidebar"
import Header from "@/components/layout/header"
import { PropertyProvider } from "@/lib/property-context"
import { requireAdmin } from "@/lib/auth/dal"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side role gate. proxy.ts already requires a session for /admin/*;
  // this ensures the session belongs to an admin (a guest is redirected out).
  const user = await requireAdmin()

  return (
    <PropertyProvider>
      <div className="min-h-dvh flex">
        <Sidebar email={user.email} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header email={user.email} />
          <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </PropertyProvider>
  )
}
