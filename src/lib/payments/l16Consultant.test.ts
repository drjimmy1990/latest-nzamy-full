/**
 * l16 (A-14/15/16/17/18): the independent consultant's leftovers, as source
 * contracts on the pages (the rules themselves are tested next to them:
 * checkoutCore.test.ts, audienceForUserType.test.ts, navigation.navbar.test.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("A-16 / A-17: the /checkout page refuses an independent consultant before the card form, and a failed read too", () => {
  const page = read("../../app/checkout/page.tsx");
  assert.match(page, /CONSULTANT_REFUSED_PLAN_IDS\.has\(item\.id\)/);
  assert.match(page, /if \(standing\.readFailed\) return <Notice title=\{CONSULTANT_CHECK_FAILED_AR\} \/>/);
  assert.match(page, /if \(standing\.scopeKind === "consultant"\) return <Notice title=\{CONSULTANT_PLAN_REFUSED_AR\} \/>/);
  // before the payment form is rendered
  assert.ok(page.indexOf("CONSULTANT_PLAN_REFUSED_AR} />") < page.indexOf("<MoyasarCheckout"));
});

test("A-18: the profile page shows no «الخدمات» tab to an independent consultant and never loads it", () => {
  const page = read("../../app/dashboard/lawyer/profile/page.tsx");
  assert.match(page, /const shownTabs = independentConsultant \? TABS\.filter\(\(t\) => t\.id !== "services"\) : TABS;/);
  assert.match(page, /\{shownTabs\.map\(\(t\) => \(/);
  assert.match(page, /!servicesRequested && !independentConsultant/);
});

test("A-15: /pricing drops the consultant-refused columns from the comparison table too", () => {
  const page = read("../../app/pricing/page.tsx");
  assert.match(page, /const comparisonPlans = withoutConsultantRefusedPlans\(/);
  assert.match(page, /const cardPlanList   = withoutConsultantRefusedPlans\(/);
});
