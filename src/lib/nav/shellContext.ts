/**
 * shellContext.ts — which menu (shell) a page draws, decided in ONE place.
 *
 * Owner package 2026-10-30, LIVE-F01 (P0) + NOTE-22-C01/C02: an admin who
 * switched to «وضع المحامي» and then opened a shared tool (الصائغ القانوني
 * /ai/draft, محترف العقود /ai/contracts, the calculator /ai/fee-calculator)
 * got the ADMIN sidebar and /dashboard/admin links back.
 *
 * Root cause: the "view as lawyer" state was never stored. The only signal was
 * the URL. SharedSidebar asked inferUserTypeFromPath() first and, on any path
 * outside /dashboard/<role>/ (every /ai/* tool, /notifications…), fell back to
 * the REAL role — "admin" — and drew ADMIN_SIDEBAR. The /ai layout had no
 * admin branch at all and fell through to the last-dashboard stamp or the
 * Business default.
 *
 * The fix keeps two things apart:
 *   - the real role (useUser().userType) — every guard, the proxy and every
 *     API route keep reading it, unchanged; nothing here can widen access;
 *   - the admin's VIEW CONTEXT (one of the nine AdminView dashboards since
 *     S6-T14; "admin" | "lawyer" before) — UI only, kept in this
 *     tab's sessionStorage under ADMIN_VIEW_STORAGE_KEY, and consulted ONLY
 *     when the real role is "admin". A stale value in a non-admin tab is
 *     ignored by construction.
 *
 * Every consumer (SharedSidebar, GlobalSearch, the /ai layout, the
 * /notifications layout, the public Navbar) goes through resolveAdminView()
 * for an admin, so the menus cannot disagree about the mode again.
 *
 * Pure (no React, no window) so node --test can load it. Relative imports
 * carry `.ts` for the same reason; the `@/` import below is type-only and is
 * erased.
 */
import type { UserType } from "@/hooks/useUser";

/** sessionStorage key for the admin's view context (per tab). */
export const ADMIN_VIEW_STORAGE_KEY = "nzamy_admin_view_as";
/** Same-tab change event (the `storage` event only fires in OTHER tabs). */
export const ADMIN_VIEW_EVENT = "nzamy:admin-view";

/**
 * S6-T14 (slice A §6.1.2): the admin's «عرض كـ» covers every dashboard, not
 * just admin / lawyer. Still UI only — the names are dashboards to DRAW, never
 * a role the server is told about.
 */
export type AdminView =
  | "admin" | "lawyer" | "firm" | "individual" | "corporate"
  | "micro" | "provider" | "government" | "ngo";

export const ADMIN_VIEWS: readonly AdminView[] = [
  "admin", "lawyer", "firm", "individual", "corporate", "micro", "provider", "government", "ngo",
];

export function parseAdminView(raw: unknown): AdminView | null {
  return typeof raw === "string" && (ADMIN_VIEWS as readonly string[]).includes(raw) ? (raw as AdminView) : null;
}

/** Minimal Storage shape, so tests can pass a Map-backed fake. */
export interface ViewStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredAdminView(storage: ViewStorage | null | undefined): AdminView | null {
  if (!storage) return null;
  try {
    return parseAdminView(storage.getItem(ADMIN_VIEW_STORAGE_KEY));
  } catch {
    return null; // private mode / blocked storage: no stored view
  }
}

/** Returns true when the stored value actually changed. */
export function writeStoredAdminView(storage: ViewStorage | null | undefined, view: AdminView): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(ADMIN_VIEW_STORAGE_KEY) === view) return false;
    storage.setItem(ADMIN_VIEW_STORAGE_KEY, view);
    return true;
  } catch {
    return false;
  }
}

/**
 * The dashboard a path belongs to. Moved here from SidebarComponents.tsx
 * (which re-exports it) so GlobalSearch's private copy could go and so this
 * file — not a .tsx — can be tested.
 */
export function inferUserTypeFromPath(pathname: string): UserType {
  if (pathname.startsWith("/dashboard/client"))     return "individual";
  if (pathname.startsWith("/dashboard/lawyer"))     return "lawyer";
  if (pathname.startsWith("/dashboard/firm"))       return "firm";
  if (pathname.startsWith("/dashboard/business"))   return "corporate";
  if (pathname.startsWith("/dashboard/micro"))      return "micro";
  if (pathname.startsWith("/dashboard/provider"))   return "provider";
  if (pathname.startsWith("/dashboard/admin"))      return "admin";
  if (pathname.startsWith("/dashboard/government")) return "government";
  if (pathname.startsWith("/dashboard/ngo"))        return "ngo";
  return null;
}

/** /ai and everything under it: the shared AI tools. */
export function isSharedToolPath(pathname: string): boolean {
  return pathname === "/ai" || pathname.startsWith("/ai/");
}

/** /dashboard/<segment> → the view it is. Whole segments only (no "lawyerish"). */
const DASHBOARD_VIEWS: ReadonlyArray<readonly [prefix: string, view: AdminView]> = [
  ["/dashboard/admin", "admin"],
  ["/dashboard/lawyer", "lawyer"],
  ["/dashboard/firm", "firm"],
  ["/dashboard/client", "individual"],
  ["/dashboard/business", "corporate"],
  ["/dashboard/micro", "micro"],
  ["/dashboard/provider", "provider"],
  ["/dashboard/government", "government"],
  ["/dashboard/ngo", "ngo"],
];

/**
 * The view an admin's visit to this path SETS (the only writes besides the
 * switch bar): entering a dashboard means that dashboard's view (S6-T14: all
 * nine, `client` → individual, `business` → corporate). /ai/* deliberately does
 * NOT write — an admin who follows a link into a tool must not be silently
 * flipped for the rest of the tab.
 */
export function adminViewFromPath(pathname: string): AdminView | null {
  for (const [prefix, view] of DASHBOARD_VIEWS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return view;
  }
  return null;
}

/**
 * THE decision for an admin session — the single place every shell asks.
 *   1. A dashboard path: the path says it.
 *   2. A shared AI tool: the stored view when it is a role dashboard (S6-T14:
 *      an admin viewing as a firm keeps the firm workspace in /ai/draft);
 *      otherwise the lawyer workspace — the admin console has no AI tools
 *      (REF0021: never the admin menu on /ai/*).
 *   3. Anywhere else (/notifications, /settings, /laws…): the stored view.
 *   4. Nothing stored: admin.
 */
export function resolveAdminView(pathname: string, storedView: AdminView | null): AdminView {
  const fromPath = adminViewFromPath(pathname);
  if (fromPath) return fromPath;
  if (isSharedToolPath(pathname)) return storedView && storedView !== "admin" ? storedView : "lawyer";
  return storedView ?? "admin";
}

/**
 * The account type whose MENU to draw — never a permission. Non-admin
 * sessions get exactly the old answer
 * (`isBusinessIntake ? "corporate" : pathUserType ?? sessionUserType`).
 */
export function resolveNavUserType(input: {
  pathname: string;
  sessionUserType: UserType;
  storedView: AdminView | null;
  isBusinessIntake?: boolean;
}): UserType {
  const { pathname, sessionUserType, storedView, isBusinessIntake = false } = input;
  if (isBusinessIntake) return "corporate";
  const pathType = inferUserTypeFromPath(pathname);
  if (pathType) return pathType;
  if (sessionUserType === "admin") return resolveAdminView(pathname, storedView);
  return sessionUserType;
}

/**
 * The public Navbar's account type. It never looked at the path for anyone,
 * and still does not for non-admins; an admin's top bar follows the view, so
 * the library (/laws) keeps the lawyer links while an admin is in lawyer mode.
 */
export function resolveNavbarUserType(input: {
  pathname: string;
  sessionUserType: UserType;
  storedView: AdminView | null;
}): UserType {
  const { pathname, sessionUserType, storedView } = input;
  if (sessionUserType !== "admin") return sessionUserType;
  return resolveAdminView(pathname, storedView);
}

// ─── /ai/* shell ─────────────────────────────────────────────────────────────

export type AiShell =
  | "loading" | "none"
  | "business" | "client" | "lawyer" | "provider" | "firm" | "micro" | "government" | "ngo";

/** Lawyer-only tools with no /ai/<role>/ prefix (unchanged list). */
export const LAWYER_AI_PREFIXES = ["/ai/collector", "/ai/brief-check", "/ai/direction-support", "/ai/vault"] as const;

const SESSION_SHELLS: Partial<Record<Exclude<UserType, null>, AiShell>> = {
  corporate: "business",
  individual: "client",
  lawyer: "lawyer",
  provider: "provider",
  firm: "firm",
  micro: "micro",
  government: "government",
  ngo: "ngo",
};

const STAMP_SHELLS: Record<string, AiShell> = {
  business: "business",
  client: "client",
  lawyer: "lawyer",
  provider: "provider",
  firm: "firm",
  micro: "micro",
  government: "government",
  ngo: "ngo",
};

/** The /ai shell for an admin's view. "admin" is unreachable on /ai (rule 2 of resolveAdminView). */
const ADMIN_VIEW_SHELLS: Record<AdminView, AiShell> = {
  admin: "lawyer",
  lawyer: "lawyer",
  firm: "firm",
  individual: "client",
  corporate: "business",
  micro: "micro",
  provider: "provider",
  government: "government",
  ngo: "ngo",
};

function underPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/**
 * The layout src/app/ai/layout.tsx wraps a tool in. Same order as before for
 * every non-admin session (see the regression table in shellContext.test.ts);
 * the one new branch is the admin's, which goes through resolveAdminView().
 */
export function resolveAiShell(input: {
  loading: boolean;
  isLoggedIn: boolean;
  userType: UserType;
  pathname: string;
  storedView: AdminView | null;
  lastDashboard: string | null;
}): AiShell {
  const { loading, isLoggedIn, userType, pathname, storedView, lastDashboard } = input;

  // 0. Session gate — never guess a sidebar before the session resolves.
  if (loading) return "loading";
  // Marketing landing for visitors.
  if (pathname === "/ai" && !isLoggedIn) return "none";

  // 1. Session (highest priority — prevents sidebar bleeding).
  if (userType === "admin") {
    // LIVE-F01 / S6-T14: the admin works the shared tools in the workspace of
    // the view it chose (lawyer by default). Every role layout's guard
    // already admits "admin" — no access change.
    return ADMIN_VIEW_SHELLS[resolveAdminView(pathname, storedView)];
  }
  const sessionShell = userType ? SESSION_SHELLS[userType] : undefined;
  if (sessionShell) return sessionShell;

  // 2. Path inference for a session that matched none of the above.
  if (underPrefix(pathname, "/ai/corp")) return "business";
  if (underPrefix(pathname, "/ai/gov")) return "government";
  if (underPrefix(pathname, "/ai/ngo")) return "ngo";
  if (underPrefix(pathname, "/ai/micro")) return "micro";

  // 2b. Logged-out escape — proxy.ts does the redirecting.
  if (!isLoggedIn) return "none";

  if (LAWYER_AI_PREFIXES.some((p) => underPrefix(pathname, p))) return "lawyer";

  // 3. Last-dashboard stamp.
  if (lastDashboard && STAMP_SHELLS[lastDashboard]) return STAMP_SHELLS[lastDashboard];

  // 4. Fallback.
  return "business";
}

// ─── /notifications shell ────────────────────────────────────────────────────

export type NotificationsShell = "business" | "client" | "lawyer" | "admin";

/**
 * The layout /notifications is wrapped in. Non-admin order unchanged. An
 * admin used to fall to the last-dashboard stamp, and the console stamps
 * "admin", which no branch matched — so the admin console's own «عرض جميع
 * الإشعارات» link opened the BUSINESS shell. Now: the view context decides —
 * the lawyer shell in lawyer mode, the admin console's own shell otherwise.
 */
export function resolveNotificationsShell(input: {
  userType: UserType;
  storedView: AdminView | null;
  lastDashboard: string | null;
  pathname?: string;
}): NotificationsShell {
  const { userType, storedView, lastDashboard, pathname = "/notifications" } = input;
  if (userType === "admin") return resolveAdminView(pathname, storedView) === "lawyer" ? "lawyer" : "admin";
  if (userType === "corporate") return "business";
  if (userType === "individual") return "client";
  if (userType === "lawyer" || userType === "firm" || userType === "provider") return "lawyer";
  if (lastDashboard === "business") return "business";
  if (lastDashboard === "client") return "client";
  if (lastDashboard === "lawyer") return "lawyer";
  return "business";
}

// ─── Switch bar state ────────────────────────────────────────────────────────

/**
 * Which «عرض كـ» view is selected for the menu being drawn. S6-T14: every
 * dashboard is a view now, so every shown type selects its own; null (no
 * menu type) selects none.
 */
export function switchCurrentView(shownType: UserType): AdminView | null {
  return parseAdminView(shownType);
}

// ─── Header label ────────────────────────────────────────────────────────────

/**
 * NOTE-22-C02: a view is not a role. When an admin is drawn a lawyer menu the
 * header says so — «مدير النظام · وضع المحامي» — rather than a bare «محامي».
 * Returns null when no suffix is due (not an admin, or the admin's own view).
 */
export function adminViewSuffix(sessionUserType: UserType, shownType: UserType, isAr = true): string | null {
  if (sessionUserType !== "admin" || shownType === "admin" || !shownType) return null;
  if (shownType === "lawyer") return isAr ? "وضع المحامي" : "Lawyer mode";
  return null;
}
