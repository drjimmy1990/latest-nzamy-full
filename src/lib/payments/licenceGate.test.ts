/**
 * licenceGate.test.ts — batch l18, owner decision ق٢٦-٩: the founder plan and
 * the professional plans wait for a verified, unexpired licence; the library,
 * top-ups and individuals are not gated; a failed read is a 503.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "./fakeDb.test-helper.ts";
import { PAYABLE_ITEMS } from "./catalog.ts";
import {
  LICENCE_CHECK_FAILED_AR,
  LICENCE_EXPIRED_PURCHASE_AR,
  LICENCE_PENDING_FIRM_PURCHASE_AR,
  LICENCE_PENDING_PURCHASE_AR,
  LICENCE_PURCHASE_CODE,
  licenceExpired,
  licenceGatedPurchase,
  licencePurchaseDecision,
  readLicencePurchaseFacts,
} from "./licenceGate.ts";

const NOW = new Date("2026-11-27T08:00:00Z");
const item = (id: string) => PAYABLE_ITEMS[id];
const facts = (over: Partial<{ userType: string; lawyerStatus: string | null; ownedFirmStatuses: string[]; memberFirmStatuses: string[] }> = {}) => ({
  userType: "lawyer",
  lawyerStatus: "verified" as string | null,
  ownedFirmStatuses: [] as string[],
  memberFirmStatuses: [] as string[],
  ...over,
});

test("what is gated: the founder plan and the lawyer / firm plans, for a lawyer or a firm only", () => {
  for (const id of ["lawyer-founder-2026", "lawyer-pro", "lawyer-bundle", "consultant-independent"]) assert.ok(licenceGatedPurchase(item(id), "lawyer"), id);
  for (const id of ["firm-basic", "firm-enterprise"]) assert.ok(licenceGatedPurchase(item(id), "firm"), id);
  for (const id of ["lib-q1", "lib-q2", "lib-annual", "topup-500"]) assert.equal(licenceGatedPurchase(item(id), "lawyer"), false, id);
  assert.equal(licenceGatedPurchase(item("ind-ai"), "individual"), false);
  assert.equal(licenceGatedPurchase(item("consultant-independent"), "provider"), false, "a provider has no verification flow yet");
  assert.equal(licenceGatedPurchase(item("lawyer-pro"), null), false);
});

test("the decision: verified passes; pending / rejected / suspended / missing → 403 with the code and the verify link; a firm without the link", () => {
  assert.deepEqual(licencePurchaseDecision("lawyer", { provider: facts(), ownExpiry: null }, NOW), { ok: true });
  for (const status of ["pending", "rejected", "suspended", null]) {
    assert.deepEqual(licencePurchaseDecision("lawyer", { provider: facts({ lawyerStatus: status }), ownExpiry: null }, NOW), {
      ok: false, status: 403, error: LICENCE_PENDING_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: "/register/provider/verify",
    });
  }
  assert.deepEqual(licencePurchaseDecision("firm", { provider: facts({ userType: "firm", lawyerStatus: null, ownedFirmStatuses: ["pending"] }), ownExpiry: null }, NOW), {
    ok: false, status: 403, error: LICENCE_PENDING_FIRM_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
  // an active member of a verified firm works under the firm's verification
  assert.deepEqual(licencePurchaseDecision("lawyer", { provider: facts({ lawyerStatus: "pending", memberFirmStatuses: ["verified"] }), ownExpiry: null, viaFirmMembership: true }, NOW), { ok: true });
  assert.deepEqual(licencePurchaseDecision("lawyer", null, NOW), { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR });
  assert.deepEqual(licencePurchaseDecision("lawyer", { provider: null, ownExpiry: null }, NOW), { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR });
});

test("an expired licence on file is treated as not verified; NULL or a future date passes (Riyadh calendar)", () => {
  assert.equal(licenceExpired("2026-11-26", NOW), true);
  assert.equal(licenceExpired("2026-11-27", NOW), false, "the expiry day itself still counts");
  assert.equal(licenceExpired("2027-01-01", NOW), false);
  assert.equal(licenceExpired(null, NOW), false);
  assert.equal(licenceExpired("not a date", NOW), false);
  // 22:30 UTC on 26 Nov is 27 Nov in Riyadh: a licence ending 26 Nov is over
  assert.equal(licenceExpired("2026-11-26", new Date("2026-11-26T22:30:00Z")), true);
  assert.deepEqual(licencePurchaseDecision("lawyer", { provider: facts(), ownExpiry: "2026-01-31" }, NOW), {
    ok: false, status: 403, error: LICENCE_EXPIRED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
});

test("the reads: the verification facts, then the buyer's own licence expiry; a failed read → null", async () => {
  const ok = fakeDb((q) => {
    if (q.table === "lawyer_profiles" && q.columns === "verification_status") return { data: { verification_status: "verified" } };
    if (q.table === "lawyer_profiles") return { data: { license_expiry: "2025-12-31" } };
    if (q.table === "firm_profiles") return { data: [] };
    if (q.table === "firm_members") return { data: [] };
    return { data: null };
  });
  const f = await readLicencePurchaseFacts(ok.client, "u1", "lawyer");
  assert.equal(f?.ownExpiry, "2025-12-31");
  assert.equal(licencePurchaseDecision("lawyer", f, NOW).ok, false);
  const down = fakeDb((q) => (q.table === "lawyer_profiles" && q.columns !== "verification_status" ? { error: { code: "08006" } } : q.table === "lawyer_profiles" ? { data: { verification_status: "verified" } } : { data: [] }));
  assert.equal(await readLicencePurchaseFacts(down.client, "u1", "lawyer"), null);
});
