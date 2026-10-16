import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PENDING_PLAN_KEY,
  PENDING_PLAN_TTL_MS,
  clearPendingPlan,
  planAudienceForUserType,
  readPendingPlan,
  savePendingPlan,
  sessionStorageOrNull,
  type PlanStorage,
} from "./pendingPlan.ts";

function memoryStorage(): PlanStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: PlanStorage = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceededError"); },
  removeItem() { throw new Error("SecurityError"); },
};

const T0 = 1_760_000_000_000;

test("a plan saved before the OAuth call is read back after it", () => {
  const s = memoryStorage();
  assert.equal(savePendingPlan(s, " ind-ai ", T0), true);
  assert.equal(readPendingPlan(s, T0 + 5 * 60 * 1000), "ind-ai");
  clearPendingPlan(s);
  assert.equal(readPendingPlan(s, T0), null);
  assert.equal(s.data.has(PENDING_PLAN_KEY), false);
});

test("nothing is saved for no plan or a value that is not a plan id", () => {
  for (const v of [null, undefined, "", "   ", "IND-AI", "ind ai", "<script>", "a".repeat(65), "/ind-ai"]) {
    const s = memoryStorage();
    assert.equal(savePendingPlan(s, v, T0), false, String(v));
    assert.equal(s.data.size, 0, String(v));
  }
});

test("an expired, future-dated or malformed entry reads as no plan", () => {
  const s = memoryStorage();
  savePendingPlan(s, "micro-shield", T0);
  assert.equal(readPendingPlan(s, T0 + PENDING_PLAN_TTL_MS), "micro-shield");
  assert.equal(readPendingPlan(s, T0 + PENDING_PLAN_TTL_MS + 1), null);
  assert.equal(readPendingPlan(s, T0 - 1), null);
  for (const raw of ["not json", "null", "42", '{"plan":"ind-ai"}', '{"plan":7,"at":1}', '{"plan":"IND","at":1}']) {
    s.setItem(PENDING_PLAN_KEY, raw);
    assert.equal(readPendingPlan(s, T0), null, raw);
  }
});

test("storage that is missing or throws never breaks the caller", () => {
  assert.equal(savePendingPlan(null, "ind-ai"), false);
  assert.equal(savePendingPlan(throwing, "ind-ai"), false);
  assert.equal(readPendingPlan(undefined), null);
  assert.equal(readPendingPlan(throwing), null);
  assert.doesNotThrow(() => clearPendingPlan(throwing));
  assert.doesNotThrow(() => clearPendingPlan(null));
  // Node has no sessionStorage: the getter reports none instead of throwing.
  assert.equal(sessionStorageOrNull(), null);
});

test("the plan audience follows profiles.user_type, not the signup picker id", () => {
  assert.equal(planAudienceForUserType("individual"), "individuals");
  assert.equal(planAudienceForUserType("corporate"), "companies");
  assert.equal(planAudienceForUserType("micro"), "micro");
  assert.equal(planAudienceForUserType("government"), "government");
  assert.equal(planAudienceForUserType("ngo"), "ngo");
  for (const t of ["company", "lawyer", "firm", "provider", "admin", "", null, undefined]) {
    assert.equal(planAudienceForUserType(t), null, String(t));
  }
});

// The wiring. Source checks, like planRequest.test.ts: the pages are .tsx.
test("/register/client stashes the plan BEFORE the Google call and keeps redirectTo bare", () => {
  const page = readFileSync(new URL("../../app/register/client/page.tsx", import.meta.url), "utf8");
  const save = page.indexOf("savePendingPlan(sessionStorageOrNull(), planParam)");
  const oauth = page.indexOf("signInWithOAuth(");
  assert.ok(save > 0 && oauth > save, "savePendingPlan runs before signInWithOAuth");
  // No query string on redirectTo: GoTrue's allow-list must keep accepting it.
  assert.match(page, /redirectTo: `\$\{window\.location\.origin\}\/auth\/callback` \}/);
  assert.doesNotMatch(page, /auth\/callback\?/);
});

test("onboarding offers the stashed plan on its last step and clears it", () => {
  const page = readFileSync(new URL("../../app/onboarding/page.tsx", import.meta.url), "utf8");
  assert.match(page, /readPendingPlan\(sessionStorageOrNull\(\)\)/);
  assert.match(page, /clearPendingPlan\(sessionStorageOrNull\(\)\)/);
  assert.match(page, /resolveRequestedPlan\(/);
  assert.match(page, /planAudienceForUserType\(/);
  assert.match(page, /<PlanRequestCard plan=\{requestedPlan\} canRequestNow \/>/);
});
