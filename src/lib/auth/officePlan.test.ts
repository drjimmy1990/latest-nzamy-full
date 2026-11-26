/**
 * officePlan.test.ts — batch l16 «roles»:
 *   س٢١٢  the «إدارة المكتب» gate (pure decisions + which routes call it);
 *   D-52  the lawyer workspace APIs admit an active firm member;
 *   D-53  the firm team managers (owner, managing partner, HR manager).
 * Run: npm run test:unit
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  OFFICE_PLAN_PRICING_HREF,
  OFFICE_PLAN_REQUIRED_CODE,
  STORAGE_QUOTA_FULL_AR,
  isOfficePlanMessage,
  officeGateDecision,
  officePlanMessageAr,
  officePlanRefusalBody,
  storageQuotaCheck,
  storageQuotaFullAr,
} from "./officePlan.ts";
import {
  FIRM_MANAGING_PARTNER_OWNER_ONLY_AR,
  FIRM_OWN_ROLE_AR,
  FIRM_TEAM_MANAGERS_ONLY_AR,
  FIRM_TEAM_MANAGE_ROLES,
  canManageFirmTeam,
  teamWriteRefusal,
} from "./firmMembershipAccess.ts";

const repo = process.cwd();
const read = (rel: string) => readFileSync(join(repo, rel), "utf8").replace(/\r\n/g, "\n");
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("the gate decision: locked / allow / not installed / unavailable", () => {
  assert.equal(officeGateDecision({ data: true, error: null }), "locked");
  assert.equal(officeGateDecision({ data: false, error: null }), "allow");
  assert.equal(officeGateDecision({ error: { code: "42883" } }), "not_installed");
  assert.equal(officeGateDecision({ error: { code: "PGRST202" } }), "not_installed");
  // fail closed on anything else
  assert.equal(officeGateDecision({ error: { code: "57014" } }), "unavailable");
  assert.equal(officeGateDecision({ data: null, error: null }), "unavailable");
  assert.equal(officeGateDecision({ data: "true", error: null }), "unavailable");
  assert.equal(officeGateDecision(null), "unavailable");
});

test("the refusal names the plan and links to its price, never a number", () => {
  const body = officePlanRefusalBody("tasks");
  assert.equal(body.code, OFFICE_PLAN_REQUIRED_CODE);
  assert.equal(body.error, "المهام متاحة في باقة «إدارة المكتب».");
  assert.equal(body.linkHref, OFFICE_PLAN_PRICING_HREF);
  assert.match(body.linkLabel, /إدارة المكتب/);
  for (const f of ["team", "cases", "clients", "documents", "tasks", "hearings", "deadlines", "invoices", "reports"] as const) {
    const m = officePlanMessageAr(f);
    assert.ok(m.endsWith("متاحة في باقة «إدارة المكتب»."), f);
    assert.doesNotMatch(m, /[0-9٠-٩]/, f);
    assert.ok(isOfficePlanMessage(m), f);
  }
  assert.equal(officePlanMessageAr(), "هذه الميزة متاحة في باقة «إدارة المكتب».");
  assert.ok(isOfficePlanMessage(STORAGE_QUOTA_FULL_AR));
  assert.equal(isOfficePlanMessage("تعذّر حفظ الموكّل."), false);
  assert.equal(isOfficePlanMessage(null), false);
});

test("1 GB: only a limited account at the cap is refused; anything unreadable allows", () => {
  const GB = 1024 ** 3;
  assert.deepEqual(storageQuotaCheck({ used_bytes: GB - 1, cap_bytes: GB, limited: true }), { ok: true });
  const full = storageQuotaCheck({ used_bytes: GB, cap_bytes: GB, limited: true });
  assert.equal(full.ok, false);
  assert.match((full as { message: string }).message, /١ جيجابايت/);
  assert.match((full as { message: string }).message, /إدارة المكتب/);
  assert.deepEqual(storageQuotaCheck({ used_bytes: 5 * GB, cap_bytes: GB, limited: false }), { ok: true }, "a paid account is never held");
  assert.deepEqual(storageQuotaCheck(null), { ok: true });
  assert.deepEqual(storageQuotaCheck({ used_bytes: "x", cap_bytes: GB, limited: true }), { ok: true });
  assert.match(storageQuotaFullAr(2 * GB), /٢ جيجابايت/);
});

test("D-53: the owner, the managing partner and the HR manager manage the team, within limits", () => {
  assert.deepEqual([...FIRM_TEAM_MANAGE_ROLES].sort(), ["hr_manager", "managing_partner"]);
  assert.equal(canManageFirmTeam({ isOwner: true, role: "managing_partner" }), true);
  assert.equal(canManageFirmTeam({ isOwner: false, role: "hr_manager" }), true);
  assert.equal(canManageFirmTeam({ isOwner: false, role: "office_admin" }), false);
  assert.equal(canManageFirmTeam(null), false);

  const owner = { isOwner: true, role: "managing_partner" };
  const hr = { isOwner: false, role: "hr_manager" };
  const mp = { isOwner: false, role: "managing_partner" };
  const plain = { isOwner: false, role: "lawyer" };
  // the owner may do anything this check governs
  assert.equal(teamWriteRefusal({ caller: owner, callerUserId: "o", target: { userId: "x", role: "managing_partner" }, newRole: "lawyer" }), null);
  assert.equal(teamWriteRefusal({ caller: owner, callerUserId: "o", target: null, newRole: "managing_partner" }), null);
  // a manager invites and re-roles ordinary members
  assert.equal(teamWriteRefusal({ caller: hr, callerUserId: "h", target: null, newRole: "trainee" }), null);
  assert.equal(teamWriteRefusal({ caller: mp, callerUserId: "m", target: { userId: "x", role: "lawyer" }, newRole: "senior_lawyer" }), null);
  // … never a managing partner, never himself
  assert.equal(teamWriteRefusal({ caller: hr, callerUserId: "h", target: null, newRole: "managing_partner" }), FIRM_MANAGING_PARTNER_OWNER_ONLY_AR);
  assert.equal(teamWriteRefusal({ caller: mp, callerUserId: "m", target: { userId: "y", role: "managing_partner" }, newRole: undefined }), FIRM_MANAGING_PARTNER_OWNER_ONLY_AR);
  assert.equal(teamWriteRefusal({ caller: hr, callerUserId: "h", target: { userId: "h", role: "hr_manager" }, newRole: "partner" }), FIRM_OWN_ROLE_AR);
  // a plain member manages nothing
  assert.equal(teamWriteRefusal({ caller: plain, callerUserId: "p", target: null, newRole: "trainee" }), FIRM_TEAM_MANAGERS_ONLY_AR);
});

test("the database holds the same team-manager list and limits (20261206_70)", () => {
  const sql = read("supabase/migrations/20261206_70_roles_office_plan.sql");
  assert.match(sql, /m\.role in \('managing_partner', 'hr_manager'\)/);
  assert.match(sql, /only the firm owner grants or changes a managing partner/);
  assert.match(sql, /only the firm owner changes your role/);
});

// ─── which routes call the gate ──────────────────────────────────────────────

const GATED: Array<[string, string]> = [
  ["src/app/api/v1/firm/members/route.ts", "team"],
  ["src/app/api/v1/firm/invitations/route.ts", "team"],
  ["src/app/api/v1/lawyer/tasks/route.ts", "tasks"],
  ["src/app/api/v1/lawyer/hearings/route.ts", "hearings"],
  ["src/app/api/v1/lawyer/deadlines/route.ts", "deadlines"],
  ["src/app/api/v1/lawyer/finance/route.ts", "invoices"],
  ["src/app/api/v1/share/route.ts", "documents"],
  ["src/app/api/v1/firm/cases/[id]/assign/route.ts", "cases"],
];

test("س٢١٢: every paid write calls officePlanRefusal in its POST, before anything is written", () => {
  for (const [rel, feature] of GATED) {
    const src = code(rel);
    const post = src.indexOf("export async function POST");
    assert.ok(post >= 0, `${rel}: no POST`);
    const tail = src.slice(post);
    const gate = tail.indexOf(`officePlanRefusal(`);
    assert.ok(gate > 0, `${rel}: POST does not call officePlanRefusal`);
    assert.ok(tail.includes(`"${feature}")`), `${rel}: feature ${feature}`);
    const write = tail.search(/\.insert\(|\.update\(|\.upsert\(|createServiceClient\(\)|\.rpc\(|createInvoiceWith\(/);
    assert.ok(write < 0 || gate < write, `${rel}: the gate runs after a write`);
    // GET is never gated: what an account holds stays readable
    const get = src.indexOf("export async function GET");
    if (get >= 0 && get < post) assert.equal(src.slice(get, post).includes("officePlanRefusal("), false, `${rel}: GET gated`);
  }
});

test("cases and clients are held by the database (one constant), not by an API gate", () => {
  for (const rel of ["src/app/api/v1/lawyer/clients/route.ts", "src/app/api/v1/service-requests/route.ts"]) {
    const src = code(rel);
    assert.equal(src.includes("officePlanRefusal("), false, rel);
    assert.ok(src.includes("limitRefusal("), `${rel} maps plan_limit:*`);
  }
});

test("the upload screen asks for the 1 GB check and maps the trigger's token", () => {
  const src = code("src/lib/services/documentService.ts");
  assert.ok(src.includes('supabase.rpc("my_storage_quota")'));
  assert.ok(src.includes("STORAGE_QUOTA_FULL_TOKEN"));
  const quotaAt = src.indexOf('supabase.rpc("my_storage_quota")');
  const uploadAt = src.indexOf('.upload(storagePath, file');
  assert.ok(quotaAt > 0 && quotaAt < uploadAt, "the check runs before the bytes travel");
});

// ─── D-52 ────────────────────────────────────────────────────────────────────

test("D-52: the lawyer workspace APIs admit an active firm member (assertCaseWorker)", () => {
  const widened = [
    "activity", "case-board/[caseId]", "case-stages", "case-stages/[caseId]",
    "clients", "clients/[id]", "clients/[id]/notes", "clients/[id]/notes/[noteId]",
    "consultations", "consultations/[id]", "consultations/[id]/convert", "consultations/[id]/opinion",
    "consultations/[id]/notes", "consultations/[id]/notes/[noteId]",
    "contracts", "contracts/[id]", "contracts/[id]/versions", "contracts/[id]/parties",
    "dashboard/summary", "deadlines", "deadlines/[id]", "hearings", "hearings/[id]", "hearings/assignees",
    "tasks", "tasks/assignees",
  ];
  for (const r of widened) {
    const src = code(`src/app/api/v1/lawyer/${r}/route.ts`);
    assert.ok(src.includes("assertCaseWorker("), r);
    assert.equal(src.includes('assertRole(["lawyer", "firm"])'), false, r);
  }
  for (const r of ["case-graph/[caseId]", "case-graph/[caseId]/boards"]) {
    assert.ok(code(`src/app/api/v1/lawyer/${r}/route.ts`).includes('assertCaseWorker(["corporate"])'), r);
  }
});

test("D-52: the market, the public services list and invoices keep the lawyer / firm gate", () => {
  for (const r of ["open-requests", "open-requests/[id]/accept", "market-requests", "services", "finance", "finance/issuer"]) {
    assert.ok(code(`src/app/api/v1/lawyer/${r}/route.ts`).includes('assertRole(["lawyer", "firm"])'), r);
  }
  const worker = code("src/lib/auth/assertCaseWorker.ts");
  assert.ok(worker.includes('.eq("status", "active")'), "only an ACTIVE membership");
});
