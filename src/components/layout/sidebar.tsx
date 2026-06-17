"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Building2, Users, UserCheck, CreditCard,
  FileText, Wrench, BarChart3, Star, LogOut, Bell
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { usePropertyScope, type PropertyScope } from "@/lib/property-context"

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/rooms", label: "Room Board", icon: Building2 },
  { href: "/leads", label: "Leads Pipeline", icon: Users, badge: 3 },
  { href: "/guests", label: "Guests", icon: UserCheck },
  { href: "/payments", label: "Payments", icon: CreditCard, badge: 2 },
  { href: "/billing", label: "Billing", icon: FileText },
  { href: "/maintenance", label: "Maintenance", icon: Wrench, badge: 4 },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/special-bookings", label: "Special Bookings", icon: Star },
]

const SCOPES: { value: PropertyScope; label: string }[] = [
  { value: "all",          label: "All"    },
  { value: "safina-plaza", label: "Plaza"  },
  { value: "peepal-tree",  label: "Peepal" },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { scope, setScope } = usePropertyScope()

  return (
    <aside className="w-56 shrink-0 hidden lg:flex flex-col h-full border-r border-border bg-card">
      {/* Logo */}
      <div className="h-13 flex items-center px-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-foreground flex items-center justify-center">
            <Building2 className="w-3.5 h-3.5 text-background" />
          </div>
          <div>
            <span className="text-[13px] font-semibold text-foreground tracking-tight">Hub Ops</span>
            <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Co-Living Platform</p>
          </div>
        </div>
      </div>

      {/* Property Scope Switcher */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border">
        <p className="text-[10px] text-muted-foreground mb-1.5 px-0.5 font-medium uppercase tracking-wide">Viewing</p>
        <div className="flex gap-1 bg-muted rounded-md p-0.5">
          {SCOPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setScope(value)}
              className={cn(
                "flex-1 text-[11px] py-1 rounded-[5px] font-medium transition-all duration-150 cursor-pointer",
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

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] transition-all duration-150 group cursor-pointer",
                active
                  ? "bg-foreground text-background font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className={cn("w-3.5 h-3.5 shrink-0", active ? "text-background" : "text-muted-foreground group-hover:text-foreground")} />
              <span className="flex-1">{label}</span>
              {badge && (
                <span className={cn(
                  "text-[10px] font-medium min-w-4 h-4 flex items-center justify-center rounded-full px-1",
                  active ? "bg-background/20 text-background" : "bg-muted-foreground/15 text-muted-foreground"
                )}>
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border p-3 space-y-1">
        <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150 cursor-pointer">
          <Bell className="w-3.5 h-3.5" />
          <span>Notifications</span>
          <span className="ml-auto text-[10px] font-medium min-w-4 h-4 flex items-center justify-center rounded-full px-1 bg-red-100 text-red-600">3</span>
        </button>
        <div className="flex items-center gap-2.5 px-2.5 py-1.5">
          <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-foreground shrink-0">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium text-foreground truncate">Admin</p>
            <p className="text-[10px] text-muted-foreground truncate">nocode@thehubco.live</p>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5">
            <LogOut className="w-3 h-3" />
          </button>
        </div>
      </div>
    </aside>
  )
}
