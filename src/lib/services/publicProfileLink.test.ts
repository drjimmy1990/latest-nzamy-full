import test from "node:test";
import assert from "node:assert/strict";
import { buildPublicProfileUrl, canShareProfile } from "./publicProfileLink.ts";

const ORIGIN = "https://nezamy.sa";
const UID = "11111111-2222-3333-4444-555555555555";

test("the slug wins whenever there is one", () => {
  assert.equal(buildPublicProfileUrl(ORIGIN, "ahmed-alsaad", UID), `${ORIGIN}/lawyers/ahmed-alsaad`);
});

test("an absent, empty or whitespace slug falls back to the user id", () => {
  for (const slug of [null, undefined, "", "   "]) {
    assert.equal(buildPublicProfileUrl(ORIGIN, slug, UID), `${ORIGIN}/lawyers/${UID}`, String(slug));
  }
});

test("the fallback never degrades to the directory index", () => {
  // `/lawyers/` is the directory, not this lawyer — the bug the `slug || userId`
  // rule exists to prevent.
  assert.equal(buildPublicProfileUrl(ORIGIN, "", UID).endsWith("/lawyers/"), false);
});

test("the path segment is percent-encoded", () => {
  assert.equal(buildPublicProfileUrl(ORIGIN, "a b/c", UID), `${ORIGIN}/lawyers/a%20b%2Fc`);
});

test("canShareProfile needs an id AND an open directory", () => {
  assert.equal(canShareProfile(UID, false), true);
  assert.equal(canShareProfile(UID, true), false, "beta closes the public directory");
  assert.equal(canShareProfile("", false), false, "no signed-in id");
  assert.equal(canShareProfile(null, false), false);
  assert.equal(canShareProfile(undefined, false), false);
  assert.equal(canShareProfile(null, true), false);
});
