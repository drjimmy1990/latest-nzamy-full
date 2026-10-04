import test from "node:test";
import assert from "node:assert/strict";

import {
  STAGE_BUCKETS,
  STAGE_BUCKET_LABELS,
  CASE_STAGES_BULK_MAX_IDS,
  stageBucketFor,
  countStageBuckets,
  stageBucketShares,
  emptyBucketCounts,
  parseCaseIdsParam,
  pickLatestStagePerCase,
} from "./caseStageBuckets.ts";

// ── stageBucketFor ──────────────────────────────────────────────────────────

test("a closed or archived case is «منتهية» whatever its stage rows say", () => {
  assert.equal(stageBucketFor("closed", "appeal"), "finished");
  assert.equal(stageBucketFor("archived", null), "finished");
});

test("an open case with no stage row is «لم تُسجَّل مرحلة», not a made-up phase", () => {
  for (const status of ["active", "pending"]) {
    assert.equal(stageBucketFor(status, null), "none");
    assert.equal(stageBucketFor(status, undefined), "none");
    assert.equal(stageBucketFor(status, ""), "none");
  }
  assert.equal(STAGE_BUCKET_LABELS.none, "لم تُسجَّل مرحلة");
  assert.doesNotMatch(STAGE_BUCKET_LABELS.none, /تحضير/);
});

test("open cases bucket by their latest degree, in either spelling", () => {
  const pairs: [string, string][] = [
    ["first_instance", "first_instance"], ["ابتدائي", "first_instance"],
    ["appeal", "appeal"], ["استئناف", "appeal"],
    ["cassation", "cassation"], ["نقض", "cassation"],
    ["execution", "execution"], ["تنفيذ", "execution"],
  ];
  for (const [degree, bucket] of pairs) assert.equal(stageBucketFor("active", degree), bucket);
});

test("an unrecognised degree never reads as more advanced than first instance", () => {
  assert.equal(stageBucketFor("active", "supreme"), "first_instance");
});

// ── countStageBuckets / stageBucketShares ───────────────────────────────────

test("counts cover every case exactly once", () => {
  const cases = [
    { id: "a", status: "active" }, { id: "b", status: "active" }, { id: "c", status: "pending" },
    { id: "d", status: "closed" }, { id: "e", status: "active" }, { id: "f", status: "active" },
  ];
  const counts = countStageBuckets(cases, { a: "استئناف", b: "ابتدائي", d: "نقض", e: "تنفيذ", f: "cassation" });
  assert.deepEqual(counts, { none: 1, first_instance: 1, appeal: 1, cassation: 1, execution: 1, finished: 1 });
  assert.equal(Object.values(counts).reduce((s, n) => s + n, 0), cases.length);
});

test("shares: empty when there are no cases", () => {
  assert.deepEqual(stageBucketShares(emptyBucketCounts()), []);
});

test("shares: only non-empty buckets, in display order, percents summing to 100", () => {
  const counts = { ...emptyBucketCounts(), none: 1, appeal: 1, finished: 1 };
  const shares = stageBucketShares(counts);
  assert.deepEqual(shares.map((s) => s.bucket), ["none", "appeal", "finished"]);
  assert.equal(shares.reduce((s, x) => s + x.percent, 0), 100);
  assert.deepEqual(shares.map((s) => s.percent).sort(), [33, 33, 34]);
  const widthSum = shares.reduce((s, x) => s + x.width, 0);
  assert.ok(Math.abs(widthSum - 100) < 1e-9);
});

test("shares: a single bucket is 100%", () => {
  const shares = stageBucketShares({ ...emptyBucketCounts(), first_instance: 7 });
  assert.equal(shares.length, 1);
  assert.equal(shares[0].percent, 100);
  assert.equal(shares[0].count, 7);
  assert.equal(shares[0].label, "أول درجة");
});

test("shares: percents always sum to 100 across awkward splits", () => {
  for (const split of [[1, 2, 4], [1, 1, 1, 1, 1, 1], [97, 1, 1, 1], [2, 3]]) {
    const counts = emptyBucketCounts();
    split.forEach((n, i) => { counts[STAGE_BUCKETS[i]] = n; });
    assert.equal(stageBucketShares(counts).reduce((s, x) => s + x.percent, 0), 100, JSON.stringify(split));
  }
});

// ── parseCaseIdsParam ───────────────────────────────────────────────────────

test("absent param → every readable case", () => {
  assert.deepEqual(parseCaseIdsParam(null), { ids: null });
});

test("ids are trimmed, de-duplicated, and blanks/unsafe values dropped", () => {
  const uuid = "3f2b1c9e-8a7d-4e6f-9b1a-2c3d4e5f6a7b";
  assert.deepEqual(parseCaseIdsParam(` ${uuid} ,,${uuid},wf-1,bad"id,a(b) `), { ids: [uuid, "wf-1"] });
  assert.deepEqual(parseCaseIdsParam(""), { ids: [] });
});

test("more than the cap is an Arabic error; exactly the cap is fine", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`).join(",");
  const ok = parseCaseIdsParam(ids(CASE_STAGES_BULK_MAX_IDS));
  assert.ok("ids" in ok && ok.ids!.length === CASE_STAGES_BULK_MAX_IDS);
  const bad = parseCaseIdsParam(ids(CASE_STAGES_BULK_MAX_IDS + 1));
  assert.ok("error" in bad);
  if ("error" in bad) assert.match(bad.error, /[؀-ۿ]/);
});

// ── pickLatestStagePerCase ──────────────────────────────────────────────────

test("latest = highest position, then latest opened_on, then latest created_at", () => {
  const rows = [
    { id: 1, case_request_id: "a", position: 0, opened_on: "2026-01-01", created_at: "2026-01-01T00:00:00Z" },
    { id: 2, case_request_id: "a", position: 1, opened_on: null, created_at: "2026-02-01T00:00:00Z" },
    { id: 3, case_request_id: "b", position: 0, opened_on: "2026-03-01", created_at: "2026-03-01T00:00:00Z" },
    { id: 4, case_request_id: "b", position: 0, opened_on: "2026-04-01", created_at: "2026-01-01T00:00:00Z" },
    { id: 5, case_request_id: "c", position: 0, opened_on: null, created_at: "2026-01-01T00:00:00Z" },
    { id: 6, case_request_id: "c", position: 0, opened_on: null, created_at: "2026-05-01T00:00:00Z" },
  ];
  const forward = pickLatestStagePerCase(rows);
  const backward = pickLatestStagePerCase([...rows].reverse());
  for (const latest of [forward, backward]) {
    assert.equal(latest.size, 3);
    assert.equal(latest.get("a")!.id, 2);
    assert.equal(latest.get("b")!.id, 4);
    assert.equal(latest.get("c")!.id, 6);
  }
});
