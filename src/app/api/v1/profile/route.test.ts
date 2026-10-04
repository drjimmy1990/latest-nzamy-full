/**
 * route.test.ts — PATCH /api/v1/profile phone contract. Run with:
 *   node --test src/app/api/v1/profile/route.test.ts
 *
 * Two halves, because the route cannot be imported in a unit test (it pulls in
 * `next/server` and a Supabase session):
 *   1. the phone DECISION, through the pure `./_phone.ts` the route delegates
 *      to — every case that decides between 400 and a stored value;
 *   2. the parts of `route.ts` that are only visible in its source, asserted
 *      against the file itself. Same technique as
 *      src/app/laws/search-result-fail-closed.test.ts:5.
 *
 * Appendix 03 §3 established that the malformed phone in the UAT never went
 * through this route — scripts/uat/verify-profile-write-guards.ps1:49-61
 * PATCHes PostgREST directly. This file pins the route's own guard so the two
 * cannot be confused again, and
 * supabase/tests/rls/profiles_phone_e164.test.sql covers the direct path.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { profilePhoneDecision } from "./_phone.ts";
import { saudiMobileMessage } from "../../../../lib/services/saudiMobile.ts";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");

test("a body without a phone key leaves the column alone", () => {
  assert.deepEqual(profilePhoneDecision({}), { action: "skip" });
  assert.deepEqual(profilePhoneDecision({ city: "الرياض" }), { action: "skip" });
});

test("a malformed phone is a 400 carrying the reason, not a stored value", () => {
  for (const [phone, reason] of [
    ["letters-and-email@example.test", "letters"],
    ["abc@example.com", "letters"],
    ["", "empty"],
    ["   ", "empty"],
    [null, "empty"],
    [42, "empty"],
    ["0112345678", "prefix"],
    ["+201012345678", "prefix"],
    ["+9660512345678", "prefix"],
    ["051234567", "length"],
    ["05123456789", "length"],
  ] as const) {
    const decision = profilePhoneDecision({ phone });
    assert.equal(decision.action, "reject", String(phone));
    assert.equal(
      decision.action === "reject" && decision.message,
      saudiMobileMessage({ ok: false, reason }),
      String(phone),
    );
  }
});

test("Arabic-Indic digits are stored as +966512345678, not refused", () => {
  for (const phone of ["٠٥١٢٣٤٥٦٧٨", "۰۵۱۲۳۴۵۶۷۸", "٠٥ ١٢٣ ٤٥٦ ٧٨"]) {
    assert.deepEqual(profilePhoneDecision({ phone }), {
      action: "store",
      e164: "+966512345678",
    }, phone);
  }
});

test("every accepted shape is normalised to the one value the column now allows", () => {
  for (const phone of [
    "0512345678",
    "512345678",
    "966512345678",
    "00966512345678",
    "+966512345678",
    "+966 51 234 5678",
    "05.12.34.56.78",
  ]) {
    assert.deepEqual(profilePhoneDecision({ phone }), {
      action: "store",
      e164: "+966512345678",
    }, phone);
  }
});

test("the stored value always satisfies the DB constraint added by 20260921_04", () => {
  // profiles_phone_e164_saudi_mobile: phone is null or phone ~ '^\+9665[0-9]{8}$'
  const decision = profilePhoneDecision({ phone: "٠٥١٢٣٤٥٦٧٨" });
  assert.equal(decision.action, "store");
  assert.match(decision.action === "store" ? decision.e164 : "", /^\+9665[0-9]{8}$/);
});

test("the route delegates its phone decision and answers 400 with the reason", () => {
  assert.match(routeSource, /import \{ profilePhoneDecision \} from "\.\/_phone";/);
  assert.match(routeSource, /const phoneDecision = profilePhoneDecision\(body\);/);
  assert.match(
    routeSource,
    /if \(phoneDecision\.action === "reject"\) \{\s*\r?\n\s*return NextResponse\.json\(\{ error: phoneDecision\.message \}, \{ status: 400 \}\);/,
  );
  assert.match(routeSource, /body\.phone = phoneDecision\.e164;/);
});

test("`email` is not on the profiles allowlist, so a PATCH cannot rewrite it", () => {
  // appendix 03 §4: profiles.email is written once at INSERT and has no sync
  // trigger with auth.users. The PATCH dropping it silently is what keeps the
  // two from diverging through this route. (The direct-PostgREST hole is
  // owner decision Q8, not this work package.)
  const allowlist = routeSource.slice(
    routeSource.indexOf("const profileFields = ["),
    routeSource.indexOf("// lawyer_profiles allowlist"),
  );
  assert.ok(allowlist.length > 0, "profileFields allowlist not found in route.ts");
  assert.doesNotMatch(allowlist, /"email"/);
  assert.match(allowlist, /"phone"/);
});

// ── WP-6 B-2 / B-3: the company-row scope contract ──────────────────────────
//
// The route itself cannot be imported here (next/server + a Supabase session),
// so the decision is tested through the pure module it delegates to
// (src/lib/auth/businessProfileScope.test.ts) and the WIRING is asserted
// against this source, the same technique the phone block above uses.

test("GET emits businessProfileScope for corporate, and only for corporate", () => {
  assert.match(
    routeSource,
    /\.\.\.\(profile\.user_type === "corporate" \? \{ businessProfile, businessProfileScope \} : \{\}\),/,
  );
});

test("GET resolves the company row by scope, not by owner_user_id alone", () => {
  // The defect: `.eq("owner_user_id", user.id)` returns ZERO ROWS for a member
  // — no error — so «you are not the owner» arrived as «nothing is saved yet».
  assert.match(routeSource, /const resolved = await resolveBusinessScope\(supabase, user\.id\);/);
  assert.match(routeSource, /businessProfileScope = resolved\.scope;/);
  assert.match(routeSource, /\.eq\("id", resolved\.businessId\)/);
});

test("an unreadable company row is reported as a read failure, never as 'none'", () => {
  assert.match(routeSource, /if \(resolved\.readFailed\) \{\s*\r?\n[\s\S]{0,400}?roleProfileReadFailed = true;/);
});

test("the membership read goes through the RLS client — no service_role in this route", () => {
  // Reading a colleague's company is RLS's decision (20260921_03's
  // business_members / business_profiles SELECT policies), not a bypass.
  assert.doesNotMatch(routeSource, /createServiceClient/);
  assert.match(routeSource, /\.from\("business_members"\)\s*\r?\n\s*\.select\("business_id"\)/);
});

test("PATCH answers a member with a specific Arabic 403, not AR.saveFailed", () => {
  assert.match(routeSource, /businessOwnerOnly: "تعديل بيانات الشركة متاح لمالك الحساب فقط\.",/);
  assert.match(
    routeSource,
    /if \(!canWriteBusinessProfile\(resolved\.scope\)\) \{[\s\S]{0,400}?AR\.businessOwnerOnly[\s\S]{0,200}?status: resolved\.scope === "member" \? 403 : 404/,
  );
});

test("the owner gate covers BOTH corporate write arms and runs before either write", () => {
  const gate = routeSource.slice(
    routeSource.indexOf("const touchesBusinessRow ="),
    routeSource.indexOf("let profile = null;"),
  );
  assert.ok(gate.length > 0, "the owner gate is not where the writes expect it");
  assert.match(gate, /businessProfilePatch !== null \|\| entitySettingsPatch !== null/);
  // …and the writes come after it, not before.
  assert.ok(
    routeSource.indexOf("const touchesBusinessRow =") <
      routeSource.indexOf('.from("business_profiles")\r\n      .update(businessProfilePatch)'.replace("\r\n", "\n")) ||
      routeSource.indexOf("const touchesBusinessRow =") < routeSource.indexOf(".update(businessProfilePatch)"),
  );
});
