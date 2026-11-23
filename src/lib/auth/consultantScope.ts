/**
 * consultantScope.ts — the independent legal consultant sees the library only
 * (owner decision, 22–23 Nov 2026). Practising before a court and the lawyer's
 * working tools are for the licensed advocate; a consultant gets them only by
 * delegation from a lawyer or a firm (phase 2, not built here — nothing in this
 * file stands in its way: a delegation would widen `CONSULTANT_ALLOWED_*`
 * per member, and the six Art. 18 pleading tools in practiceKind.ts stay shut).
 *
 * An ALLOWLIST, not a blocklist: a lawyer-workspace route added tomorrow is
 * closed to a consultant until someone lists it here. The old blocklist
 * (`CONSULTANT_BLOCKED_PREFIXES`, practiceKind.ts) is untouched: it is a fixed
 * statutory floor that many gates share.
 *
 * Who is a consultant is decided by the EXACT value `practice_kind = 'consultant'`
 * (`toPracticeKind`): a blank, null, unknown or differently-cased value is an
 * advocate and is never locked out. The allowlist is applied to a confirmed
 * consultant and fails closed for every route it does not name.
 *
 * Pure, no `@/` imports, so `node --test` loads it with a relative `.ts` import.
 * The same functions serve the proxy (pages and /api/v1/lawyer), the sidebar
 * and the dashboard, so the screen and the server cannot disagree.
 */
import { toPracticeKind } from "./practiceKind.ts";

/** The consultant's home: the library dashboard that replaces the lawyer's. */
export const CONSULTANT_HOME_PATH = "/dashboard/lawyer";

/** Pages a consultant may open, segment-exact (the path itself or a child). */
export const CONSULTANT_ALLOWED_PAGE_PREFIXES = [
  "/laws", // the library and «مكتبتي» (/laws/my)
  "/notifications",
  "/settings", // includes the subscription tab
  "/pricing",
  "/checkout",
  "/payments",
  // The client side of the marketplace, as for an individual: browse and ask
  // for a service. The provider side (taking public requests) stays closed.
  "/marketplace",
  "/dashboard/lawyer/join-office", // «انضم إلى مكتب أو محامٍ»
  "/dashboard/lawyer/profile", // his own profile and licence details
] as const;

/** Pages matched exactly (no children). */
export const CONSULTANT_ALLOWED_PAGE_EXACT = [CONSULTANT_HOME_PATH] as const;

/** /api/v1/lawyer/* routes a consultant still needs: licence verification and the profile row. */
export const CONSULTANT_ALLOWED_API_PREFIXES = [
  "/api/v1/lawyer/signup-verification",
  "/api/v1/lawyer/licence-image",
  "/api/v1/lawyer/profile-row",
] as const;

/** Where the proxy applies the scope: the lawyer's workspace and the AI tool pages. */
const SCOPED_PAGE_PREFIXES = ["/dashboard/lawyer", "/ai"] as const;
const SCOPED_API_PREFIX = "/api/v1/lawyer";

function clean(pathname: unknown): string | null {
  if (typeof pathname !== "string") return null;
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

function under(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Is this page on the consultant's allowlist? Anything unlisted is false. */
export function isConsultantAllowedPath(pathname: string): boolean {
  const path = clean(pathname);
  if (path === null) return false;
  if ((CONSULTANT_ALLOWED_PAGE_EXACT as readonly string[]).includes(path)) return true;
  return CONSULTANT_ALLOWED_PAGE_PREFIXES.some((p) => under(path, p));
}

export function isConsultantAllowedApiPath(pathname: string): boolean {
  const path = clean(pathname);
  if (path === null) return false;
  return CONSULTANT_ALLOWED_API_PREFIXES.some((p) => under(path, p));
}

/** Is this page inside the area the scope governs? */
export function isConsultantScopedPagePath(pathname: string): boolean {
  const path = clean(pathname);
  return path !== null && SCOPED_PAGE_PREFIXES.some((p) => under(path, p));
}

/** `/api/v1/lawyer/...` only; `/api/v1/lawyers` (the public directory) is another route. */
export function isConsultantScopedApiPath(pathname: string): boolean {
  const path = clean(pathname);
  return path !== null && under(path, SCOPED_API_PREFIX);
}

/** A consultant, by the exact value and nothing else. */
export function isConsultantKind(practiceKind: unknown): boolean {
  return toPracticeKind(practiceKind) === "consultant";
}

/** A page request: allow, or send the consultant to his home. */
export function consultantPageVerdict(pathname: string, practiceKind: unknown): "allow" | "redirect_home" {
  if (!isConsultantKind(practiceKind)) return "allow";
  if (!isConsultantScopedPagePath(pathname)) return "allow";
  return isConsultantAllowedPath(pathname) ? "allow" : "redirect_home";
}

/** An API request: allow, or refuse (403) a consultant on an unlisted lawyer route. */
export function consultantApiVerdict(pathname: string, practiceKind: unknown): "allow" | "forbid" {
  if (!isConsultantKind(practiceKind)) return "allow";
  if (!isConsultantScopedApiPath(pathname)) return "allow";
  return isConsultantAllowedApiPath(pathname) ? "allow" : "forbid";
}

/**
 * The AI tools Art. 18 itself closes (pleading). A refusal names Art. 18 for
 * these only; every other tool a consultant cannot run names the reservation
 * (CONSULTANT_RESERVED_MESSAGE).
 */
export const CONSULTANT_PLEADING_TOOL_IDS: readonly string[] = [
  "najiz-optimizer",
  "brief-check",
  "wargaming",
  "analyze-strength",
];
