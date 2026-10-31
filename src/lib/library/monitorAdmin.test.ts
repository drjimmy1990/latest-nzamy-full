/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/monitorAdmin.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activitySince,
  num,
  parseClearFlagBody,
  parseUserLimitBody,
  toFlagDto,
  toLimitDto,
} from "./monitorAdmin.ts";

const NOW = Date.parse("2026-10-31T22:30:00.000Z"); // 01:30 on 1 Nov in Riyadh
const U = "00000000-0000-0000-0000-00000000aa01";

test("a per-user limit: who, at least one cap, a reason, an optional future end", () => {
  const ok = parseUserLimitBody({ email: " Office@Example.com ", dailyDocs: "1000", note: " مكتب كبير " }, NOW);
  assert.deepEqual(ok, {
    ok: true,
    value: { userId: null, email: "office@example.com", dailyDocs: 1000, hourlyDocs: null, until: null, note: "مكتب كبير" },
  });
  assert.equal(parseUserLimitBody({ userId: U, hourlyDocs: 10, note: "x" }, NOW).ok, true);
  assert.equal(parseUserLimitBody({ note: "x", dailyDocs: 5 }, NOW).ok, false); // nobody
  assert.equal(parseUserLimitBody({ userId: U, note: "x" }, NOW).ok, false); // no cap
  assert.equal(parseUserLimitBody({ userId: U, dailyDocs: 0, note: "x" }, NOW).ok, false);
  assert.equal(parseUserLimitBody({ userId: U, dailyDocs: 5.5, note: "x" }, NOW).ok, false);
  assert.equal(parseUserLimitBody({ userId: U, dailyDocs: 5, note: "  " }, NOW).ok, false);
  assert.equal(parseUserLimitBody({ userId: U, dailyDocs: 5, note: "x", until: "2026-10-30T00:00:00Z" }, NOW).ok, false);
  assert.equal(parseUserLimitBody({ userId: U, dailyDocs: 5, note: "x", until: "2028-01-01T00:00:00Z" }, NOW).ok, false);
  const until = parseUserLimitBody({ userId: U, dailyDocs: 5, note: "x", until: "2026-11-05T10:00:00Z" }, NOW);
  assert.equal(until.ok && until.value.until, "2026-11-05T10:00:00.000Z");
});

test("closing a review: optional note; the automatic slow-down goes too unless asked not to", () => {
  assert.deepEqual(parseClearFlagBody({}), { ok: true, value: { note: null, liftSlow: true } });
  assert.deepEqual(parseClearFlagBody({ note: " ok ", liftSlow: false }), { ok: true, value: { note: "ok", liftSlow: false } });
  assert.equal(parseClearFlagBody({ note: "x".repeat(1001) }).ok, false);
});

test("today starts at Riyadh midnight; week is 7 × 24 hours", () => {
  assert.deepEqual(activitySince(null, NOW), { range: "today", since: "2026-10-31T21:00:00.000Z" });
  assert.deepEqual(activitySince("week", NOW), { range: "week", since: "2026-10-24T22:30:00.000Z" });
});

test("a flag row and a limit row for the panel", () => {
  const people = new Map([[U, { name: "أ", email: "a@x.sa" }]]);
  const f = toFlagDto({
    id: "f1", user_id: U, reference: "REV-1", rule: "week_docs", rules: ["week_docs", "sustained"],
    details: { week_docs: 700 }, action_taken: "slow", created_at: "t", cleared_at: null, cleared_by: null, clear_note: null,
  }, people);
  assert.deepEqual(f.rulesAr, ["وثائق كثيرة خلال أسبوع", "وتيرة آلية متواصلة"]);
  assert.equal(f.open, true);
  assert.equal(f.user.email, "a@x.sa");
  assert.match(f.actionAr, /إبطاء/);
  const l = toLimitDto({
    user_id: U, daily_docs: 5, hourly_docs: null, until: "2026-10-31T00:00:00Z", source: "auto_slow",
    note: null, set_by: null, set_at: "t",
  }, people, NOW);
  assert.equal(l.active, false);
  assert.equal(l.sourceAr, "إبطاء تلقائي");
  assert.equal(num("12"), 12);
  assert.equal(num(null), 0);
});
