/**
 * officePages.test.ts — batch l19 «office» (owner ق٢٦-٤ / ق٢٦-٥, package 2026-11-26):
 *   * which office step opens which page (paid → open, free → teaser, null → open);
 *   * the database's answer → a level (my_office_plan_level, fallback my_office_features_locked);
 *   * market cases stay open on the free side; tasks are free without cases;
 *   * EVERY mutating /api/v1/lawyer/** handler is classified: gated (calls
 *     officePlanRefusal before it reads the body or writes) or free (never calls it);
 *   * the 19 firm keys carry their plan, and the session tier never decides them;
 *   * the sidebar locks by level, and the dialog's «فتح الصفحة» escape is gone.
 * Run: npm run test:unit
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  FIRM_ENTERPRISE_PAGE_PREFIXES,
  FIRM_OFFICE_PAGE_PREFIXES,
  LAWYER_OFFICE_PAGE_PREFIXES,
  isCaseListOrCasePage,
  isMarketClaimedCase,
  levelFromLockedRead,
  officeLevelGrants,
  officePageNeed,
  readOfficeLevel,
  taskNeedsOfficePlan,
  type OfficeLevel,
} from "./officePages.ts";
import { isOfficePlanMessage, officePlanMessageAr, officePlanPhraseAr, officePlanRefusalBody } from "./officePlan.ts";
import { FEATURE_GATES, OFFICE_DECIDED_FEATURES, resolveFeatureAccess, type FeatureAdminFlags } from "../../hooks/featureAccess.ts";
import {
  FIRM_ENTERPRISE_HREFS,
  officeLockContinue,
  withOfficeLevelLocks,
  withOfficeLocks,
} from "../../constants/navigation.officeLock.ts";
import type { SidebarGroup } from "../../constants/navigation.types.ts";

const repo = process.cwd();
const read = (rel: string) => readFileSync(join(repo, rel), "utf8").replace(/\r\n/g, "\n");
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ─── levels ──────────────────────────────────────────────────────────────────

test("a level opens what it pays for: none → nothing, office → office, enterprise → all, null → all", () => {
  const cases: Array<[OfficeLevel | null, "office" | "enterprise", boolean]> = [
    ["none", "office", false], ["none", "enterprise", false],
    ["office", "office", true], ["office", "enterprise", false],
    ["enterprise", "office", true], ["enterprise", "enterprise", true],
    [null, "office", true], [null, "enterprise", true],
  ];
  for (const [level, need, want] of cases) assert.equal(officeLevelGrants(level, need), want, `${level} / ${need}`);
});

test("the database's answer → a level; a missing function falls back, an error locks nothing", () => {
  assert.deepEqual(readOfficeLevel({ data: "none", error: null }), { state: "level", level: "none" });
  assert.deepEqual(readOfficeLevel({ data: "office", error: null }), { state: "level", level: "office" });
  assert.deepEqual(readOfficeLevel({ data: "enterprise", error: null }), { state: "level", level: "enterprise" });
  assert.deepEqual(readOfficeLevel({ data: null, error: null }), { state: "level", level: null });
  assert.deepEqual(readOfficeLevel({ error: { code: "42883" } }), { state: "missing" });
  assert.deepEqual(readOfficeLevel({ error: { code: "PGRST202" } }), { state: "missing" });
  assert.deepEqual(readOfficeLevel({ error: { code: "42501" } }), { state: "unknown" });
  assert.deepEqual(readOfficeLevel({ data: "gold", error: null }), { state: "unknown" });
  assert.deepEqual(readOfficeLevel(null), { state: "unknown" });
  // the fallback (20261206_70 only): true → none, false → open, else unknown
  assert.deepEqual(levelFromLockedRead({ data: true, error: null }), { state: "level", level: "none" });
  assert.deepEqual(levelFromLockedRead({ data: false, error: null }), { state: "level", level: null });
  assert.deepEqual(levelFromLockedRead({ error: { code: "42883" } }), { state: "unknown" });
  assert.deepEqual(levelFromLockedRead({ data: "x" }), { state: "unknown" });
});

// ─── pages ───────────────────────────────────────────────────────────────────

test("ق٢٦-٤: the lawyer's 17 locked pages need «إدارة المكتب»", () => {
  const locked = [
    "/dashboard/lawyer/cases/abc/sharing",
    "/dashboard/lawyer/clients", "/dashboard/lawyer/clients/c1",
    "/dashboard/lawyer/contracts", "/dashboard/lawyer/contracts/k1",
    "/dashboard/lawyer/hearings", "/dashboard/lawyer/deadlines",
    "/dashboard/lawyer/documents",
    "/dashboard/lawyer/finance", "/dashboard/lawyer/finance/statement",
    "/dashboard/lawyer/analytics", "/dashboard/lawyer/activity", "/dashboard/lawyer/graph",
    "/dashboard/lawyer/secondment",
  ];
  for (const p of locked) assert.equal(officePageNeed("lawyer", p), "office", p);
  // trailing slash / query / hash never open a locked page
  assert.equal(officePageNeed("lawyer", "/dashboard/lawyer/contracts/"), "office");
  assert.equal(officePageNeed("lawyer", "/dashboard/lawyer/finance?tab=x"), "office");
  // the cases list and a case page sort market cases themselves; the vault is the free letterhead
  for (const p of ["/dashboard/lawyer/cases", "/dashboard/lawyer/cases/abc", "/dashboard/lawyer/vault"]) {
    assert.equal(officePageNeed("lawyer", p), null, p);
  }
  assert.equal(isCaseListOrCasePage("lawyer", "/dashboard/lawyer/cases/abc"), true);
  assert.equal(isCaseListOrCasePage("lawyer", "/dashboard/lawyer/cases/abc/sharing"), false);
  // every real page under a locked prefix exists (no typo in the list)
  for (const prefix of LAWYER_OFFICE_PAGE_PREFIXES) {
    assert.ok(statSync(join(repo, "src/app", prefix, "page.tsx")).isFile(), prefix);
  }
});

test("ق٢٦-٤: the lawyer's 13 free pages stay open (home, profile, market, consultations, messages, reviews, tasks, office, achievements, AI history, letterhead)", () => {
  for (const p of [
    "/dashboard/lawyer", "/dashboard/lawyer/profile", "/dashboard/lawyer/profile/edit",
    "/dashboard/lawyer/marketplace", "/dashboard/lawyer/consultations", "/dashboard/lawyer/consultations/x",
    "/dashboard/lawyer/messages", "/dashboard/lawyer/reviews", "/dashboard/lawyer/tasks",
    "/dashboard/lawyer/join-office", "/dashboard/lawyer/achievements", "/dashboard/lawyer/ai/history",
    "/dashboard/lawyer/letterhead", "/notifications", "", null,
  ]) {
    assert.equal(officePageNeed("lawyer", p as string), null, String(p));
  }
  // a lookalike prefix is not the locked page
  assert.equal(officePageNeed("lawyer", "/dashboard/lawyer/clientsX"), null);
});

test("ق٢٦-٥: the firm's free pages, «مكتب المحاماة» pages and «شركة المحاماة» pages", () => {
  for (const p of ["/dashboard/firm", "/dashboard/firm/marketplace", "/dashboard/firm/wallet", "/dashboard/firm/profile",
                   "/dashboard/firm/consultations", "/dashboard/firm/reviews", "/dashboard/firm/cases", "/dashboard/firm/cases/r1"]) {
    assert.equal(officePageNeed("firm", p), null, p);
  }
  for (const p of ["/dashboard/firm/cases/assign", "/dashboard/firm/team", "/dashboard/firm/team/roles", "/dashboard/firm/clients/c1",
                   "/dashboard/firm/contracts", "/dashboard/firm/hearings", "/dashboard/firm/finance", "/dashboard/firm/fees",
                   "/dashboard/firm/vault", "/dashboard/firm/graph", "/dashboard/firm/activity", "/dashboard/firm/tasks",
                   "/dashboard/firm/shared-rooms", "/dashboard/firm/analytics"]) {
    assert.equal(officePageNeed("firm", p), "office", p);
  }
  for (const p of ["/dashboard/firm/departments", "/dashboard/firm/departments/permissions", "/dashboard/firm/branches",
                   "/dashboard/firm/governance", "/dashboard/firm/compliance/walls", "/dashboard/firm/health-check",
                   "/dashboard/firm/secondment/new", "/dashboard/firm/client-portal", "/dashboard/firm/branding"]) {
    assert.equal(officePageNeed("firm", p), "enterprise", p);
  }
  for (const prefix of [...FIRM_OFFICE_PAGE_PREFIXES, ...FIRM_ENTERPRISE_PAGE_PREFIXES]) {
    const dir = join(repo, "src/app", prefix);
    assert.ok(statSync(dir).isDirectory(), prefix);
  }
});

// ─── market cases, tasks ─────────────────────────────────────────────────────

test("a market case (client filed, he is the assignee) stays open; his own filing is the paid office", () => {
  assert.equal(isMarketClaimedCase({ requester_user_id: "client", assigned_to: "me" }, "me"), true);
  assert.equal(isMarketClaimedCase({ requester_user_id: "me", assigned_to: "me" }, "me"), false);
  assert.equal(isMarketClaimedCase({ requester_user_id: "client", assigned_to: "colleague" }, "me"), false);
  assert.equal(isMarketClaimedCase({ requester_user_id: null, assigned_to: "me" }, "me"), false);
  assert.equal(isMarketClaimedCase({ requester_user_id: "client", assigned_to: "me" }, undefined), false);
  assert.equal(isMarketClaimedCase(null, "me"), false);
});

test("the same rule as the database's case cap (solo_lawyer_case_counts: requester = assignee is counted)", () => {
  const sql = read("supabase/migrations/20261206_70_roles_office_plan.sql");
  assert.match(sql, /\(p ->> 'requester_user_id'\) is not distinct from \(p ->> 'assigned_to'\)/);
});

test("ق٢٦-٤: a task is free unless it links a case or names a colleague", () => {
  assert.equal(taskNeedsOfficePlan({ callerId: "me" }), false);
  assert.equal(taskNeedsOfficePlan({ caseId: "", assigneeUserId: null, callerId: "me" }), false);
  assert.equal(taskNeedsOfficePlan({ assigneeUserId: "me", callerId: "me" }), false);
  assert.equal(taskNeedsOfficePlan({ assigneeUserId: " me ", callerId: "me" }), false);
  assert.equal(taskNeedsOfficePlan({ caseId: "r1", callerId: "me" }), true);
  assert.equal(taskNeedsOfficePlan({ assigneeUserId: "colleague", callerId: "me" }), true);
});

test("the tasks route asks for the plan only inside taskNeedsOfficePlan (POST and PATCH)", () => {
  const src = code("src/app/api/v1/lawyer/tasks/route.ts");
  for (const meth of ["POST", "PATCH"]) {
    const body = methodBody(src, meth);
    assert.ok(body, meth);
    const cond = body!.indexOf("if (taskNeedsOfficePlan(");
    const gate = body!.indexOf("officePlanRefusal(");
    assert.ok(cond > 0 && gate > cond, `${meth}: the gate is conditional`);
    assert.equal(body!.split("officePlanRefusal(").length - 1, 1, `${meth}: exactly one gate`);
    const write = body!.search(/\.insert\(|\.update\(/);
    assert.ok(gate < write, `${meth}: the gate runs before the write`);
  }
});

test("the add-task form offers no case link and no colleague on the free side", () => {
  const src = code("src/app/dashboard/lawyer/_components/AddTaskModal.tsx");
  assert.ok(src.includes('useOfficeGateFor("office")'));
  assert.match(src, /\{!freeSide && \(\s*<div>\s*<label[^>]*>ارتباط بقضية/);
  assert.ok(src.includes("const showAssignee = !freeSide &&"));
});

// ─── every mutating /api/v1/lawyer/** handler is classified ─────────────────

function methodBody(src: string, meth: string): string | null {
  const re = new RegExp(`export (async )?function ${meth}\\b`);
  const m = re.exec(src);
  if (!m) return null;
  const tail = src.slice(m.index + m[0].length);
  const next = tail.search(/\nexport (async )?function /);
  return next >= 0 ? tail.slice(0, next) : tail;
}

/** [route under src/app/api/v1, method, feature] — the paid office writes (ق٢٦-٤ / ق٢٦-٥). */
const GATED: Array<[string, string, string]> = [
  ["lawyer/case-board/[caseId]", "PUT", "cases"],
  ["lawyer/case-graph/[caseId]", "PUT", "cases"],
  ["lawyer/case-graph/[caseId]/boards", "POST", "cases"],
  ["lawyer/case-graph/[caseId]/boards/[boardId]", "PUT", "cases"],
  ["lawyer/case-graph/[caseId]/boards/[boardId]", "PATCH", "cases"],
  ["lawyer/case-stages/[caseId]", "POST", "cases"],
  ["lawyer/case-stages/[caseId]", "PATCH", "cases"],
  ["lawyer/clients/[id]", "PATCH", "clients"],
  ["lawyer/clients/[id]/notes", "POST", "clients"],
  ["lawyer/consultations/[id]/convert", "POST", "cases"],
  ["lawyer/contracts", "POST", "contracts"],
  ["lawyer/contracts/[id]", "PATCH", "contracts"],
  ["lawyer/contracts/[id]/obligations", "POST", "contracts"],
  ["lawyer/contracts/[id]/obligations/[oid]", "PATCH", "contracts"],
  ["lawyer/contracts/[id]/parties", "POST", "contracts"],
  ["lawyer/contracts/[id]/parties/[pid]", "PATCH", "contracts"],
  ["lawyer/contracts/[id]/party-id", "PUT", "contracts"],
  ["lawyer/contracts/[id]/payments", "POST", "contracts"],
  ["lawyer/contracts/[id]/payments/[pid]", "PATCH", "contracts"],
  ["lawyer/contracts/[id]/versions", "POST", "contracts"],
  ["lawyer/deadlines", "POST", "deadlines"],
  ["lawyer/deadlines/[id]", "PATCH", "deadlines"],
  ["lawyer/expenses", "POST", "finance"],
  ["lawyer/expenses/[id]", "PATCH", "finance"],
  ["lawyer/expenses/[id]/receipt", "POST", "finance"],
  ["lawyer/fee-statement/billed", "POST", "reports"],
  ["lawyer/finance", "POST", "invoices"],
  ["lawyer/finance", "PATCH", "invoices"],
  ["lawyer/finance/[id]/send", "POST", "invoices"],
  ["lawyer/finance/[id]/void", "POST", "invoices"],
  ["lawyer/finance/issuer", "PUT", "invoices"],
  ["lawyer/hearings", "POST", "hearings"],
  ["lawyer/hearings/[id]", "PATCH", "hearings"],
  ["lawyer/ledger", "POST", "finance"],
  ["lawyer/ledger/[id]", "PATCH", "finance"],
  ["lawyer/time-entries", "POST", "finance"],
  ["lawyer/time-entries/[id]", "PATCH", "finance"],
  ["lawyer/trust", "POST", "finance"],
  ["lawyer/trust/[id]", "PATCH", "finance"],
];

/** The writes that stay free — the market, consultations, the profile, personal notes, pomodoro, removals. */
const FREE: Array<[string, string]> = [
  ["lawyer/clients", "POST"], // held by the database (plan_limit:clients, solo_lawyer_limits 0)
  ["lawyer/clients/[id]/notes/[noteId]", "PATCH"], // restore an archived note of his own
  ["lawyer/clients/[id]/notes/[noteId]", "DELETE"],
  ["lawyer/consultations/[id]", "PATCH"],
  ["lawyer/consultations/[id]/notes", "POST"],
  ["lawyer/consultations/[id]/notes/[noteId]", "DELETE"],
  ["lawyer/consultations/[id]/opinion", "POST"],
  ["lawyer/case-graph/[caseId]/boards/[boardId]", "DELETE"],
  ["lawyer/contracts/[id]/obligations/[oid]", "DELETE"],
  ["lawyer/contracts/[id]/parties/[pid]", "DELETE"],
  ["lawyer/contracts/[id]/party-id", "DELETE"],
  ["lawyer/contracts/[id]/payments/[pid]", "DELETE"],
  ["lawyer/contracts/[id]/versions/[vid]", "DELETE"],
  ["lawyer/dashboard-notes", "POST"],
  ["lawyer/dashboard-notes/[id]", "PATCH"],
  ["lawyer/dashboard-notes/[id]", "DELETE"],
  ["lawyer/licence-image", "POST"],
  ["lawyer/market-requests/[id]/withdraw", "POST"],
  ["lawyer/open-requests/[id]/accept", "POST"],
  ["lawyer/profile-row", "POST"],
  ["lawyer/services", "POST"],
  ["lawyer/services/[id]", "PATCH"],
  ["lawyer/services/[id]", "DELETE"],
  ["lawyer/signup-verification/email/start", "POST"],
  ["lawyer/signup-verification/email/verify", "POST"],
  ["lawyer/signup-verification/licence", "POST"],
  ["lawyer/work-sessions", "POST"],
  ["lawyer/work-sessions/[id]", "DELETE"],
  ["firm/invitations/[id]", "DELETE"],
  ["firm/reviews-visibility", "PATCH"],
];
/** Conditional (tested above): tasks. */
const CONDITIONAL: Array<[string, string]> = [["lawyer/tasks", "POST"], ["lawyer/tasks", "PATCH"], ["firm/members/[memberId]", "PATCH"]];

test("ق٢٦-٥: re-roling or re-activating a member is the paid team; suspending or removing one never is", () => {
  const body = methodBody(code("src/app/api/v1/firm/members/[memberId]/route.ts"), "PATCH")!;
  const cond = body.indexOf('if (!(role === undefined && (status === "suspended" || status === "removed"))) {');
  const gate = body.indexOf('officePlanRefusal(supabase, "team", auth.userType)');
  assert.ok(cond > 0 && gate > cond, "the gate is inside the condition");
  const firstWrite = body.search(/createServiceClient\(\)|\.update\(|resolveCallerFirm\(/);
  assert.ok(gate < firstWrite, "the gate runs before any read of the firm or write");
});

const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(repo, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(repo, rel)).isDirectory()) out.push(...routeFiles(rel));
    else if (name === "route.ts") out.push(rel);
  }
  return out;
}

test("every paid write calls officePlanRefusal with its feature and the caller's type, before the body or any write", () => {
  for (const [rel, meth, feature] of GATED) {
    const body = methodBody(code(`src/app/api/v1/${rel}/route.ts`), meth);
    assert.ok(body, `${rel} ${meth}: no handler`);
    const gate = body!.indexOf("officePlanRefusal(");
    assert.ok(gate > 0, `${rel} ${meth}: not gated`);
    assert.ok(body!.includes(`, "${feature}", `), `${rel} ${meth}: feature ${feature}`);
    assert.match(body!, /officePlanRefusal\([\w.]+, "\w+", (?:[\w.]+\.userType|"lawyer")\)/, `${rel} ${meth}: audience`);
    const first = body!.search(/request\.json\(|\.insert\(|\.update\(|\.upsert\(|\.delete\(|createServiceClient\(\)|\.rpc\(|createInvoiceWith\(|formData\(/);
    assert.ok(first < 0 || gate < first, `${rel} ${meth}: the gate runs after the body is read or a write`);
    assert.match(body!, /if \(officeLocked\) return officeLocked;|if \(locked\) return locked;/, `${rel} ${meth}: the refusal is returned`);
  }
});

test("the free writes never call the office gate", () => {
  for (const [rel, meth] of FREE) {
    const body = methodBody(code(`src/app/api/v1/${rel}/route.ts`), meth);
    assert.ok(body, `${rel} ${meth}: no handler`);
    assert.equal(body!.includes("officePlanRefusal("), false, `${rel} ${meth}: gated`);
  }
});

test("no GET under /api/v1/lawyer or /api/v1/firm is gated: what an account holds stays readable", () => {
  for (const rel of [...routeFiles("src/app/api/v1/lawyer"), ...routeFiles("src/app/api/v1/firm")]) {
    const body = methodBody(code(rel), "GET");
    if (body) assert.equal(body.includes("officePlanRefusal("), false, `${rel} GET`);
  }
});

test("EVERY mutating handler under /api/v1/lawyer and /api/v1/firm is classified (a new route must be decided)", () => {
  const known = new Set([...GATED.map(([r, m]) => `${r} ${m}`), ...FREE.map(([r, m]) => `${r} ${m}`), ...CONDITIONAL.map(([r, m]) => `${r} ${m}`)]);
  // l16's own team gates (firm/members POST, invitations POST, cases assign POST) are pinned in officePlan.test.ts
  for (const r of ["firm/members POST", "firm/invitations POST", "firm/cases/[id]/assign POST"]) known.add(r);
  const missing: string[] = [];
  for (const rel of [...routeFiles("src/app/api/v1/lawyer"), ...routeFiles("src/app/api/v1/firm")]) {
    const src = code(rel);
    const route = rel.replace("src/app/api/v1/", "").replace(/\/route\.ts$/, "");
    for (const meth of WRITE_METHODS) {
      if (methodBody(src, meth) && !known.has(`${route} ${meth}`)) missing.push(`${route} ${meth}`);
    }
  }
  assert.deepEqual(missing, []);
});

// ─── the words ───────────────────────────────────────────────────────────────

test("the refusal names the feature and the plan; the enterprise step names «شركة المحاماة»", () => {
  assert.equal(officePlanMessageAr("contracts", "lawyer"), "العقود متاحة في باقة «إدارة المكتب».");
  assert.equal(officePlanMessageAr("finance", "firm"), "الحسابات المالية للمكتب متاحة في باقة المكتب («مكتب المحاماة» أو «شركة المحاماة»).");
  assert.equal(officePlanPhraseAr("enterprise"), "باقة «شركة المحاماة»");
  assert.equal(isOfficePlanMessage(officePlanMessageAr("team", "enterprise")), true);
  const body = officePlanRefusalBody("contracts", "lawyer");
  assert.equal(body.code, "office_plan_required");
  assert.equal(body.linkHref, "/pricing");
});

// ─── firm keys ───────────────────────────────────────────────────────────────

const FIRM_PLAN: Record<string, string> = {
  "firm-marketplace": "free", "firm-wallet": "free", "firm-ai": "free", "firm-legal-library": "free",
  "firm-cases": "corp", "firm-team": "corp", "firm-finance": "corp", "firm-collaboration": "corp",
  "firm-shared-rooms": "corp", "firm-analytics": "corp",
  "firm-departments": "enterprise", "firm-branches": "enterprise", "firm-chinese-walls": "enterprise",
  "firm-governance": "enterprise", "firm-hr": "enterprise", "firm-branding": "enterprise",
  "firm-client-portal": "enterprise", "firm-health-check": "enterprise", "firm-secondment": "enterprise",
};

test("ق٢٦-٥: the 19 firm keys carry their plan (firm-basic = corp, firm-enterprise = enterprise), browser and server alike", () => {
  const browser = Object.fromEntries(Object.entries(FEATURE_GATES).filter(([k]) => k.startsWith("firm-")));
  assert.deepEqual(browser, FIRM_PLAN);
  assert.equal(OFFICE_DECIDED_FEATURES.size, 19);
  const server = code("src/lib/access-control.ts");
  for (const [k, v] of Object.entries(FIRM_PLAN)) {
    assert.match(server, new RegExp(`"${k}":\\s+"${v}"`), `SERVER_FEATURE_GATES ${k}`);
  }
  assert.ok(server.includes('if (featureKey.startsWith("firm-")) {'), "checkAccess never tier-gates a firm key");
  // the price book's tiers are what the keys name
  const book = code("src/lib/pricing/priceBook.ts");
  assert.match(book, /"firm-basic",\s*"مكتب المحاماة",\s*\{[^}]*\},\s*"corp"/);
  assert.match(book, /"firm-enterprise",\s*"شركة المحاماة",\s*\{[^}]*\},\s*"enterprise"/);
});

const NO_FLAGS = { mounted: false } as unknown as FeatureAdminFlags;

test("ق٢٦-٥: the session tier never decides a firm key (a paid firm's member holds no tier of his own)", () => {
  for (const key of Object.keys(FIRM_PLAN)) {
    assert.equal(resolveFeatureAccess(key, "free", NO_FLAGS, true), true, key);
  }
  // other keys keep their tier gate
  assert.equal(resolveFeatureAccess("governance", "free", NO_FLAGS, true), false);
  assert.equal(resolveFeatureAccess("governance", "corp", NO_FLAGS, true), true);
});

// ─── the sidebar ─────────────────────────────────────────────────────────────

const g = (items: string[]): SidebarGroup[] =>
  [{ title: "t", items: items.map((href) => ({ label: href, labelEn: href, href, icon: "X" })) }] as unknown as SidebarGroup[];
const lockedOf = (groups: SidebarGroup[]) =>
  Object.fromEntries(groups.flatMap((x) => x.items).filter((i) => i.officeLocked).map((i) => [i.href, i.officeLocked]));

test("the menu locks by level: none → every paid row, office → the firm's enterprise rows, else nothing", () => {
  const firm = g(["/dashboard/firm/team", "/dashboard/firm/departments/permissions", "/dashboard/firm/secondment/new", "/dashboard/firm/wallet"]);
  assert.deepEqual(lockedOf(withOfficeLevelLocks(firm, "none", "firm")), {
    "/dashboard/firm/team": "firm",
    "/dashboard/firm/departments/permissions": "firm",
    "/dashboard/firm/secondment/new": "firm",
  });
  assert.deepEqual(lockedOf(withOfficeLevelLocks(firm, "office", "firm")), {
    "/dashboard/firm/departments/permissions": "enterprise",
    "/dashboard/firm/secondment/new": "enterprise",
  });
  for (const level of ["enterprise", null, undefined] as const) {
    assert.equal(withOfficeLevelLocks(firm, level, "firm"), firm, String(level));
  }
  const lawyer = g(["/dashboard/lawyer/cases", "/dashboard/lawyer/tasks"]);
  assert.deepEqual(lockedOf(withOfficeLevelLocks(lawyer, "none", "lawyer")), { "/dashboard/lawyer/cases": "lawyer" });
  assert.equal(withOfficeLevelLocks(lawyer, "office", "lawyer"), lawyer);
  // 'none' is exactly the l18 binary lock
  assert.deepEqual(withOfficeLevelLocks(firm, "none", "firm"), withOfficeLocks(firm, true, "firm"));
  for (const h of FIRM_ENTERPRISE_HREFS) assert.equal(officePageNeed("firm", h.split("?")[0]), "enterprise", h);
});

test("the dialog's «فتح الصفحة» escape is gone; only the market cases and the letterhead keep a link", () => {
  assert.deepEqual(officeLockContinue("/dashboard/lawyer/cases"), { href: "/dashboard/lawyer/cases", label: "قضايا السوق المسندة إليك" });
  assert.deepEqual(officeLockContinue("/dashboard/firm/cases"), { href: "/dashboard/firm/cases", label: "قضايا السوق المسندة إليك" });
  assert.deepEqual(officeLockContinue("/dashboard/lawyer/vault"), { href: "/dashboard/lawyer/vault?tab=branding", label: "الورق المروّس" });
  for (const h of ["/dashboard/lawyer/contracts", "/dashboard/lawyer/finance", "/dashboard/firm/team"]) assert.equal(officeLockContinue(h), null, h);
  const side = code("src/components/dashboard/SidebarComponents.tsx");
  assert.equal(side.includes("continueHref: item.href"), false);
  assert.ok(side.includes("officeLockContinue(item.href)"));
});

// ─── wiring ──────────────────────────────────────────────────────────────────

test("the lawyer and firm layouts guard their pages; the sidebar reads the level; admins are never asked", () => {
  assert.match(code("src/app/dashboard/lawyer/layout.tsx"), /<OfficePlanGuard scope="lawyer">\{children\}<\/OfficePlanGuard>/);
  assert.match(code("src/app/dashboard/firm/layout.tsx"), /<OfficePlanGuard scope="firm">\{children\}<\/OfficePlanGuard>/);
  const guard = code("src/components/dashboard/OfficePlanGuard.tsx");
  assert.ok(guard.includes('user.userType !== "admin"'), "an admin is never locked");
  assert.ok(guard.includes("isSupabaseMode"), "demo mode is never locked");
  assert.ok(guard.includes("if (pending) return null;"), "nothing shows while the answer loads");
  const hook = code("src/hooks/useOfficePlanLevel.ts");
  assert.ok(hook.indexOf('rpc("my_office_plan_level")') < hook.indexOf('rpc("my_office_features_locked")'), "level first, fallback second");
  const side = read("src/components/dashboard/SharedSidebar.tsx");
  assert.ok(side.includes("const officeLevel = useOfficePlanLevel("));
  assert.equal(side.includes("useOfficeFeaturesLocked("), false, "the binary hook is not the menu's source any more");
  assert.ok(side.includes("!isRealAdmin"));
  for (const rel of ["src/app/dashboard/lawyer/cases/page.tsx", "src/app/dashboard/firm/cases/page.tsx",
                     "src/app/dashboard/lawyer/cases/[id]/page.tsx", "src/app/dashboard/firm/cases/[id]/page.tsx"]) {
    const src = code(rel);
    assert.ok(src.includes('useOfficeGateFor("office")'), rel);
    assert.ok(src.includes("isMarketClaimedCase("), rel);
  }
});

test("20261209_60: 'none' IS office_features_locked; enterprise = firm-enterprise; only my_office_plan_level for sessions", () => {
  const sql = read("supabase/migrations/20261209_60_l19_office_plan_level.sql");
  assert.match(sql, /if public\.office_features_locked\(p_user\) then\s+return 'none';/);
  assert.match(sql, /select array\['firm-enterprise'\]::text\[\];/);
  assert.match(sql, /grant execute on function public\.my_office_plan_level\(\) to authenticated;/);
  assert.equal(/grant execute on function public\.office_plan_level\(uuid\) to authenticated/.test(sql), false);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /raise notice 'l19_office verify: OK/);
});
