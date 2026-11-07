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
 * Pure, one relative import — `node --test` loads it.
 */
import { staffCan, type StaffRole } from "../auth/staffRoles.ts";

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
