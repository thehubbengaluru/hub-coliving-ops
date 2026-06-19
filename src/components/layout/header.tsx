"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { Search, Menu, Building2, LogOut, Bell } from "lucide-react"
import {
  LayoutDashboard, Users, UserCheck, CreditCard,
  FileText, Wrench, BarChart3, Star,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { usePropertyScope, type PropertyScope } from "@/lib/property-context"

const titles: Record<string, { title: string; subtitle: string }> = {
  "/admin/dashboard":       { title: "Dashboard",          subtitle: "Overview of Hub Co-Living operations" },
  "/admin/rooms":           { title: "Room Board",          subtitle: "Live occupancy across all properties" },
  "/admin/leads":           { title: "Leads Pipeline",      subtitle: "Track prospects from inquiry to check-in" },
  "/admin/guests":          { title: "Guests",              subtitle: "Active members and booking details" },
  "/admin/payments":        { title: "Payments",            subtitle: "Invoice tracking and payment recovery" },
  "/admin/billing":         { title: "Billing",             subtitle: "Invoicing and Zoho Books sync" },
  "/admin/maintenance":     { title: "Maintenance",         subtitle: "Open tickets and room readiness" },
  "/admin/reports":         { title: "Reports & Analytics", subtitle: "Revenue, occupancy, and conversion metrics" },
  "/admin/special-bookings":{ title: "Special Bookings",    subtitle: "Owner guests, Airbnb blocks, and team stays" },
}

const navItems = [
  { href: "/admin/dashboard",       label: "Dashboard",        icon: LayoutDashboard },
  { href: "/admin/rooms",           label: "Room Board",       icon: Building2 },
  { href: "/admin/leads",           label: "Leads Pipeline",   icon: Users },
  { href: "/admin/guests",          label: "Guests",           icon: UserCheck },
  { href: "/admin/payments",        label: "Payments",         icon: CreditCard },
  { href: "/admin/billing",         label: "Billing",          icon: FileText },
  { href: "/admin/maintenance",     label: "Maintenance",      icon: Wrench },
  { href: "/admin/reports",         label: "Reports",          icon: BarChart3 },
  { href: "/admin/special-bookings",label: "Special Bookings", icon: Star },
]

const SCOPES: { value: PropertyScope; label: string }[] = [
  { value: "all",          label: "All"    },
  { value: "safina-plaza", label: "Plaza"  },
  { value: "peepal-tree",  label: "Peepal" },
]

function MobileNav({ onClose }: { onClose: () => void }) {
  const pathname = usePathname()
  const { scope, setScope } = usePropertyScope()

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center">
          <Building2 className="w-3.5 h-3.5 text-background" />
        </div>
        <div>
          <span className="text-[13px] font-semibold text-foreground tracking-tight">Hub Ops</span>
          <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Co-Living Platform</p>
        </div>
      </div>

      {/* Property scope switcher */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border">
        <p className="text-[10px] text-muted-foreground mb-1.5 px-0.5 font-medium uppercase tracking-wide">Viewing</p>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          {SCOPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setScope(value)}
              className={cn(
                "flex-1 text-[11px] py-1.5 rounded-[5px] font-medium transition-all duration-150 cursor-pointer",
                scope === value
                  ? "bg-foreground text-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-2.5 px-3 py-3 rounded-md text-[14px] transition-all duration-150 cursor-pointer",
                active
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("w-4 h-4 shrink-0", active ? "text-background" : "text-muted-foreground")} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 px-2.5 py-2">
          <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[12px] font-semibold text-foreground shrink-0">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-foreground truncate">Admin</p>
            <p className="text-[11px] text-muted-foreground truncate">nocode@thehubco.live</p>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1.5" aria-label="Log out">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Header() {
  const pathname = usePathname()
  const info = titles[pathname] ?? { title: "Hub Ops", subtitle: "" }
  const [open, setOpen] = useState(false)

  return (
    <header className="h-13 border-b border-border bg-background flex items-center px-4 gap-3 shrink-0 sticky top-0 z-10">
      {/* Mobile hamburger */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <button
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-md hover:bg-muted transition-colors cursor-pointer shrink-0"
              aria-label="Open navigation"
            />
          }
        >
          <Menu className="w-5 h-5 text-foreground" />
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 bg-card border-border">
          <MobileNav onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-[15px] font-semibold text-foreground leading-tight truncate" style={{ fontFamily: "Calistoga, serif" }}>
          {info.title}
        </h1>
        {info.subtitle && (
          <p className="text-[11px] text-muted-foreground leading-none mt-0.5 hidden sm:block">{info.subtitle}</p>
        )}
      </div>

      {/* Search — hidden on small mobile */}
      <div className="relative hidden md:block w-48">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <Input
          placeholder="Search guests, rooms…"
          className="pl-7 h-7 text-xs bg-muted border-0 focus-visible:ring-1 rounded-md"
        />
      </div>

      {/* Date — hidden on mobile */}
      <span className="text-[11px] text-muted-foreground tabular-nums hidden lg:block">17 Jun 2026</span>

      {/* Mobile notifications badge */}
      <div className="relative lg:hidden">
        <Bell className="w-5 h-5 text-muted-foreground" />
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">3</span>
      </div>
    </header>
  )
}
