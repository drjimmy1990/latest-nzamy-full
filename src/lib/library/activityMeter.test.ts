/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/activityMeter.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ActivityMeter, hourStartIso, libraryActivityKind } from "./activityMeter.ts";

const T0 = Date.parse("2026-10-31T09:59:58.000Z");

test("the kind of a quota target: a document, a search, a library-AI call", () => {
  assert.equal(libraryActivityKind({ kind: "doc", docKey: "law:x" }, "/api/library/laws/x"), "doc");
  assert.equal(libraryActivityKind({ kind: "lock-only" }, "/api/library/search"), "search");
  assert.equal(libraryActivityKind({ kind: "lock-only" }, "/api/library/scoped-search"), "search");
  assert.equal(libraryActivityKind({ kind: "lock-only" }, "/api/ai/library-chat"), "ai");
  assert.equal(libraryActivityKind({ kind: "lock-only" }, "/api/ai/explain-article"), "ai");
});

test("one row per reader per clock hour; every kind is a request", () => {
  const m = new ActivityMeter();
  m.record("u1", "doc", T0);
  m.record("u1", "search", T0);
  m.record("u1", "ai", T0 + 1000);
  m.record("u1", "doc", T0 + 3000); // 10:00:01 — the next hour
  m.record("u2", "doc", T0);
  const rows = m.drain();
  assert.deepEqual(rows, [
    { u: "u1", h: "2026-10-31T09:00:00.000Z", r: 3, s: 1, a: 1 },
    { u: "u1", h: "2026-10-31T10:00:00.000Z", r: 1, s: 0, a: 0 },
    { u: "u2", h: "2026-10-31T09:00:00.000Z", r: 1, s: 0, a: 0 },
  ]);
  assert.equal(m.size, 0);
  assert.deepEqual(m.drain(), []);
});

test("a full tally refuses new readers but still counts the ones it holds", () => {
  const m = new ActivityMeter(2);
  assert.equal(m.record("a", "doc", T0), true);
  assert.equal(m.record("b", "doc", T0), true);
  assert.equal(m.record("c", "doc", T0), false);
  assert.equal(m.record("a", "doc", T0), true);
  assert.equal(m.size, 2);
  assert.equal(m.drain().find((r) => r.u === "a")?.r, 2);
});

test("the hour is the UTC clock hour (Riyadh is UTC+3, the same boundaries)", () => {
  assert.equal(hourStartIso(Date.parse("2026-10-31T21:30:00.000Z")), "2026-10-31T21:00:00.000Z");
});
