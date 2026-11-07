/**
 * libraryRequestApproval.ts — owner answer ٤٢٧ (2026-11-07): a FREE library
 * grant is the admin's alone. Operations hold `entitlements.decide` (they
 * decide plan / credits / media requests), but approving a `library` request
 * writes a library_access_grants row — a grant of the library — so it needs
 * either a paid order behind the request, or the actor's `entitlements.grant`
 * (super_admin; the same action the direct grant route requires).
 *
 * A request carries no link to an order or a payment today
 * (public.entitlement_requests, 20260706: user_id, kind, requested_ref,
 * amount, note — all written by the requester), and a paid library order is
 * granted by the payment itself (src/lib/payments/grantPurchase.ts), never
 * through a request. So the route passes `paidOrder: false` and only an admin
 * may approve; the parameter is here for the day a request is tied to an order.
 *
 * Pure, relative imports only — `node --test` loads it.
 */
import { staffCan, type StaffRole } from "../auth/staffRoles.ts";
import { fullLibraryAccess } from "../libraryAccessDecision.ts";

export const LIBRARY_REQUEST_ADMIN_ONLY_AR =
  "لا يمكن اعتماد هذا الطلب من حسابك: منح المكتبة القانونية دون طلب مدفوع صلاحية للمشرف الأعلى وحده. اترك الطلب له، أو ارفضه.";

export type LibraryRequestApproval =
  | { allowed: true; basis: "paid_order" | "admin_grant" }
  | { allowed: false; status: 403; code: "library_grant_admin_only"; error: string };

export function libraryRequestApprovalDecision(input: {
  role: StaffRole | null | undefined;
  /** The request is tied to a paid order (never true today — see the header). */
  paidOrder: boolean;
}): LibraryRequestApproval {
  if (input.paidOrder === true) return { allowed: true, basis: "paid_order" };
  if (staffCan(input.role, "entitlements.grant")) return { allowed: true, basis: "admin_grant" };
  return { allowed: false, status: 403, code: "library_grant_admin_only", error: LIBRARY_REQUEST_ADMIN_ONLY_AR };
}

/** The grant action a request kind maps to when the body names none (route.ts). */
export function defaultGrantActionForKind(kind: string): "plan" | "credits" | "wallet" {
  return kind === "credits" ? "credits" : kind === "wallet" ? "wallet" : "plan";
}

export const GRANT_ACTION_ADMIN_ONLY_AR =
  "لا يمكن تغيير نوع المنح عن نوع الطلب من حسابك: هذا للمشرف الأعلى وحده. اعتمد الطلب كما قُدِّم، أو اتركه له.";

export const LIBRARY_TIER_ADMIN_ONLY_AR =
  "لا يمكن منح هذه الباقة من حسابك: باقة Pro وما فوقها تشمل المكتبة القانونية كاملة، ومنح المكتبة دون طلب مدفوع صلاحية للمشرف الأعلى وحده. اختر باقة أدنى، أو اترك الطلب له.";

export type RequestGrantApproval =
  | { allowed: true }
  | { allowed: false; status: 403; code: "grant_action_admin_only" | "library_grant_admin_only"; error: string };

/**
 * Owner ٤٢٧, the plan / media / credits / wallet arm of the same route. A Pro+
 * plan IS the full library (libraryAccessDecision.ts fullLibraryAccess), so an
 * operations approval of a plan request with tier "pro" (the console's
 * default) — or of a credits request turned into a plan by `grantAction` —
 * would be a free library grant by another door. Without `entitlements.grant`:
 *   - the grant action must be the kind's own (no `grantAction` override);
 *   - a plan grant must be of a tier below pro, unless the request is tied
 *     to a paid order (none is today).
 * `ranks` is access-control.ts's TIER_RANK (the one table; passed in, never
 * copied — the same way entitlementGrantRules.ts takes it).
 */
export function requestGrantApprovalDecision(input: {
  role: StaffRole | null | undefined;
  kind: string;
  grantAction: unknown;
  tier: unknown;
  paidOrder: boolean;
  ranks: Record<string, number>;
}): RequestGrantApproval {
  if (staffCan(input.role, "entitlements.grant")) return { allowed: true };
  const kindAction = defaultGrantActionForKind(input.kind);
  if (input.grantAction !== undefined && input.grantAction !== null && input.grantAction !== kindAction) {
    return { allowed: false, status: 403, code: "grant_action_admin_only", error: GRANT_ACTION_ADMIN_ONLY_AR };
  }
  if (kindAction === "plan" && input.paidOrder !== true) {
    const tier = typeof input.tier === "string" ? input.tier : "";
    if (fullLibraryAccess({ tier, isAdmin: false, hasLibraryGrant: false }, input.ranks)) {
      return { allowed: false, status: 403, code: "library_grant_admin_only", error: LIBRARY_TIER_ADMIN_ONLY_AR };
    }
  }
  return { allowed: true };
}
