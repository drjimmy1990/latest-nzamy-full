/**
 * libraryFullAccess.test.ts — run with:
 *   node --test src/lib/library/libraryFullAccess.test.ts
 *
 * The client's reading of GET /api/v1/library/access. Anything but a 2xx whose
 * body says `hasFullAccess: true` is false: the redeem CTA and the invitation
 * banner then show, which is what a user without the full library sees today.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { LIBRARY_ACCESS_ENDPOINT, parseLibraryAccessResponse } from "./libraryFullAccess.ts";

test("the endpoint is the v1 route", () => {
  assert.equal(LIBRARY_ACCESS_ENDPOINT, "/api/v1/library/access");
});

test("a 2xx saying true is the only yes", () => {
  assert.equal(parseLibraryAccessResponse(true, { hasFullAccess: true }), true);
});

test("everything else is no", () => {
  assert.equal(parseLibraryAccessResponse(true, { hasFullAccess: false }), false);
  assert.equal(parseLibraryAccessResponse(true, { hasFullAccess: "true" }), false);
  assert.equal(parseLibraryAccessResponse(true, { hasFullAccess: 1 }), false);
  assert.equal(parseLibraryAccessResponse(true, {}), false);
  assert.equal(parseLibraryAccessResponse(true, null), false);
  assert.equal(parseLibraryAccessResponse(true, "true"), false);
  assert.equal(parseLibraryAccessResponse(true, [true]), false);
  // A 503 (auth unavailable) or any failure never opens anything.
  assert.equal(parseLibraryAccessResponse(false, { hasFullAccess: true }), false);
  assert.equal(parseLibraryAccessResponse(false, null), false);
});
