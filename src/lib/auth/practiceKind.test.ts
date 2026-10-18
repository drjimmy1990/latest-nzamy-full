import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONSULTANT_BLOCKED_MESSAGE,
  CONSULTANT_BLOCKED_PREFIXES,
  isConsultantBlockedPath,
  toPracticeKind,
} from "./practiceKind.ts";

test("a blocked route and its sub-routes are blocked", () => {
  assert.equal(isConsultantBlockedPath("/dashboard/lawyer/hearings"), true);
  assert.equal(isConsultantBlockedPath("/dashboard/lawyer/hearings/123"), true);
});

test("every listed prefix is blocked, exactly and below", () => {
  assert.equal(CONSULTANT_BLOCKED_PREFIXES.length, 5);
  for (const prefix of CONSULTANT_BLOCKED_PREFIXES) {
    assert.equal(isConsultantBlockedPath(prefix), true, prefix);
    assert.equal(isConsultantBlockedPath(`${prefix}/x`), true, `${prefix}/x`);
  }
});

test("tools outside Art. 18 stay open", () => {
  assert.equal(isConsultantBlockedPath("/dashboard/lawyer/contracts"), false);
  assert.equal(isConsultantBlockedPath("/ai/legal-opinion"), false);
  assert.equal(isConsultantBlockedPath("/dashboard/lawyer"), false);
});

test("matching is segment-exact: a longer sibling segment is not blocked", () => {
  for (const p of [
    "/dashboard/lawyer/hearings-old",
    "/dashboard/lawyer/deadlinesx",
    "/ai/brief-checker",
    "/ai/wargaming-x",
    "/ai/najiz-optimizer2",
  ]) {
    assert.equal(isConsultantBlockedPath(p), false, p);
  }
});

test("a trailing slash, a query and a hash are ignored", () => {
  for (const p of [
    "/ai/wargaming/",
    "/dashboard/lawyer/deadlines?x=1",
    "/ai/brief-check#a",
    "/ai/najiz-optimizer/?q",
    "/dashboard/lawyer/hearings/#top",
    "/dashboard/lawyer/hearings#a?b",
  ]) {
    assert.equal(isConsultantBlockedPath(p), true, p);
  }
  // a query or hash cannot smuggle a blocked path in
  assert.equal(isConsultantBlockedPath("/ai/legal-opinion?next=/ai/wargaming"), false);
  assert.equal(isConsultantBlockedPath("/ai/legal-opinion#/ai/wargaming"), false);
});

test("matching is case-sensitive (Next routes are lowercase)", () => {
  assert.equal(isConsultantBlockedPath("/Dashboard/lawyer/hearings"), false);
  assert.equal(isConsultantBlockedPath("/AI/WARGAMING"), false);
});

test("the root and an empty path are not blocked", () => {
  assert.equal(isConsultantBlockedPath(""), false);
  assert.equal(isConsultantBlockedPath("/"), false);
});

test("only the exact value 'consultant' is a consultant", () => {
  assert.equal(toPracticeKind("consultant"), "consultant");
  for (const v of ["CONSULTANT", " consultant", "advocate", "", null, undefined, 1, {}]) {
    assert.equal(toPracticeKind(v), "advocate", JSON.stringify(v));
  }
});

test("the message cites Art. 18 in Arabic", () => {
  assert.match(CONSULTANT_BLOCKED_MESSAGE, /المادة ١٨ من نظام المحاماة/);
});
