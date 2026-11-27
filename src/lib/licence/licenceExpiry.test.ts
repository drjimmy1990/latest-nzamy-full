/**
 * licenceExpiry.test.ts — owner ٢٤١ (batch l19): the licence expiry alerts
 * that replace l18's «جدّد رخصتك أولاً» refusal — the bands (30 / 7 / the
 * last day or past, once each, only the most urgent), the owner's sentence
 * with Arabic number agreement, the mute rule, the banner's reply parser, and
 * source pins for the cron route, the banner route and where the banner sits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LICENCE_CONTACT_HREF,
  LICENCE_UPLOAD_HREF,
  bannerLicence,
  licenceBannerFromReply,
  licenceDaysLeft,
  licenceExpiryKind,
  licenceExpiryNotice,
  licenceExpiryStage,
  licenceNoticeMuted,
  planLicenceExpiryNotices,
  riyadhToday,
} from "./licenceExpiry.ts";
import { isGeneralRateLimitedApiPath } from "../rateLimitRoutes.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");
// 22:30 UTC on 27 Nov = already 28 Nov in Riyadh
const NOW = new Date("2026-11-27T22:30:00Z");

test("days left count Riyadh's day; an unreadable date is null", () => {
  assert.equal(riyadhToday(NOW), "2026-11-28");
  assert.equal(licenceDaysLeft("2026-11-28", NOW), 0);
  assert.equal(licenceDaysLeft("2026-11-27", NOW), -1);
  assert.equal(licenceDaysLeft("2026-12-28", NOW), 30);
  assert.equal(licenceDaysLeft("2026-12-05T00:00:00", NOW), 7);
  for (const bad of [null, undefined, "", "soon", 20261201]) assert.equal(licenceDaysLeft(bad, NOW), null, String(bad));
});

test("bands: 8–30 → 30d, 1–7 → 7d, the last day or past → 0d, beyond 30 → none", () => {
  assert.deepEqual([31, 30, 8, 7, 1, 0, -1, -400].map(licenceExpiryStage), [null, "30d", "30d", "7d", "7d", "0d", "0d", "0d"]);
  assert.equal(licenceExpiryStage(null), null);
  assert.deepEqual((["30d", "7d", "0d"] as const).map(licenceExpiryKind), ["licence_expiry_30d_app", "licence_expiry_7d_app", "licence_expiry_0d_app"]);
});

test("the plan: one stage per licence, the most urgent only; rows beyond 30 days or unreadable are left out", () => {
  const rows = [
    { user_id: "a", holder: "lawyer", subject_id: "a", expiry: "2026-12-01" }, // 3 days → 7d (never also 30d)
    { user_id: "b", holder: "firm", subject_id: "f-1", expiry: "2026-12-20" }, // 22 → 30d
    { user_id: "c", holder: "provider", subject_id: "c", expiry: "2025-01-01" }, // past → 0d
    { user_id: "d", holder: "lawyer", subject_id: "d", expiry: "2027-06-01" }, // beyond
    { user_id: "e", holder: "lawyer", subject_id: "e", expiry: "?" },
  ];
  assert.deepEqual(planLicenceExpiryNotices(rows, NOW).map((p) => [p.row.user_id, p.stage]), [["a", "7d"], ["b", "30d"], ["c", "0d"]]);
  // the banner shows the nearest / longest-past licence of the caller
  assert.equal(bannerLicence(rows, NOW)?.row.user_id, "c");
  assert.equal(bannerLicence([rows[3]], NOW), null);
});

test("the owner's sentence, with Arabic number agreement; a firm reads «ترخيص مكتبك»", () => {
  const lawyer = (d: number) => licenceExpiryNotice("lawyer", d).title;
  assert.equal(lawyer(1), "تنبيه: رخصتك المهنية تنتهي خلال يوم واحد");
  assert.equal(lawyer(2), "تنبيه: رخصتك المهنية تنتهي خلال يومين");
  assert.equal(lawyer(5), "تنبيه: رخصتك المهنية تنتهي خلال ٥ أيام");
  assert.equal(lawyer(30), "تنبيه: رخصتك المهنية تنتهي خلال ٣٠ يومًا");
  assert.equal(lawyer(0), "تنبيه: رخصتك المهنية تنتهي اليوم");
  assert.equal(lawyer(-3), "تنبيه: رخصتك المهنية انتهت");
  const l = licenceExpiryNotice("lawyer", 7);
  assert.ok(l.body.startsWith("يرجى رفع تجديد الرخصة حتى تستطيع الاستمرار في استخدام المنصة."), l.body);
  assert.deepEqual([l.href, l.hrefLabel], [LICENCE_UPLOAD_HREF, "رفع الرخصة المجدّدة"]);
  const f = licenceExpiryNotice("firm", 12);
  assert.equal(f.title, "تنبيه: ترخيص مكتبك ينتهي خلال ١٢ يومًا");
  assert.equal(licenceExpiryNotice("firm", -1).title, "تنبيه: ترخيص مكتبك انتهى");
  assert.ok(f.body.startsWith("يرجى رفع تجديد الترخيص"), f.body);
  assert.equal(f.href, LICENCE_CONTACT_HREF);
  const p = licenceExpiryNotice("provider", 3);
  assert.equal(p.title, "تنبيه: رخصتك المهنية تنتهي خلال ٣ أيام");
  assert.equal(p.href, LICENCE_CONTACT_HREF);
  for (const n of [l, f, p, licenceExpiryNotice("lawyer", -9)]) assert.doesNotMatch(`${n.title} ${n.body}`, /[0-9]|undefined|null|NaN/);
});

test("muted: notifications off, or the «تجديدات الترخيص» category off; no settings row = told", () => {
  assert.equal(licenceNoticeMuted(null), false);
  assert.equal(licenceNoticeMuted({ notifications_enabled: true, preferences: {} }), false);
  assert.equal(licenceNoticeMuted({ notifications_enabled: false }), true);
  assert.equal(licenceNoticeMuted({ preferences: { notifications: { categories: { license_expiry: false } } } }), true);
  assert.equal(licenceNoticeMuted({ preferences: { notifications: { categories: { license_expiry: true, reminders: false } } } }), false);
});

test("the banner's reply parser: only a well-formed alert with an in-site link", () => {
  const alert = { ...licenceExpiryNotice("lawyer", 4), daysLeft: 4, stage: "7d" };
  assert.deepEqual(licenceBannerFromReply({ alert }), alert);
  for (const bad of [null, {}, { alert: null }, { alert: { ...alert, stage: "9d" } }, { alert: { ...alert, href: "https://elsewhere.example" } }, { alert: { ...alert, href: "//x" } }, { alert: { ...alert, daysLeft: "4" } }]) {
    assert.equal(licenceBannerFromReply(bad), null, JSON.stringify(bad));
  }
});

test("source: the cron checks the secret first, is not rate-limited, sends in-app ONCE (marked), honours the mute and the suspension, stops on a missing schema", () => {
  const src = read("src", "app", "api", "v1", "cron", "licence-expiry", "route.ts");
  const post = src.slice(src.indexOf("export async function POST("));
  const checkAt = post.indexOf('cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)');
  assert.ok(checkAt > -1 && post.indexOf("status: 401") > checkAt && post.indexOf("createServiceClient(") > post.indexOf("status: 401"));
  assert.equal(isGeneralRateLimitedApiPath("POST", "/api/v1/cron/licence-expiry"), false);
  assert.match(src, /export const dynamic = "force-dynamic";/);
  assert.match(src, /admin\.rpc\("licence_expiry_alerts", \{\s*p_user_ids: null,\s*p_horizon_days: LICENCE_EXPIRY_HORIZON_DAYS,/);
  assert.match(src, /await notifyReminderOnce\(/);
  assert.match(src, /dueOn: p\.row\.expiry\.slice\(0, 10\)/, "keyed on the licence date: a renewed date is a new cycle");
  assert.doesNotMatch(src, /recordNotification\(|\bsendEmail\(/, "never an unmarked send");
  assert.match(src, /licenceNoticeMuted\(byUser\.get\(id\)\)/);
  assert.match(src, /admin_suspended_user_ids/);
  assert.match(src, /if \(outcome === "schema_missing"\)/);
  assert.match(src, /if \(settings\.error\) \{[\s\S]{0,200}continue;/, "a failed settings read sends nothing for those accounts");
});

test("source: the banner route asks for the session's own id only, licensed types only, never caches; the banner sits on the three dashboards and Settings", () => {
  const src = read("src", "app", "api", "v1", "me", "licence-expiry", "route.ts");
  assert.match(src, /const auth = await assertRole\(\);/);
  assert.match(src, /p_user_ids: \[auth\.user\.id\]/);
  assert.match(src, /new Set\(\["lawyer", "firm", "provider"\]\)/);
  assert.match(src, /"Cache-Control": "private, no-store"/);
  for (const page of [
    ["src", "app", "dashboard", "lawyer", "layout.tsx"],
    ["src", "app", "dashboard", "firm", "layout.tsx"],
    ["src", "app", "dashboard", "provider", "layout.tsx"],
    ["src", "app", "settings", "page.tsx"],
  ]) {
    const s = read(...page);
    assert.match(s, /import LicenceExpiryBanner from "@\/components\/dashboard\/LicenceExpiryBanner";/, page.join("/"));
    assert.match(s, /<LicenceExpiryBanner \/>/, page.join("/"));
  }
  const tab = read("src", "app", "settings", "components", "tabs", "NotificationsTab.tsx");
  assert.equal((tab.match(/key: "license_expiry"/g) ?? []).length, 3, "lawyer, firm and provider can mute it");
});

test("٢٤١: no licence expiry refusal is left on the purchase paths", () => {
  for (const f of [
    ["src", "lib", "payments", "licenceGate.ts"],
    ["src", "lib", "payments", "checkoutCore.ts"],
    ["src", "lib", "payments", "couponRedeemCore.ts"],
    ["src", "lib", "payments", "heldPlanActivation.ts"],
    ["src", "lib", "pricing", "founderCard.ts"],
    ["src", "app", "checkout", "page.tsx"],
  ]) {
    const s = read(...f);
    assert.doesNotMatch(s, /جدّد رخصتك أولاً"|LICENCE_EXPIRED_PURCHASE_AR|license_expiry|detail === "expired"/, f.join("/"));
  }
});
