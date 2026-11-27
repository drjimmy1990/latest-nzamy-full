/**
 * licenceGate.test.ts — batch l18, owner answer ٢٣٩ (replaces the ق٢٦-٩
 * block): a PENDING licence may pay for the founder plan or a professional
 * plan (held until the approval); an unverified one is sent to verify; a free
 * activation needs a verified licence; a failed read is a 503. l19 (owner
 * ٢٤١): a verified licence whose expiry date passed is NOT refused.
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
  LICENCE_RESUBMIT_FIRM_PURCHASE_AR,
  LICENCE_RESUBMIT_PURCHASE_AR,
  licenceCheckoutDecision,
  licenceDetail,
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

test("٢٣٩ (l18 review ruling) — a paid purchase: verified goes; PENDING and NOT SUBMITTED go held; rejected → «أعد تقديم التوثيق أولاً»; suspended → verify; unread → 503", () => {
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts()), { ok: true, held: false });
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: "pending" })), { ok: true, held: true });
  // never submitted: no lawyer row, or a pending row without the licence image → held, and the copy asks for it
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: null }), { itemKind: "plan" }), { ok: true, held: true, submitLicence: true });
  assert.deepEqual(licenceCheckoutDecision("lawyer", { ...facts({ lawyerStatus: "pending" }), licenceSubmitted: false }, { itemKind: "plan" }), { ok: true, held: true, submitLicence: true });
  assert.deepEqual(licenceCheckoutDecision("firm", facts({ userType: "firm", lawyerStatus: null }), { itemKind: "plan" }), { ok: true, held: true, submitLicence: true });
  // the founder membership still needs a submitted licence (founder_reserve_seat refuses the same)
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: null }), { itemKind: "membership" }), {
    ok: false, status: 403, error: LICENCE_UNVERIFIED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: "/register/provider/verify",
  });
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: "rejected" })), {
    ok: false, status: 403, error: LICENCE_RESUBMIT_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: "/register/provider/verify",
  });
  assert.deepEqual(licenceCheckoutDecision("firm", facts({ userType: "firm", lawyerStatus: null, ownedFirmStatuses: ["rejected"] })), {
    ok: false, status: 403, error: LICENCE_RESUBMIT_FIRM_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: "suspended" })), {
    ok: false, status: 403, error: LICENCE_UNVERIFIED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: "/register/provider/verify",
  });
  assert.deepEqual(licenceCheckoutDecision("firm", facts({ userType: "firm", lawyerStatus: null, ownedFirmStatuses: ["suspended"] })), {
    ok: false, status: 403, error: LICENCE_UNVERIFIED_FIRM_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
  assert.deepEqual(licenceCheckoutDecision("lawyer", null), { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR });
});

test("٢٤١ (l19) — a verified licence whose expiry date passed pays, subscribes and uses codes like any verified one", () => {
  // an expiry date in the facts (as an older caller might still pass) changes nothing
  const lawyerExpired = { ...facts(), licenceExpiry: "2020-01-01" } as ReturnType<typeof facts>;
  const firmExpired = { ...facts({ userType: "firm", lawyerStatus: null, ownedFirmStatuses: ["verified"] }), licenceExpiry: "2020-01-01" } as ReturnType<typeof facts>;
  for (const [userType, f] of [["lawyer", lawyerExpired], ["firm", firmExpired]] as const) {
    assert.equal(licenceDetail(f), "verified", userType);
    assert.deepEqual(licenceCheckoutDecision(userType, f, { itemKind: "plan" }), { ok: true, held: false }, `${userType} plan`);
    assert.deepEqual(licenceCheckoutDecision(userType, f, { itemKind: "membership" }), { ok: true, held: false }, `${userType} membership`);
    assert.deepEqual(licenceFreeCodeDecision(userType, f), { ok: true, held: false }, `${userType} free code`);
  }
  // every other l18 rule stands
  assert.equal(licenceCheckoutDecision("lawyer", { ...facts({ lawyerStatus: "rejected" }), licenceExpiry: "2020-01-01" } as ReturnType<typeof facts>).ok, false);
  assert.deepEqual(licenceCheckoutDecision("lawyer", { ...facts({ lawyerStatus: "pending" }), licenceExpiry: "2020-01-01" } as ReturnType<typeof facts>), { ok: true, held: true });
});

test("licenceDetail: the finer standing behind the ruling", () => {
  assert.equal(licenceDetail(facts()), "verified");
  assert.equal(licenceDetail(facts({ lawyerStatus: "pending", memberFirmStatuses: ["verified"] })), "verified", "works under a verified firm");
  assert.equal(licenceDetail({ ...facts({ lawyerStatus: "pending" }), licenceSubmitted: true }), "pending");
  assert.equal(licenceDetail(facts({ userType: "firm", lawyerStatus: null, ownedFirmStatuses: ["pending", "rejected"] })), "pending");
  assert.equal(licenceDetail(null), null);
});

test("a free activation needs a verified licence (nothing paid to hold): pending → 403 «فعّل الكود بعد الاعتماد»", () => {
  assert.deepEqual(licenceFreeCodeDecision("lawyer", facts()), { ok: true, held: false });
  assert.deepEqual(licenceFreeCodeDecision("lawyer", facts({ lawyerStatus: "pending" })), {
    ok: false, status: 403, error: LICENCE_FREE_CODE_PENDING_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
  assert.equal(licenceFreeCodeDecision("lawyer", facts({ lawyerStatus: "rejected" })).ok, false);
  assert.equal(licenceFreeCodeDecision("lawyer", null).ok, false);
  // l18 review: not submitted stays refused for a free activation (nothing paid to hold)
  assert.equal(licenceFreeCodeDecision("lawyer", facts({ lawyerStatus: null })).ok, false);
});
