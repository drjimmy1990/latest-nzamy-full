/**
 * founderInvites.test.ts — owner Q144 أ (batch l13; SQL 20261203_20): the
 * founder's monthly invites, the pure half, plus source pins of the two
 * routes, the invite page and the rate-limit entry.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/founder/founderInvites.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CREATE_REFUSAL_AR,
  FOUNDER_INVITES_DEFAULTS,
  INVITES_GATEWAY_OFF_AR,
  REDEEM_REFUSAL_AR,
  REDEEM_RESULTS,
  founderInvitesIssue,
  founderInvitesValue,
  founderInvitesView,
  formatInviteCode,
  inviteGiftAr,
  inviteLinkPath,
  inviteStatus,
  normalizeInviteCode,
  parseFounderInvites,
  redeemResultOf,
  redeemStatus,
  redeemSuccessAr,
  riyadhMonthKey,
  type InviteRow,
} from "./founderInvites.ts";
import { isStrictRateLimitedRoute } from "../rateLimitRoutes.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the defaults are the owner's answer: 3 a month, 30-day library trial, 50 points for the library assistant", () => {
  assert.deepEqual({ ...FOUNDER_INVITES_DEFAULTS }, { monthly: 3, trialDays: 30, points: 50, pointsScope: "library_agent", validDays: 30 });
  assert.deepEqual(parseFounderInvites(null), { ...FOUNDER_INVITES_DEFAULTS });
  assert.equal(inviteGiftAr(FOUNDER_INVITES_DEFAULTS), "تجربة المكتبة القانونية ٣٠ يوماً مع ٥٠ نقطة لمساعد المكتبة صالحة مدة التجربة");
});

test("parseFounderInvites: a malformed field reads as its default, a good one is kept (as founder_invite_settings())", () => {
  assert.deepEqual(
    parseFounderInvites({ monthly: "x", trial_days: 0, points: -1, points_scope: "all", valid_days: 9999 }),
    { ...FOUNDER_INVITES_DEFAULTS },
  );
  assert.deepEqual(parseFounderInvites({ monthly: 5, trial_days: 7, points: 0, points_scope: "general", valid_days: 10 }), {
    monthly: 5, trialDays: 7, points: 0, pointsScope: "general", validDays: 10,
  });
  assert.equal(parseFounderInvites({ monthly: 2.5 }).monthly, 3);
});

test("founderInvitesIssue: exactly the five keys, integers in range, a known wallet", () => {
  assert.equal(founderInvitesIssue(founderInvitesValue(FOUNDER_INVITES_DEFAULTS)), null);
  assert.equal(founderInvitesIssue({ monthly: 20, trial_days: 365, points: 0, points_scope: "general", valid_days: 1 }), null);
  for (const bad of [
    null, [], "x",
    { monthly: 3, trial_days: 30, points: 50, points_scope: "library_agent" },
    { monthly: 3, trial_days: 30, points: 50, points_scope: "library_agent", valid_days: 30, extra: 1 },
    { monthly: 0, trial_days: 30, points: 50, points_scope: "library_agent", valid_days: 30 },
    { monthly: 21, trial_days: 30, points: 50, points_scope: "library_agent", valid_days: 30 },
    { monthly: 3, trial_days: 366, points: 50, points_scope: "library_agent", valid_days: 30 },
    { monthly: 3, trial_days: 30, points: 10_001, points_scope: "library_agent", valid_days: 30 },
    { monthly: 3, trial_days: 30, points: 1.5, points_scope: "library_agent", valid_days: 30 },
    { monthly: 3, trial_days: 30, points: 50, points_scope: "all", valid_days: 30 },
    { monthly: 3, trial_days: 30, points: 50, points_scope: "library_agent", valid_days: 0 },
  ]) assert.ok(founderInvitesIssue(bad), JSON.stringify(bad));
});

test("codes: spaces, dashes and case are forgiven; anything but 16 hex is refused", () => {
  assert.equal(normalizeInviteCode("abcd-1234-ef56-7890"), "ABCD1234EF567890");
  assert.equal(normalizeInviteCode(" ABCD 1234 EF56 7890 "), "ABCD1234EF567890");
  for (const bad of ["", "nope", "ABCD1234EF56789", "ABCD1234EF5678901", "GHIJ1234EF567890", 42, null, "A".repeat(80)]) {
    assert.equal(normalizeInviteCode(bad), null, String(bad));
  }
  assert.equal(formatInviteCode("ABCD1234EF567890"), "ABCD-1234-EF56-7890");
  assert.equal(inviteLinkPath("ABCD1234EF567890"), "/founder/invite/ABCD1234EF567890");
});

test("riyadhMonthKey: the Riyadh calendar month (UTC+3) — 21:00 UTC on the last day is already next month", () => {
  assert.equal(riyadhMonthKey(new Date("2026-11-30T20:59:59Z")), "2026-11");
  assert.equal(riyadhMonthKey(new Date("2026-11-30T21:00:00Z")), "2026-12");
  assert.equal(riyadhMonthKey(new Date("2026-12-31T21:30:00Z")), "2027-01");
});

test("redeem answers: every database result has an Arabic line and a status", () => {
  assert.deepEqual([...REDEEM_RESULTS].sort(), [
    "already_redeemed", "expired", "founder_inactive", "invalid", "not_lawyer", "not_new", "ok", "pending_verification", "self", "used",
  ]);
  for (const r of REDEEM_RESULTS) {
    if (r === "ok") continue;
    assert.ok(REDEEM_REFUSAL_AR[r].length > 10, r);
    assert.ok(!/[A-Za-z]/.test(REDEEM_REFUSAL_AR[r]), `${r}: no Latin words in the user's line`);
  }
  assert.equal(redeemStatus("ok"), 200);
  assert.equal(redeemStatus("invalid"), 400);
  assert.equal(redeemStatus("not_new"), 403);
  assert.equal(redeemStatus("not_lawyer"), 403);
  assert.equal(redeemStatus("expired"), 409);
  assert.equal(redeemStatus("pending_verification"), 409);
  assert.equal(redeemResultOf({ result: "ok" }), "ok");
  assert.equal(redeemResultOf({ result: "weird" }), null);
  assert.equal(redeemResultOf(null), null);
  assert.ok(CREATE_REFUSAL_AR.limit.includes("لا تتراكم"));
  assert.match(INVITES_GATEWAY_OFF_AR, /بعد تفعيل الدفع الإلكتروني/);
  assert.match(redeemSuccessAr("2026-12-23T10:00:00Z", FOUNDER_INVITES_DEFAULTS), /حتى ٢٠٢٦-١٢-٢٣/);
  assert.equal(inviteGiftAr({ ...FOUNDER_INVITES_DEFAULTS, points: 0 }), "تجربة المكتبة القانونية ٣٠ يوماً");
});

test("founderInvitesView: this month's allowance from the rows of this Riyadh month only; statuses; newest first", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const row = (code: string, created: string, expires: string, redeemed: string | null, month: string): InviteRow => ({
    code, created_at: created, expires_at: expires, redeemed_at: redeemed, month_key: month,
  });
  const rows = [
    row("AAAAAAAAAAAAAAAA", "2026-10-30T10:00:00Z", "2026-11-29T10:00:00Z", null, "2026-10"),
    row("BBBBBBBBBBBBBBBB", "2026-11-02T10:00:00Z", "2026-12-02T10:00:00Z", "2026-11-03T10:00:00Z", "2026-11"),
    row("CCCCCCCCCCCCCCCC", "2026-11-05T10:00:00Z", "2026-11-20T10:00:00Z", null, "2026-11"),
  ];
  const v = founderInvitesView(rows, FOUNDER_INVITES_DEFAULTS, now);
  assert.equal(v.used, 2);
  assert.equal(v.remaining, 1);
  assert.equal(v.remainingAr, "دعوات هذا الشهر: بقي ١ من ٣، ولا تتراكم.");
  assert.deepEqual(v.items.map((i) => [i.code, i.status]), [
    ["CCCCCCCCCCCCCCCC", "expired"], ["BBBBBBBBBBBBBBBB", "redeemed"], ["AAAAAAAAAAAAAAAA", "open"],
  ]);
  assert.equal(v.items[2].linkPath, "/founder/invite/AAAAAAAAAAAAAAAA");
  const full = founderInvitesView([...rows, row("DDDDDDDDDDDDDDDD", "2026-11-20T10:00:00Z", "2026-12-20T10:00:00Z", null, "2026-11")], FOUNDER_INVITES_DEFAULTS, now);
  assert.equal(full.remaining, 0);
  assert.match(full.remainingAr, /تتجدد أول الشهر القادم/);
  assert.equal(inviteStatus(row("E", "x", "not a date", null, "2026-11"), now), "expired");
});

test("the routes: payment gateway checked before the database, the code in the body, service client keyed by the session", () => {
  const create = read("../../app/api/v1/membership/founder/invites/route.ts");
  const redeem = read("../../app/api/v1/membership/founder/invites/redeem/route.ts");
  for (const src of [create, redeem]) {
    assert.match(src, /requireApiUser\(/);
    assert.match(src, /invitesGatewayOn\(userId\)/);
    assert.match(src, /gateway_off/);
    assert.match(src, /private, no-store/);
  }
  assert.ok(create.indexOf("invitesGatewayOn(userId)") < create.indexOf('rpc("founder_invite_create"'), "create: gateway before the RPC");
  assert.ok(redeem.indexOf("invitesGatewayOn(userId)") < redeem.indexOf('rpc("founder_invite_redeem"'), "redeem: gateway before the RPC");
  assert.ok(redeem.indexOf("normalizeInviteCode(") < redeem.indexOf("invitesGatewayOn(userId)"), "redeem: a malformed code never reaches the database");
  assert.match(create, /p_founder: userId/);
  assert.match(redeem, /p_user: userId, p_code: code/);
  // never who redeemed an invite
  assert.doesNotMatch(create, /redeemed_by/);
  assert.equal(isStrictRateLimitedRoute("POST", "/api/v1/membership/founder/invites/redeem"), true);
  assert.equal(isStrictRateLimitedRoute("GET", "/api/v1/membership/founder/invites/redeem"), false);
});

test("the invite page: noindex, no code lookup, the honest gateway line, no button while payment is off", () => {
  const page = read("../../app/founder/invite/[code]/page.tsx");
  assert.match(page, /noIndex: true/);
  assert.doesNotMatch(page, /from\("founder_invites"\)/);
  assert.match(page, /INVITES_GATEWAY_OFF_AR/);
  assert.ok(page.indexOf("!gatewayOn ?") < page.indexOf("<RedeemInvite"), "the button only when payment is on");
  const card = read("../../app/dashboard/lawyer/_components/FounderInvitesCard.tsx");
  assert.match(card, /!reply\.ready \|\| !reply\.gatewayOn/);
});
