/**
 * consultantScopeServer.test.ts — the read behind "independent consultant" and
 * the wiring of the shared guard (proxy: pages and /api/v1/lawyer; the AI run
 * path; tool-status). RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/consultantScopeServer.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CONSULTANT_STANDING_TTL_MS,
  ConsultantStandingCache,
  readConsultantStanding,
  readConsultantStandingCached,
} from "./consultantScopeServer.ts";
import { consultantApiVerdict, consultantPageVerdict } from "./consultantScope.ts";

type Reply = { data?: unknown; error?: { code?: string } | null };
/** A client whose lawyer_profiles / firm_members reads answer as given (or throw). */
function client(profile: Reply | "throw", member: Reply | "throw" = { data: null }) {
  const answer = (r: Reply | "throw") => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self; chain.eq = self; chain.limit = self;
    chain.maybeSingle = async () => { if (r === "throw") throw new Error("boom"); return { data: r.data ?? null, error: r.error ?? null }; };
    return chain;
  };
  return { from: (t: string) => answer(t === "lawyer_profiles" ? profile : member) } as never;
}

test("only the exact value 'consultant' makes a consultant; everything else is an advocate (never locked out)", async () => {
  for (const v of [null, undefined, "", " ", "advocate", "Consultant", "CONSULTANT", "consultant ", 1, true, {}]) {
    const s = await readConsultantStanding(client({ data: { practice_kind: v } }), "u");
    assert.equal(s.scopeKind, "advocate", JSON.stringify(v));
  }
  assert.equal((await readConsultantStanding(client({ data: null }), "u")).scopeKind, "advocate", "no row (a firm account)");
  assert.equal((await readConsultantStanding(client({ data: { practice_kind: "consultant" } }), "u")).scopeKind, "consultant");
});

test("a consultant who is an active firm member is not the independent one", async () => {
  const s = await readConsultantStanding(client({ data: { practice_kind: "consultant" } }, { data: { id: "m1" } }), "u");
  assert.deepEqual([s.practiceKind, s.firmMember, s.scopeKind], ["consultant", true, "advocate"]);
  assert.equal(consultantPageVerdict("/dashboard/lawyer/cases", s.scopeKind), "allow");
  assert.equal(consultantApiVerdict("/api/v1/lawyer/clients", s.scopeKind), "allow");
});

test("a membership read that fails never opens the workspace to a consultant", async () => {
  for (const member of ["throw", { error: { code: "XX000" } }] as const) {
    const s = await readConsultantStanding(client({ data: { practice_kind: "consultant" } }, member), "u");
    assert.equal(s.scopeKind, "consultant");
    assert.equal(consultantApiVerdict("/api/v1/lawyer/clients", s.scopeKind), "forbid");
  }
});

test("an unreadable practice_kind is an advocate but is reported, so the API can answer 503; a missing column is not reported", async () => {
  const failed = await readConsultantStanding(client({ error: { code: "XX000" } }), "u");
  assert.deepEqual([failed.scopeKind, failed.readFailed], ["advocate", true]);
  assert.equal((await readConsultantStanding(client("throw"), "u")).readFailed, true);
  const missing = await readConsultantStanding(client({ error: { code: "42703" } }), "u");
  assert.deepEqual([missing.scopeKind, missing.readFailed], ["advocate", false]);
});

// ── wiring (source level: proxy.ts and the run path cannot be loaded by node --test) ──

const src = (rel: string) => readFileSync(join(process.cwd(), "src", rel), "utf8").replace(/\r\n/g, "\n");

test("(c) the proxy refuses a consultant on /api/v1/lawyer (403, before the admin MFA step) and redirects his pages home", () => {
  const proxy = src("proxy.ts");
  const api = proxy.indexOf("isConsultantScopedApiPath(pathname) && !isConsultantAllowedApiPath(pathname)");
  assert.ok(api > 0, "the API guard is missing");
  assert.ok(api < proxy.indexOf("if (isAdminApiPath(pathname))"), "the guard must sit inside the protected-API branch");
  assert.match(proxy.slice(api, api + 900), /readConsultantStandingCached\(supabase, user\.id\)/, "the API guard reads through the cache");
  assert.match(proxy.slice(api, api + 900), /consultantApiVerdict\(pathname, standing\.scopeKind\) === "forbid"[\s\S]*status: 403/);
  assert.match(proxy.slice(api, api + 900), /standing\.readFailed[\s\S]*status: 503/, "an unreadable kind asks again");
  const page = proxy.indexOf('knownType === "lawyer" && isConsultantScopedPagePath(pathname) && !isConsultantAllowedPath(pathname)');
  assert.ok(page > 0, "the page guard is missing");
  const pageGuard = proxy.slice(page, page + 700);
  assert.match(pageGuard, /readConsultantStandingCached\(supabase, user\.id\)/, "the page guard reads through the cache");
  // review of 23 Nov: a failed read is closed on pages too (his home, never the page asked for)
  assert.match(pageGuard, /if \(standing\.readFailed \|\| consultantPageVerdict\(pathname, standing\.scopeKind\) === "redirect_home"\)/);
  assert.match(pageGuard, /home\.pathname = CONSULTANT_HOME_PATH;/);
  // no uncached read is left in the proxy
  assert.doesNotMatch(proxy, /readConsultantStanding\(/);
});

test("the AI run path and tool-status read the same standing", () => {
  assert.match(src("app/api/v1/ai/runs/route.ts"), /firmMember: \(await readConsultantStanding\(supabase, user\.id\)\)\.firmMember/);
  assert.match(src("lib/ai/toolStatus.ts"), /readConsultantStanding\(rls, userId\)\)\.firmMember/);
});

test("/dashboard/lawyer renders the library home for a consultant and the lawyer dashboard for everyone else", () => {
  const page = src("app/dashboard/lawyer/page.tsx");
  assert.match(page, /if \(isIndependentConsultantSession\(userType, practiceKind, !!firmMembership\)\) return <ConsultantHome \/>;\n  return <LawyerDashboardContent \/>;/);
});

test("the paid-term policy is gone", () => {
  assert.throws(() => readFileSync(join(process.cwd(), "src/lib/ai/consultantTerm.ts")), /ENOENT/);
});

// ── review of 23 Nov: the guard is asked on every lawyer page, so the answer is kept briefly ──

/** A client that counts its lawyer_profiles reads and answers as given (the last reply repeats). */
function countingClient(replies: Array<Reply | "throw">) {
  let reads = 0;
  const c = {
    from: (t: string) => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self; chain.eq = self; chain.limit = self;
      chain.maybeSingle = async () => {
        if (t !== "lawyer_profiles") return { data: null, error: null };
        const r = replies[Math.min(reads, replies.length - 1)];
        reads += 1;
        if (r === "throw") throw new Error("boom");
        return { data: r.data ?? null, error: r.error ?? null };
      };
      return chain;
    },
  };
  return { client: c as never, reads: () => reads };
}

test("an answer is kept for the TTL per user, then read again", async () => {
  const cache = new ConsultantStandingCache();
  const { client: c, reads } = countingClient([{ data: { practice_kind: "advocate" } }]);
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i += 1) await readConsultantStandingCached(c, "u1", cache, t0 + i * 1000);
  assert.equal(reads(), 1, "an advocate moving between pages pays one read");
  await readConsultantStandingCached(c, "u2", cache, t0);
  assert.equal(reads(), 2, "keyed per user");
  await readConsultantStandingCached(c, "u1", cache, t0 + CONSULTANT_STANDING_TTL_MS);
  assert.equal(reads(), 3, "read again once the TTL has passed");
  assert.ok(CONSULTANT_STANDING_TTL_MS <= 60_000, "a change of kind or membership reaches the guard within a minute");
});

test("a consultant's answer is kept too, so the cache never opens what the read closed", async () => {
  const cache = new ConsultantStandingCache();
  const { client: c } = countingClient([{ data: { practice_kind: "consultant" } }]);
  const first = await readConsultantStandingCached(c, "u", cache, 0);
  const again = await readConsultantStandingCached(c, "u", cache, 10);
  assert.equal(first.scopeKind, "consultant");
  assert.equal(again.scopeKind, "consultant");
  assert.equal(consultantApiVerdict("/api/v1/lawyer/cases", again.scopeKind), "forbid");
  assert.equal(consultantPageVerdict("/marketplace/collaborate", again.scopeKind), "redirect_home");
});

test("a failed read is never kept: the next request reads again", async () => {
  for (const bad of ["throw", { error: { code: "XX000" } }] as const) {
    const cache = new ConsultantStandingCache();
    const { client: c, reads } = countingClient([bad, { data: { practice_kind: "consultant" } }]);
    const failed = await readConsultantStandingCached(c, "u", cache, 0);
    assert.equal(failed.readFailed, true);
    assert.equal(cache.size, 0);
    const next = await readConsultantStandingCached(c, "u", cache, 1);
    assert.equal(reads(), 2);
    assert.deepEqual([next.readFailed, next.scopeKind], [false, "consultant"]);
  }
});

test("the cache is bounded and drops the oldest user first", async () => {
  const cache = new ConsultantStandingCache(60_000, 3);
  const { client: c, reads } = countingClient([{ data: { practice_kind: "advocate" } }]);
  for (const id of ["a", "b", "c", "d"]) await readConsultantStandingCached(c, id, cache, 0);
  assert.equal(cache.size, 3);
  assert.equal(reads(), 4);
  await readConsultantStandingCached(c, "a", cache, 1);
  assert.equal(reads(), 5, "the oldest (a) was dropped");
  await readConsultantStandingCached(c, "d", cache, 1);
  assert.equal(reads(), 5, "a recent one is still kept");
});
