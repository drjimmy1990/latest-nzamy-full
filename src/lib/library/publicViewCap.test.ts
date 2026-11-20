/**
 * publicViewCap.test.ts — batch l11 (O18 / A16, O19): the settings, the G45
 * switch-on guard, the subjects, the 429, and the wiring in the four document
 * routes, the reader message and the migration.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/publicViewCap.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EVIDENCE_REQUIRED_AR,
  PUBLIC_VIEW_COLUMNS,
  PUBLIC_VIEW_DEFAULTS,
  PUBLIC_VIEW_LIMIT_CODE,
  parseProtectionPatch,
  parsePublicViewRow,
  publicViewRefusal,
  publicViewSettingsFromRow,
  subjectHash,
  viewerSubjects,
} from "./publicViewCap.ts";
import { readerRefusalFrom } from "./readerRefusal.ts";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");
const ROOT = path.resolve(SRC, "..");
const MIGRATION = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261201_30_library_scrape_guard.sql"), "utf8");

test("defaults: shipped OFF, the owner's 5, Amazonbot on probation, no staff address", () => {
  const s = publicViewSettingsFromRow(null);
  assert.equal(s.enabled, false);
  assert.equal(s.dailyViews, 5);
  assert.equal(s.addressDailyViews, 20);
  assert.equal(s.crawlers.amazonbot.on, false);
  assert.equal(s.crawlers.googlebot.on, true);
  assert.deepEqual(s.alertEmails, []);
  assert.equal(PUBLIC_VIEW_DEFAULTS.enabled, false);
});

test("the row: valid columns are read, odd ones keep their default", () => {
  const s = publicViewSettingsFromRow({
    non_subscriber_view_limit_enabled: true,
    non_subscriber_daily_view_limit: 7,
    non_subscriber_address_daily_limit: "x",
    crawler_view_limits: { googlebot: { on: false, daily: 9 }, bingbot: { on: "yes", daily: -1 }, unknown: { on: true, daily: 1 } },
    agent_view_limits: { "chatgpt-user": 3, "claude-user": 0 },
    alert_emails: ["a@example.com", "not an address"],
  });
  assert.equal(s.enabled, true);
  assert.equal(s.dailyViews, 7);
  assert.equal(s.addressDailyViews, 20);
  assert.deepEqual(s.crawlers.googlebot, { on: false, daily: 9 });
  assert.deepEqual(s.crawlers.bingbot, PUBLIC_VIEW_DEFAULTS.crawlers.bingbot);
  assert.equal("unknown" in s.crawlers, false);
  assert.equal(s.agents["chatgpt-user"], 3);
  assert.equal(s.agents["claude-user"], 100);
  assert.deepEqual(s.alertEmails, ["a@example.com"]);
});

test("G45: switching the cap ON needs the evidence confirmation; OFF never does", () => {
  const off = publicViewSettingsFromRow(null);
  const refused = parseProtectionPatch({ enabled: true }, off);
  assert.deepEqual(refused, { ok: false, error: EVIDENCE_REQUIRED_AR, status: 409 });
  const ok = parseProtectionPatch({ enabled: true, confirmEvidence: true }, off);
  assert.ok(ok.ok && ok.columns.non_subscriber_view_limit_enabled === true);
  const on = { ...off, enabled: true };
  const offAgain = parseProtectionPatch({ enabled: false }, on);
  assert.ok(offAgain.ok && offAgain.columns.non_subscriber_view_limit_enabled === false);
  // a number change while it is on needs no confirmation
  assert.ok(parseProtectionPatch({ dailyViews: 6 }, on).ok);
});

test("the patch: bounds, unknown fields, crawlers, agents, e-mails", () => {
  const s = publicViewSettingsFromRow(null);
  assert.equal(parseProtectionPatch({}, s).ok, false);
  assert.equal(parseProtectionPatch({ nope: 1 }, s).ok, false);
  assert.equal(parseProtectionPatch({ dailyViews: 0 }, s).ok, false);
  assert.equal(parseProtectionPatch({ dailyViews: 1001 }, s).ok, false);
  assert.equal(parseProtectionPatch({ sequenceGapSeconds: 2.5 }, s).ok, false);
  const c = parseProtectionPatch({ crawlers: { amazonbot: { on: true, daily: 50 } } }, s);
  assert.ok(c.ok);
  if (c.ok) {
    const v = c.columns.crawler_view_limits as Record<string, { on: boolean; daily: number }>;
    assert.deepEqual(v.amazonbot, { on: true, daily: 50 });
    assert.deepEqual(v.googlebot, s.crawlers.googlebot, "the others are kept");
  }
  assert.equal(parseProtectionPatch({ crawlers: { evilbot: { on: true, daily: 1 } } }, s).ok, false);
  assert.equal(parseProtectionPatch({ agents: { "chatgpt-user": 0 } }, s).ok, false);
  const e = parseProtectionPatch({ alertEmails: "Owner@Example.com, dev@example.com\nowner@example.com" }, s);
  assert.ok(e.ok && JSON.stringify(e.columns.alert_emails) === JSON.stringify(["owner@example.com", "dev@example.com"]));
  assert.equal(parseProtectionPatch({ alertEmails: ["bad address"] }, s).ok, false);
  assert.equal(parseProtectionPatch({ alertEmails: Array.from({ length: 11 }, (_, i) => `a${i}@example.com`) }, s).ok, false);
  assert.ok(parseProtectionPatch({ alertEmails: [] }, s).ok, "clearing the list is allowed");
});

test("subjects: an account by id; a guest by session and address; a proven crawler alone; an agent on top", () => {
  assert.deepEqual(viewerSubjects({ userId: "u1", sessionHash: "S", addressHash: "A", verifiedCrawlerId: null, agentId: null }), ["u:u1"]);
  assert.deepEqual(viewerSubjects({ userId: null, sessionHash: "S", addressHash: "A", verifiedCrawlerId: null, agentId: null }), ["s:S", "a:A"]);
  assert.deepEqual(viewerSubjects({ userId: null, sessionHash: null, addressHash: "A", verifiedCrawlerId: null, agentId: null }), ["a:A"]);
  assert.deepEqual(viewerSubjects({ userId: null, sessionHash: "S", addressHash: "A", verifiedCrawlerId: "googlebot", agentId: null }), ["c:googlebot"]);
  assert.deepEqual(viewerSubjects({ userId: null, sessionHash: "S", addressHash: "A", verifiedCrawlerId: null, agentId: "chatgpt-user" }), ["s:S", "a:A", "p:chatgpt-user"]);
  for (const s of viewerSubjects({ userId: "9b000000-0000-0000-0000-0000000000b1", sessionHash: null, addressHash: null, verifiedCrawlerId: null, agentId: "claude-user" })) {
    assert.match(s, /^[usacp]:[A-Za-z0-9_-]{1,120}$/, "the SQL subject format");
  }
});

test("hashes: keyed, stable, URL-safe, never the address itself", async () => {
  const a = await subjectHash("secret-one", "addr", "203.0.113.7");
  assert.equal(a, await subjectHash("secret-one", "addr", "203.0.113.7"));
  assert.notEqual(a, await subjectHash("secret-two", "addr", "203.0.113.7"));
  assert.notEqual(a, await subjectHash("secret-one", "sid", "203.0.113.7"));
  assert.match(a, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(!a.includes("203"));
});

test("the 429: the visitor's number, Riyadh-midnight Retry-After, no challenge", () => {
  const s = publicViewSettingsFromRow(null);
  const now = Date.parse("2026-11-20T12:00:00Z");
  const row = parsePublicViewRow([{ status: "over", used: 5, day_limit: 5, subject: "s:abc", resets_at: "2026-11-20T21:00:00Z" }]);
  const r = publicViewRefusal(row, s, now);
  assert.ok(r);
  assert.equal(r!.status, 429);
  assert.equal(r!.body.code, PUBLIC_VIEW_LIMIT_CODE);
  assert.equal(r!.retryAfterSeconds, 9 * 3600);
  assert.match(r!.body.error, /\(5 مستندات/);
  assert.equal(r!.body.subscribeHref, "/laws/subscribe");
  // the address number is never shown to the reader
  const byAddress = publicViewRefusal(parsePublicViewRow({ status: "over", used: 20, day_limit: 20, subject: "a:x", resets_at: null }), s, now);
  assert.equal(byAddress!.body.limit, 5);
  assert.equal(publicViewRefusal(parsePublicViewRow([{ status: "ok" }]), s, now), null);
  assert.equal(publicViewRefusal(parsePublicViewRow([{ status: "off" }]), s, now), null);
  assert.equal(publicViewRefusal(null, s, now), null);
});

test("the reader shows the server's message and when it renews", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  const r = readerRefusalFrom(429, { code: PUBLIC_VIEW_LIMIT_CODE, error: "رسالة الخادم.", resetsAt: "2026-11-20T21:00:00Z" }, now);
  assert.deepEqual(r, { kind: "limit", scope: "daily", messageAr: "رسالة الخادم. يتجدد حدّك بعد 9 ساعة." });
});

test("wiring: each document route counts a non-subscriber AFTER its own quota and device checks, with its subscriber answer", () => {
  const routes: Array<[string, RegExp]> = [
    ["app/api/library/laws/[slug]/route.ts", /spendPublicView\(_request, \{ userId, hasFullLibrary: isSubscriber \}\)/],
    ["app/api/library/decrees/[id]/route.ts", /spendPublicView\(_request, \{ userId, hasFullLibrary: isSubscriber \}\)/],
    ["app/api/library/precedents/[slug]/route.ts", /spendPublicView\(request, \{ userId, hasFullLibrary: hasFullAccess \}\)/],
    ["app/api/library/books/[slug]/route.ts", /hasFullLibrary: freeLimit === -1 && !isWhitelisted \? true : await hasFullLibraryAccess\(userId, accessMemo\)/],
  ];
  for (const [file, call] of routes) {
    const src = read(file);
    assert.match(src, call, file);
    const quota = src.indexOf("if (quotaRefusal) return quotaRefusal;");
    const view = src.indexOf("spendPublicView(");
    assert.ok(quota > 0 && view > quota, `${file}: the view cap comes after the subscriber quota`);
    assert.match(src, /if \(viewRefusal\) return viewRefusal;/, file);
  }
});

test("O26 wiring: the routes that asked twice share one per-request memo", () => {
  const laws = read("app/api/library/laws/[slug]/route.ts");
  assert.match(laws, /const accessMemo = libraryAccessMemo\(userId\);/);
  assert.match(laws, /checkLibraryAccess\(userId, slug, 0, 'laws', \{ memo: accessMemo \}\),\s*hasFullLibraryAccess\(userId, accessMemo\),/);
  assert.match(read("app/api/library/decrees/[id]/route.ts"), /checkLibraryAccess\(userId, id, 0, "decrees", \{ memo: accessMemo \}\),\s*hasFullLibraryAccess\(userId, accessMemo\),/);
  assert.match(read("app/api/library/precedents/[slug]/route.ts"), /getLibraryAccessForUser\(userId, accessMemo\)/);
  assert.match(read("app/api/library/laws/[slug]/citations/preview/route.ts"), /checkLibraryAccess\(userId, lawSlug, 0, 'laws', \{ memo: accessMemo \}\)/);
  assert.match(read("app/api/v1/ai/source-preview/route.ts"), /checkLibraryAccess\(userId, slug, 0, "laws", \{ memo: accessMemo \}\)/);
  const ac = read("lib/access-control.ts");
  // promises, not results; per request, never module-level; another user id is ignored
  assert.match(ac, /memo\.tier \?\?= read\(\);/);
  assert.match(ac, /memo\.full \?\?= userId/);
  assert.match(ac, /return !!memo && memo\.userId === userId;/);
  assert.doesNotMatch(ac, /new TtlMemo|const accessMemo =/);
});

test("O19 wiring: an allowed full-text open records the session; alerts go to staff, never to the test mail sink", () => {
  const dq = read("lib/library/libraryDocQuota.ts");
  assert.match(dq, /if \(row\) noteLibraryReadSession\(request, userId\);/);
  const alerts = read("lib/library/readAlertsServer.ts");
  assert.match(alerts, /if \(!emailConfigured\(\)\) return 0;/);
  assert.match(alerts, /if \(settings\.alertEmails\.length === 0\) return 0;/);
  assert.doesNotMatch(alerts, /userIds/, "the flagged account's id is never passed (a test account's alert must reach the staff)");
  assert.match(alerts, /idempotencyKey: `library-review-flag:\$\{flag\.reference\}:\$\{to\}`/);
  assert.match(read("lib/library/activityMeterServer.ts"), /import\("\.\/readAlertsServer"\)\.then\(\(m\) => m\.sendPendingReviewFlagEmails\(\)\)/);
});

test("the migration: the columns the app reads, shipped OFF, service role only, no admin exemption", () => {
  for (const c of PUBLIC_VIEW_COLUMNS) assert.match(MIGRATION, new RegExp(`add column if not exists ${c} `), c);
  assert.match(MIGRATION, /non_subscriber_view_limit_enabled boolean not null default false/);
  assert.match(MIGRATION, /non_subscriber_daily_view_limit int not null default 5/);
  assert.match(MIGRATION, /set local lock_timeout/);
  assert.match(MIGRATION, /raise notice 'l11_scrape verify: OK'/);
  assert.doesNotMatch(MIGRATION, /grant [^;]*to (anon|authenticated)/i);
  assert.doesNotMatch(MIGRATION, /v_type = 'admin'/, "R67: no admin exemption in the evaluator");
  assert.match(MIGRATION, /'sequential', 'parallel'\)\)/);
  // the JSON defaults equal the app's
  const crawlers = /crawler_view_limits jsonb not null default\s*'([^']+)'/.exec(MIGRATION)![1];
  assert.deepEqual(JSON.parse(crawlers), PUBLIC_VIEW_DEFAULTS.crawlers);
  const agents = /agent_view_limits jsonb not null default\s*'([^']+)'/.exec(MIGRATION)![1];
  assert.deepEqual(JSON.parse(agents), PUBLIC_VIEW_DEFAULTS.agents);
  const verify = fs.readFileSync(path.join(ROOT, "supabase/migrations/_verify.sql"), "utf8");
  assert.match(verify, /-- >>> verify:l11_scrape[\s\S]+-- <<< verify:l11_scrape/);
});
