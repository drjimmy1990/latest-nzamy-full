/**
 * publicGuard.test.ts — batch l8-libguard (owner message 18 Nov, items 2 and
 * 3.2): the public-library guard's pure rules, and source pins on the files
 * that wire it (proxy, challenge route, precedents / books routes, admin
 * settings, the subscribe card, the crawler rule).
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIBRARY_PUBLIC_PROTECTION_DEFAULTS,
  PUBLIC_RULINGS_DEFAULTS,
  FEQH_FREE_PAGES_DEFAULT,
  feqhFreePagesIssue,
  guardSettingsFromRows,
  isBeyondPublicDepth,
  isLibraryGuardedRequest,
  isPagedLibraryRequest,
  isRulingRow,
  libraryPassSecret,
  libraryPublicProtectionIssue,
  librarySessionId,
  newLibraryId,
  parseLibraryPublicProtection,
  parsePublicRulings,
  passBinding,
  publicExcerpt,
  publicRulingsIssue,
  signLibraryPass,
  verifyLibraryPass,
} from "./publicGuard.ts";
import { asksForChallenge, libraryApiPath } from "./challengeClient.ts";
import { dailyResetLineAr, readerRefusalFrom } from "./readerRefusal.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

test("owner defaults: 0 full rulings with a ~1.5-line excerpt, fiqh 0 free pages, a depth cap", () => {
  assert.deepEqual(PUBLIC_RULINGS_DEFAULTS, { full: 0, excerptChars: 180 });
  assert.equal(FEQH_FREE_PAGES_DEFAULT, 0);
  assert.equal(LIBRARY_PUBLIC_PROTECTION_DEFAULTS.maxPublicOffset, 250);
  assert.ok(LIBRARY_PUBLIC_PROTECTION_DEFAULTS.sessionHardPer10Min > LIBRARY_PUBLIC_PROTECTION_DEFAULTS.sessionChallengeAfter);
  // The audit's crawl: one request a second for ten minutes = 600 — past the challenge threshold.
  assert.ok(LIBRARY_PUBLIC_PROTECTION_DEFAULTS.sessionChallengeAfter < 600);
});

test("settings parse: a stored value wins, an odd field keeps its default", () => {
  const p = parseLibraryPublicProtection({ session_challenge_after: 200, max_public_offset: "x", pass_minutes: 1 });
  assert.equal(p.sessionChallengeAfter, 200);
  assert.equal(p.maxPublicOffset, 250);
  assert.equal(p.passMinutes, 30, "below the minimum keeps the default");
  assert.deepEqual(parsePublicRulings({ full: 1, excerpt_chars: 240 }), { full: 1, excerptChars: 240 });
  assert.deepEqual(parsePublicRulings(null), { full: 0, excerptChars: 180 });
  const all = guardSettingsFromRows([
    { key: "library_public_protection", value: { pages_challenge_after: 9 } },
    { key: "library_feqh_free_pages", value: { pages: 2 } },
  ]);
  assert.equal(all.protection.pagesChallengeAfter, 9);
  assert.equal(all.feqhFreePages, 2);
  assert.deepEqual(all.rulings, PUBLIC_RULINGS_DEFAULTS);
  assert.equal(guardSettingsFromRows("nonsense").feqhFreePages, 0);
});

test("admin validators: refuse unknown fields, wrong types and out-of-range numbers, in Arabic", () => {
  assert.equal(libraryPublicProtectionIssue({ session_challenge_after: 120, max_public_offset: 300 }), null);
  assert.match(libraryPublicProtectionIssue({ nope: 1 }) ?? "", /حقل غير معروف/);
  assert.match(libraryPublicProtectionIssue({ pass_minutes: 2 }) ?? "", /بين/);
  assert.match(libraryPublicProtectionIssue({ session_challenge_after: 500, session_hard_per_10min: 100 }) ?? "", /يجب ألا يقل/);
  assert.notEqual(libraryPublicProtectionIssue([]), null);
  assert.equal(publicRulingsIssue({ full: 0, excerpt_chars: 180 }), null);
  assert.notEqual(publicRulingsIssue({ full: -1 }), null);
  assert.notEqual(publicRulingsIssue({ excerpt_chars: 5000 }), null);
  assert.equal(feqhFreePagesIssue({ pages: 0 }), null);
  assert.notEqual(feqhFreePagesIssue({ pages: 2.5 }), null);
});

test("which requests the guard counts: library reads and search, not the challenge / status / devices / folders", () => {
  assert.equal(isLibraryGuardedRequest("GET", "/api/library/precedents/LAW-98-1252"), true);
  assert.equal(isLibraryGuardedRequest("POST", "/api/library/search"), true);
  assert.equal(isLibraryGuardedRequest("POST", "/api/library/scoped-search"), true);
  assert.equal(isLibraryGuardedRequest("GET", "/api/library/init"), true);
  assert.equal(isLibraryGuardedRequest("GET", "/api/librar%79/laws/x"), true, "an encoded spelling is still counted");
  assert.equal(isLibraryGuardedRequest("POST", "/api/library/challenge"), false);
  assert.equal(isLibraryGuardedRequest("GET", "/api/v1/library/status"), false);
  assert.equal(isLibraryGuardedRequest("POST", "/api/v1/library/devices/code"), false);
  assert.equal(isLibraryGuardedRequest("PATCH", "/api/library/folders"), false);
  assert.equal(isLibraryGuardedRequest("GET", "/api/v1/ai/runs"), false);
});

test("a paged request: offset > 0, page > 1 or a cursor", () => {
  assert.equal(isPagedLibraryRequest(new URLSearchParams("offset=50&limit=50")), true);
  assert.equal(isPagedLibraryRequest(new URLSearchParams("page=2")), true);
  assert.equal(isPagedLibraryRequest(new URLSearchParams("cursor=abc")), true);
  assert.equal(isPagedLibraryRequest(new URLSearchParams("offset=0&limit=50")), false);
  assert.equal(isPagedLibraryRequest(new URLSearchParams("page=1")), false);
});

test("browsing depth: only a non-subscriber past the cap is refused", () => {
  assert.equal(isBeyondPublicDepth(250, false, 250), true);
  assert.equal(isBeyondPublicDepth(200, false, 250), false);
  assert.equal(isBeyondPublicDepth(2300, true, 250), false);
});

test("session id: well-formed only; a fresh one is", () => {
  assert.equal(librarySessionId("abc"), null);
  assert.equal(librarySessionId("x".repeat(20) + ";"), null);
  const id = newLibraryId();
  assert.equal(librarySessionId(id), id);
});

test("the pass: signed, bound to the visitor, expires; a forged or moved pass is refused", async () => {
  const secret = "test-secret-for-the-library-pass";
  const now = Date.parse("2026-11-19T10:00:00Z");
  const binding = await passBinding("203.0.113.7");
  const nonce = newLibraryId();
  const pass = await signLibraryPass(secret, { expiresAt: now + 60_000, nonce, binding });
  assert.equal(await verifyLibraryPass(secret, pass, binding, now), nonce);
  assert.equal(await verifyLibraryPass(secret, pass, await passBinding("198.51.100.9"), now), null, "another address");
  assert.equal(await verifyLibraryPass(secret, pass, binding, now + 61_000), null, "expired");
  assert.equal(await verifyLibraryPass("another-secret-entirely-000", pass, binding, now), null, "another key");
  const [v, , n, sig] = pass.split(".");
  assert.equal(await verifyLibraryPass(secret, `${v}.${now + 9e9}.${n}.${sig}`, binding, now), null, "a longer expiry");
  assert.equal(await verifyLibraryPass(secret, "garbage", binding, now), null);
  assert.equal(await verifyLibraryPass("", pass, binding, now), null);
});

test("the pass secret: LIBRARY_CHALLENGE_SECRET, else the Turnstile secret, else none", () => {
  assert.equal(libraryPassSecret({ LIBRARY_CHALLENGE_SECRET: "s".repeat(32), TURNSTILE_SECRET_KEY: "t" }), "s".repeat(32));
  assert.equal(libraryPassSecret({ LIBRARY_CHALLENGE_SECRET: "short", TURNSTILE_SECRET_KEY: "turnstile" }), "turnstile");
  assert.equal(libraryPassSecret({}), null);
});

test("publicExcerpt (audit م-1): never the whole text, cut at a word, always «…»", () => {
  const short = "لا يجوز للمحكمة أن تقضي بما لم يطلبه الخصوم";
  const cut = publicExcerpt(short, 150) as string;
  assert.ok(cut.endsWith("…"));
  assert.ok(cut.length < short.length, "a text under the cap is still cut");
  assert.ok(short.startsWith(cut.slice(0, -1)));
  const long = "كلمة ".repeat(100);
  const longCut = publicExcerpt(long, 180) as string;
  assert.ok(longCut.length <= 181);
  assert.ok(!/\sكل…$/.test(longCut), "no half word");
  assert.equal(publicExcerpt(null, 150), null);
});

test("a ruling row is one with facts, reasons or an operative part", () => {
  assert.equal(isRulingRow({ facts: "وقائع" }), true);
  assert.equal(isRulingRow({ facts: "  ", reasons: null, ruling: "" }), false);
  assert.equal(isRulingRow({}), false);
});

test("challenge client: only same-origin library API calls; the challenge answer is 429 + the header", () => {
  const o = "https://nezamy.sa";
  assert.equal(libraryApiPath("/api/library/laws/x?y=1", o), "/api/library/laws/x");
  assert.equal(libraryApiPath(new URL("https://nezamy.sa/api/v1/library/my-grant"), o), "/api/v1/library/my-grant");
  assert.equal(libraryApiPath("/api/library/challenge", o), null);
  assert.equal(libraryApiPath("https://evil.example/api/library/laws/x", o), null);
  assert.equal(libraryApiPath("/api/v1/ai/runs", o), null);
  const h = (v: string | null) => ({ get: (n: string) => (n === "x-library-challenge" ? v : null) });
  assert.equal(asksForChallenge({ status: 429, headers: h("required") }), true);
  assert.equal(asksForChallenge({ status: 429, headers: h(null) }), false);
  assert.equal(asksForChallenge({ status: 403, headers: h("required") }), false);
});

test("owner 3.2: the daily refusal names when the limit renews (computed on the client)", () => {
  const now = Date.parse("2026-11-19T18:30:00Z");
  assert.equal(dailyResetLineAr("2026-11-19T21:00:00Z", now), "يتجدد حدّك بعد 2 ساعة و30 دقيقة.");
  assert.equal(dailyResetLineAr("2026-11-19T18:40:00Z", now), "يتجدد حدّك بعد 10 دقيقة.");
  assert.equal(dailyResetLineAr(null, now), null);
  const r = readerRefusalFrom(429, { code: "library_daily_limit", error: "بلغت الحد اليومي.", resetsAt: "2026-11-19T21:00:00Z" }, now);
  assert.ok(r && r.kind === "limit");
  assert.match(r.messageAr, /بلغت الحد اليومي\. يتجدد حدّك بعد 2 ساعة/);
});

test("wiring: the proxy runs the guard right after the rate limiter and sets the session cookie", () => {
  const src = read("proxy.ts");
  const limiter = src.indexOf("const rateLimited = applyRateLimit(req, pathname);");
  const guard = src.indexOf("const libraryGuarded = await applyLibraryPublicGuard(req, pathname);");
  const checkout = src.indexOf("const checkoutLimited = await applyCheckoutStartLimit(req, pathname);");
  assert.ok(limiter > 0 && guard > limiter && checkout > guard);
  assert.match(src, /withLibrarySessionCookie\(req, withAttributionCookie\(req, await proxyRoutes\(req\)\)\)/);
  assert.match(src, /LIBRARY_CHALLENGE_HEADER, "required"/);
  // The guard never keys on the auth cookie's NAME (a forged name must not buy a wider budget).
  const body = src.slice(src.indexOf("async function applyLibraryPublicGuard"), src.indexOf("function withLibrarySessionCookie"));
  assert.ok(!body.includes("hasSupabaseAuthCookie"));
  assert.ok(!/user-agent/i.test(body));
});

test("wiring: the challenge route verifies Turnstile and sets an HttpOnly pass on /api", () => {
  const src = read("app/api/library/challenge/route.ts");
  assert.match(src, /turnstilePolicy\(process\.env\.TURNSTILE_SECRET_KEY, process\.env\.NODE_ENV\)/);
  assert.match(src, /verifyTurnstileToken\(/);
  assert.match(src, /httpOnly: true/);
  assert.match(src, /path: "\/api"/);
});

test("wiring: precedents — depth cap, rulings excerpt, publicExcerpt instead of a 150-char slice", () => {
  const src = read("app/api/library/precedents/[slug]/route.ts");
  assert.match(src, /isBeyondPublicDepth\(offset, hasFullAccess, maxPublicOffset\)/);
  assert.match(src, /code: 'library_depth_limit'/);
  assert.match(src, /!isFree && isRuling && offset \+ idx >= publicRulings\.full/);
  assert.match(src, /publicExcerpt\(text, excerptChars\)/);
  assert.ok(!src.includes("substring(0, len)"));
  const page = read("app/precedents/[slug]/page.tsx");
  assert.match(page, /body\?\.code === "library_depth_limit"/);
});

test("wiring: fiqh — the books route reads library_feqh_free_pages and locks every block at 0", () => {
  const src = read("app/api/library/books/[slug]/route.ts");
  assert.match(src, /loadLibraryGuardSettings\(\)\)\.feqhFreePages/);
  assert.match(src, /feqhFreePages <= 0\) \{\s*lockFrom = Number\.NEGATIVE_INFINITY;/);
  assert.ok(!/أول صفحتين مجاناً/.test(read("app/laws/components/FeqhTabContent.tsx")));
  assert.ok(!/أول صفحتين/.test(read("app/book/[slug]/_stream-block.tsx")));
});

test("wiring: admin settings allow and validate the three keys", () => {
  const src = read("app/api/v1/admin/settings/route.ts");
  for (const key of ["library_public_protection", "public_full_rulings_per_collection", "library_feqh_free_pages"]) {
    assert.ok(src.includes(`"${key}",`), `${key} is allow-listed`);
  }
  assert.match(src, /library_public_protection: libraryPublicProtectionIssue/);
  assert.match(src, /public_full_rulings_per_collection: publicRulingsIssue/);
  assert.match(src, /library_feqh_free_pages: feqhFreePagesIssue/);
});

test("subscribe card: the owner's button, the price, the founder banner, the account-type lock; mounted on locked items", () => {
  const card = read("components/library/LibrarySubscribeCard.tsx");
  assert.ok(card.includes("اشترك في المكتبة"));
  assert.match(card, /bookPriceText\("lib-annual", "once", "ar"\)/);
  assert.match(card, /\/api\/v1\/campaigns\/active/);
  assert.doesNotMatch(card, /TODO\(l8-liblock\)/);
  assert.match(card, /useLibraryAccountLocked\(\)/, "a locked account type sees the owner's line, not the price");
  assert.match(card, /LIBRARY_ACCOUNT_LOCKED_AR/);
  assert.match(read("app/precedents/[slug]/_principle-block.tsx"), /<LibraryLockedNote/);
  assert.match(read("app/book/[slug]/_stream-block.tsx"), /<LibraryLockedNote/);
  assert.match(read("app/layout.tsx"), /<LibraryChallengeHost \/>/);
});

test("the crawler gets nothing more than a visitor: no library route or reader branches on the User-Agent", () => {
  const roots = ["app/api/library", "app/laws", "app/precedents", "app/book", "lib/library"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
        const text = read(rel);
        // A User-Agent read, Next's userAgent(), an isbot() helper or a /googlebot/ test —
        // never the robots metadata (`googleBot: { index: false }`) or a comment.
        // deviceLimitServer.ts reads it only to NAME a subscriber's device («Chrome على Windows»),
        // never to choose what text is served.
        if (rel.endsWith("deviceLimitServer.ts")) continue;
        if (/headers\.get\(\s*["']user-agent["']\s*\)|(?<![A-Za-z])userAgent\(|(?<![A-Za-z])isbot\(|\/googlebot\/i?\.test/i.test(text)) offenders.push(rel);
      }
    }
  };
  for (const r of roots) walk(r);
  assert.deepEqual(offenders, []);
});

test("no bulk export: no library API route sends a file download, and every list route caps its page", () => {
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(SRC, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/route\.ts$/.test(e.name) && /content-disposition|text\/csv|application\/zip/i.test(read(rel))) offenders.push(rel);
    }
  };
  walk("app/api/library");
  assert.deepEqual(offenders, []);
  assert.match(read("app/api/library/precedents/[slug]/_window.ts"), /50/);
  assert.match(read("app/api/library/books/[slug]/_shape.ts"), /BLOCKS_MAX_LIMIT = 50/);
  assert.match(read("app/api/library/init/route.ts"), /, 200\)/);
});

test("audit م-1: a locked law article body is cut at a word and never whole", () => {
  const src = read("app/api/library/laws/[slug]/route.ts");
  assert.match(src, /if \(limit === LOCKED_PREVIEW_CHARS && s\.trim\(\) !== ''\) return publicExcerpt\(s, limit\)/);
});
