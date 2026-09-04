/**
 * _shared.test.ts — run with:  node --test src/app/api/v1/research/items/_shared.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { isValidUuid, validateTitle, dbErrorResponse } from "./_shared.ts";

// ─── isValidUuid ────────────────────────────────────────────────────────────

test("isValidUuid: accepts a well-formed uuid, any case", () => {
  assert.equal(isValidUuid("11111111-1111-1111-1111-111111111111"), true);
  assert.equal(isValidUuid("A1B2C3D4-E5F6-4789-A012-3456789ABCDE"), true);
});

test("isValidUuid: rejects everything else", () => {
  assert.equal(isValidUuid(""), false);
  assert.equal(isValidUuid("not-a-uuid"), false);
  assert.equal(isValidUuid("11111111-1111-1111-1111-11111111111"), false); // one char short
  assert.equal(isValidUuid("11111111-1111-1111-1111-1111111111111"), false); // one char long
  assert.equal(isValidUuid("1' OR '1'='1"), false);
});

// ─── validateTitle ──────────────────────────────────────────────────────────

test("validateTitle: undefined and null both resolve to an empty string", () => {
  assert.deepEqual(validateTitle(undefined), { ok: true, value: "" });
  assert.deepEqual(validateTitle(null), { ok: true, value: "" });
});

test("validateTitle: a normal Arabic title passes through untouched", () => {
  assert.deepEqual(validateTitle("عنوان البحث"), { ok: true, value: "عنوان البحث" });
});

test("validateTitle: exactly 300 characters is still valid (the boundary is inclusive)", () => {
  const title = "أ".repeat(300);
  const result = validateTitle(title);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.value, title);
});

test("validateTitle: 301 characters is rejected with an Arabic message", () => {
  const result = validateTitle("أ".repeat(301));
  assert.equal(result.ok, false);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /300/);
});

test("validateTitle: a non-string value is rejected", () => {
  assert.equal(validateTitle(42).ok, false);
  assert.equal(validateTitle({}).ok, false);
  assert.equal(validateTitle(["عنوان"]).ok, false);
});

test("validateTitle: an empty string is valid (not the same as undefined, but still ≤300)", () => {
  assert.deepEqual(validateTitle(""), { ok: true, value: "" });
});

// ─── dbErrorResponse ────────────────────────────────────────────────────────

test("dbErrorResponse maps every known Postgres code", () => {
  assert.equal(dbErrorResponse({ code: "23514" }).status, 400);
  assert.equal(dbErrorResponse({ code: "23503" }).status, 400);
  assert.equal(dbErrorResponse({ code: "42501" }).status, 403);
  assert.equal(dbErrorResponse({ code: "22P02" }).status, 400);
});

test("dbErrorResponse falls back to 500 for an unmapped code, null or undefined", () => {
  assert.equal(dbErrorResponse({ code: "unknown" }).status, 500);
  assert.equal(dbErrorResponse(null).status, 500);
  assert.equal(dbErrorResponse(undefined).status, 500);
});

test("dbErrorResponse: every message is a non-empty string (Arabic error strings only)", () => {
  for (const code of ["23514", "23503", "42501", "22P02", "unmapped"]) {
    const { message } = dbErrorResponse({ code });
    assert.ok(typeof message === "string" && message.length > 0);
  }
});
