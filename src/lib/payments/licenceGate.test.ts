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
  LICENCE_EXPIRED_PURCHASE_AR,
  LICENCE_RESUBMIT_FIRM_PURCHASE_AR,
  LICENCE_RESUBMIT_PURCHASE_AR,
  licenceCheckoutDecision,
  licenceDetail,
  licenceExpired,
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

test("٢٣٩ (l18 review ruling) — a paid purchase: verified goes; PENDING and NOT SUBMITTED go held; rejected → «أعد تقديم التوثيق أولاً»; suspended → verify; expired → «جدّد رخصتك أولاً»; unread → 503", () => {
  const NOW = new Date("2026-11-27T08:00:00Z");
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts(), { now: NOW }), { ok: true, held: false });
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: "pending" }), { now: NOW }), { ok: true, held: true });
  // never submitted: no lawyer row, or a pending row without the licence image → held, and the copy asks for it
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: null }), { itemKind: "plan", now: NOW }), { ok: true, held: true, submitLicence: true });
  assert.deepEqual(licenceCheckoutDecision("lawyer", { ...facts({ lawyerStatus: "pending" }), licenceSubmitted: false }, { itemKind: "plan", now: NOW }), { ok: true, held: true, submitLicence: true });
  assert.deepEqual(licenceCheckoutDecision("firm", facts({ userType: "firm", lawyerStatus: null }), { itemKind: "plan", now: NOW }), { ok: true, held: true, submitLicence: true });
  // the founder membership still needs a submitted licence (founder_reserve_seat refuses the same)
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: null }), { itemKind: "membership", now: NOW }), {
    ok: false, status: 403, error: LICENCE_UNVERIFIED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: "/register/provider/verify",
  });
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: "rejected" }), { now: NOW }), {
    ok: false, status: 403, error: LICENCE_RESUBMIT_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: "/register/provider/verify",
  });
  assert.deepEqual(licenceCheckoutDecision("firm", facts({ userType: "firm", lawyerStatus: null, ownedFirmStatuses: ["rejected"] }), { now: NOW }), {
    ok: false, status: 403, error: LICENCE_RESUBMIT_FIRM_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
  assert.deepEqual(licenceCheckoutDecision("lawyer", facts({ lawyerStatus: "suspended" }), { now: NOW }), {
    ok: false, status: 403, error: LICENCE_UNVERIFIED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: "/register/provider/verify",
  });
  assert.deepEqual(licenceCheckoutDecision("firm", facts({ userType: "firm", lawyerStatus: null, ownedFirmStatuses: ["suspended"] }), { now: NOW }), {
    ok: false, status: 403, error: LICENCE_UNVERIFIED_FIRM_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
  // verified, but the recorded expiry passed (Riyadh day) → renew first; today or later → goes
  assert.deepEqual(licenceCheckoutDecision("lawyer", { ...facts(), licenceExpiry: "2026-11-26" }, { now: NOW }), {
    ok: false, status: 403, error: LICENCE_EXPIRED_PURCHASE_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
  assert.deepEqual(licenceCheckoutDecision("lawyer", { ...facts(), licenceExpiry: "2026-11-27" }, { now: NOW }), { ok: true, held: false });
  assert.deepEqual(licenceCheckoutDecision("lawyer", { ...facts(), licenceExpiry: "not a date" }, { now: NOW }), { ok: true, held: false });
  assert.deepEqual(licenceCheckoutDecision("lawyer", null), { ok: false, status: 503, error: LICENCE_CHECK_FAILED_AR });
});

test("licenceDetail and licenceExpired: the finer standing behind the ruling", () => {
  const NOW = new Date("2026-11-27T22:30:00Z"); // already 28 Nov in Riyadh
  assert.equal(licenceExpired("2026-11-27", NOW), true);
  assert.equal(licenceExpired("2026-11-28", NOW), false);
  assert.equal(licenceExpired(null, NOW), false);
  assert.equal(licenceDetail(facts({ lawyerStatus: "pending", memberFirmStatuses: ["verified"] }), NOW), "verified", "works under a verified firm");
  assert.equal(licenceDetail({ ...facts({ lawyerStatus: "pending" }), licenceSubmitted: true }, NOW), "pending");
  assert.equal(licenceDetail(facts({ userType: "firm", lawyerStatus: null, ownedFirmStatuses: ["pending", "rejected"] }), NOW), "pending");
  assert.equal(licenceDetail(null, NOW), null);
});

test("a free activation needs a verified licence (nothing paid to hold): pending → 403 «فعّل الكود بعد الاعتماد»", () => {
  assert.deepEqual(licenceFreeCodeDecision("lawyer", facts()), { ok: true, held: false });
  assert.deepEqual(licenceFreeCodeDecision("lawyer", facts({ lawyerStatus: "pending" })), {
    ok: false, status: 403, error: LICENCE_FREE_CODE_PENDING_AR, code: LICENCE_PURCHASE_CODE, verifyHref: null,
  });
  assert.equal(licenceFreeCodeDecision("lawyer", facts({ lawyerStatus: "rejected" })).ok, false);
  assert.equal(licenceFreeCodeDecision("lawyer", null).ok, false);
  // l18 review: not submitted and expired stay refused for a free activation (nothing paid to hold)
  assert.equal(licenceFreeCodeDecision("lawyer", facts({ lawyerStatus: null })).ok, false);
  const expired = licenceFreeCodeDecision("lawyer", { ...facts(), licenceExpiry: "2020-01-01" });
  assert.equal(expired.ok === false && expired.error, LICENCE_EXPIRED_PURCHASE_AR);
});
