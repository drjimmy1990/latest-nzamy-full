/**
 * officePages.ts — which office pages a plan opens (batch l19 «office»).
 *
 * Owner ق٢٦-٤ (package 2026-11-26), the lawyer's dashboard: «مفتوح (13): …
 * السوق والاستشارات الواردة … مهامي/البومودورو (بلا قضايا) … والورق المروّس»
 * and «مقفول لـ إدارة المكتب (17): القضايا ومشاركتها، الموكلون، العقود،
 * الجلسات، المواعيد، المستندات، الخزنة، المالية والكشوفات، التحليلات، سجل
 * النشاط، خريطة القضايا، والإعارة». Owner ق٢٦-١: «الميزات المدفوعة تظهر بقفل
 * 🔒 يفتح معاينة تشويقية وزر ترقية (SubscriptionGuard + HTTP 403 بالخادم)».
 * Owner ق٢٦-٥, the firm: free = market, wallet, the firm's profile and
 * settings; «مكتب محاماة» (firm-basic) = team, cases, finance, tasks, rooms,
 * collaboration, analytics; «شركة محاماة» (firm-enterprise) = branches,
 * departments, chinese walls, governance, HR, branding, client portal, health
 * check, secondment.
 *
 * Who holds what is the DATABASE's answer — public.my_office_plan_level()
 * (20261209_60): null (not a professional account: nothing locked), 'none'
 * (exactly office_features_locked(), 20261206_70 — the free side), 'office',
 * 'enterprise'. Before 20261209_60 is applied the screens fall back to
 * public.my_office_features_locked() (true → 'none', false → open).
 *
 * Two exemptions the owner's own words require, handled IN the page, not here:
 *   * a case that reached the professional from the market (the client is the
 *     requester, he is the assignee) — «السوق والاستشارات الواردة» is free and
 *     the database never counts it (solo_lawyer_case_counts). The case list
 *     and the case page show those to the free side.
 *   * the lawyer's vault: its «هوية ومطبوعات المكتب» tab is the letterhead
 *     («والورق المروّس» — free); its documents tab only links to
 *     «المستندات», which is locked. So the vault page is not guarded.
 * What a free account already created is never deleted: the read APIs stay
 * open, and the page comes back with all of it once a plan is bought.
 *
 * Pure, no imports: node --test loads it and client screens import it.
 */

export type OfficeLevel = "none" | "office" | "enterprise";
export type OfficeNeed = "office" | "enterprise";
export type OfficeScope = "lawyer" | "firm";

/** Does `level` open a page that needs `need`? null (not a professional account) opens everything. */
export function officeLevelGrants(level: OfficeLevel | null, need: OfficeNeed): boolean {
  if (level === null) return true;
  if (level === "enterprise") return true;
  if (level === "office") return need === "office";
  return false;
}

/** The answer a screen acts on: a level, or "unknown" (loading never reaches here). */
export type OfficeLevelRead = { state: "level"; level: OfficeLevel | null } | { state: "missing" } | { state: "unknown" };

const MISSING_FUNCTION = new Set(["42883", "PGRST202"]);
const LEVELS = new Set<string>(["none", "office", "enterprise"]);

/** rpc("my_office_plan_level") → what it says; "missing" = 20261209_60 not applied yet. */
export function readOfficeLevel(read: { data?: unknown; error?: { code?: string | null } | null } | null | undefined): OfficeLevelRead {
  if (!read) return { state: "unknown" };
  if (read.error) {
    return MISSING_FUNCTION.has(String(read.error.code ?? "")) ? { state: "missing" } : { state: "unknown" };
  }
  if (read.data === null || read.data === undefined) return { state: "level", level: null };
  if (typeof read.data === "string" && LEVELS.has(read.data)) return { state: "level", level: read.data as OfficeLevel };
  return { state: "unknown" };
}

/**
 * The fallback before 20261209_60: rpc("my_office_features_locked") → a level.
 * true → 'none'; false → null (open — the old binary rule had no enterprise
 * step); anything else → "unknown".
 */
export function levelFromLockedRead(read: { data?: unknown; error?: { code?: string | null } | null } | null | undefined): OfficeLevelRead {
  if (!read || read.error) return { state: "unknown" };
  if (read.data === true) return { state: "level", level: "none" };
  if (read.data === false) return { state: "level", level: null };
  return { state: "unknown" };
}

// ─── the pages ───────────────────────────────────────────────────────────────

/** The lawyer's 17 locked pages (ق٢٦-٤), as route prefixes. */
export const LAWYER_OFFICE_PAGE_PREFIXES: readonly string[] = Object.freeze([
  "/dashboard/lawyer/clients",
  "/dashboard/lawyer/contracts",
  "/dashboard/lawyer/hearings",
  "/dashboard/lawyer/deadlines",
  "/dashboard/lawyer/documents",
  "/dashboard/lawyer/finance",
  "/dashboard/lawyer/analytics",
  "/dashboard/lawyer/activity",
  "/dashboard/lawyer/graph",
  "/dashboard/lawyer/secondment",
]);

/** The firm's «مكتب المحاماة» pages (ق٢٦-٥ + the rows l18 locked in the menu). */
export const FIRM_OFFICE_PAGE_PREFIXES: readonly string[] = Object.freeze([
  "/dashboard/firm/cases/assign",
  "/dashboard/firm/graph",
  "/dashboard/firm/hearings",
  "/dashboard/firm/activity",
  "/dashboard/firm/contracts",
  "/dashboard/firm/clients",
  "/dashboard/firm/team",
  "/dashboard/firm/finance",
  "/dashboard/firm/fees",
  "/dashboard/firm/vault",
  "/dashboard/firm/documents",
  "/dashboard/firm/tasks",
  "/dashboard/firm/archive",
  "/dashboard/firm/analytics",
  "/dashboard/firm/shared-rooms",
  "/dashboard/firm/of-counsel",
]);

/** The firm's «شركة المحاماة» pages (ق٢٦-٥). */
export const FIRM_ENTERPRISE_PAGE_PREFIXES: readonly string[] = Object.freeze([
  "/dashboard/firm/departments",
  "/dashboard/firm/branches",
  "/dashboard/firm/governance",
  "/dashboard/firm/compliance",
  "/dashboard/firm/health-check",
  "/dashboard/firm/secondment",
  "/dashboard/firm/client-portal",
  "/dashboard/firm/branding",
]);

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function cleanPath(pathname: string | null | undefined): string {
  if (typeof pathname !== "string" || pathname === "") return "";
  const bare = pathname.split(/[?#]/)[0];
  return bare.length > 1 ? bare.replace(/\/+$/, "") : bare;
}

/** /dashboard/<scope>/cases or /dashboard/<scope>/cases/<id> — the pages that sort market cases themselves. */
export function isCaseListOrCasePage(scope: OfficeScope, pathname: string | null | undefined): boolean {
  const path = cleanPath(pathname);
  const base = `/dashboard/${scope}/cases`;
  if (path === base) return true;
  if (!path.startsWith(`${base}/`)) return false;
  const rest = path.slice(base.length + 1);
  return rest !== "" && !rest.includes("/") && rest !== "assign";
}

/**
 * What the page at `pathname` needs, for the layout's guard: null = free (or
 * a case page, which sorts market cases itself), else the step it needs.
 */
export function officePageNeed(scope: OfficeScope, pathname: string | null | undefined): OfficeNeed | null {
  const path = cleanPath(pathname);
  if (path === "") return null;
  if (scope === "lawyer") {
    if (path.startsWith("/dashboard/lawyer/cases/") && path.endsWith("/sharing")) return "office";
    return LAWYER_OFFICE_PAGE_PREFIXES.some((p) => underPrefix(path, p)) ? "office" : null;
  }
  if (FIRM_ENTERPRISE_PAGE_PREFIXES.some((p) => underPrefix(path, p))) return "enterprise";
  if (isCaseListOrCasePage("firm", path)) return null;
  return FIRM_OFFICE_PAGE_PREFIXES.some((p) => underPrefix(path, p)) ? "office" : null;
}

// ─── market cases ────────────────────────────────────────────────────────────

/**
 * A case that came to `userId` from the market or a client's direct request:
 * he is the assignee and someone else (the client) filed it. The same rule
 * as the database's case cap (solo_lawyer_case_counts, 20261206_70), which
 * never counts such a case — market intake is free.
 */
export function isMarketClaimedCase(
  row: { assigned_to?: unknown; requester_user_id?: unknown } | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!row || typeof userId !== "string" || userId === "") return false;
  const requester = typeof row.requester_user_id === "string" ? row.requester_user_id : "";
  const assignee = typeof row.assigned_to === "string" ? row.assigned_to : "";
  return assignee === userId && requester !== "" && requester !== userId;
}

// ─── the words ───────────────────────────────────────────────────────────────

/** The teaser's title and lines. */
export const OFFICE_TEASER_TITLE_AR = "هذه الصفحة من أدوات إدارة المكتب";
export const OFFICE_TEASER_KEEP_AR =
  "ما أضفته سابقاً محفوظ كما هو ولا يُحذف، ويعود إليك كاملاً فور الاشتراك.";
/** The case list's note on the free side (only the market's cases are shown). */
export const OFFICE_MARKET_CASES_NOTE_AR =
  "تظهر هنا القضايا التي وصلتك من سوق الطلبات فقط، وهي متاحة لك مجاناً. أما إضافة قضاياك الخاصة وإدارتها فمن أدوات إدارة المكتب.";

// ─── tasks: free, without cases ─────────────────────────────────────────────

/**
 * Owner ق٢٦-٤: «مهامي/البومودورو (بلا قضايا)» is free. A task body needs
 * «إدارة المكتب» only when it links a case (`caseId`) or hands the task to
 * someone other than the caller (`assigneeUserId`) — the team is paid.
 */
export function taskNeedsOfficePlan(input: { caseId?: unknown; assigneeUserId?: unknown; callerId: string }): boolean {
  const caseLinked = typeof input.caseId === "string" && input.caseId.trim() !== "";
  const other = typeof input.assigneeUserId === "string" && input.assigneeUserId.trim() !== "" && input.assigneeUserId.trim() !== input.callerId;
  return caseLinked || other;
}
