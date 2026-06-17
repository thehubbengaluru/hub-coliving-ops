"use client"

import { usePathname } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"

const titles: Record<string, { title: string; subtitle: string }> = {
  "/dashboard":       { title: "Dashboard",        subtitle: "Overview of Hub Co-Living operations" },
  "/rooms":           { title: "Room Board",        subtitle: "Live occupancy across all properties" },
  "/leads":           { title: "Leads Pipeline",    subtitle: "Track prospects from inquiry to check-in" },
  "/guests":          { title: "Guests",            subtitle: "Active members and booking details" },
  "/payments":        { title: "Payments",          subtitle: "Invoice tracking and payment recovery" },
  "/billing":         { title: "Billing",           subtitle: "Invoicing and Zoho Books sync" },
  "/maintenance":     { title: "Maintenance",       subtitle: "Open tickets and room readiness" },
  "/reports":         { title: "Reports & Analytics", subtitle: "Revenue, occupancy, and conversion metrics" },
  "/special-bookings":{ title: "Special Bookings",  subtitle: "Owner guests, Airbnb blocks, and team stays" },
}

export default function Header() {
  const pathname = usePathname()
  const info = titles[pathname] ?? { title: "Hub Ops", subtitle: "" }

  return (
    <header className="h-13 border-b border-border bg-background flex items-center px-6 gap-4 shrink-0 sticky top-0 z-10">
      <div className="flex-1">
        <h1 className="text-[15px] font-semibold text-foreground leading-tight" style={{ fontFamily: 'Calistoga, serif' }}>
          {info.title}
        </h1>
        {info.subtitle && (
          <p className="text-[11px] text-muted-foreground leading-none mt-0.5">{info.subtitle}</p>
        )}
      </div>
      <div className="relative w-52">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <Input
          placeholder="Search guests, rooms…"
          className="pl-7 h-7 text-xs bg-muted border-0 focus-visible:ring-1 rounded-md"
        />
      </div>
      <span className="text-[11px] text-muted-foreground tabular-nums">17 Jun 2026</span>
    </header>
  )
}
