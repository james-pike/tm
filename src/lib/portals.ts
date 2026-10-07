// Single source of truth for the four employee portals: which login tiles exist,
// what each role may order, the per-garment quantity caps, and the seasonal
// split. Lives in its own leaf module (no imports) so the shell (layout.tsx),
// the catalog (product-catalog.tsx) and the product detail panel can all share
// it, and so a DB regen of the auto-generated products.ts can never wipe it.
//
// The rules come straight from Tamarack's apparel policy: employees may only
// VIEW the items they're allowed to order and only request the allowed
// quantities. "Combination totaling N" is enforced as a GROUP cap (any mix of
// the group's SKUs, summed, must stay <= cap). Coats are "as needed/approved":
// qty 1, flagged on the order as needing approval rather than blocked.

export type Portal = "labourers" | "technicians" | "supervisors" | "clerks";
export type Season = "summer" | "winter";

// Login-screen tiles, in display order. The label is the ONLY place a portal is
// named for the shopper; the store itself looks identical whichever is picked.
// labelFr is the French tile label (the login screen has an EN/FR toggle).
export const PORTALS: { key: Portal; label: string; labelFr: string }[] = [
  // "manoeuvres" spelled without the œ ligature — CSS uppercasing œ→Œ renders the
  // ligature glyph overlapping under the tile's bold letter-spacing.
  { key: "labourers", label: "Carpenters & Labourers", labelFr: "Charpentiers et manoeuvres" },
  { key: "technicians", label: "Inspectors & Technicians", labelFr: "Inspecteurs et techniciens" },
  { key: "supervisors", label: "Foreman & Superintendents", labelFr: "Contremaîtres et surintendants" },
  { key: "clerks", label: "Site Clerks", labelFr: "Commis de chantier" },
];

export function isPortal(v: string | null | undefined): v is Portal {
  return v === "labourers" || v === "technicians" || v === "supervisors" || v === "clerks";
}

// The tile label for a portal key (e.g. "Site Clerks"), shown in the gated area
// so a signed-in employee can see which portal they're in. "" if unknown.
export function portalLabel(key: string | null | undefined): string {
  return PORTALS.find((p) => p.key === key)?.label || "";
}

// Summer = Apr 1 – Sep 30, Winter = Oct 1 – Mar 31. One place to change the
// boundary. getMonth() is 0-based (0 = Jan), so Apr–Sep is months 3..8.
export function currentSeason(d: Date = new Date()): Season {
  const m = d.getMonth();
  return m >= 3 && m <= 8 ? "summer" : "winter";
}

export interface AllowanceGroup {
  key: string;        // stable id, unique within a portal
  label: string;      // lower-case noun phrase, used in cart messaging
  skus: string[];     // every SKU that counts toward this group's cap
  cap: number;        // combined cap across ALL of the group's SKUs
  season: Season | "all"; // "all" = shown/counted in both seasons
  approval?: boolean; // "as needed/approved": clamp qty to 1 and flag the order
}

// Service Technicians & Home Inspectors and Site Supervisors (Finishing Foreman,
// Assistant Site Superintendents & Site Superintendents) share one rule set.
const DRESS_SHIRTS = ["TM-12", "TM-13", "TM-14", "TM-15", "TM-17", "TM-19"];
const TECH_SUPERVISOR_ALLOWANCES: AllowanceGroup[] = [
  { key: "shirts", label: "dress & golf shirts", skus: DRESS_SHIRTS, cap: 5, season: "all" },
  { key: "cap", label: "ball cap", skus: ["TM-9"], cap: 1, season: "summer" },
  { key: "raincoat", label: "rain coat", skus: ["TM-20"], cap: 1, season: "summer", approval: true },
  { key: "fleece", label: "zip fleece or hooded sweatshirt", skus: ["TM-11", "TM-3", "TM-8", "TM-16"], cap: 1, season: "winter" },
  { key: "wintercoat", label: "winter coat", skus: ["TM-18"], cap: 1, season: "winter", approval: true },
  { key: "toque", label: "toque", skus: ["TM-10"], cap: 1, season: "winter" },
];

export const PORTAL_ALLOWANCES: Record<Portal, AllowanceGroup[]> = {
  // Labourer / Carpenter — high-visibility work wear.
  labourers: [
    { key: "tees", label: "t-shirts", skus: ["TM-1", "TM-2", "TM-4", "TM-5", "TM-6"], cap: 5, season: "all" },
    { key: "cap", label: "ball cap", skus: ["TM-9"], cap: 1, season: "summer" },
    // The Carhartt Iconic Duck Active Jacket (TM-16) is a hooded piece, so it
    // counts toward the hooded-sweatshirt allowance, not the hi-vis coat.
    { key: "hoodie", label: "hooded sweatshirt", skus: ["TM-3", "TM-8", "TM-16"], cap: 1, season: "winter" },
    { key: "toque", label: "toque", skus: ["TM-10"], cap: 1, season: "winter" },
    { key: "hivis-coat", label: "high-visibility coat", skus: ["TM-21"], cap: 1, season: "winter", approval: true },
  ],
  technicians: TECH_SUPERVISOR_ALLOWANCES,
  supervisors: TECH_SUPERVISOR_ALLOWANCES,
  // Site Clerks — one order per year, no seasonal split (every group is "all").
  clerks: [
    { key: "shirts", label: "dress & golf shirts", skus: DRESS_SHIRTS, cap: 5, season: "all" },
    { key: "fleece", label: "zip fleece", skus: ["TM-11"], cap: 1, season: "all" },
    { key: "cap", label: "ball cap", skus: ["TM-9"], cap: 1, season: "all" },
    // The Carhartt Iconic Duck jacket (TM-16) is a Labourers-only item; Site
    // Clerks' hi-vis coat is just the Viking Handyman (TM-21).
    { key: "hivis-coat", label: "high-visibility coat", skus: ["TM-21"], cap: 1, season: "all", approval: true },
  ],
};

// The allowance groups active for a portal in a given season (season "all"
// groups are always included).
export function groupsFor(portal: Portal, season: Season): AllowanceGroup[] {
  return (PORTAL_ALLOWANCES[portal] || []).filter((g) => g.season === "all" || g.season === season);
}

// Every SKU a portal may order this season (union across its active groups).
export function allowedSkus(portal: Portal, season: Season): Set<string> {
  const out = new Set<string>();
  for (const g of groupsFor(portal, season)) for (const sku of g.skus) out.add(sku);
  return out;
}

export function groupForSku(portal: Portal, season: Season, sku: string): AllowanceGroup | undefined {
  return groupsFor(portal, season).find((g) => g.skus.includes(sku));
}

export function isApprovalSku(portal: Portal, season: Season, sku: string): boolean {
  return !!groupForSku(portal, season, sku)?.approval;
}

type QtyItem = { sku?: string | null; quantity: number };

// Total quantity already committed to a group across the given cart items.
export function groupTotal(group: AllowanceGroup, items: QtyItem[]): number {
  return items.reduce(
    (n, it) => (it.sku && group.skus.includes(it.sku) ? n + (Number(it.quantity) || 0) : n),
    0,
  );
}

export interface AllowanceRow {
  key: string;
  label: string;
  cap: number;
  used: number;
  remaining: number;
  approval: boolean;
}

// The full allowance legend for a portal this season — EVERY group it may order,
// each annotated with how much of the cap the given cart has used. Drives the
// cart/checkout allowance panel ("what you can order, and what's left").
export function allowanceGuide(portal: Portal, season: Season, items: QtyItem[] = []): AllowanceRow[] {
  return groupsFor(portal, season).map((g) => {
    const used = groupTotal(g, items);
    return { key: g.key, label: g.label, cap: g.cap, used, remaining: Math.max(0, g.cap - used), approval: !!g.approval };
  });
}

// Just the groups the cart currently has items in (used > 0) — the compact
// "you may order N more" view, derived from the full guide.
export function allowanceSummary(portal: Portal, season: Season, items: QtyItem[]): AllowanceRow[] {
  return allowanceGuide(portal, season, items).filter((s) => s.used > 0);
}

// How many more units of `sku` the cart may still take before the group cap is
// hit. `items` is the current cart; `excludeSku`-matching lines can be left out
// of the running total when you're about to replace a line's quantity. Returns
// the cap itself (no group) for an SKU this portal shouldn't see — callers gate
// on allowedSkus() first, so that path is only a safety net.
export function remainingAllowance(
  portal: Portal,
  season: Season,
  sku: string,
  items: QtyItem[],
): { group?: AllowanceGroup; cap: number; used: number; remaining: number; approval: boolean } {
  const group = groupForSku(portal, season, sku);
  if (!group) return { cap: Infinity, used: 0, remaining: Infinity, approval: false };
  const used = groupTotal(group, items);
  return {
    group,
    cap: group.cap,
    used,
    remaining: Math.max(0, group.cap - used),
    approval: !!group.approval,
  };
}
