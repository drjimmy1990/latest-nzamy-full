/**
 * signupPlan.ts — the plans a sign-up offers and where a chosen plan leads
 * once the account exists (batch l18: LIVE-03 / LIVE-04, owner package
 * 26 Nov 2026).
 *
 *   - LIVE-03: step 4 of /register/provider used to show one fixed list (a
 *     free «ERP» card, the lawyer's 3,990 pre-selected, the firm's 14,900
 *     hidden in a bullet) to all six roles. Each role now gets the free card
 *     plus exactly the price-book plans it may buy — the same ids /pricing
 *     shows that audience — priced by the book in the cycle picked, with the
 *     free card selected by default. A notary / government agent / arbitrator
 *     has no plan sold online yet (which cards they should see is an open
 *     owner question): the free card only.
 *   - LIVE-04: the plan chosen on /pricing or on step 4 survives the sign-up
 *     and the WhatsApp code (pendingPlan.ts keeps it with its cycle), then
 *     leads to /checkout while online payment is on and the plan is sold
 *     online, otherwise to /pricing, where a signed-in account lands on its
 *     own plans (and the request flow when payment is off).
 *
 * Pure: relative imports only, so `node --test` loads it (signupPlan.test.ts)
 * and client pages may import it (no node: modules in this chain).
 */
import { checkoutHref } from "../payments/checkoutView.ts";
import { bookEntry, isOnSale, offeredBillings, PROFESSIONAL_CYCLES, type Billing, type Cycle } from "./priceBook.ts";

/** The six cards of /register/provider step 1 (types.ts ProviderType, minus null). */
export type ProviderRole = "lawyer" | "firm" | "notary" | "tracker" | "arbitrator" | "consultant";

/** The free card's id (no plan is bought; the account starts free). */
export const FREE_SIGNUP_PLAN = "free";

/** /pricing's tab for a role — where the cards' names, descriptions and features are written. */
export type ProviderPlanAudience = "lawyers" | "firms" | "providers";

const PAID_PLANS: Readonly<Record<ProviderRole, readonly string[]>> = Object.freeze({
  // «إدارة المكتب» and the bundle with the library: lawyers only in the book.
  lawyer: Object.freeze(["lawyer-pro", "lawyer-bundle"]),
  // «مكتب المحاماة» (5 seats) and «شركة المحاماة» (15 seats).
  firm: Object.freeze(["firm-basic", "firm-enterprise"]),
  // l16 A-15: an independent consultant buys his own plan, never lawyer-pro or the bundle.
  consultant: Object.freeze(["consultant-independent"]),
  notary: Object.freeze([]),
  tracker: Object.freeze([]),
  arbitrator: Object.freeze([]),
});

const AUDIENCE: Readonly<Record<ProviderRole, ProviderPlanAudience>> = Object.freeze({
  lawyer: "lawyers",
  firm: "firms",
  consultant: "providers",
  notary: "providers",
  tracker: "providers",
  arbitrator: "providers",
});

/** /pricing's own ?plan= spellings that are not book ids. */
const PLAN_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  independent: "consultant-independent",
});

export function isProviderRole(v: unknown): v is ProviderRole {
  return typeof v === "string" && Object.hasOwn(PAID_PLANS, v);
}

export function providerPlanAudience(role: ProviderRole): ProviderPlanAudience {
  return AUDIENCE[role];
}

/** The paid plans the role's step 4 shows, in order — only what the book sells today. */
export function providerPaidPlanIds(role: ProviderRole): string[] {
  return PAID_PLANS[role].filter((id) => {
    const entry = bookEntry(id);
    return entry !== undefined && isOnSale(entry);
  });
}

/**
 * The cycle switch of step 4: the professionals' cycles (quarterly, half-yearly,
 * yearly — never monthly) that at least one of the role's plans is sold in.
 * Empty when the role has no paid plan (no switch shown).
 */
export function providerPlanCycles(role: ProviderRole): Cycle[] {
  const sold = new Set<Billing>();
  for (const id of providerPaidPlanIds(role)) for (const b of offeredBillings(bookEntry(id)!)) sold.add(b);
  return PROFESSIONAL_CYCLES.filter((c) => sold.has(c));
}

/** The cycle a plan is shown and bought in: the picked one when the plan sells it, else its first sold cycle. */
export function planCycleFor(planId: string, picked: Cycle): Cycle | null {
  const entry = bookEntry(planId);
  if (!entry || !isOnSale(entry)) return null;
  const sold = offeredBillings(entry).filter((b): b is Cycle => b !== "once" && PROFESSIONAL_CYCLES.includes(b as Cycle));
  if (sold.includes(picked)) return picked;
  return sold.includes("yearly") ? "yearly" : sold[0] ?? null;
}

/**
 * A /pricing link's `?plan=` (and `?type=`) read on /register/provider: the
 * role it belongs to and the plan to preselect, or null (unknown id, a plan
 * of another role, a plan not sold any more, or a type that disagrees).
 */
export function providerPlanFromParams(
  plan: string | null | undefined,
  type: string | null | undefined,
): { role: ProviderRole; planId: string } | null {
  const raw = typeof plan === "string" ? plan.trim() : "";
  if (!raw) return null;
  const planId = Object.hasOwn(PLAN_ALIASES, raw) ? PLAN_ALIASES[raw] : raw;
  const roles: ProviderRole[] = isProviderRole(type)
    ? [type]
    : (Object.keys(PAID_PLANS) as ProviderRole[]);
  for (const role of roles) {
    if (providerPaidPlanIds(role).includes(planId)) return { role, planId };
  }
  return null;
}

/** A /pricing `?billing=` value as a professional cycle, or null. */
export function cycleFromParam(v: string | null | undefined): Cycle | null {
  return typeof v === "string" && (PROFESSIONAL_CYCLES as readonly string[]).includes(v) ? (v as Cycle) : null;
}

/**
 * Where a plan chosen before sign-up leads once the account exists (after the
 * WhatsApp code, or on the last step when no code is asked): /checkout for a
 * plan sold online while the gateway takes payments (the checkout page itself
 * says when this account cannot buy it yet — a licence under review, another
 * account type), otherwise /pricing, where a signed-in account lands on its
 * own plans. null when nothing was chosen (or the free card).
 */
export function pendingPlanHref(
  choice: { plan: string; billing: string | null } | null | undefined,
  gatewayOn: boolean,
): string | null {
  if (!choice || !choice.plan || choice.plan === FREE_SIGNUP_PLAN) return null;
  const billing: Billing =
    choice.billing && ["monthly", "quarterly", "semiannual", "yearly", "once"].includes(choice.billing)
      ? (choice.billing as Billing)
      : "yearly";
  const href = checkoutHref(choice.plan, billing, gatewayOn, true) ?? checkoutHref(choice.plan, "yearly", gatewayOn, true);
  return href ?? "/pricing";
}

/**
 * LIVE-04: /pricing's subscribe links for a guest carry the cycle on screen
 * (`&billing=`), so the sign-up form opens on it. Only a link to a sign-up
 * form gains it; any other link is returned untouched.
 */
export function withSignupBilling(href: string, billing: string): string {
  if (!/^\/register\/(?:provider|client)(?:\?|$)/.test(href)) return href;
  if (!["monthly", "quarterly", "semiannual", "yearly"].includes(billing)) return href;
  if (/[?&]billing=/.test(href)) return href;
  return `${href}${href.includes("?") ? "&" : "?"}billing=${billing}`;
}
