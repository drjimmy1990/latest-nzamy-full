import test from "node:test";
import assert from "node:assert/strict";

import {
  validatePreferencesPatch, mergePreferences, mergePutPreferences, PREFERENCE_KEYS, RECENT_SESSIONS_MAX,
} from "./preferencesMerge.ts";

const VALID_READING_ACTIVITY = {
  lawsThisWeek: 3,
  lawsThisMonth: 12,
  articles: 40,
  principles: 5,
  feqhPages: 0,
  lastWeekReset: "2026-09-01T00:00:00.000Z",
  lastMonthReset: null,
};

test("an unknown top-level key is rejected", () => {
  const result = validatePreferencesPatch({ dashboardMode: "light", theme: "dark" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /theme/);
});

test("a known key with a valid value is accepted", () => {
  const result = validatePreferencesPatch({ dashboardMode: "full" });
  assert.deepEqual(result, { ok: true, patch: { dashboardMode: "full" } });
});

test("dashboardMode enum rejects anything outside light|full", () => {
  for (const bad of ["compact", "dark", "", 1, null, undefined]) {
    const result = validatePreferencesPatch({ dashboardMode: bad });
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
  for (const good of ["light", "full"]) {
    const result = validatePreferencesPatch({ dashboardMode: good });
    assert.equal(result.ok, true, `expected ${good} to be accepted`);
  }
});

test("readingActivity requires non-negative numbers and string|null resets", () => {
  const ok = validatePreferencesPatch({ readingActivity: VALID_READING_ACTIVITY });
  assert.equal(ok.ok, true);

  const negative = validatePreferencesPatch({
    readingActivity: { ...VALID_READING_ACTIVITY, articles: -1 },
  });
  assert.equal(negative.ok, false);

  const wrongType = validatePreferencesPatch({
    readingActivity: { ...VALID_READING_ACTIVITY, lawsThisWeek: "3" },
  });
  assert.equal(wrongType.ok, false);

  const badReset = validatePreferencesPatch({
    readingActivity: { ...VALID_READING_ACTIVITY, lastWeekReset: 12345 },
  });
  assert.equal(badReset.ok, false);

  const nullResetOk = validatePreferencesPatch({
    readingActivity: { ...VALID_READING_ACTIVITY, lastWeekReset: null, lastMonthReset: null },
  });
  assert.equal(nullResetOk.ok, true);
});

test("recentSessions is capped at 10, order preserved as sent", () => {
  const sessions = Array.from({ length: 15 }, (_, i) => ({
    slug: `law-${i}`,
    title: `Law ${i}`,
  }));
  const result = validatePreferencesPatch({ recentSessions: sessions });
  assert.equal(result.ok, true);
  if (result.ok) {
    const kept = result.patch.recentSessions!;
    assert.equal(kept.length, RECENT_SESSIONS_MAX);
    assert.equal(kept.length, 10);
    // Order as sent — the first 10 sent, not reordered or re-sorted.
    assert.deepEqual(
      kept.map((s) => s.slug),
      sessions.slice(0, 10).map((s) => s.slug),
    );
  }
});

test("recentSessions rejects an item missing slug or title", () => {
  const missingSlug = validatePreferencesPatch({ recentSessions: [{ title: "بدون slug" }] });
  assert.equal(missingSlug.ok, false);

  const emptyTitle = validatePreferencesPatch({ recentSessions: [{ slug: "x", title: "" }] });
  assert.equal(emptyTitle.ok, false);

  const notArray = validatePreferencesPatch({ recentSessions: { slug: "x", title: "y" } });
  assert.equal(notArray.ok, false);
});

test("recentSessions keeps optional string fields and rejects non-string ones", () => {
  const ok = validatePreferencesPatch({
    recentSessions: [{ slug: "s1", title: "t1", titleEn: "t1en", catId: "c1", type: "law", openedAt: "2026-09-04" }],
  });
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.patch.recentSessions![0], {
    slug: "s1", title: "t1", titleEn: "t1en", catId: "c1", type: "law", openedAt: "2026-09-04",
  });

  const bad = validatePreferencesPatch({ recentSessions: [{ slug: "s1", title: "t1", catId: 5 }] });
  assert.equal(bad.ok, false);
});

test("an empty body is rejected rather than treated as a no-op", () => {
  const result = validatePreferencesPatch({});
  assert.equal(result.ok, false);
});

test("a non-object body is rejected", () => {
  for (const bad of [null, undefined, "x", 1, ["a"]]) {
    const result = validatePreferencesPatch(bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
  }
});

// ── mergePreferences ────────────────────────────────────────────────────────

test("mergePreferences preserves a sibling key the module does not model", () => {
  // NotificationsTab stores its own choices under preferences.notifications —
  // a PATCH that only touches dashboardMode must never clobber it.
  const existing = { notifications: { email: true, sms: false }, dashboardMode: "full" };
  const merged = mergePreferences(existing, { dashboardMode: "light" });
  assert.deepEqual(merged, { notifications: { email: true, sms: false }, dashboardMode: "light" });
});

test("mergePreferences replaces a top-level key wholesale (shallow, not deep)", () => {
  const existing = { readingActivity: { ...VALID_READING_ACTIVITY, articles: 1 } };
  const nextActivity = { ...VALID_READING_ACTIVITY, articles: 2 };
  const merged = mergePreferences(existing, { readingActivity: nextActivity });
  assert.deepEqual(merged.readingActivity, nextActivity);
});

test("mergePreferences on a null/undefined existing value starts from {}", () => {
  assert.deepEqual(mergePreferences(null, { dashboardMode: "light" }), { dashboardMode: "light" });
  assert.deepEqual(mergePreferences(undefined, { dashboardMode: "light" }), { dashboardMode: "light" });
});

test("mergePreferences with an empty patch returns the existing value unchanged", () => {
  const existing = { notifications: { email: true }, dashboardMode: "full" };
  assert.deepEqual(mergePreferences(existing, {}), existing);
});

// ── quickTools (T28-30) ─────────────────────────────────────────────────────

test("PREFERENCE_KEYS carries quickTools", () => {
  assert.ok((PREFERENCE_KEYS as readonly string[]).includes("quickTools"));
});

test("quickTools: 3..8 unique registry ids are accepted", () => {
  const result = validatePreferencesPatch({ quickTools: ["cases", "draft", "brief-check", "calculator"] });
  assert.deepEqual(result, { ok: true, patch: { quickTools: ["cases", "draft", "brief-check", "calculator"] } });
});

test("quickTools: too few, too many, duplicates, unknown ids and non-arrays are 400s", () => {
  const nine = ["cases", "hearings", "deadlines", "documents", "finance", "consultations", "clients", "tasks", "contracts"];
  for (const bad of [
    [], ["cases", "draft"], nine,
    ["cases", "draft", "draft"],
    ["cases", "draft", "direction-support"],
    ["cases", "draft", 1],
    "cases", null, { a: 1 },
  ]) {
    const result = validatePreferencesPatch({ quickTools: bad });
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    if (!result.ok) assert.match(result.error, /[؀-ۿ]/, "the error must be Arabic");
  }
});

test("quickTools merges without touching notifications or the other PATCH keys", () => {
  const existing = { notifications: { sms: true }, dashboardMode: "full", quickTools: ["cases", "draft", "tasks"] };
  const merged = mergePreferences(existing, { quickTools: ["draft", "clients", "calculator"] });
  assert.deepEqual(merged, { notifications: { sms: true }, dashboardMode: "full", quickTools: ["draft", "clients", "calculator"] });
});

// ── mergePutPreferences (PUT /api/v1/settings) ──────────────────────────────

test("PUT merge keeps keys the body does not mention (the notifications-tab wipe)", () => {
  const stored = { notifications: { sms: true, categories: { a: true } }, quickTools: ["cases", "draft", "tasks"], dashboardMode: "light" };
  const result = mergePutPreferences(stored, { notifications: { sms: false, categories: { a: false } } });
  assert.deepEqual(result, {
    ok: true,
    merged: { notifications: { sms: false, categories: { a: false } }, quickTools: ["cases", "draft", "tasks"], dashboardMode: "light" },
  });
});

test("PUT merge drops PATCH-owned keys so a stale echo cannot revert them", () => {
  // The tab loaded quickTools=[a,b,c] and dashboardMode=full, then the lawyer
  // changed both elsewhere; an old bundle PUTs the whole loaded object back.
  const stored = { quickTools: ["draft", "clients", "calculator"], dashboardMode: "light", notifications: { sms: true } };
  const staleEcho = { quickTools: ["cases", "draft", "tasks"], dashboardMode: "full", readingActivity: VALID_READING_ACTIVITY, recentSessions: [], notifications: { sms: false } };
  const result = mergePutPreferences(stored, staleEcho);
  assert.deepEqual(result, {
    ok: true,
    merged: { quickTools: ["draft", "clients", "calculator"], dashboardMode: "light", notifications: { sms: false } },
  });
});

test("PUT merge on an empty/absent row starts from {}", () => {
  assert.deepEqual(mergePutPreferences(null, { notifications: { sms: true } }), { ok: true, merged: { notifications: { sms: true } } });
  assert.deepEqual(mergePutPreferences(undefined, {}), { ok: true, merged: {} });
});

test("PUT merge refuses a preferences value that is not a plain object", () => {
  for (const bad of [null, undefined, "x", 1, ["a"]]) {
    const result = mergePutPreferences({ notifications: {} }, bad);
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`);
    if (!result.ok) assert.match(result.error, /[؀-ۿ]/);
  }
});
