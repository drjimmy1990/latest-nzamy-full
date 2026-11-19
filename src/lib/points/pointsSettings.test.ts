/**
 * pointsSettings.test.ts — the batch l7 points settings (owner 18 Nov 2026):
 * defaults equal to what 20261127_40 seeds, the admin validators, the
 * fall-back to defaults on a missing or malformed value, and the admin route
 * accepting the four keys with their validators.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeDb } from "../payments/fakeDb.test-helper.ts";
import {
  DEFAULT_FREE_QUESTIONS,
  DEFAULT_GIFT_VALID_DAYS,
  DEFAULT_LIBRARY_PLAN_POINTS,
  DEFAULT_MIN_TOPUP_SAR,
  freeQuestionsIssue,
  giftExpiry,
  giftValidDaysIssue,
  libraryPlanPointsIssue,
  libraryPlanPointsLine,
  parseGiftValidDays,
  parseLibraryPlanPoints,
  readGiftValidDays,
  readLibraryPlanPoints,
} from "./pointsSettings.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261127_40_points_wallets.sql"), "utf8");

test("the code defaults are what the migration seeds", () => {
  assert.deepEqual(DEFAULT_LIBRARY_PLAN_POINTS, { "lib-q1": 50, "lib-q2": 120, "lib-annual": 300 });
  assert.match(sql, /'library_plan_points', '\{"lib-q1": 50, "lib-q2": 120, "lib-annual": 300\}'::jsonb/);
  assert.equal(DEFAULT_GIFT_VALID_DAYS, 90);
  assert.match(sql, /'gift_valid_days', '90'::jsonb/);
  assert.deepEqual(DEFAULT_FREE_QUESTIONS, { lawyer: 10, individual: 5 });
  assert.match(sql, /'free_questions_by_account_type', '\{"lawyer": 10, "individual": 5\}'::jsonb/);
  // l9 (owner register 14 item 7): 50 for every account type — 20261129_30
  // UPDATEs the stored map (it overwrites on purpose: the owner's decision)
  // and inserts the same full map when the row is missing.
  const l9 = readFileSync(join(ROOT, "supabase", "migrations", "20261129_30_l9_terms_pricing.sql"), "utf8");
  assert.equal(Object.keys(DEFAULT_MIN_TOPUP_SAR).length, 8);
  for (const [t, n] of Object.entries(DEFAULT_MIN_TOPUP_SAR)) {
    assert.equal(n, 50, t);
    assert.match(l9, new RegExp(`"${t}": 50`), t);
    assert.match(l9, new RegExp(`'${t}'`), `${t} is in the UPDATE's key list`);
  }
  assert.match(l9, /jsonb_object_agg\(k\.key, 50\)/);
  assert.match(l9, /where ps\.key = 'min_topup_by_account_type'/);
});

test("validators refuse what would silently misprice", () => {
  assert.equal(libraryPlanPointsIssue({ "lib-q1": 60 }), null);
  assert.notEqual(libraryPlanPointsIssue({ "lib-x": 60 }), null, "unknown plan");
  assert.notEqual(libraryPlanPointsIssue({ "lib-q1": 1.5 }), null);
  assert.notEqual(libraryPlanPointsIssue([50]), null);
  assert.equal(giftValidDaysIssue(90), null);
  assert.notEqual(giftValidDaysIssue(0), null);
  assert.notEqual(giftValidDaysIssue("90"), null);
  assert.equal(freeQuestionsIssue({ lawyer: 10, individual: 5 }), null);
  assert.notEqual(freeQuestionsIssue({ lawyer: -1 }), null);
});

test("readers fall back to the defaults on a missing or malformed value", async () => {
  assert.deepEqual(parseLibraryPlanPoints({ "lib-annual": 400 }), { "lib-q1": 50, "lib-q2": 120, "lib-annual": 400 });
  assert.deepEqual(parseLibraryPlanPoints("x"), { ...DEFAULT_LIBRARY_PLAN_POINTS });
  assert.equal(parseGiftValidDays(undefined), 90);
  assert.equal(parseGiftValidDays(30), 30);
  const failing = fakeDb(() => ({ error: { code: "57014", message: "timeout" } }));
  assert.equal(await readGiftValidDays(failing.client), 90);
  assert.equal(await readLibraryPlanPoints(failing.client, "lib-q1"), 50);
  assert.equal(await readLibraryPlanPoints(failing.client, "lib-founder"), 0);
});

test("a gift ends gift_valid_days after now", () => {
  assert.equal(giftExpiry(new Date("2026-11-20T00:00:00.000Z"), 90).toISOString(), "2027-02-18T00:00:00.000Z");
});

test("the admin credits route and the entitlements grant use gift_valid_days, not one year", () => {
  for (const f of ["src/app/api/v1/admin/credits/route.ts", "src/lib/entitlements.ts"]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    assert.match(src, /giftExpiry\((new Date\(\)|now), await readGiftValidDays\((adminClient|admin)\)\)/, f);
    assert.doesNotMatch(src, /setUTCFullYear\(expires\.getUTCFullYear\(\) \+ 1\)/, f);
  }
});

test("the admin settings route accepts the four keys, each with its validator", () => {
  const src = readFileSync(join(ROOT, "src/app/api/v1/admin/settings/route.ts"), "utf8");
  for (const [key, fn] of [
    ["library_plan_points", "libraryPlanPointsIssue"], ["gift_valid_days", "giftValidDaysIssue"],
    ["min_topup_by_account_type", "minTopupIssue"], ["free_questions_by_account_type", "freeQuestionsIssue"],
  ]) {
    assert.ok(src.includes(`  "${key}",`), key);
    assert.ok(src.includes(`  ${key}: ${fn},`), fn);
  }
});

test("l9 (owner file 15 row 13): every library plan card states the points it includes, from the code default", () => {
  assert.equal(libraryPlanPointsLine("lib-q1", "ar"), "٥٠ نقطة لمساعد المكتبة الذكي، تنتهي بانتهاء الاشتراك");
  assert.equal(libraryPlanPointsLine("lib-q2", "ar"), "١٢٠ نقطة لمساعد المكتبة الذكي، تنتهي بانتهاء الاشتراك");
  assert.equal(libraryPlanPointsLine("lib-annual", "en"), "300 points for the library's smart assistant, ending with the plan");
  for (const rel of [["src", "constants", "pricing", "pricing.library.ts"], ["src", "app", "laws", "subscribe", "page.tsx"]]) {
    const src = readFileSync(join(ROOT, ...rel), "utf8");
    for (const id of Object.keys(DEFAULT_LIBRARY_PLAN_POINTS)) {
      for (const lang of ["ar", "en"]) {
        assert.ok(src.includes(`libraryPlanPointsLine("${id}", "${lang}")`), `${rel.at(-1)} ${id} ${lang}`);
      }
    }
  }
});
