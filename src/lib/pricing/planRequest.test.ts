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

test("a link to the retired family plan asks for «التأمين القانوني», which now carries the family cover", () => {
  // Owner ٢١٣/١٧٦: the 699 «ind-family» plan is merged into ind-litigation.
  // An old ?plan=ind-family link, or one saved by pendingPlan before the
  // deploy, resolves to the plan that sells the family option now.
  const individuals: RequestablePlan[] = [
    { id: "ind-ai", name: "الباقة الذكية (AI الذاتي)", ctaHref: "/register/client?type=individual&plan=ind-ai" },
    { id: "ind-litigation", name: "التأمين القانوني", ctaHref: "/register/client?type=individual&plan=ind-litigation" },
  ];
  assert.deepEqual(resolveRequestedPlan("ind-family", individuals), { id: "ind-litigation", name: "التأمين القانوني" });
  assert.deepEqual(resolveRequestedPlan(" ind-family ", individuals), { id: "ind-litigation", name: "التأمين القانوني" });
  // Not for an audience that does not sell it.
  assert.equal(resolveRequestedPlan("ind-family", PLANS), null);
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
  // individuals 3 plans + the 100 / 250 top-ups (owner ٣٠٢) × 2 languages
  // (the 699 family plan merged into «التأمين القانوني», owner ٢١٣/١٧٦),
  // micro 1 × 2, ngo 2 × 2
  assert.equal(seen, 16);
});

// ── N5 (fix plan 2026-10-16): the library checkout path ─────────────────────

test("planFromParam keeps only a plan the page sells", async () => {
  const { planFromParam } = await import("./planRequest.ts");
  const ids = ["lib-q1", "lib-annual"];
  assert.equal(planFromParam("lib-q1", ids), "lib-q1");
  assert.equal(planFromParam(" lib-annual ", ids), "lib-annual");
  for (const v of [null, undefined, "", "lib-quarterly", "free", "LIB-Q1"]) {
    assert.equal(planFromParam(v, ids), null, String(v));
  }
});

test("the paywall and every library CTA send the id /laws/subscribe knows", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const subscribe = read("../../app/laws/subscribe/page.tsx");
  const subscribeIds = new Set([...subscribe.matchAll(/id: "(lib-[\w-]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...subscribeIds].sort(), ["lib-annual", "lib-q1", "lib-q2"]);

  const paywall = read("../../app/laws/components/PaywallModal.tsx");
  const paywallIds = [...paywall.matchAll(/id: "(lib-[\w-]+)"/g)].map((m) => m[1]);
  assert.ok(paywallIds.length > 0);
  for (const id of paywallIds) assert.ok(subscribeIds.has(id), `paywall plan ${id}`);
  assert.match(paywall, /href=\{`\/laws\/subscribe\?plan=\$\{plan\.id\}`\}/);

  for (const rel of ["./plans.ts", "../../constants/pricing/pricing.library.ts"]) {
    for (const m of read(rel).matchAll(/\/laws\/subscribe\?plan=([\w-]+)/g)) {
      assert.ok(subscribeIds.has(m[1]), `${rel}: ?plan=${m[1]}`);
    }
  }
});

test("/laws/subscribe marks the ?plan= it was sent and takes a guest to /login and back", () => {
  const src = readFileSync(new URL("../../app/laws/subscribe/page.tsx", import.meta.url), "utf8");
  assert.match(src, /planFromParam\(\s*new URLSearchParams\(window\.location\.search\)\.get\("plan"\),/);
  assert.match(src, /chosenPlanId === plan\.id && \(/);
  // Arriving with a plan never sends a request: only the button does.
  // The ?plan= effect, from its state up to the effect's closing `}, []);`.
  const effectStart = src.indexOf("const [chosenPlanId");
  const effectEnd = src.indexOf("}, []);", effectStart);
  assert.ok(effectStart >= 0 && effectEnd > effectStart, "the ?plan= effect was not found");
  const effect = src.slice(effectStart, effectEnd);
  assert.match(effect, /setChosenPlanId\(chosen\)/);
  assert.doesNotMatch(effect, /requestEntitlement|handleSubscribe/);
  assert.match(src, /window\.location\.href = `\/login\?next=\$\{encodeURIComponent\(`\/laws\/subscribe\?plan=\$\{planId\}`\)\}`;/);
  assert.doesNotMatch(src, /useSearchParams\(|import[^;]*useSearchParams/);
});
