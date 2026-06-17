import Sidebar from "@/components/layout/sidebar"
import Header from "@/components/layout/header"
import { PropertyProvider } from "@/lib/property-context"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PropertyProvider>
      <div className="h-full flex">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </PropertyProvider>
  )
}
