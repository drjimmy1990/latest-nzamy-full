/**
 * firmLanding — where an ACTIVE firm member lands (owner package 13-Nov,
 * N01-25/26/27; spec 01 §3: «المحامي الفرعي … يفتح حسابه مباشرةً وتلقائياً على
 * لوحة المكتب»).
 *
 * A firm member keeps their own profiles.user_type (`lawyer`, or `individual`
 * for a secretary/accountant) — membership is additive and trg_lock_user_type
 * forbids rewriting the column — so every "go to my dashboard" path that keys
 * on the type alone sent them to /dashboard/lawyer (or /dashboard/client).
 *
 * Two answers live here, both pure so the edge bundle can import them and
 * `node --test` can drive them (firmLanding.test.ts):
 *
 *   firmLandingFor(type, isActiveFirmMember)
 *     The landing the session handshake reports and /login follows. Only a
 *     `lawyer` or `individual` member moves; the firm owner already lands on
 *     /dashboard/firm by type, and no other type can be invited
 *     (POST /api/v1/firm/members admits lawyer and individual accounts only).
 *
 *   isFirmLandingCheckPath(pathname, knownType)
 *     Whether src/proxy.ts should spend its ONE membership read on asking
 *     "is this lawyer a firm member?". True only for a `lawyer` on the exact
 *     /dashboard/lawyer root — the page every type-based link, the Google
 *     callback and the home-page redirect send a lawyer to. Every
 *     /dashboard/lawyer/* sub-page stays reachable: the member's own cases,
 *     clients and contracts live there, and firm pages reuse lawyer modules.
 *
 * Relative imports with `.ts`: `node --test` loads this file directly.
 */
import { dashboardPathFor } from "./userTypes.ts";

export const FIRM_DASHBOARD_PATH = "/dashboard/firm";
export const LAWYER_DASHBOARD_ROOT = "/dashboard/lawyer";

/** The account types a firm invitation can be accepted by. */
const FIRM_MEMBER_TYPES: ReadonlySet<string> = new Set(["lawyer", "individual"]);

/**
 * The firm dashboard for an active member whose own type would otherwise send
 * them elsewhere; null when the type-based landing stands.
 */
export function firmLandingFor(
  userType: string | null | undefined,
  isActiveFirmMember: boolean,
): typeof FIRM_DASHBOARD_PATH | null {
  if (!isActiveFirmMember) return null;
  if (typeof userType !== "string" || !FIRM_MEMBER_TYPES.has(userType)) return null;
  return FIRM_DASHBOARD_PATH;
}

/** firmLandingFor, else the type's own dashboard (dashboardPathFor). */
export function defaultDashboardPathFor(
  userType: string,
  isActiveFirmMember: boolean,
): string {
  return firmLandingFor(userType, isActiveFirmMember) ?? dashboardPathFor(userType);
}

/**
 * True only for a `lawyer` requesting exactly the /dashboard/lawyer root
 * (a trailing slash included). Never for admin, a firm account, any other
 * type, or any sub-page.
 */
export function isFirmLandingCheckPath(pathname: string, knownType: string | null): boolean {
  if (knownType !== "lawyer") return false;
  return pathname === LAWYER_DASHBOARD_ROOT || pathname === `${LAWYER_DASHBOARD_ROOT}/`;
}
