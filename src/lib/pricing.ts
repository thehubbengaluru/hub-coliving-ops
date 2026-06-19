// Single source of truth correlating each canonical room tier to its monthly
// rate. The tier values mirror the Notion "Active Members" Room Type tag
// (Standard/Deluxe × Sharing/Private), so price is derived from the tag — never
// guessed from rate thresholds.

import type { Property, RoomType, RoomTier } from "./types"

// Per-bed monthly rate (₹, incl. GST). For private tiers this is the whole room;
// for sharing tiers it is the rate one guest pays for one bed.
export const TIER_RATES: Record<Property, Partial<Record<RoomTier, number>>> = {
  "safina-plaza": {
    "Standard Sharing": 21500,
    "Deluxe Sharing":   30000,
    "Standard Private": 43500,
    "Deluxe Private":   60000,
  },
  "peepal-tree": {
    "Standard Sharing": 18550,
    "Standard Private": 39100,
  },
}

export function isSharingTier(tier: RoomTier): boolean {
  return tier === "Standard Sharing" || tier === "Deluxe Sharing"
}

export function coarseType(tier: RoomTier): RoomType {
  return isSharingTier(tier) ? "sharing" : "private"
}

// Maps a raw Notion tag value (or a legacy/public-pricing label) to the
// canonical tier. Returns null when it can't be resolved — callers should then
// fall back to a manual choice rather than mis-price.
const TIER_ALIASES: Record<string, RoomTier> = {
  "standard sharing": "Standard Sharing",
  "standard private": "Standard Private",
  "deluxe sharing":   "Deluxe Sharing",
  "deluxe private":   "Deluxe Private",
  // legacy wording from the public pricing page
  "shared room":      "Standard Sharing",
  "private room":     "Standard Private",
  // Peepal Tree tags rooms with the bare coarse type (no Standard/Deluxe split,
  // since it has a single tier each) — treat these as the Standard tier.
  "sharing":          "Standard Sharing",
  "private":          "Standard Private",
}

export function normalizeRoomTier(raw: string | null | undefined): RoomTier | null {
  if (!raw) return null
  return TIER_ALIASES[raw.trim().toLowerCase()] ?? null
}

// Per-bed monthly rate for a known tier, or 0 when the tier/property has none.
export function rateForTier(property: Property, tier: RoomTier | null | undefined): number {
  if (!tier) return 0
  return TIER_RATES[property]?.[tier] ?? 0
}

// Best-effort reverse lookup: recover the canonical tier from a known rate when
// the Notion "Room Type" tag is missing (rates are distinct within a
// property + coarse type, so the match is unambiguous).
export function tierFromRate(property: Property, type: RoomType, rate: number): RoomTier | null {
  if (!rate) return null
  for (const [tier, r] of Object.entries(TIER_RATES[property] ?? {}) as [RoomTier, number][]) {
    if (r === rate && coarseType(tier) === type) return tier
  }
  return null
}

export type RateTier = { label: RoomTier; rate: number }

// Tier choices for a coarse room type — used ONLY as a manual fallback when the
// exact tier is genuinely unknown (no tag and no rate on Notion).
export function tierOptions(property: Property, type: RoomType): RateTier[] {
  const rates = TIER_RATES[property] ?? {}
  return (Object.entries(rates) as [RoomTier, number][])
    .filter(([tier]) => coarseType(tier) === type)
    .map(([label, rate]) => ({ label, rate }))
}
