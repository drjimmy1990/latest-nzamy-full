/**
 * founderRenewal.test.ts — batch l11 pay, register 55 / founder terms ٤:
 * the renewal setting (OFF, no invented price), the founder's 15 % on his
 * own renewal, and the 60-day notice.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/membership/founderRenewal.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FOUNDER_RENEWAL_NEEDS_PRICE_AR,
  FOUNDER_RENEWAL_NOTICE_DAYS,
  FOUNDER_RENEWAL_OFF,
  founderRenewalIssue,
  founderRenewalOffered,
  founderRenewalQuote,
  membershipEndsAt,
  parseFounderRenewal,
  renewalEmailAr,
  renewalNoticeAr,
  seatsDueForRenewalNotice,
} from "./founderRenewal.ts";

const SRC = join(import.meta.dirname, "..", "..");
const ROOT = join(SRC, "..");

test("the setting: absent or malformed is OFF with no price; a price is never guessed", () => {
  assert.deepEqual(parseFounderRenewal(undefined), FOUNDER_RENEWAL_OFF);
  assert.deepEqual(parseFounderRenewal({ enabled: true }), { enabled: false, priceHalalas: null });
  assert.deepEqual(parseFounderRenewal({ enabled: true, price_sar: 0 }), { enabled: false, priceHalalas: null });
  assert.deepEqual(parseFounderRenewal({ enabled: false, price_sar: 3990 }), { enabled: false, priceHalalas: 399000 });
  assert.deepEqual(parseFounderRenewal({ enabled: true, price_sar: 3990 }), { enabled: true, priceHalalas: 399000 });
  assert.equal(founderRenewalOffered(parseFounderRenewal({ enabled: false, price_sar: 3990 })), false);
  assert.equal(founderRenewalOffered(parseFounderRenewal({ enabled: true, price_sar: null })), false);
  assert.equal(founderRenewalOffered(parseFounderRenewal({ enabled: true, price_sar: 3990 })), true);
});

test("the admin write check: exact shape, whole SAR, no switch-on without a price", () => {
  assert.equal(founderRenewalIssue({ enabled: false, price_sar: null }), null);
  assert.equal(founderRenewalIssue({ enabled: true, price_sar: 3990 }), null);
  assert.equal(founderRenewalIssue({ enabled: true, price_sar: null }), FOUNDER_RENEWAL_NEEDS_PRICE_AR);
  for (const bad of [null, [], "x", { enabled: "yes", price_sar: 1 }, { enabled: true, price_sar: 39.9 }, { enabled: true, price_sar: -1 },
    { enabled: true, price_sar: 100_001 }, { enabled: true }, { enabled: true, price_sar: 1, extra: 1 }]) {
    assert.notEqual(founderRenewalIssue(bad), null, JSON.stringify(bad));
  }
});

test("register 55: the founder pays the announced price less 15 %, VAT on the rest — one discount only", () => {
  // 3,990 SAR announced → 15 % = 598.50 → 3,391.50 + 15 % VAT 508.73 = 3,900.23
  assert.deepEqual(founderRenewalQuote(399000, 1500), {
    listNetHalalas: 399000, discountHalalas: 59850, netHalalas: 339150, vatHalalas: 50873, totalHalalas: 390023,
  });
  assert.equal(founderRenewalQuote(399000, 0).discountHalalas, 0, "the rate setting at 0 switches it off");
});

test("the 60-day window: active seats whose year ends after now and within 60 days", () => {
  const now = new Date("2027-09-20T00:00:00Z");
  const seats = [
    { id: "a", user_id: "u1", activated_at: "2026-11-18T09:00:00Z", ends_at: "2027-11-18T09:00:00Z" }, // 59 days → due
    { id: "b", user_id: "u2", activated_at: "2026-12-01T09:00:00Z", ends_at: null }, // +12 months → 72 days → not yet
    { id: "c", user_id: "u3", activated_at: null, ends_at: "2027-09-19T00:00:00Z" }, // already ended
    { id: "d", user_id: "u4", activated_at: null, ends_at: null }, // unknowable
    { id: "e", user_id: "u5", activated_at: "2026-11-20T00:00:00Z", ends_at: null }, // +12 m = 2027-11-20 → 61 days
  ];
  assert.deepEqual(seatsDueForRenewalNotice(seats, now).map((d) => d.seat.id), ["a"]);
  assert.equal(FOUNDER_RENEWAL_NOTICE_DAYS, 60);
  assert.equal(membershipEndsAt({ activated_at: "2026-11-18T09:00:00Z" })?.toISOString(), "2027-11-18T09:00:00.000Z");
  assert.equal(membershipEndsAt({}), null);
  // nobody is due before the first membership years end (Nov 2027)
  assert.deepEqual(seatsDueForRenewalNotice(seats, new Date("2026-11-20T00:00:00Z")), []);
});

test("the notice: the announced price, the founder's price, the end of the year — no payment link", () => {
  const n = renewalNoticeAr({ endsAt: new Date("2027-11-18T09:00:00Z"), priceHalalas: 399000, bps: 1500 });
  assert.equal(n.title, "سعر تجديد باقة المحامي المؤسس");
  assert.match(n.body, /سعر التجديد للسنة التالية .+ قبل الضريبة\./);
  assert.match(n.body, /خصم ١٥٪ ما دام اشتراكك سارياً وقت التجديد/);
  assert.match(n.body, /وإذا لم تجدّد فقدت خصم المؤسس نهائياً\.$/);
  assert.equal(n.href, "/dashboard/billing");
  assert.doesNotMatch(n.href, /checkout/);
  const noRate = renewalNoticeAr({ endsAt: new Date("2027-11-18T09:00:00Z"), priceHalalas: 399000, bps: 0 });
  assert.doesNotMatch(noRate.body, /خصم ٠/);
  const mail = renewalEmailAr({ endsAt: new Date("2027-11-18T09:00:00Z"), priceHalalas: 399000, bps: 1500, siteOrigin: "https://nezamy.sa/" });
  assert.equal(mail.action?.href, "https://nezamy.sa/dashboard/billing");
  assert.equal(renewalEmailAr({ endsAt: new Date(), priceHalalas: 1, bps: 1500, siteOrigin: "http://x" }).action, null);
});

test("the cron: secret first, OFF reads nothing more, once per seat and year, e-mail through sendEmail", () => {
  const route = readFileSync(join(SRC, "app", "api", "v1", "cron", "founder-renewal-notice", "route.ts"), "utf8");
  const off = route.indexOf('skipped: "off"');
  assert.ok(route.indexOf("cronSecretMatches(") < route.indexOf('.from("platform_settings")'));
  assert.ok(off > 0 && off < route.indexOf('.from("founder_seats")'), "the switch is read before any seat");
  assert.ok(route.includes('{ onConflict: "seat_id,cycle_end", ignoreDuplicates: true }'));
  assert.ok(route.includes("if (!inserted || inserted.length === 0)"));
  assert.ok(route.includes("await sendEmail({"));
  assert.ok(route.includes("userIds: [seat.user_id]"), "a test account's mail is sunk");
});

test("the admin can set it; the migration ships it OFF with no price", () => {
  const settings = readFileSync(join(SRC, "app", "api", "v1", "admin", "settings", "route.ts"), "utf8");
  assert.ok(settings.includes('"founder_renewal",'));
  assert.ok(settings.includes("founder_renewal: founderRenewalIssue,"));
  const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261201_20_pay_guest_offers_founder_renewal.sql"), "utf8");
  assert.ok(sql.includes(`('founder_renewal', '{"enabled": false, "price_sar": null}'::jsonb,`));
  assert.ok(sql.includes("on conflict (key) do nothing"));
});
