/**
 * The /ai pages whose tool is for lawyers and law firms only (owner ٤١٧, answer
 * of 8 Nov 2026, and the controller ruling that applies it): which page runs
 * which tool, and who may see a link to it.
 *
 * Pure data and string matching, no imports: the edge (src/proxy.ts via
 * src/lib/auth/routeAccess.ts), the /ai layout, the sidebars and the dashboards
 * all read it. toolRoles.test.ts pins every tool named here to
 * LAWYER_FIRM_ROLES in src/lib/ai/tools.ts, so the two cannot drift apart.
 *
 * Deliberately NOT listed, because the page serves other accounts something
 * else and splits by the tool's roles itself:
 *   /ai/draft   — a client gets the team order (the drafter's AI path follows
 *                 toolRoleRefusal on legal-drafter);
 *   /ai/analyze — a client gets the gated analyzer; the case brief («عصارة
 *                 المرفقات») is drawn for lawyer, firm and admin only.
 */
export const LAWYER_ONLY_AI_PAGES: Readonly<Record<string, string>> = Object.freeze({
  "/ai/contracts": "contracts-pro",
  "/ai/contract-negotiator": "contract-negotiator",
  "/ai/contract-drafter": "contract-drafter",
  "/ai/wargaming": "wargaming",
  "/ai/analyze-strength": "analyze-strength",
  "/ai/najiz-optimizer": "najiz-optimizer",
  "/ai/brief-check": "brief-check",
  "/ai/communicate": "communicate",
  "/ai/assistant": "assistant",
});

/** The account types that see these pages: the tools' roles plus the admin, who passes every tool. */
export const LAWYER_TOOL_VIEWER_TYPES = ["lawyer", "firm", "admin"] as const;

/** The path part of an href: no query, no hash, no trailing slash. */
function pathOf(href: string): string {
  const path = href.split(/[?#]/)[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** The lawyer-only tool behind this page or link (its subpages included), or null. Segment-aware: /ai/contracts-x is not /ai/contracts. */
export function lawyerOnlyAiTool(href: string): string | null {
  const path = pathOf(href);
  for (const [page, tool] of Object.entries(LAWYER_ONLY_AI_PAGES)) {
    if (path === page || path.startsWith(`${page}/`)) return tool;
  }
  return null;
}

export function isLawyerOnlyAiHref(href: string): boolean {
  return lawyerOnlyAiTool(href) !== null;
}

/** May this account type see a lawyer-only tool's link or page? Lawyer, firm and admin. */
export function canSeeLawyerTools(userType: string | null | undefined): boolean {
  return (LAWYER_TOOL_VIEWER_TYPES as readonly string[]).includes(userType ?? "");
}
