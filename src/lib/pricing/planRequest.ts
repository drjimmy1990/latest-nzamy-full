/**
 * planRequest.ts — how a plan CTA becomes an entitlement request (there is no
 * payment gateway: the admin reviews every request in
 * /dashboard/admin/entitlements/requests and grants a tier by hand).
 *
 * Two callers:
 *   - src/components/pricing/PricingCards.tsx — a signed-in user clicks a
 *     plan's subscribe CTA on /pricing;
 *   - src/app/register/client — a guest clicked the same CTA, which sent them
 *     to /register/client?type=…&plan=<Plan.id>; once the account exists the
 *     request is offered from the last signup step.
 *
 * No `@/` imports and no runtime imports: `node --test` loads this file
 * directly (planRequest.test.ts).
 */

export interface RequestablePlan {
  id: string;
  name: string;
  ctaHref: string;
}

export interface PlanEntitlementRequest {
  kind: "plan" | "library";
  /** The canonical Plan.id — stable, unlike the display name. */
  requested_ref: string;
  /** The display name, so the admin queue stays readable. */
  note: string;
}

/**
 * The body for POST /api/v1/entitlement-requests.
 *
 * `requested_ref` carries the plan id, not its name: the name is copy and
 * changes (it did, in this very pass), the id is what the plan catalogue, the
 * admin pricing screen and `?plan=` all key on. The name travels in `note`,
 * which the admin queue prints under the request.
 *
 * Library plans on /pricing go out as kind "library", the same kind
 * /laws/subscribe sends for the same plans, so the admin sees one label for
 * one product. (The approval route maps plan, library and media to the same
 * grant, so this changes the label only.)
 */
export function planEntitlementRequest(
  plan: { id: string; name: string },
  opts: { libraryMode?: boolean } = {},
): PlanEntitlementRequest {
  return {
    kind: opts.libraryMode ? "library" : "plan",
    requested_ref: plan.id,
    note: plan.name,
  };
}

/**
 * The `?plan=` a page was opened with, when it names one of the plans that
 * page sells (`ids`); otherwise null. /laws/subscribe uses it to mark the plan
 * the paywall or a /pricing CTA sent; it never requests anything by itself.
 */
export function planFromParam(param: string | null | undefined, ids: readonly string[]): string | null {
  const wanted = param?.trim();
  return wanted && ids.includes(wanted) ? wanted : null;
}

/** The `plan` query value of a CTA href, or null. */
export function planParamOf(href: string): string | null {
  const q = href.indexOf("?");
  if (q < 0) return null;
  const value = new URLSearchParams(href.slice(q + 1)).get("plan");
  return value ? value : null;
}

/**
 * The plan a signup was started for, or null.
 *
 * `plans` is the plan list of the account type being registered. A `?plan=`
 * value is honoured only when it names a plan in that list AND that plan's
 * own CTA is a client-registration link carrying the same id — i.e. it is a
 * plan whose button actually leads here. Anything else (a typo, a retired id
 * such as the old «shield»/«group», a plan of another account type, a plan
 * sold through «تواصل معنا») resolves to null and the signup simply carries no
 * plan, rather than offering something the pricing page does not sell.
 */
/**
 * Retired plan ids whose product lives on inside another plan. Owner answers
 * ٢١٣ + ١٧٦ (2026-10-18): the 699 family plan «ind-family» was merged into
 * «التأمين القانوني» (ind-litigation) as its family option, so an old
 * `?plan=ind-family` link — or one pendingPlan saved before the deploy — asks
 * for that plan. (The retired shield/group plans have no successor and still
 * resolve to nothing.)
 */
const MERGED_PLAN_IDS: Readonly<Record<string, string>> = {
  "ind-family": "ind-litigation",
};

export function resolveRequestedPlan(
  planParam: string | null | undefined,
  plans: readonly RequestablePlan[],
): { id: string; name: string } | null {
  const raw = planParam?.trim();
  if (!raw) return null;
  const wanted = MERGED_PLAN_IDS[raw] ?? raw;
  const plan = plans.find((p) => p.id === wanted);
  if (!plan) return null;
  if (!plan.ctaHref.startsWith("/register/client")) return null;
  if (planParamOf(plan.ctaHref) !== plan.id) return null;
  return { id: plan.id, name: plan.name };
}
