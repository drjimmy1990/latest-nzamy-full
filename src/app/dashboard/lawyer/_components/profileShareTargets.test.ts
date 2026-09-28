import test from "node:test";
import assert from "node:assert/strict";

import { buildProfileShareTargets, PROFILE_SHARE_TEXT } from "./profileShareTargets.ts";

const URL_ = "https://nezamy.sa/lawyers/ahmad-k";

test("three targets: WhatsApp, X, LinkedIn — in that order", () => {
  assert.deepEqual(buildProfileShareTargets(URL_).map((t) => t.id), ["whatsapp", "x", "linkedin"]);
});

test("WhatsApp carries no phone number — the lawyer picks the recipient", () => {
  const wa = buildProfileShareTargets(URL_).find((t) => t.id === "whatsapp")!;
  assert.match(wa.href, /^https:\/\/wa\.me\/\?text=/);
  const text = new URL(wa.href).searchParams.get("text")!;
  assert.ok(text.includes(PROFILE_SHARE_TEXT));
  assert.ok(text.includes(URL_));
});

test("X gets the text and the url as separate, encoded parameters", () => {
  const x = new URL(buildProfileShareTargets(URL_).find((t) => t.id === "x")!.href);
  assert.equal(x.origin + x.pathname, "https://x.com/intent/post");
  assert.equal(x.searchParams.get("text"), PROFILE_SHARE_TEXT);
  assert.equal(x.searchParams.get("url"), URL_);
});

test("LinkedIn gets the url only", () => {
  const li = new URL(buildProfileShareTargets(URL_).find((t) => t.id === "linkedin")!.href);
  assert.equal(li.origin + li.pathname, "https://www.linkedin.com/sharing/share-offsite/");
  assert.equal(li.searchParams.get("url"), URL_);
});

test("a url with reserved characters survives the round trip", () => {
  const odd = "https://nezamy.sa/lawyers/a%20b?x=1&y=2";
  for (const t of buildProfileShareTargets(odd)) {
    const params = new URL(t.href).searchParams;
    const carried = params.get("url") ?? params.get("text")!;
    assert.ok(carried.includes(odd), t.id);
  }
});

test("the share text is Arabic", () => {
  assert.match(PROFILE_SHARE_TEXT, /^[؀-ۿ]/);
});
