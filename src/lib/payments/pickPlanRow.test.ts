/**
 * pickPlanRow.test.ts — the deterministic plan-row choice for a
 * (tier, audience) grant (B1 Task 1 fix round 1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { pickPlanRow } from "./pickPlanRow.ts";

test("a plan sold today wins over an older catalog row, whatever the row order", () => {
  assert.equal(pickPlanRow([{ id: "individual-ai" }, { id: "ind-ai" }]), "ind-ai");
  assert.equal(pickPlanRow([{ id: "ind-ai" }, { id: "individual-ai" }]), "ind-ai");
  assert.equal(pickPlanRow([{ id: "individual-pro" }, { id: "ind-preventive" }]), "ind-preventive");
  assert.equal(pickPlanRow([{ id: "provider-pro" }, { id: "consultant-independent" }]), "consultant-independent");
  assert.equal(pickPlanRow([{ id: "firm-corp" }, { id: "firm-basic" }]), "firm-basic");
});

test("two sold candidates: the lowest id of them", () => {
  assert.equal(pickPlanRow([{ id: "lawyer-pro" }, { id: "consultant-independent" }]), "consultant-independent");
});

test("no sold candidate: the lowest id", () => {
  assert.equal(pickPlanRow([{ id: "micro-ai" }, { id: "lawyer-ai" }, { id: "individual-ai" }]), "individual-ai");
  assert.equal(pickPlanRow([{ id: "firm-pro" }]), "firm-pro");
});

test("empty, null or id-less input → null", () => {
  assert.equal(pickPlanRow([]), null);
  assert.equal(pickPlanRow(null), null);
  assert.equal(pickPlanRow(undefined), null);
  assert.equal(pickPlanRow([{ id: null }, { id: "" }]), null);
});

test("both resolvers use pickPlanRow and no longer take an unordered .limit(1) plan", () => {
  for (const rel of ["../entitlements.ts", "../../app/api/v1/admin/subscriptions/route.ts"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    const start = src.indexOf('.from("subscription_plans")');
    assert.ok(start > -1, `${rel}: no subscription_plans lookup found`);
    assert.ok(src.includes("pickPlanRow("), `${rel}: does not call pickPlanRow`);
    const lookups = src.split('.from("subscription_plans")').slice(1).map((s) => s.slice(0, 200));
    for (const l of lookups) {
      if (!l.includes('.eq("tier"')) continue;
      assert.ok(!l.includes(".limit(1)"), `${rel}: a tier lookup still takes .limit(1)`);
    }
  }
});
