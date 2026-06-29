/**
 * demo-data-access.ts
 * ──────────────────────────────────────────────────────────────────────
 * Gated accessor for library demo/mock data.
 *
 * Re-exports the demo arrays (DEMO_PRINCIPLES, DEMO_PRECEDENTS, …) but
 * returns `[]` in production unless explicitly opted-in via the
 * `NEXT_PUBLIC_LIB_DEMO_FALLBACK` env var. This ensures that in prod with
 * no seeded DB data, library pages render their existing empty states
 * instead of fabricated demo laws/precedents.
 *
 * Taxonomy constants (PRINCIPLE_SOURCES, ORDER_ISSUERS, …) and TypeScript
 * types are re-exported unconditionally — they carry no fake content.
 *
 * Goal (per audit): "in prod with no seed, pages show empty states,
 * NOT demo laws." Demo-data files are intentionally NOT deleted.
 * ──────────────────────────────────────────────────────────────────────
 */

// ─── Types (compile-time only, no runtime content) ───
export type {
  PrincipleSubject,
  PrincipleSourceId,
  PrincipleSourceAbbr,
  DemoPrinciple,
  DemoPrecedent,
  DemoOrder,
  FeqhBookDemo,
  PrecedentCollectionDemo,
} from "./demo-data";

// ─── Taxonomy constants (labels/menus, not fake records) ───
export {
  PRINCIPLE_SUBJECTS,
  PRINCIPLE_SOURCES,
  PRINCIPLE_SOURCE_GROUPS,
  ORDER_ISSUERS,
  ORDER_TYPE_LABELS_EN,
} from "./demo-data";

// ─── Demo arrays — gated ───
import {
  DEMO_PRINCIPLES as _DEMO_PRINCIPLES,
  DEMO_PRECEDENTS as _DEMO_PRECEDENTS,
  DEMO_PRECEDENTS_COLLECTIONS as _DEMO_PRECEDENTS_COLLECTIONS,
  DEMO_FEQH_BOOKS as _DEMO_FEQH_BOOKS,
  DEMO_RAWD as _DEMO_RAWD,
  DEMO_ORDERS as _DEMO_ORDERS,
} from "./demo-data";

/**
 * True when demo data should be visible:
 *   - always in non-production (dev/test)
 *   - in production only if NEXT_PUBLIC_LIB_DEMO_FALLBACK === "1"
 */
const DEMO_ENABLED =
  process.env.NODE_ENV !== "production" ||
  process.env.NEXT_PUBLIC_LIB_DEMO_FALLBACK === "1";

export const DEMO_PRINCIPLES = DEMO_ENABLED ? _DEMO_PRINCIPLES : [];
export const DEMO_PRECEDENTS = DEMO_ENABLED ? _DEMO_PRECEDENTS : [];
export const DEMO_PRECEDENTS_COLLECTIONS = DEMO_ENABLED
  ? _DEMO_PRECEDENTS_COLLECTIONS
  : [];
export const DEMO_FEQH_BOOKS = DEMO_ENABLED ? _DEMO_FEQH_BOOKS : [];
export const DEMO_RAWD = DEMO_ENABLED ? _DEMO_RAWD : [];
export const DEMO_ORDERS = DEMO_ENABLED ? _DEMO_ORDERS : [];