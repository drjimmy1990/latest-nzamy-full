/**
 * signupPlan.test.ts — batch l18 (owner package 26 Nov 2026):
 *   LIVE-03: step 4 of /register/provider shows each role its own plans from
 *            the price book, the free card by default, no ✓ over the price;
 *   LIVE-04: the chosen plan (and cycle) survives the sign-up and the code
 *            and leads to /checkout (gateway on) or /pricing.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/pricing/signupPlan.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cycleFromParam,
  FREE_SIGNUP_PLAN,
  pendingPlanHref,
  planCycleFor,
  providerPaidPlanIds,
  providerPlanAudience,
  providerPlanCycles,
  providerPlanFromParams,
  withSignupBilling,
} from "./signupPlan.ts";
import { bookEntry, isOnSale } from "./priceBook.ts";
import { PROVIDER_TYPE_IDS } from "../../app/register/provider/signupMetadata.ts";
import {
  PENDING_PLAN_KEY,
  readPendingPlan,
  readPendingPlanChoice,
  savePendingPlan,
  savePendingPlanChoice,
  type PlanStorage,
} from "./pendingPlan.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function memoryStorage(): PlanStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

test("LIVE-03: each role sees exactly its own price-book plans", () => {
  assert.deepEqual(providerPaidPlanIds("firm"), ["firm-basic", "firm-enterprise"]);
  assert.deepEqual(providerPaidPlanIds("lawyer"), ["lawyer-pro", "lawyer-bundle"]);
  // l16 A-15: a consultant is never offered lawyer-pro or the bundle.
  assert.deepEqual(providerPaidPlanIds("consultant"), ["consultant-independent"]);
  for (const r of ["notary", "tracker", "arbitrator"] as const) assert.deepEqual(providerPaidPlanIds(r), [], r);
  // Every card of the picker has a row; every paid id is on sale and sold to that role.
  const buyerType = { lawyer: "lawyer", consultant: "lawyer", firm: "firm" } as const;
  for (const role of PROVIDER_TYPE_IDS) {
    for (const id of providerPaidPlanIds(role)) {
      const entry = bookEntry(id)!;
      assert.ok(entry && isOnSale(entry), `${id} on sale`);
      const buyers = entry.buyers;
      assert.ok(buyers === "any" || buyers.includes(buyerType[role as keyof typeof buyerType]), `${id} sold to ${role}`);
    }
  }
  assert.equal(providerPlanAudience("lawyer"), "lawyers");
  assert.equal(providerPlanAudience("firm"), "firms");
  assert.equal(providerPlanAudience("consultant"), "providers");
});

test("LIVE-03: the cycle switch offers the professionals' cycles only (no monthly)", () => {
  assert.deepEqual(providerPlanCycles("firm"), ["quarterly", "semiannual", "yearly"]);
  assert.deepEqual(providerPlanCycles("lawyer"), ["quarterly", "semiannual", "yearly"]);
  assert.deepEqual(providerPlanCycles("consultant"), ["yearly"]);
  assert.deepEqual(providerPlanCycles("notary"), []);
  // A plan not sold in the picked cycle falls back to yearly.
  assert.equal(planCycleFor("consultant-independent", "quarterly"), "yearly");
  assert.equal(planCycleFor("firm-enterprise", "semiannual"), "semiannual");
  assert.equal(planCycleFor("no-such-plan", "yearly"), null);
});

test("LIVE-04: /pricing's ?plan= picks the role and the plan; anything else picks nothing", () => {
  assert.deepEqual(providerPlanFromParams("lawyer-pro", null), { role: "lawyer", planId: "lawyer-pro" });
  assert.deepEqual(providerPlanFromParams("lawyer-bundle", undefined), { role: "lawyer", planId: "lawyer-bundle" });
  assert.deepEqual(providerPlanFromParams("firm-enterprise", "firm"), { role: "firm", planId: "firm-enterprise" });
  assert.deepEqual(providerPlanFromParams("independent", "consultant"), { role: "consultant", planId: "consultant-independent" });
  assert.equal(providerPlanFromParams("lawyer-pro", "consultant"), null, "a consultant never gets lawyer-pro");
  assert.equal(providerPlanFromParams("firm-basic", "lawyer"), null);
  assert.equal(providerPlanFromParams("pro", "service"), null, "provider-pro is not sold online");
  assert.equal(providerPlanFromParams("ind-ai", null), null);
  assert.equal(providerPlanFromParams("", "lawyer"), null);
  assert.equal(providerPlanFromParams(null, "lawyer"), null);
  assert.equal(cycleFromParam("semiannual"), "semiannual");
  assert.equal(cycleFromParam("monthly"), null, "professionals never pay monthly");
  assert.equal(cycleFromParam("weekly"), null);
});

test("LIVE-04: a pending plan leads to /checkout with the gateway on, else /pricing", () => {
  assert.equal(pendingPlanHref({ plan: "firm-basic", billing: "quarterly" }, true), "/checkout?item=firm-basic&billing=quarterly");
  assert.equal(pendingPlanHref({ plan: "lawyer-pro", billing: null }, true), "/checkout?item=lawyer-pro&billing=yearly");
  assert.equal(pendingPlanHref({ plan: "ind-ai", billing: "yearly" }, true), "/checkout?item=ind-ai&billing=yearly");
  // A retired cycle falls back to the yearly price that is sold.
  assert.equal(pendingPlanHref({ plan: "ind-ai", billing: "monthly" }, true), "/checkout?item=ind-ai&billing=yearly");
  assert.equal(pendingPlanHref({ plan: "firm-basic", billing: "yearly" }, false), "/pricing");
  // A plan not sold online (a request plan) goes to the plans page.
  assert.equal(pendingPlanHref({ plan: "micro-shield", billing: null }, true), "/pricing");
  assert.equal(pendingPlanHref({ plan: FREE_SIGNUP_PLAN, billing: null }, true), null);
  assert.equal(pendingPlanHref(null, true), null);
});

test("LIVE-04: the pending plan keeps its cycle and still reads the older shape", () => {
  const s = memoryStorage();
  const T = 1_760_000_000_000;
  assert.equal(savePendingPlanChoice(s, "firm-basic", "quarterly", T), true);
  assert.deepEqual(readPendingPlanChoice(s, T + 1000), { plan: "firm-basic", billing: "quarterly" });
  assert.equal(readPendingPlan(s, T + 1000), "firm-basic");
  assert.equal(savePendingPlanChoice(s, "firm-basic", "fortnightly", T), true);
  assert.deepEqual(readPendingPlanChoice(s, T), { plan: "firm-basic", billing: null }, "an unknown cycle is dropped");
  assert.equal(savePendingPlan(s, "ind-ai", T), true);
  assert.deepEqual(readPendingPlanChoice(s, T), { plan: "ind-ai", billing: null });
  s.setItem(PENDING_PLAN_KEY, JSON.stringify({ plan: "ind-ai", at: T, billing: 5 }));
  assert.deepEqual(readPendingPlanChoice(s, T), { plan: "ind-ai", billing: null });
  assert.equal(savePendingPlanChoice(s, "BAD ID", "yearly", T), false);
});

test("LIVE-04: /pricing's guest links to a sign-up form carry the cycle", () => {
  assert.equal(withSignupBilling("/register/provider?plan=lawyer-pro", "semiannual"), "/register/provider?plan=lawyer-pro&billing=semiannual");
  assert.equal(withSignupBilling("/register/client?type=individual&plan=ind-ai", "yearly"), "/register/client?type=individual&plan=ind-ai&billing=yearly");
  assert.equal(withSignupBilling("/register/provider", "yearly"), "/register/provider?billing=yearly");
  assert.equal(withSignupBilling("/contact?type=firm-seats", "yearly"), "/contact?type=firm-seats");
  assert.equal(withSignupBilling("/laws/subscribe?plan=lib-q1", "yearly"), "/laws/subscribe?plan=lib-q1");
  assert.equal(withSignupBilling("/register/provider?billing=yearly", "quarterly"), "/register/provider?billing=yearly");
  assert.equal(withSignupBilling("/register/provider?plan=x", "once"), "/register/provider?plan=x");
  const cards = code("src/components/pricing/PricingCards.tsx");
  assert.match(cards, /href=\{withSignupBilling\(cta\.ctaHref, billing\)\}/);
  const firms = read("src/constants/pricing/pricing.firms.ts");
  assert.equal(firms.split('ctaHref: "/register/provider?type=firm&plan=firm-basic"').length - 1, 2);
  assert.equal(firms.split('ctaHref: "/register/provider?type=firm&plan=firm-enterprise"').length - 1, 2);
});

test("LIVE-03 wiring: step 4 reads the role's plans, defaults to free, ✓ never over the price", () => {
  const page = code("src/app/register/provider/page.tsx");
  assert.match(page, /useState<string>\(FREE_SIGNUP_PLAN\)/);
  assert.match(page, /<Step4 key="s4" isAr=\{isAr\} providerType=\{providerType\} selectedPlan=\{selectedPlan\} onSelect=\{setSelectedPlan\} cycle=\{planCycle\} onCycle=\{setPlanCycle\} \/>/);
  assert.match(page, /const tier = "free" as const;/, "nothing paid at sign-up");
  assert.match(page, /onboarding_completed: true,/, "LIVE-01: the provider form is not followed by the wizard");
  assert.doesNotMatch(page, /useState\("ai"\)/);
  const steps = code("src/app/register/provider/components/Steps.tsx");
  assert.match(steps, /providerPaidPlanIds\(providerType\)/);
  assert.match(steps, /getPlanList\(providerPlanAudience\(providerType\), isAr\)/);
  assert.match(steps, /cardLaunch\(plan, planCycle, launch, lang\)/);
  assert.match(steps, /const launch = useLaunchPrices\(\);/);
  const step4 = steps.slice(steps.indexOf("export function Step4("), steps.indexOf("export function Step5("));
  assert.ok(step4.length > 0);
  assert.doesNotMatch(step4, /absolute top-3 end-3/, "the ✓ is beside the name, not over the price");
  assert.doesNotMatch(steps, /نظامي لايت|ذكاء نظامي|نظامي برو/, "no old plan names on step 5");
  assert.doesNotMatch(step4, /features\.slice\(0, 3\)/, "the fourth bullet (the 14,900 plan) is no longer hidden");
  const data = read("src/app/register/provider/data.ts");
  assert.doesNotMatch(data, /ERP مجاني|إدارة القضايا"|الجلسات والمهل"|المهام والتقويم"/, "the free card promises nothing the free account lacks");
  assert.doesNotMatch(data, /export const plans\b/);
});

test("LIVE-04 wiring: the plan survives the code and is offered afterwards", () => {
  const verify = code("src/app/verify-phone/page.tsx");
  assert.match(verify, /home && home !== "\/onboarding" \? readPendingPlanChoice\(storage\) : null/, "a Google sign-up keeps its plan for the wizard");
  assert.match(verify, /pendingPlanHref\(choice, await gatewayOnNow\(\)\)/);
  assert.match(verify, /window\.location\.assign\(planHref \?\? home \?\? "\/"\)/);
  const client = code("src/app/register/client/page.tsx");
  assert.match(client, /savePendingPlanChoice\(sessionStorageOrNull\(\), requestedPlan\?\.id \?\? planParam, billingParam\);\s*window\.location\.assign\("\/verify-phone"\);/);
  const provider = code("src/app/register/provider/page.tsx");
  assert.match(provider, /step === 5 && signupHasSession && !phoneStepPending && selectedBilling && \(/);
  assert.match(provider, /<SignupPlanNextStep planId=\{selectedPlan\} billing=\{selectedBilling\} isAr=\{isAr\} \/>/);
  const card = code("src/components/pricing/PlanRequestCard.tsx");
  assert.match(card, /checkoutHref\(plan\.id, isBilling\(billing\) \? billing : "yearly", gatewayAllowsCheckout\(payments\), true\)/);
});
