/**
 * cardCta.test.ts — backlog UX14: a signed-in member sees «إدارة باقتي» on a
 * sign-up button, and every other button is left alone.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { MANAGE_PLAN_HREF, signedInCta } from "./cardCta.ts";

test("a guest keeps every button as written", () => {
  for (const card of [
    { cta: "سجّل مجاناً", ctaHref: "/register/client?type=micro&plan=micro-free" },
    { cta: "اشترك الآن", ctaHref: "/register/provider?plan=lawyer-pro" },
    { cta: "Sign up free", ctaHref: "/register/provider" },
  ]) {
    assert.deepEqual(signedInCta(card, false, true), card);
  }
});

test("a signed-in member: a sign-up button becomes «إدارة باقتي» → the subscription settings", () => {
  for (const cta of ["سجّل مجاناً", "سجل الآن", "إنشاء حساب"]) {
    assert.deepEqual(signedInCta({ cta, ctaHref: "/register/client" }, true, true), { cta: "إدارة باقتي", ctaHref: MANAGE_PLAN_HREF });
  }
  for (const cta of ["Sign up free", "Register", "signup"]) {
    assert.deepEqual(signedInCta({ cta, ctaHref: "/register/provider" }, true, false), { cta: "Manage my plan", ctaHref: MANAGE_PLAN_HREF });
  }
  assert.equal(MANAGE_PLAN_HREF, "/settings?tab=subscription");
});

test("a signed-in member: subscribe, top-up and sales buttons are left alone (the subscribe handler sends them on)", () => {
  for (const card of [
    { cta: "اشترك الآن", ctaHref: "/register/provider?plan=lawyer-pro" },
    { cta: "اشحن الآن", ctaHref: "/register/provider?plan=topup-500" },
    { cta: "تواصل مع المبيعات", ctaHref: "/contact" },
    { cta: "Subscribe", ctaHref: "/register/provider?plan=lawyer-pro" },
  ]) {
    assert.deepEqual(signedInCta(card, true, true), card);
  }
});

test("the settings page has the subscription tab the link opens", () => {
  const settings = readFileSync(new URL("../../app/settings/page.tsx", import.meta.url), "utf8");
  assert.match(settings, /subscription/);
});
