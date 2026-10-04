import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProfileShareTargets,
  PROFILE_SHARE_TEXT,
  profileQrFileName,
  profileShareState,
} from "./profileShareTargets.ts";

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

// ─── profileShareState: only a published profile gets a link (owner Q151) ────

const BASE = {
  origin: "https://nezamy.sa",
  userId: "11111111-2222-3333-4444-555555555555",
  slug: "ahmad-k",
  hasRoleProfile: true,
  roleProfileReadFailed: false,
  verificationStatus: "verified",
  marketplaceVisible: true,
};

test("verified + visible → published, with the slug link", () => {
  assert.deepEqual(profileShareState(BASE), { kind: "published", url: "https://nezamy.sa/lawyers/ahmad-k" });
});

test("published without a slug falls back to the user id link", () => {
  assert.deepEqual(profileShareState({ ...BASE, slug: "" }), {
    kind: "published",
    url: `https://nezamy.sa/lawyers/${BASE.userId}`,
  });
});

test("not verified, or not visible → unpublished, naming what is missing, no url", () => {
  assert.deepEqual(profileShareState({ ...BASE, verificationStatus: "pending" }), { kind: "unpublished", verified: false, visible: true });
  assert.deepEqual(profileShareState({ ...BASE, marketplaceVisible: false }), { kind: "unpublished", verified: true, visible: false });
  assert.deepEqual(profileShareState({ ...BASE, verificationStatus: null, marketplaceVisible: false }), { kind: "unpublished", verified: false, visible: false });
  for (const status of ["rejected", "suspended", "Verified", ""]) {
    assert.equal(profileShareState({ ...BASE, verificationStatus: status }).kind, "unpublished", status);
  }
});

test("an unread professional record, or no signed-in id → unknown, never a guess", () => {
  assert.deepEqual(profileShareState({ ...BASE, roleProfileReadFailed: true }), { kind: "unknown" });
  // Read fine, no row yet: its own state, not "could not check".
  assert.deepEqual(profileShareState({ ...BASE, hasRoleProfile: false }), { kind: "no_profile" });
  for (const userId of [null, undefined, "", "  "]) {
    assert.deepEqual(profileShareState({ ...BASE, userId }), { kind: "unknown" }, String(userId));
  }
});

test("profileQrFileName names the PNG after the link's last segment", () => {
  assert.equal(profileQrFileName("https://nezamy.sa/lawyers/ahmad-k"), "nezamy-profile-ahmad-k.png");
  assert.equal(profileQrFileName(`https://nezamy.sa/lawyers/${BASE.userId}`), `nezamy-profile-${BASE.userId}.png`);
  assert.equal(profileQrFileName("https://nezamy.sa/lawyers/%D8%A3"), "nezamy-profile.png");
});
