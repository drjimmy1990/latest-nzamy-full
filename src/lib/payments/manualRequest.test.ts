import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { couponNoteLine, normalizeRequestCoupon, noteWithCoupon, requestFiledAr, requestReference } from "./manualRequest.ts";

test("A-56: the request reference is the id's first 8 characters, upper case; the toast names it and the paused payment", () => {
  assert.equal(requestReference("3f2a9c1b-0000-4000-8000-000000000001"), "#3F2A9C1B");
  for (const bad of [null, undefined, "", "abc", 12, "3f2a9c1b"]) assert.equal(requestReference(bad), null);
  assert.match(requestFiledAr("3f2a9c1b-0000-4000-8000-000000000001"), /رقم الطلب #3F2A9C1B/);
  assert.match(requestFiledAr("3f2a9c1b-0000-4000-8000-000000000001"), /الدفع الإلكتروني متوقف مؤقتاً/);
  assert.doesNotMatch(requestFiledAr(null), /#/);
});

test("A-59: an attached code is shape-checked and carried as one note line", () => {
  assert.equal(normalizeRequestCoupon(" nzamy50 "), "NZAMY50");
  for (const bad of ["", "ab", "has space", "x".repeat(41), "شيء", 5, null]) assert.equal(normalizeRequestCoupon(bad), null, String(bad));
  assert.equal(noteWithCoupon("باقة إدارة المكتب", "NZAMY50"), `باقة إدارة المكتب\n${couponNoteLine("NZAMY50")}`);
  assert.equal(noteWithCoupon(undefined, "NZAMY50"), couponNoteLine("NZAMY50"));
  assert.equal(noteWithCoupon(undefined, null), null);
  assert.equal(noteWithCoupon(" x ", null), " x ", "without a code the note is stored as sent");
});

test("source contract: the signed-in buy button is a <button>, the toast carries the reference, the route stores the code", () => {
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
  const cards = read("../../components/pricing/PricingCards.tsx");
  assert.match(cards, /const memberBuy = signedIn && cta\.ctaHref === plan\.ctaHref && isSubscribeCta\(plan\.ctaHref\);/);
  assert.match(cards, /<motion\.button\s+type="button"\s+onClick=\{\(\) => \{\s*onSubscribe\?\.\(plan\);/);
  assert.match(cards, /msg: requestFiledAr\(res\.id\)/);
  const route = read("../../app/api/v1/entitlement-requests/route.ts");
  assert.match(route, /note: noteWithCoupon\(body\.note, coupon\)/);
});
