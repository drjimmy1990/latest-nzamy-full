import assert from "node:assert/strict";
import test from "node:test";
import {
  hashClientIp,
  isMissingTermsTable,
  parseAcceptanceBody,
  shouldRecordSignupFromMetadata,
  truncateUserAgent,
  USER_AGENT_MAX,
} from "./termsAcceptance.ts";
import { isTermsGateExemptPath } from "./termsGatePaths.ts";
import {
  CURRENT_TERMS_VERSION,
  TERMS_CONSENT_AR,
  termsConsentSentenceAr,
} from "./termsVersion.ts";

test("the version is a date the migration's CHECK accepts", () => {
  assert.match(CURRENT_TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test("the consent sentence is the owner's text, verbatim (file 11 part ب)", () => {
  assert.equal(
    termsConsentSentenceAr(),
    "أقر بأنني اطلعت على شروط الاستخدام وبند حماية المنصة ومحتواها، وأفهم أن الاستخراج الآلي أو الهندسة العكسية أو التحايل على حدود الاستخدام يعرّضني للمساءلة الجزائية بالسجن مدة لا تزيد على أربع سنوات وبغرامة لا تزيد على ثلاثة ملايين ريال بحسب الفعل، وللتعويض.",
  );
  assert.equal(TERMS_CONSENT_AR.termsLink, "شروط الاستخدام");
});

test("the IP is hashed with the salt, never stored as itself", () => {
  const h = hashClientIp("203.0.113.7", "salt-1");
  assert.ok(h);
  assert.match(h, /^[0-9a-f]{64}$/); // the column's CHECK
  assert.ok(!h.includes("203"));
  assert.equal(hashClientIp("203.0.113.7", "salt-1"), h, "stable for one salt");
  assert.notEqual(hashClientIp("203.0.113.7", "salt-2"), h, "the salt changes it");
  assert.notEqual(hashClientIp("203.0.113.8", "salt-1"), h);
  assert.match(hashClientIp("203.0.113.7", "") ?? "", /^[0-9a-f]{64}$/, "an empty salt still hashes");
});

test("an unknown address is null, not a hash of 'unknown'", () => {
  assert.equal(hashClientIp("unknown", "s"), null);
  assert.equal(hashClientIp("", "s"), null);
  assert.equal(hashClientIp(null, "s"), null);
  assert.equal(hashClientIp(undefined, "s"), null);
});

test("the user agent is cut to the column's limit", () => {
  assert.equal(truncateUserAgent(null), null);
  assert.equal(truncateUserAgent("  "), null);
  assert.equal(truncateUserAgent("Mozilla/5.0"), "Mozilla/5.0");
  assert.equal(truncateUserAgent("x".repeat(1000))?.length, USER_AGENT_MAX);
});

test("the POST body: current version and a known context only", () => {
  assert.deepEqual(parseAcceptanceBody({ version: CURRENT_TERMS_VERSION, context: "signup" }), { ok: true, context: "signup" });
  assert.deepEqual(parseAcceptanceBody({ version: CURRENT_TERMS_VERSION, context: "relogin" }), { ok: true, context: "relogin" });
  const stale = parseAcceptanceBody({ version: "2020-01-01", context: "relogin" });
  assert.equal(stale.ok, false);
  assert.equal(!stale.ok && stale.status, 409);
  for (const bad of [null, [], "x", {}, { version: CURRENT_TERMS_VERSION }, { version: CURRENT_TERMS_VERSION, context: "admin" }]) {
    const r = parseAcceptanceBody(bad);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.status, 400);
  }
});

test("signup metadata is honoured only for an account with no rows yet", () => {
  const meta = { terms_version: CURRENT_TERMS_VERSION };
  assert.equal(shouldRecordSignupFromMetadata(meta, 0), true);
  assert.equal(shouldRecordSignupFromMetadata(meta, 1), false, "a later re-ask cannot be skipped by editing metadata");
  assert.equal(shouldRecordSignupFromMetadata({ terms_version: "2020-01-01" }, 0), false);
  assert.equal(shouldRecordSignupFromMetadata({}, 0), false);
  assert.equal(shouldRecordSignupFromMetadata(null, 0), false);
});

test("a missing table is recognised (the route then fails open)", () => {
  assert.equal(isMissingTermsTable("42P01"), true);
  assert.equal(isMissingTermsTable("PGRST205"), true);
  assert.equal(isMissingTermsTable("42501"), false);
  assert.equal(isMissingTermsTable(undefined), false);
});

test("the modal never opens on the documents it links to, onboarding or auth", () => {
  for (const p of ["/terms", "/privacy", "/onboarding", "/login", "/register/client", "/auth/callback", "/account-frozen"]) {
    assert.equal(isTermsGateExemptPath(p), true, p);
  }
  for (const p of ["/dashboard/lawyer", "/ai/draft", "/settings", "/termsx", "/privacy-center"]) {
    assert.equal(isTermsGateExemptPath(p), false, p);
  }
});
