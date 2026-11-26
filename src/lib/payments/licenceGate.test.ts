/**
 * licenceGate.test.ts — batch l18, owner answer ٢٣٩ (replaces the ق٢٦-٩
 * block): a PENDING licence may pay for the founder plan or a professional
 * plan (held until the approval); an unverified one is sent to verify; a free
 * activation needs a verified licence; a failed read is a 503.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAYABLE_ITEMS } from "./catalog.ts";
import {
  LICENCE_CHECK_FAILED_AR,
  LICENCE_FREE_CODE_PENDING_AR,
  LICENCE_PURCHASE_CODE,
  LICENCE_UNVERIFIED_FIRM_PURCHASE_AR,
  LICENCE_UNVERIFIED_PURCHASE_AR,
  licenceCheckoutDecision,
  licenceFreeCodeDecision,
  licenceGatedPurchase,
  licenceStanding,
} from "./licenceGate.ts";

const item = (id: string) => PAYABLE_ITEMS[id];
const facts = (over: Partial<{ userType: string; lawyerStatus: string | null; ownedFirmStatuses: string[]; memberFirmStatuses: string[] }> = {}) => ({
  userType: "lawyer",
  lawyerStatus: "verified" as string | null,
  ownedFirmStatuses: [] as string[],
  memberFirmStatuses: [] as string[],
  ...over,
});

test("what follows the rule: the founder plan and the lawyer / firm plans, for a lawyer or a firm only", () => {
  for (const id of ["lawyer-founder-2026", "lawyer-pro", "lawyer-bundle", "consultant-independent"]) assert.ok(licenceGatedPurchase(item(id), "lawyer"), id);
  for (const id of ["firm-basic", "firm-enterprise"]) assert.ok(licenceGatedPurchase(item(id), "firm"), id);
  for (const id of ["lib-q1", "lib-q2", "lib-annual", "topup-500"]) assert.equal(licenceGatedPurchase(item(id), "lawyer"), false, id);
  assert.equal(licenceGatedPurchase(item("ind-ai"), "individual"), false);
  assert.equal(licenceGatedPurchase(item("consultant-independent"), "provider"), false);
  assert.equal(licenceGatedPurchase(item("lawyer-pro"), null), false);
});

test("standing: verified / pending (own licence or owned firm) / unverified; unread → null", () => {
  assert.equal(licenceStanding(facts()), "verified");
  assert.equal(licenceStanding(facts({ lawyerStatus: "pending" })), "pending");
  assert.equal(licenceStanding(facts({ lawyerStatus: "pending", memberFirmStatuses: ["verified"] })), "verified", "works under a verified firm");
  for (const s of ["rejected", "suspended", null]) assert.equal(licenceStanding(facts({ lawyerStatus: s })), "unverified");
  assert.equal(licenceStanding(facts({ userType: "firm", lawyerStatus: null, ownedFirmStatuses: ["pending"] })), "pending");
  assert.equal(licenceStanding(null), null);
});

test("٢٣٩ — a paid purchase: verified goes; PENDING goes and is held until the approval; unverified → 403 with the verify link; unread → 503", () => {
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts()), { ok: true, held: false });
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: "pending" })), { ok: true, held: true });
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: "rejected" })), {
    ok: false, status: 403, error: LICENCE_UNVERIFIED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: "/register/provider/verify",
  });
  assert.deepEqual(licenceCheckoutDecision("firm", facts({ userType: "firm", lawyerStatus: null })), {
    ok: false, status: 403, error: LICENCE_UNVERIFIED_FIRM_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
  assert.deepEqual(licenceCheckoutDecision("lawyer", null), { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR });
});

test("a free activation needs a verified licence (nothing paid to hold): pending → 403 «فعّل الكود بعد الاعتماد»", () => {
  assert.deepEqual(licenceFreeCodeDecision("lawyer", facts()), { ok: true, held: false });
  assert.deepEqual(licenceFreeCodeDecision("lawyer", facts({ lawyerStatus: "pending" })), {
    ok: false, status: 403, error: LICENCE_FREE_CODE_PENDING_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
  assert.equal(licenceFreeCodeDecision("lawyer", facts({ lawyerStatus: "rejected" })).ok, false);
  assert.equal(licenceFreeCodeDecision("lawyer", null).ok, false);
});
