import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FEATURE_FLAGS,
  FEATURE_FLAG_KEYS,
  FIXED_FLAGS,
  createFeatureFlagCache,
  defaultFeatureFlags,
  featureFlagsIssue,
  parseFeatureFlags,
} from "./featureFlags.ts";

/** O22 (batch l11-misc): server-side feature flags in platform_settings.feature_flags. */

test("the list is closed and every flag has an Arabic name and description", () => {
  assert.deepEqual([...FEATURE_FLAG_KEYS], ["site_assistant", "library_auto_link_tag", "library_similar_links"]);
  for (const k of FEATURE_FLAG_KEYS) {
    assert.ok(FEATURE_FLAGS[k].nameAr.length > 3);
    assert.ok(FEATURE_FLAGS[k].descriptionAr.length > 10);
    assert.doesNotMatch(FEATURE_FLAGS[k].descriptionAr, /[A-Za-z]/, "plain Arabic");
  }
  assert.equal(defaultFeatureFlags().site_assistant, true, "the assistant needs no outside model, so it ships on");
});

test("parse: missing / malformed → defaults; booleans kept; unknown keys ignored", () => {
  assert.deepEqual(parseFeatureFlags(null), { ...defaultFeatureFlags(), site_assistant: true });
  assert.deepEqual(parseFeatureFlags("off"), { ...defaultFeatureFlags(), site_assistant: true });
  assert.deepEqual(parseFeatureFlags([false]), { ...defaultFeatureFlags(), site_assistant: true });
  assert.deepEqual(parseFeatureFlags({ site_assistant: "false" }), { ...defaultFeatureFlags(), site_assistant: true });
  assert.deepEqual(parseFeatureFlags({ site_assistant: false }), { ...defaultFeatureFlags(), site_assistant: false });
  assert.deepEqual(parseFeatureFlags({ site_assistant: false, other: true }), { ...defaultFeatureFlags(), site_assistant: false });
  assert.deepEqual(parseFeatureFlags({ __proto__: { site_assistant: false } }), { ...defaultFeatureFlags(), site_assistant: true }, "own keys only");
});

test("batch l12: the two library link switches ship on (owner library-Q4 default; Q133 register 14)", () => {
  assert.equal(defaultFeatureFlags().library_auto_link_tag, true);
  assert.equal(defaultFeatureFlags().library_similar_links, true);
  assert.equal(parseFeatureFlags({ library_similar_links: false }).library_similar_links, false);
  assert.equal(featureFlagsIssue({ library_auto_link_tag: false }), null);
});

test("write validator: an object of known flags → booleans, nothing else", () => {
  assert.equal(featureFlagsIssue({ site_assistant: false }), null);
  assert.equal(featureFlagsIssue({}), null, "an empty object reads as every default");
  assert.match(featureFlagsIssue(null) ?? "", /كائناً/);
  assert.match(featureFlagsIssue([]) ?? "", /كائناً/);
  assert.match(featureFlagsIssue({ ENABLE_WARGAMING_AI: true }) ?? "", /غير معروف/);
  assert.match(featureFlagsIssue({ site_assistant: "true" }) ?? "", /true أو false/);
  assert.match(featureFlagsIssue({ site_assistant: 1 }) ?? "", /true أو false/);
});

test("the beta gates are shown as they are in code, read-only", () => {
  assert.deepEqual(FIXED_FLAGS.map((f) => f.id), ["review", "single-provider"]);
  for (const f of FIXED_FLAGS) assert.doesNotMatch(f.nameAr + f.descriptionAr, /[A-Za-z]/);
  const page = readFileSync(new URL("../../app/dashboard/admin/features/page.tsx", import.meta.url), "utf8");
  assert.match(page, /import \{ BETA_MONOPOLY_MODE, BETA_REVIEW_MODE \} from "@\/lib\/betaConfig";/);
  assert.match(page, /review: BETA_REVIEW_MODE,\s*"single-provider": BETA_MONOPOLY_MODE,/);
  assert.doesNotMatch(page, /onClick=\{[^}]*FIXED/, "no switch for a fixed gate");
});

test("cache: one read per ttl, shared by concurrent callers, cleared on write", async () => {
  let t = 1_000;
  let reads = 0;
  let stored: unknown = { site_assistant: false };
  const cache = createFeatureFlagCache(async () => {
    reads += 1;
    return stored;
  }, { ttlMs: 60_000, now: () => t });
  const [a, b] = await Promise.all([cache.get(), cache.get()]);
  assert.equal(a.site_assistant, false);
  assert.equal(b.site_assistant, false);
  assert.equal(reads, 1);
  stored = { site_assistant: true };
  t += 30_000;
  assert.equal((await cache.get()).site_assistant, false, "still cached");
  assert.equal(reads, 1);
  cache.clear();
  assert.equal((await cache.get()).site_assistant, true, "cleared → re-read");
  assert.equal(reads, 2);
  t += 60_001;
  stored = { site_assistant: false };
  assert.equal((await cache.get()).site_assistant, false, "expired → re-read");
  assert.equal(reads, 3);
});

test("cache: a failed read answers the defaults and retries after 5 s", async () => {
  let t = 0;
  let fail = true;
  const cache = createFeatureFlagCache(async () => {
    if (fail) throw new Error("db down");
    return { site_assistant: false };
  }, { now: () => t });
  assert.deepEqual(await cache.get(), { ...defaultFeatureFlags(), site_assistant: true });
  fail = false;
  t += 4_000;
  assert.deepEqual(await cache.get(), { ...defaultFeatureFlags(), site_assistant: true }, "short negative cache");
  t += 1_001;
  assert.deepEqual(await cache.get(), { ...defaultFeatureFlags(), site_assistant: false });
});

test("the admin settings route allow-lists, validates and clears the cache for feature_flags", () => {
  const route = readFileSync(new URL("../../app/api/v1/admin/settings/route.ts", import.meta.url), "utf8");
  assert.match(route, /^\s*"feature_flags",$/m);
  assert.match(route, /feature_flags: featureFlagsIssue,/);
  assert.match(route, /if \(key === FEATURE_FLAGS_SETTING\) clearFeatureFlagsCache\(\);/);
});

test("the admin page edits the real setting — no browser-only switches or technical words", () => {
  const page = readFileSync(new URL("../../app/dashboard/admin/features/page.tsx", import.meta.url), "utf8");
  assert.match(page, /key: FEATURE_FLAGS_SETTING/);
  assert.match(page, /\/api\/v1\/admin\/settings/);
  for (const banned of ["INITIAL_FLAGS", "حفظ محلي", "محلياً", "ENABLE_WARGAMING_AI", "BILLING_POSTPAY", "Feature flag", "feature-flags backend", "إضافة مفتاح ميزة"]) {
    assert.equal(page.includes(banned), false, `«${banned}» is still on the page`);
  }
});
