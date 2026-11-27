/**
 * adminLicenceExpiry.test.ts — l19 review (pay S1 + the corr gap): an admin
 * sets or corrects a lawyer's / firm's licence expiry date on the verification
 * screen, saved through the existing verification route and audited; the
 * renewed-licence bell points to that screen.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/licence/adminLicenceExpiry.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LICENCE_EXPIRY_ACTION,
  LICENCE_EXPIRY_AUDIT_ACTION,
  LICENCE_EXPIRY_TABLE,
  parseLicenceExpiryPatch,
  realIsoDate,
} from "./adminLicenceExpiry.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("realIsoDate: a real calendar date only", () => {
  for (const ok of ["2027-01-31", "2028-02-29", "1900-01-01", "2200-12-31"]) assert.equal(realIsoDate(ok), ok);
  for (const bad of ["2027-02-29", "2027-13-01", "2027-00-10", "2027-04-31", "1899-12-31", "2201-01-01", "27-01-01", "2027/01/01", "", null, 20270101, "2027-01-01T00:00"]) {
    assert.equal(realIsoDate(bad), null, String(bad));
  }
});

test("parseLicenceExpiryPatch: holder lawyer | firm, a real date or null / empty to clear", () => {
  assert.deepEqual(parseLicenceExpiryPatch({ action: LICENCE_EXPIRY_ACTION, holder: "lawyer", licenseExpiry: "2027-05-01" }), { ok: true, holder: "lawyer", date: "2027-05-01" });
  assert.deepEqual(parseLicenceExpiryPatch({ action: LICENCE_EXPIRY_ACTION, holder: "firm", licenseExpiry: null }), { ok: true, holder: "firm", date: null });
  assert.deepEqual(parseLicenceExpiryPatch({ action: LICENCE_EXPIRY_ACTION, holder: "firm", licenseExpiry: "" }), { ok: true, holder: "firm", date: null });
  for (const bad of [
    { action: LICENCE_EXPIRY_ACTION, holder: "provider", licenseExpiry: "2027-05-01" },
    { action: LICENCE_EXPIRY_ACTION, licenseExpiry: "2027-05-01" },
    { action: LICENCE_EXPIRY_ACTION, holder: "lawyer", licenseExpiry: "2027-02-30" },
    { action: LICENCE_EXPIRY_ACTION, holder: "lawyer" },
    { action: "approve", holder: "lawyer", licenseExpiry: "2027-05-01" },
    null,
    "x",
  ]) assert.equal(parseLicenceExpiryPatch(bad).ok, false, JSON.stringify(bad));
  assert.deepEqual(LICENCE_EXPIRY_TABLE.lawyer, { table: "lawyer_profiles", key: "user_id" });
  assert.deepEqual(LICENCE_EXPIRY_TABLE.firm, { table: "firm_profiles", key: "owner_user_id" });
});

test("the verification route: the date branch is staff-gated, writes only the date, audits before → after", () => {
  const src = read("app/api/v1/admin/verifications/[id]/route.ts");
  const gate = src.indexOf('const gate = await requireStaff("verifications.decide");');
  const branch = src.indexOf("(body as { action?: unknown } | null)?.action === LICENCE_EXPIRY_ACTION");
  assert.ok(gate > 0 && branch > gate, "after the staff gate");
  assert.ok(branch < src.indexOf('if (!action || !["approve", "reject"].includes(action))'), "before approve / reject");
  const fn = src.slice(src.indexOf("async function setLicenceExpiry("));
  assert.match(fn, /parseLicenceExpiryPatch\(body\)/);
  assert.match(fn, /\.update\(\{ license_expiry: parsed\.date, updated_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.doesNotMatch(fn, /verification_status|recordNotification|settleHeldPlans|dispatchVerificationToN8n/, "nothing but the date");
  assert.match(fn, /action: LICENCE_EXPIRY_AUDIT_ACTION,/);
  assert.match(fn, /before: \{ license_expiry: before \},\s*after: \{ license_expiry: parsed\.date \},/);
  assert.equal(LICENCE_EXPIRY_AUDIT_ACTION, "licence_expiry_set");
});

test("the screen shows the date on lawyer and firm cards; the list carries it; the bell opens that screen", () => {
  const list = read("app/api/v1/admin/verifications/route.ts");
  assert.match(list, /license_expiry: \(lp\.license_expiry as string \| null\) \?\? null,/);
  assert.match(list, /license_expiry: \(fp\.license_expiry as string \| null\) \?\? null,/);
  const page = read("app/dashboard/admin/provider-verification/page.tsx");
  assert.match(page, /\(r\.type === "lawyer" \|\| r\.type === "firm"\) && \(\s*<LicenceExpiryField/);
  assert.match(page, /await setLicenceExpiry\(userId, holder, next\)/);
  assert.match(page, /\(!onlyUser \|\| r\.user_id === onlyUser\)/);
  // the one account is asked from the server, not filtered out of the newest 50
  assert.match(page, /getVerificationRequests\(onlyUser \? \{ userId: onlyUser \} : undefined\)/);
  assert.match(list, /if \(onlyUser\) lawyerQuery = lawyerQuery\.eq\("user_id", onlyUser\);/);
  assert.match(list, /if \(onlyUser\) providerQuery = providerQuery\.eq\("user_id", onlyUser\);/);
  assert.match(list, /if \(onlyUser\) firmQuery = firmQuery\.eq\("owner_user_id", onlyUser\);/);
  assert.match(read("lib/services/adminService.ts"), /user: filters\?\.userId,/);
  assert.match(read("lib/services/adminService.ts"), /\{ action: "set_licence_expiry", holder, licenseExpiry \}/);
  const bell = read("app/api/v1/lawyer/licence-image/route.ts");
  assert.match(bell, /p_href: `\/dashboard\/admin\/provider-verification\?user=\$\{user\.id\}`/);
  assert.match(bell, /من بطاقته في صفحة «تحقق المزودين»/);
});

test("the alerts take the later of the registry's and the lawyer's own date (20261209_10)", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261209_10_l19_licence_expiry_alerts.sql", import.meta.url), "utf8");
  assert.match(sql, /cross join lateral \(select greatest\(r\.expiry_date, lp\.license_expiry\) as d\) e/);
  assert.doesNotMatch(sql, /coalesce\(r\.expiry_date, lp\.license_expiry\)/);
});
