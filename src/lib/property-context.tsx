"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"

export type PropertyScope = "all" | "safina-plaza" | "peepal-tree"

interface PropertyContextValue {
  scope: PropertyScope
  setScope: (s: PropertyScope) => void
}

const PropertyContext = createContext<PropertyContextValue>({
  scope: "all",
  setScope: () => {},
})

export function PropertyProvider({ children }: { children: ReactNode }) {
  const [scope, setScope] = useState<PropertyScope>("all")

  useEffect(() => {
    const stored = localStorage.getItem("hub-ops-property")
    if (stored === "safina-plaza" || stored === "peepal-tree" || stored === "all") {
      setScope(stored as PropertyScope)
    }
  }, [])

  const handleSet = (s: PropertyScope) => {
    setScope(s)
    localStorage.setItem("hub-ops-property", s)
  }

  return (
    <PropertyContext.Provider value={{ scope, setScope: handleSet }}>
      {children}
    </PropertyContext.Provider>
  )
}

export function usePropertyScope(): PropertyContextValue {
  return useContext(PropertyContext)
}
