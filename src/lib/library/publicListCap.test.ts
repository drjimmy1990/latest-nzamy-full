/**
 * Q100a (batch l12): the non-subscriber LIST cap — 30 items a day / 100 a
 * week (the owner's numbers), SHIPPED OFF until he approves the evidence
 * (question ١٥٨). The pure rules, the wiring in /api/library/init and
 * /api/library/search, the admin route, and the migration's defaults. The
 * counting itself is proved in Docker (supabase/tests/rls/l12_rules.test.sql).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LIST_CAP_DEFAULTS,
  LIST_EVIDENCE_REQUIRED_AR,
  PUBLIC_LIST_LIMIT_CODE,
  allowedListKeys,
  keepAllowed,
  listCapSettingsFromRow,
  listItemKey,
  listLimitMessageAr,
  listLimitNotice,
  parseListCapPatch,
  parseListHitRow,
} from "./publicListCap.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("Q100a: ships OFF with 30 / 100 (and 150 / 500 for one address); a row's odd column keeps its default", () => {
  assert.deepEqual({ ...LIST_CAP_DEFAULTS }, { enabled: false, daily: 30, weekly: 100, addressDaily: 150, addressWeekly: 500 });
  assert.deepEqual(listCapSettingsFromRow(null), { ...LIST_CAP_DEFAULTS });
  assert.deepEqual(
    listCapSettingsFromRow({ non_subscriber_list_limit_enabled: true, non_subscriber_list_daily_limit: 10, non_subscriber_list_weekly_limit: "x" }),
    { enabled: true, daily: 10, weekly: 100, addressDaily: 150, addressWeekly: 500 },
  );
});

test("Q100a: switching it ON needs the evidence confirmation (409); numbers in bounds; unknown fields refused", () => {
  const off = { ...LIST_CAP_DEFAULTS };
  const refused = parseListCapPatch({ enabled: true }, off, false);
  assert.ok(!refused.ok && refused.status === 409 && refused.error === LIST_EVIDENCE_REQUIRED_AR);
  const on = parseListCapPatch({ enabled: true, daily: "40" }, off, true);
  assert.ok(on.ok && on.columns.non_subscriber_list_limit_enabled === true && on.columns.non_subscriber_list_daily_limit === 40);
  assert.ok(parseListCapPatch({ enabled: false }, { ...off, enabled: true }, false).ok, "switching off needs no confirmation");
  assert.equal(parseListCapPatch({ daily: 0 }, off, false).ok, false);
  assert.equal(parseListCapPatch({ weekly: 1.5 }, off, false).ok, false);
  assert.equal(parseListCapPatch({ crawlers: {} }, off, false).ok, false);
  assert.equal(parseListCapPatch({}, off, false).ok, false);
  assert.equal(parseListCapPatch(null, off, false).ok, false);
});

test("Q100a: item keys, the function's row, the allowed set and the filter", () => {
  assert.equal(listItemKey("law", "labor"), "law:labor");
  assert.equal(listItemKey("decree", 12), "decree:12");
  assert.equal(listItemKey("law", ""), null);
  assert.equal(listItemKey("law", "x".repeat(400))!.length, 300);
  const row = parseListHitRow([{ status: "partial", allowed: ["law:a"], used_day: 30, used_week: 31, day_limit: 30, week_limit: 100, subject: "s:abc", cap_window: "day", resets_at: "2026-11-22T21:00:00Z" }]);
  assert.ok(row && row.window === "day" && row.allowed?.length === 1);
  assert.deepEqual([...allowedListKeys(row)!], ["law:a"]);
  assert.equal(allowedListKeys(parseListHitRow({ status: "off", allowed: ["x"] })), null, "off = every item");
  assert.equal(allowedListKeys(parseListHitRow({ status: "ok", allowed: [] })), null);
  assert.equal(allowedListKeys(null), null, "no row (a failure) = every item");
  const items = [{ k: "law:a" }, { k: "law:b" }, { k: null }];
  assert.deepEqual(keepAllowed(items, (i) => i.k, new Set(["law:a"])), [{ k: "law:a" }, { k: null }]);
  assert.deepEqual(keepAllowed(items, (i) => i.k, null), items);
});

test("Q100a: the reader's notice names his own number and the window", () => {
  const settings = { ...LIST_CAP_DEFAULTS, enabled: true };
  const day = listLimitNotice(parseListHitRow({ status: "over", allowed: [], day_limit: 30, week_limit: 100, subject: "u:x", cap_window: "day", resets_at: "2026-11-22T21:00:00Z" }), settings);
  assert.ok(day && day.code === PUBLIC_LIST_LIMIT_CODE && day.limit === 30 && day.window === "day" && day.resetsAt);
  assert.match(day.message, /\(30 عنصراً مختلفاً\)/);
  const addr = listLimitNotice(parseListHitRow({ status: "partial", allowed: ["a"], day_limit: 150, week_limit: 500, subject: "a:h", cap_window: "week" }), settings);
  assert.ok(addr && addr.limit === 100 && addr.window === "week" && addr.resetsAt === null, "an address stop shows the visitor's number");
  assert.equal(listLimitNotice(parseListHitRow({ status: "ok", allowed: [] }), settings), null);
  assert.match(listLimitMessageAr("week", 100), /سبعة أيام/);
});

test("wiring: init and search filter their items through the cap after the answer is built, fail open, OFF by default", () => {
  const init = read("../../app/api/library/init/route.ts");
  assert.match(init, /const listCap = await spendPublicListItems\(\s*request,\s*\{ userId, hasFullLibrary: hasFullAccess \},/);
  assert.match(init, /\.\.\.\(listCap\.notice \? \{ listLimit: listCap\.notice \} : \{\}\)/);
  assert.match(init, /s\.hasMore = false;/);
  const search = read("../../app/api/library/search/route.ts");
  assert.match(search, /const listCap = await spendPublicListItems\(\s*request,\s*\{ userId, hasFullLibrary: hasFullAccess \},/);
  assert.match(search, /if \(listCap\.notice\) combined\.body\.listLimit = listCap\.notice;/);
  const server = read("./publicListCapServer.ts");
  assert.match(server, /if \(viewer\.hasFullLibrary \|\| !isSupabaseMode \|\| keys\.length === 0\) return ALL;/);
  assert.match(server, /if \(!settings\.enabled\) return ALL;/);
  assert.match(server, /if \(await provenCrawlerRequest\(request, await loadPublicViewSettings\(\)\)\) return ALL;/);
  assert.match(server, /\} catch \{\s*return ALL;\s*\}/);
  // The crawler proof is the view cap's (the one importer of crawlerVerify besides its server half).
  assert.doesNotMatch(server, /crawlerVerify/);
  const view = read("./publicViewCapServer.ts");
  assert.match(view, /export async function provenCrawlerRequest\(request: Request, settings: PublicViewSettings\): Promise<boolean> \{/);
  assert.match(view, /return isVerifiedCrawler\(claim\.crawler, address\);/);
});

test("wiring: the admin route — ON only with the evidence confirmation, audited under its own action", () => {
  const route = read("../../app/api/v1/admin/library-monitor/list-cap/route.ts");
  assert.match(route, /const gate = await requireStaff\("settings\.write"\);/);
  assert.match(route, /parseListCapPatch\(b\.list, current, b\.confirmEvidence === true\)/);
  assert.match(route, /action: switchedOn \? "library_public_list_cap_enabled" : "library_list_cap_settings_updated"/);
  assert.match(read("../../app/dashboard/admin/security/LibraryProtectionPanel.tsx"), /<LibraryListCapPanel isDark=\{isDark\} card=\{card\} \/>/);
});

test("the migration's defaults are the app's (20261202_50)", () => {
  const sql = read("../../../supabase/migrations/20261202_50_l12_rules.sql");
  assert.match(sql, /non_subscriber_list_limit_enabled boolean not null default false/);
  assert.match(sql, /non_subscriber_list_daily_limit int not null default 30/);
  assert.match(sql, /non_subscriber_list_weekly_limit int not null default 100/);
  assert.match(sql, /non_subscriber_list_address_daily_limit int not null default 150/);
  assert.match(sql, /non_subscriber_list_address_weekly_limit int not null default 500/);
  assert.match(sql, /revoke all on function public\.library_public_list_hit\(text\[\], text\[\]\) from public, anon, authenticated;/);
});
