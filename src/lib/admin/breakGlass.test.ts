import test from "node:test";
import assert from "node:assert/strict";
import { breakGlassStatus, breakGlassErrorResponse, isBreakGlassMissing } from "./breakGlass.ts";

const NOW = Date.parse("2026-11-26T12:00:00Z");
const base = { requested_at: "2026-11-26T11:00:00Z", approved_at: null, expires_at: null, rejected_at: null, revoked_at: null };

test("breakGlassStatus: pending, lapsed after 24 h", () => {
  assert.equal(breakGlassStatus(base, NOW), "pending");
  assert.equal(breakGlassStatus({ ...base, requested_at: "2026-11-25T11:00:00Z" }, NOW), "lapsed");
  assert.equal(breakGlassStatus({ ...base, revoked_at: "2026-11-26T11:30:00Z" }, NOW), "lapsed");
});

test("breakGlassStatus: active until expiry, then expired; revoked and rejected win", () => {
  const approved = { ...base, approved_at: "2026-11-26T11:10:00Z", expires_at: "2026-11-26T12:10:00Z" };
  assert.equal(breakGlassStatus(approved, NOW), "active");
  assert.equal(breakGlassStatus({ ...approved, expires_at: "2026-11-26T11:59:00Z" }, NOW), "expired");
  assert.equal(breakGlassStatus({ ...approved, revoked_at: "2026-11-26T11:20:00Z" }, NOW), "revoked");
  assert.equal(breakGlassStatus({ ...base, rejected_at: "2026-11-26T11:20:00Z" }, NOW), "rejected");
});

test("breakGlassErrorResponse maps the database refusals", () => {
  assert.equal(breakGlassErrorResponse({ code: "42501", message: "x: the second approval must come from another super admin" }).status, 403);
  assert.match(breakGlassErrorResponse({ code: "42501", message: "x: the second approval must come from another super admin" }).error, /مسؤول أعلى آخر/);
  assert.equal(breakGlassErrorResponse({ code: "22023", message: "x: a written reason of 20 to 1000 characters is required" }).status, 400);
  assert.equal(breakGlassErrorResponse({ code: "22023", message: "x: the request lapsed (not approved within 24 hours)" }).status, 409);
  assert.equal(breakGlassErrorResponse({ code: "P0002", message: "x" }).status, 404);
  assert.equal(breakGlassErrorResponse({ code: "PGRST202", message: "x" }).status, 503);
  assert.equal(breakGlassErrorResponse({ code: "XX000", message: "x" }).status, 500);
  assert.ok(isBreakGlassMissing("42883"));
  assert.ok(!isBreakGlassMissing("42501"));
});
