import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { planEntitlementRequest, planParamOf, resolveRequestedPlan, type RequestablePlan } from "./planRequest.ts";

// ── planEntitlementRequest ──────────────────────────────────────────────────

test("the request carries the plan id as requested_ref and the name as note", () => {
  assert.deepEqual(planEntitlementRequest({ id: "ind-preventive", name: "الباقة الوقائية (استشارات وعقود)" }), {
    kind: "plan",
    requested_ref: "ind-preventive",
    note: "الباقة الوقائية (استشارات وعقود)",
  });
});

test("library plans on /pricing go out with the same kind /laws/subscribe uses", () => {
  assert.equal(planEntitlementRequest({ id: "lib-q2", name: "نصف سنوي" }, { libraryMode: true }).kind, "library");
  assert.equal(planEntitlementRequest({ id: "lib-q2", name: "نصف سنوي" }, { libraryMode: false }).kind, "plan");
});

// ── planParamOf ─────────────────────────────────────────────────────────────

test("planParamOf reads the plan query value", () => {
  assert.equal(planParamOf("/register/client?type=individual&plan=ind-ai"), "ind-ai");
  assert.equal(planParamOf("/register/client?type=micro"), null);
  assert.equal(planParamOf("/contact"), null);
  assert.equal(planParamOf("/register/client?plan="), null);
});

// ── resolveRequestedPlan ────────────────────────────────────────────────────

const PLANS: RequestablePlan[] = [
  { id: "micro-free", name: "المراقب المجاني", ctaHref: "/register/client?type=micro" },
  { id: "micro-shield", name: "درع المنشأة", ctaHref: "/register/client?type=micro&plan=micro-shield" },
  { id: "ngo-x", name: "خطة بلا رابط تسجيل", ctaHref: "/contact?type=ngo" },
  { id: "stale", name: "رابط يحمل معرفاً آخر", ctaHref: "/register/client?type=micro&plan=shield" },
];

test("a plan whose own CTA leads to this signup resolves to its id and name", () => {
  assert.deepEqual(resolveRequestedPlan("micro-shield", PLANS), { id: "micro-shield", name: "درع المنشأة" });
  assert.deepEqual(resolveRequestedPlan("  micro-shield ", PLANS), { id: "micro-shield", name: "درع المنشأة" });
});

test("no param, unknown or retired ids resolve to nothing", () => {
  assert.equal(resolveRequestedPlan(null, PLANS), null);
  assert.equal(resolveRequestedPlan("", PLANS), null);
  assert.equal(resolveRequestedPlan("shield", PLANS), null); // retired value, not an id
  assert.equal(resolveRequestedPlan("group", PLANS), null);
  assert.equal(resolveRequestedPlan("ind-ai", PLANS), null); // another account type's plan
});

test("a plan not sold through this signup is not offered", () => {
  assert.equal(resolveRequestedPlan("micro-free", PLANS), null); // free: its CTA names no plan
  assert.equal(resolveRequestedPlan("ngo-x", PLANS), null); // sold via /contact
  assert.equal(resolveRequestedPlan("stale", PLANS), null); // CTA names a different id
});

// ── Catalogue invariant: every `?plan=` a pricing CTA sends is its own id ───
//
// The constants import phosphor icons at runtime, so they are read as text and
// cut at each `id: "…"`.

const PRICING_FILES = [
  "pricing.individuals.ts",
  "pricing.micro.ts",
  "pricing.ngo.ts",
  "pricing.companies.ts",
  "pricing.companies.legaldept.ts",
  "pricing.government.ts",
];

test("every client-registration CTA carries its own plan id in ?plan=", () => {
  let seen = 0;
  for (const file of PRICING_FILES) {
    const text = readFileSync(new URL(`../../constants/pricing/${file}`, import.meta.url), "utf8");
    for (const block of text.split(/\bid: "/).slice(1)) {
      const id = block.slice(0, block.indexOf('"'));
      const href = block.match(/ctaHref: "([^"]*)"/)?.[1];
      if (!href || !href.startsWith("/register/client")) continue;
      const param = planParamOf(href);
      if (param === null) continue;
      assert.equal(param, id, `${file}: plan ${id} sends ?plan=${param}`);
      seen++;
    }
  }
  // individuals 4 × 2 languages, micro 1 × 2, ngo 2 × 2
  assert.equal(seen, 14);
});
