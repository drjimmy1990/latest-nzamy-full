/**
 * founderConsent.test.ts — the founder terms consent rule (owner ١٦, 17 Nov
 * 2026): what the checkout body must carry for the founder membership, and
 * what the order records.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURRENT_FOUNDER_TERMS,
  FOUNDER_CONSENT_LABEL_AR,
  FOUNDER_TERMS_HREF,
  FOUNDER_TERMS_REQUIRED_AR,
  FOUNDER_TERMS_STALE_AR,
  checkFounderConsent,
  parseFounderConsent,
} from "./founderConsent.ts";
import { FOUNDER_TERMS_PUBLISHED, FOUNDER_TERMS_VERSION } from "../founder/founderTerms.ts";
import { FOUNDER_CLOSED_AR } from "./checkoutCore.ts";

const NOW = new Date("2026-11-18T09:15:00.000Z");

test("the label and the link are the owner's", () => {
  assert.equal(FOUNDER_CONSENT_LABEL_AR, "قرأتُ شروط باقة المحامي المؤسس وأوافق عليها");
  assert.equal(FOUNDER_TERMS_HREF, "/founder-terms");
  assert.deepEqual(CURRENT_FOUNDER_TERMS, { published: FOUNDER_TERMS_PUBLISHED, version: FOUNDER_TERMS_VERSION });
});

test("parseFounderConsent: only a literal true is a consent; only a short string is a version; never refuses", () => {
  assert.deepEqual(parseFounderConsent({ itemId: "x", acceptFounderTerms: true, founderTermsVersion: "2026-11-17" }), {
    accepted: true,
    version: "2026-11-17",
  });
  for (const accept of [false, "true", 1, null, undefined, {}]) {
    assert.equal(parseFounderConsent({ acceptFounderTerms: accept, founderTermsVersion: "2026-11-17" }).accepted, false, String(accept));
  }
  for (const version of [5, "", "x".repeat(33), null, {}]) {
    assert.equal(parseFounderConsent({ acceptFounderTerms: true, founderTermsVersion: version }).version, null, String(version));
  }
  for (const body of [null, "x", [], 7]) {
    assert.deepEqual(parseFounderConsent(body), { accepted: false, version: null });
  }
});

test("checkFounderConsent: accepted + the current version → the metadata, stamped with the server clock", () => {
  const r = checkFounderConsent({ accepted: true, version: FOUNDER_TERMS_VERSION }, NOW, { published: true, version: FOUNDER_TERMS_VERSION });
  assert.deepEqual(r, {
    ok: true,
    metadata: { founder_terms_version: FOUNDER_TERMS_VERSION, founder_terms_accepted_at: "2026-11-18T09:15:00.000Z" },
  });
});

test("checkFounderConsent: no consent → 400 required; another version → 400 stale; unpublished → 410 closed", () => {
  const terms = { published: true, version: "2026-11-17" };
  for (const c of [null, undefined, { accepted: false, version: "2026-11-17" }]) {
    assert.deepEqual(checkFounderConsent(c, NOW, terms), { ok: false, status: 400, error: FOUNDER_TERMS_REQUIRED_AR });
  }
  for (const version of [null, "2026-11-16"]) {
    assert.deepEqual(checkFounderConsent({ accepted: true, version }, NOW, terms), { ok: false, status: 400, error: FOUNDER_TERMS_STALE_AR });
  }
  assert.deepEqual(checkFounderConsent({ accepted: true, version: "2026-11-17" }, NOW, { ...terms, published: false }), {
    ok: false,
    status: 410,
    error: FOUNDER_CLOSED_AR,
  });
});

test("the refusals are Arabic and say what to do", () => {
  assert.match(FOUNDER_TERMS_REQUIRED_AR, /شروط باقة المحامي المؤسس/);
  assert.match(FOUNDER_TERMS_STALE_AR, /حدّث الصفحة/);
});
