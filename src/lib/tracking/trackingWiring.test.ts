/**
 * Source pins for the client tracking link (N3.6): the public page is a
 * server page that is never cached, indexed or referred from; it reads only
 * through the whitelist; the service role stays behind one server module;
 * the lawyer routes never touch the token hash; the limiter covers /track.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("the public page: server-rendered, dynamic, noindex, no Referer, the CTA, and 404 for a dead link", () => {
  const page = read("app/track/[token]/page.tsx");
  assert.doesNotMatch(page, /^"use client"/m, "never a client component — the service read must stay on the server");
  assert.match(page, /export const dynamic = "force-dynamic";/);
  assert.match(page, /robots: \{ index: false, follow: false/);
  assert.match(page, /referrer: "no-referrer"/);
  assert.match(page, /if \(read\.state === "none"\) notFound\(\);/);
  assert.match(page, /إنشاء حساب على منصة نظامي لحفظ القضية ومتابعتها/);
  assert.match(page, /readTrackingView\(token\)/);
  assert.doesNotMatch(page, /createServiceClient|\.rpc\(|\.from\(/, "the page itself queries nothing");
});

test("the page renders only the view's whitelisted fields", () => {
  const page = read("app/track/[token]/page.tsx");
  const used = new Set([...page.matchAll(/\bv\.(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...used].sort(), ["caseNumber", "court", "hearings", "stageLabel", "title"]);
  const hUsed = new Set([...page.matchAll(/\bh\.(\w+)/g)].map((m) => m[1]));
  assert.deepEqual([...hUsed].sort(), ["court", "date", "time"]);
});

test("the snapshot RPC is called from one server module, which hashes and serializes", () => {
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { if (name !== "node_modules") walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\.ts$/.test(name)) continue;
      if (/rpc\(\s*["'`]case_tracking_snapshot/.test(readFileSync(full, "utf8"))) callers.push(relative(SRC, full).replace(/\\/g, "/"));
    }
  };
  walk(SRC);
  assert.deepEqual(callers, ["lib/tracking/trackingSnapshot.server.ts"]);
  const mod = read("lib/tracking/trackingSnapshot.server.ts");
  assert.match(mod, /if \(!isTrackingToken\(token\)\) return \{ state: "none" \};/, "the shape is checked before any database call");
  assert.match(mod, /p_token_hash: sha256Hex\(token\)/, "only the hash is sent");
  assert.match(mod, /toTrackingView\(data\)/, "the answer passes the whitelist");
});

test("the lawyer routes use the session (RLS), never read the hash, and the panel is on the case file", () => {
  for (const f of ["app/api/v1/cases/[id]/tracking-links/route.ts", "app/api/v1/cases/[id]/tracking-links/[linkId]/route.ts", "app/api/v1/cases/[id]/tracking-links/_shared.ts"]) {
    const src = read(f);
    assert.doesNotMatch(src, /createServiceClient/, f);
    assert.doesNotMatch(src, /select\([^)]*token_hash/, `${f} selects no hash`);
  }
  assert.match(read("app/api/v1/cases/[id]/tracking-links/route.ts"), /token_hash: sha256Hex\(token\)/);
  assert.match(read("app/dashboard/lawyer/cases/[id]/page.tsx"), /<CaseTrackingLinksPanel caseId=\{id\} isDark=\{isDark\} \/>/);
  assert.match(read("components/dashboard/caseTracking/CaseTrackingLinksPanel.tsx"), /لن يُعرض مرة أخرى/);
});

test("robots disallows /track/, the proxy rate-limits it, and the old /cases/[id] is still a 404", () => {
  assert.match(read("app/robots.ts"), /"\/track\/",/);
  const proxy = read("proxy.ts");
  assert.match(proxy, /const isTrackingMatch = isTrackingPageRoute\(method, pathname\);/);
  assert.match(proxy, /rateLimiter\.check\("tracking-page", key, TRACKING_PAGE_RATE_LIMIT\)/);
  assert.match(read("app/cases/[id]/page.tsx"), /notFound\(\);/);
});

// ─── Who may issue a link (review 2026-10-25) ────────────────────────────────
// Any active firm member used to pass (case_row_scope_ok alone): a finance or
// HR member, an office admin or a trainee could hand a firm case to a guest.
// Now: the lead, the filer, the case team, the firm owner, or a member whose
// firm role may open the firm's cases (/dashboard/firm/cases in
// entityRouteAccess.ts). The SQL role list must stay that route's list.

const MIGRATION_32 = readFileSync(join(SRC, "../supabase/migrations/20261025_32_case_tracking_links.sql"), "utf8");

test("tracking_link_maker_ok carries exactly the roles that may open /dashboard/firm/cases", async () => {
  const { FIRM_ROUTE_RULES } = await import("../../constants/entityRouteAccess.ts");
  const rule = FIRM_ROUTE_RULES.find((r) => r.path === "/dashboard/firm/cases");
  assert.ok(rule, "the firm cases route rule exists");
  const fn = /create or replace function public\.tracking_link_maker_ok\(p_request text, p_user uuid\)[\s\S]*?\n\$\$;/.exec(MIGRATION_32);
  assert.ok(fn, "20261025_32 defines public.tracking_link_maker_ok(text, uuid)");
  const list = /m\.role in \(([^)]*)\)/.exec(fn[0]);
  assert.ok(list, "the predicate tests m.role in (…)");
  const sqlRoles = [...list[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(sqlRoles, [...rule.allowedRoles].sort());
});

test("the insert and revoke policies and the snapshot use the maker rule; the POST route checks it first", () => {
  const insert = /create policy "tracking links creatable by case workers"[\s\S]*?;\n/.exec(MIGRATION_32);
  assert.ok(insert);
  assert.match(insert[0], /public\.can_issue_tracking_link\(case_request_id\)/);
  assert.match(insert[0], /public\.case_row_scope_ok\(case_request_id, firm_id\)/);
  const revoke = /create policy "tracking links revocable by maker or case workers"[\s\S]*?;\n/.exec(MIGRATION_32);
  assert.ok(revoke);
  assert.match(revoke[0], /using \(owner_user_id = auth\.uid\(\) or public\.can_issue_tracking_link\(case_request_id\)\)/);
  assert.match(MIGRATION_32, /if not public\.tracking_link_maker_ok\(v_link\.case_request_id, v_link\.owner_user_id\) then/);
  const post = read("app/api/v1/cases/[id]/tracking-links/route.ts");
  assert.match(post, /\.rpc\("can_issue_tracking_link", \{ p_request: id \}\)/);
  const insertAt = post.indexOf('.from("case_tracking_links").insert(');
  assert.ok(insertAt > 0, "the POST inserts the link");
  assert.ok(post.indexOf('rpc("can_issue_tracking_link"') < insertAt, "checked before the insert");
});

test("the tracking bucket also counts the proxy's own client IP (X-Real-IP first), not only CF-Connecting-IP", () => {
  const proxy = read("proxy.ts");
  assert.match(proxy, /rateLimiter\.check\("tracking-page-ip", ip, TRACKING_PAGE_IP_RATE_LIMIT\)/);
});

test("/track/<token> answers with X-Robots-Tag noindex, no-store and no-referrer headers, not only meta tags", () => {
  const config = readFileSync(join(SRC, "../next.config.ts"), "utf8");
  const block = /source: "\/track\/:token",[\s\S]*?\],/.exec(config);
  assert.ok(block, "next.config.ts has a /track/:token headers block");
  assert.match(block[0], /\{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" \}/);
  assert.match(block[0], /\{ key: "Cache-Control", value: "private, no-store, max-age=0" \}/);
  assert.match(block[0], /\{ key: "Referrer-Policy", value: "no-referrer" \}/);
});

// ─── v2 (D2, owner ٢٧٦, 20261026_62) ─────────────────────────────────────────

const walkSrc = (match: (src: string) => boolean): string[] => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) { if (name !== "node_modules") walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(name) || /\.test\.ts$/.test(name)) continue;
      if (match(readFileSync(full, "utf8"))) hits.push(relative(SRC, full).replace(/\\/g, "/"));
    }
  };
  walk(SRC);
  return hits.sort();
};

test("v2: the gate and the unlock RPCs live in the one server module; nothing in the app names the phone function", () => {
  assert.deepEqual(walkSrc((t) => /rpc\(\s*["'`]case_tracking_(gate|unlock)/.test(t)), ["lib/tracking/trackingSnapshot.server.ts"]);
  assert.deepEqual(walkSrc((t) => /case_client_phone_last4/.test(t)), [], "the phone digits are read by SQL only");
});

test("v2: the page asks the gate first, shows no case data to paused/expired/revoked links, and the digits before the snapshot", () => {
  const page = read("app/track/[token]/page.tsx");
  const gateAt = page.indexOf("await readTrackingGate(token)");
  const unlockAt = page.indexOf("await isTrackingUnlocked(token)");
  const snapAt = page.indexOf("await readTrackingView(token)");
  assert.ok(gateAt > 0 && unlockAt > gateAt && snapAt > unlockAt, "gate → unlock cookie → snapshot");
  assert.match(page, /if \(gate === "none"\) notFound\(\);/);
  assert.match(page, /gate === "paused" \|\| gate === "expired" \|\| gate === "unavailable"/);
  assert.match(page, /الرابط موقوف مؤقتاً — تواصل مع محاميك/);
  assert.match(page, /<TrackingUnlockForm token=\{token\} \/>/);
  const form = read("app/track/[token]/TrackingUnlockForm.tsx");
  assert.match(form, /^"use client";/m);
  assert.doesNotMatch(form, /\bphone\w*\s*[:=?.(]|createServiceClient|\.rpc\(/, "the form knows nothing about the phone");
});

test("v2: the unlock route — generic denial, the strict bucket, and the cookie's flags", () => {
  const route = read("app/api/v1/track/[token]/unlock/route.ts");
  assert.doesNotMatch(route, /createServiceClient|\.rpc\(|\.from\(/, "the route only calls the server module");
  assert.match(route, /unlockTracking\(token, digits\)/);
  assert.match(route, /normalizeUnlockDigits\(body\?\.digits\)/);
  assert.match(route, /if \(result !== "ok"\) return NextResponse\.json\(\{ error: DENIED \}/, "wrong digits, unknown and paused links: one answer");
  const mod = read("lib/tracking/trackingSnapshot.server.ts");
  assert.match(mod, /httpOnly: true,/);
  assert.match(mod, /secure: true,/);
  assert.match(mod, /sameSite: "strict"/);
  assert.match(mod, /path: unlockCookiePath\(token\)/);
  assert.match(mod, /unlockCookieKey\(process\.env\.SUPABASE_SERVICE_ROLE_KEY\)/);
  assert.ok(read("lib/rateLimitRoutes.ts").includes(String.raw`/^\/api\/v1\/track\/[^/]+\/unlock$/`), "the unlock POST is in the strict bucket");
});

test("v2: creation refuses a case with no client mobile before inserting; pause/resume go through the RPCs with the session", () => {
  const post = read("app/api/v1/cases/[id]/tracking-links/route.ts");
  const phoneAt = post.indexOf('rpc("case_tracking_has_phone"', post.indexOf("export async function POST"));
  assert.ok(phoneAt > 0 && phoneAt < post.indexOf('.from("case_tracking_links").insert('), "phone checked before the insert");
  assert.match(post, /\{ error: NO_PHONE_AR, code: "no_phone" \}, \{ status: 409/);
  assert.match(read("app/api/v1/cases/[id]/tracking-links/_shared.ts"), /أضف رقم جوال الموكل في ملف القضية أولاً/);
  const patch = read("app/api/v1/cases/[id]/tracking-links/[linkId]/route.ts");
  assert.match(patch, /supabase\.rpc\("tracking_link_pause", \{ p_link: linkId \}\)/);
  assert.match(patch, /supabase\.rpc\("tracking_link_resume", \{ p_link: linkId, p_lifetime: body\?\.lifetime \}\)/);
  const panel = read("components/dashboard/caseTracking/CaseTrackingLinksPanel.tsx");
  for (const w of ["إيقاف مؤقت", "إعادة تفعيل", "إلغاء نهائي", "نعم، ألغِ الرابط نهائياً"]) assert.ok(panel.includes(w), w);
  assert.doesNotMatch(panel, /text-(gray|slate)-(100|200)\b/, "no gray-100/200 text (dark-mode trap: those are surfaces)");
});
