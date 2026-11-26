/**
 * gatewayErrorAr.test.ts — batch l18 (LIVE-14 / LIVE-15): the gateway's
 * refusal in Arabic, never the raw English, and the reason read out of the
 * Moyasar form's on_failure report.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutRefusalNoticeAr, failureReason, gatewayErrorAr, GATEWAY_DECLINED_GENERIC_AR } from "./gatewayErrorAr.ts";

const arabicOnly = (s: string) => /[؀-ۿ]/.test(s) && !/[A-Za-z]{4,}/.test(s.replace(/CVV/g, ""));

test("the owner's live case: BLOCKED: CARD COUNTRY NOT ALLOWED (any spelling) → the country sentence", () => {
  for (const m of ["BLOCKED: CARD COUNTRY NOT ALLOWED", "card_country_not_allowed", "Card country is not allowed", "CARD-COUNTRY-NOT-ALLOWED"]) {
    const ar = gatewayErrorAr(m);
    assert.ok(ar.includes("بلد إصدارها"), `${m} → ${ar}`);
    assert.ok(arabicOnly(ar), ar);
  }
});

test("the common refusals each get their own Arabic sentence", () => {
  const cases: Array<[string, string]> = [
    ["Insufficient Funds", "رصيد البطاقة"],
    ["3-D Secure transaction attempt failed", "التحقق البنكي"],
    ["AUTHENTICATION_FAILED", "التحقق البنكي"],
    ["Expired Card", "منتهية الصلاحية"],
    ["Invalid card number", "بيانات البطاقة غير صحيحة"],
    ["invalid cvc", "بيانات البطاقة غير صحيحة"],
    ["DECLINED: Do not honor", "رفض البنك المصدر"],
    ["Exceeds withdrawal amount limit", "الحد المسموح"],
    ["Connection lost — timeout", "انقطع الاتصال"],
    ["Stolen card, pick up", "رفض البنك المصدر"],
  ];
  for (const [m, part] of cases) assert.ok(gatewayErrorAr(m).includes(part), `${m} → ${gatewayErrorAr(m)}`);
});

test("unknown, empty or missing → one generic Arabic sentence; Arabic from the gateway is kept", () => {
  assert.equal(gatewayErrorAr("ZXQ-77 something new"), GATEWAY_DECLINED_GENERIC_AR);
  assert.equal(gatewayErrorAr(""), GATEWAY_DECLINED_GENERIC_AR);
  assert.equal(gatewayErrorAr(null), GATEWAY_DECLINED_GENERIC_AR);
  assert.equal(gatewayErrorAr(undefined), GATEWAY_DECLINED_GENERIC_AR);
  assert.equal(gatewayErrorAr("  رصيد غير كافٍ  "), "رصيد غير كافٍ");
});

test("failureReason reads the form's report: a string, message, source.message or error.message", () => {
  assert.equal(failureReason("  Card declined "), "Card declined");
  assert.equal(failureReason({ message: "Insufficient Funds" }), "Insufficient Funds");
  assert.equal(failureReason({ status: "failed", source: { message: "BLOCKED: CARD COUNTRY NOT ALLOWED" } }), "BLOCKED: CARD COUNTRY NOT ALLOWED");
  assert.equal(failureReason({ error: { message: "timeout" } }), "timeout");
  assert.equal(failureReason({ type: "intent_not_fulfillable" }), null);
  assert.equal(failureReason(null), null);
  assert.equal(failureReason(42), null);
  assert.equal(failureReason("x".repeat(400))?.length, 300);
});

test("the /checkout notice: the reason in Arabic, then how to try again", () => {
  const n = checkoutRefusalNoticeAr({ source: { message: "BLOCKED: CARD COUNTRY NOT ALLOWED" } });
  assert.ok(n.includes("بلد إصدارها") && n.includes("«متابعة الدفع»"), n);
  assert.ok(!/BLOCKED|COUNTRY/i.test(n));
});

// l18 review S5: a timeout can follow a charge that went through — never a promise that nothing was taken.
test("a timeout says the result is being checked and points to billing before paying again", () => {
  for (const m of ["timeout", "Connection lost — timeout", "network error", "service unavailable"]) {
    const ar = gatewayErrorAr(m);
    assert.ok(ar.includes("قيد التحقق") && ar.includes("«الفواتير»"), `${m} → ${ar}`);
    assert.doesNotMatch(ar, /لن يُخصم|لا يُخصم/, `${m}: no promise of no charge`);
  }
});
