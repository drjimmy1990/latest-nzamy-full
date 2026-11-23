/**
 * consultantScopeServer.test.ts — the read behind "independent consultant" and
 * the wiring of the shared guard (proxy: pages and /api/v1/lawyer; the AI run
 * path; tool-status). RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/consultantScopeServer.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { readConsultantStanding } from "./consultantScopeServer.ts";
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
  assert.match(proxy.slice(api, api + 900), /consultantApiVerdict\(pathname, standing\.scopeKind\) === "forbid"[\s\S]*status: 403/);
  assert.match(proxy.slice(api, api + 900), /standing\.readFailed[\s\S]*status: 503/, "an unreadable kind asks again");
  assert.match(proxy, /knownType === "lawyer" && isConsultantScopedPagePath\(pathname\) && !isConsultantAllowedPath\(pathname\)/);
  assert.match(proxy, /consultantPageVerdict\(pathname, standing\.scopeKind\) === "redirect_home"/);
});

test("the AI run path and tool-status read the same standing", () => {
  assert.match(src("app/api/v1/ai/runs/route.ts"), /firmMember: \(await readConsultantStanding\(supabase, user\.id\)\)\.firmMember/);
  assert.match(src("lib/ai/toolStatus.ts"), /readConsultantStanding\(rls, userId\)\)\.firmMember/);
});

test("/dashboard/lawyer renders the library home for a consultant and the lawyer dashboard for everyone else", () => {
  const page = src("app/dashboard/lawyer/page.tsx");
  assert.match(page, /if \(practiceKind === "consultant"\) return <ConsultantHome \/>;\n  return <LawyerDashboardContent \/>;/);
});

test("the paid-term policy is gone", () => {
  assert.throws(() => readFileSync(join(process.cwd(), "src/lib/ai/consultantTerm.ts")), /ENOENT/);
});
