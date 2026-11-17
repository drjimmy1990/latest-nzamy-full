import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  founderPointsView,
  openedAgoAr,
  readingHistoryHref,
  readingHistoryRows,
  subscriptionView,
} from "./myLibraryView.ts";

const GRANT = {
  status: "active" as const,
  startsAt: "2026-11-01T00:00:00Z",
  endsAt: "2027-02-01T00:00:00Z",
  endsAtAr: "١ فبراير ٢٠٢٧",
  daysLeft: 76,
  planRef: "lib-q1",
  planLabel: "ربع سنوي",
  nextStartsAt: null,
};

test("subscription: a running grant is the card's to draw", () => {
  const v = subscriptionView({ signedIn: true, grant: GRANT, purchase: { eligible: true } }, false);
  assert.deepEqual(v, { kind: "grant" });
});

test("subscription: full library through the plan, no grant — never «no subscription»", () => {
  const v = subscriptionView({ signedIn: true, grant: null, purchase: { eligible: true } }, true);
  assert.deepEqual(v, { kind: "plan" });
});

test("subscription: no grant and no full access — none, with the refusal wording when he may not buy", () => {
  assert.deepEqual(
    subscriptionView({ signedIn: true, grant: null, purchase: { eligible: true } }, false),
    { kind: "none", messageAr: null },
  );
  assert.deepEqual(
    subscriptionView(
      { signedIn: true, grant: null, purchase: { eligible: false, reason: "individual", messageAr: "م" } },
      false,
    ),
    { kind: "none", messageAr: "م" },
  );
});

test("subscription: a failed or pending read is unknown, never «none»", () => {
  assert.deepEqual(subscriptionView(null, false), { kind: "unknown" });
  // parseMyLibraryGrant's answer for a failed read
  assert.deepEqual(subscriptionView({ signedIn: false, grant: null, purchase: null }, false), { kind: "unknown" });
  // the full-access read failed and there is no grant
  assert.deepEqual(subscriptionView({ signedIn: true, grant: null, purchase: null }, null), { kind: "unknown" });
});

test("founder points: loading, failure, non-member, member", () => {
  assert.deepEqual(founderPointsView(undefined), { kind: "loading" });
  assert.deepEqual(founderPointsView(null), { kind: "unavailable" });
  assert.deepEqual(founderPointsView({ member: false, libraryPoints: { total: 0, remaining: 0 } }), { kind: "none" });
  assert.deepEqual(
    founderPointsView({ member: true, libraryPoints: { total: 100, remaining: 85 } }),
    { kind: "member", remaining: 85, total: 100 },
  );
  // a seat with no library row yet (before 20261124_10) shows nothing
  assert.deepEqual(founderPointsView({ member: true, libraryPoints: { total: 0, remaining: 0 } }), { kind: "none" });
  // an odd body is not a member with zero points
  assert.deepEqual(founderPointsView({ member: true, libraryPoints: { total: "x" } }), { kind: "unavailable" });
});

test("reading history: the reader per type, encoded once", () => {
  assert.equal(readingHistoryHref(undefined, "نظام-العمل"), `/laws/${encodeURIComponent("نظام-العمل")}`);
  const once = encodeURIComponent("نظام-العمل");
  assert.equal(readingHistoryHref("law", once), `/laws/${once}`);
  assert.equal(readingHistoryHref("order", "abc"), "/laws/orders/abc");
  assert.equal(readingHistoryHref("precedent", "c1"), "/precedents/c1");
});

test("reading history: rows keep real entries only, dedupe, no invented time", () => {
  const rows = readingHistoryRows([
    { slug: "labor", title: " نظام العمل ", openedAt: "2026-11-16T10:00:00Z" },
    { slug: "labor", title: "نظام العمل" },
    { slug: "x", title: "" },
    { title: "بلا معرّف" },
    null,
    { slug: "o1", title: "أمر", type: "order", openedAt: "not a date" },
  ]);
  assert.ok(rows);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "نظام العمل");
  assert.equal(rows[0].openedAt, "2026-11-16T10:00:00Z");
  assert.equal(rows[1].href, "/laws/orders/o1");
  assert.equal(rows[1].openedAt, null);
  assert.equal(rows[1].kindAr, "أمر أو تعميم");
  assert.deepEqual(readingHistoryRows(undefined), []);
  assert.equal(readingHistoryRows("nope"), null);
});

test("openedAgoAr", () => {
  const now = Date.parse("2026-11-17T12:00:00Z");
  assert.equal(openedAgoAr("2026-11-17T08:00:00Z", now), "اليوم");
  assert.equal(openedAgoAr("2026-11-16T08:00:00Z", now), "أمس");
  assert.equal(openedAgoAr("2026-11-12T08:00:00Z", now), "منذ ٥ أيام");
  assert.equal(openedAgoAr("garbage", now), "");
});

test("/laws/my is guarded on the server, outside the proxy", () => {
  const src = readFileSync(join(import.meta.dirname, "page.tsx"), "utf8");
  assert.match(src, /redirect\("\/login\?from=%2Flaws%2Fmy"\)/);
  assert.match(src, /export const dynamic = "force-dynamic"/);
  assert.match(src, /index: false/);
});
