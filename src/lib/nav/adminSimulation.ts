/**
 * adminSimulation.ts — the admin's «عرض كـ» sub-role and «محاكاة القيود»
 * (S6 Part D, slice A §6.1.2; preflight ruling R27).
 *
 * UI STATE ONLY. It picks which MENU an admin is drawn (a judge's, a
 * consultant's, a firm member's) and, in «محاكاة القيود» mode, which of the
 * dashboards' own UI gates apply to the admin. It never reaches:
 *   - useUser() — the session keeps the real role;
 *   - a guard (UserTypeGuard, requireStaff, assertRole…), routeAccess or
 *     src/proxy.ts;
 *   - an API, a request body or a request header.
 * The server keeps treating the admin as admin (points stay exempt —
 * runCore.ts), and the switch caption says so. adminSimulation.test.ts pins
 * all of this with a source scan, including a list of the only files allowed
 * to import this module.
 *
 * Every reader is gated on the REAL role: simulatedNavIdentity() and
 * adminBypassesUiGates() look at realUserType first, so a value left in (or
 * typed into) a non-admin tab's sessionStorage is ignored by construction.
 *
 * Pure (no React, no window) so node --test can load it: relative imports
 * carry `.ts`; the `@/` imports are type-only and erased.
 */
import type { UserType, GovernmentRole } from "@/hooks/useUser";
import type { PracticeKind } from "@/lib/auth/practiceKind";
import { ADMIN_VIEWS, type AdminView, type ViewStorage } from "./shellContext.ts";

/** sessionStorage key (per tab), beside shellContext's nzamy_admin_view_as. */
export const ADMIN_SIM_STORAGE_KEY = "nzamy_admin_sim";
/** Same-tab change event (the `storage` event only fires in OTHER tabs). */
export const ADMIN_SIM_EVENT = "nzamy:admin-sim";

/** «تجاوز الأدمن» (default) or «محاكاة القيود». */
export type AdminSimMode = "override" | "simulate";
export type AdminSimAffiliationRole = "managing_partner" | "lawyer";

export type AdminSimulation = {
  view: AdminView;
  practiceKind?: PracticeKind;
  affiliationRole?: AdminSimAffiliationRole;
  governmentRole?: GovernmentRole;
  mode: AdminSimMode;
};

export type AdminSwitchGroup = "المهنيون" | "العملاء" | "الجهات" | "الإدارة";

export type AdminSwitchOption = {
  id: string;
  group: AdminSwitchGroup;
  label: string;
  sim: Omit<AdminSimulation, "mode">;
  href: string;
};

/** The 14 «عرض كـ» entries, in display order. */
export const ADMIN_SWITCH_OPTIONS: ReadonlyArray<AdminSwitchOption> = [
  { id: "lawyer-advocate",       group: "المهنيون", label: "محامٍ",                 sim: { view: "lawyer", practiceKind: "advocate" },        href: "/dashboard/lawyer" },
  { id: "lawyer-consultant",     group: "المهنيون", label: "مستشار (م ١٨)",          sim: { view: "lawyer", practiceKind: "consultant" },      href: "/dashboard/lawyer" },
  { id: "firm-managing-partner", group: "المهنيون", label: "مكتب — الشريك المدير",   sim: { view: "firm", affiliationRole: "managing_partner" }, href: "/dashboard/firm" },
  { id: "firm-member",           group: "المهنيون", label: "مكتب — محامٍ عضو",       sim: { view: "firm", affiliationRole: "lawyer" },         href: "/dashboard/firm" },
  { id: "provider",              group: "المهنيون", label: "مزوّد خدمة",             sim: { view: "provider" },                                href: "/dashboard/provider" },
  { id: "individual",            group: "العملاء",  label: "فرد",                    sim: { view: "individual" },                              href: "/dashboard/client" },
  { id: "corporate",             group: "العملاء",  label: "شركة",                   sim: { view: "corporate" },                               href: "/dashboard/business" },
  { id: "micro",                 group: "العملاء",  label: "منشأة صغيرة",            sim: { view: "micro" },                                   href: "/dashboard/micro" },
  { id: "gov-judge",             group: "الجهات",   label: "قاضٍ",                   sim: { view: "government", governmentRole: "judge" },      href: "/dashboard/government" },
  { id: "gov-prosecutor",        group: "الجهات",   label: "عضو نيابة",              sim: { view: "government", governmentRole: "prosecutor" }, href: "/dashboard/government" },
  { id: "gov-officer",           group: "الجهات",   label: "ضابط",                   sim: { view: "government", governmentRole: "officer" },    href: "/dashboard/government" },
  { id: "gov-counsel",           group: "الجهات",   label: "مستشار قانوني حكومي",    sim: { view: "government", governmentRole: "gov_counsel" }, href: "/dashboard/government" },
  { id: "ngo",                   group: "الجهات",   label: "جمعية خيرية",            sim: { view: "ngo" },                                     href: "/dashboard/ngo" },
  { id: "admin",                 group: "الإدارة",  label: "لوحة الإدارة",           sim: { view: "admin" },                                   href: "/dashboard/admin" },
];

// ─── Parsing (strict: a hand-edited value that names anything else is null) ──

const MODES: readonly AdminSimMode[] = ["override", "simulate"];
const PRACTICE_KINDS: readonly PracticeKind[] = ["advocate", "consultant"];
const AFFILIATION_ROLES: readonly AdminSimAffiliationRole[] = ["managing_partner", "lawyer"];
const GOVERNMENT_ROLES: readonly GovernmentRole[] = ["judge", "prosecutor", "officer", "gov_counsel"];
const KEYS = new Set(["view", "practiceKind", "affiliationRole", "governmentRole", "mode"]);

function oneOf<T extends string>(list: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

/**
 * The simulation a raw value names, or null. Rejects unknown keys, unknown
 * values, and a sub-role on the wrong dashboard (a governmentRole on a firm
 * view, say). Returns a fresh object holding only the known keys.
 */
export function parseAdminSimulation(raw: unknown): AdminSimulation | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).some((k) => !KEYS.has(k))) return null;
  if (!oneOf(ADMIN_VIEWS, r.view) || !oneOf(MODES, r.mode)) return null;

  const sim: AdminSimulation = { view: r.view, mode: r.mode };
  if (r.practiceKind !== undefined) {
    if (r.view !== "lawyer" || !oneOf(PRACTICE_KINDS, r.practiceKind)) return null;
    sim.practiceKind = r.practiceKind;
  }
  if (r.affiliationRole !== undefined) {
    if (r.view !== "firm" || !oneOf(AFFILIATION_ROLES, r.affiliationRole)) return null;
    sim.affiliationRole = r.affiliationRole;
  }
  if (r.governmentRole !== undefined) {
    if (r.view !== "government" || !oneOf(GOVERNMENT_ROLES, r.governmentRole)) return null;
    sim.governmentRole = r.governmentRole;
  }
  return sim;
}

/** The stored JSON text → a simulation, or null (absent, junk, not JSON). */
export function parseStoredAdminSimulation(text: string | null | undefined): AdminSimulation | null {
  if (!text) return null;
  try {
    return parseAdminSimulation(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Raw stored text (for useSyncExternalStore: a string snapshot is stable). */
export function readStoredAdminSimulationText(storage: ViewStorage | null | undefined): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(ADMIN_SIM_STORAGE_KEY);
  } catch {
    return null; // private mode / blocked storage: nothing stored
  }
}

export function readStoredAdminSimulation(storage: ViewStorage | null | undefined): AdminSimulation | null {
  return parseStoredAdminSimulation(readStoredAdminSimulationText(storage));
}

/** Returns true when the stored value actually changed. An invalid sim is never written. */
export function writeStoredAdminSimulation(storage: ViewStorage | null | undefined, sim: AdminSimulation): boolean {
  if (!storage) return false;
  const clean = parseAdminSimulation(sim);
  if (!clean) return false;
  const text = JSON.stringify(clean);
  try {
    if (storage.getItem(ADMIN_SIM_STORAGE_KEY) === text) return false;
    storage.setItem(ADMIN_SIM_STORAGE_KEY, text);
    return true;
  } catch {
    return false;
  }
}

// ─── Readers (each gated on the REAL role) ───────────────────────────────────

/**
 * The sub-role values a MENU should be built with, or null to use the
 * session's own. Non-null only when the real role is admin AND the stored
 * simulation is for the dashboard being drawn — a stale value in a
 * non-admin tab, or one for another dashboard, is ignored.
 */
export function simulatedNavIdentity(
  realUserType: UserType,
  sim: AdminSimulation | null,
  navView: UserType,
): { practiceKind: PracticeKind | null; affiliationRole: AdminSimAffiliationRole | null; governmentRole: GovernmentRole | null } | null {
  if (realUserType !== "admin" || !sim || sim.view !== navView) return null;
  return {
    practiceKind: sim.practiceKind ?? null,
    affiliationRole: sim.affiliationRole ?? null,
    governmentRole: sim.governmentRole ?? null,
  };
}

/**
 * The «عرض كـ» entry to show selected for the dashboard being drawn: the
 * stored simulation's entry when it is for that dashboard, else the first
 * entry for it (lawyer → محامٍ, firm → الشريك المدير, government → قاضٍ).
 * Null when nothing is drawn.
 */
export function switchOptionFor(current: AdminView | null, sim: AdminSimulation | null): AdminSwitchOption | null {
  if (!current) return null;
  if (sim && sim.view === current) {
    const exact = ADMIN_SWITCH_OPTIONS.find((o) =>
      o.sim.view === sim.view &&
      o.sim.practiceKind === sim.practiceKind &&
      o.sim.affiliationRole === sim.affiliationRole &&
      o.sim.governmentRole === sim.governmentRole);
    if (exact) return exact;
  }
  return ADMIN_SWITCH_OPTIONS.find((o) => o.sim.view === current) ?? null;
}

/** True when `pathname` is `href` or under it (the switch navigates only otherwise). */
export function isUnderHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}
