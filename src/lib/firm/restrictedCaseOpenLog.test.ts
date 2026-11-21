/**
 * N16 (batch l12, 20261202_80): the restricted case's open log — the pure half
 * and the wiring. The SQL half is proven by supabase/tests/rls/l12_firm_scope.test.sql (D1–D4).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { openLogRpcOutcome, shouldLogRestrictedOpen, toOpenLogEntries } from "./restrictedCaseOpenLog.ts";

const repo = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");

test("N16: only a restricted firm case is logged on open", () => {
  assert.equal(shouldLogRestrictedOpen({ firm_id: "f1", is_restricted: true }), true);
  assert.equal(shouldLogRestrictedOpen({ firm_id: "f1", is_restricted: false }), false);
  assert.equal(shouldLogRestrictedOpen({ firm_id: null, is_restricted: true }), false);
  assert.equal(shouldLogRestrictedOpen(null), false);
});

test("N16: RPC errors read as unavailable / forbidden / failed", () => {
  assert.equal(openLogRpcOutcome(null), "ok");
  assert.equal(openLogRpcOutcome({ code: "42883" }), "unavailable");
  assert.equal(openLogRpcOutcome({ code: "PGRST202" }), "unavailable");
  assert.equal(openLogRpcOutcome({ code: "42501" }), "forbidden");
  assert.equal(openLogRpcOutcome({ code: "XX000" }), "failed");
});

test("N16: the owner sees who by office and when; a platform admin is never named", () => {
  const out = toOpenLogEntries([
    { opened_at: "2026-11-21T10:00:00Z", viewer_name: "سالم", viewer_kind: "managing_partner" },
    { opened_at: "2026-11-21T09:00:00Z", viewer_name: "اسم مسرّب", viewer_kind: "platform_admin" },
    { opened_at: "2026-11-21T08:00:00Z", viewer_name: null, viewer_kind: "firm_owner" },
    { opened_at: "2026-11-21T07:00:00Z", viewer_name: "x", viewer_kind: "unknown" },
    "junk",
  ]);
  assert.deepEqual(out.map((e) => e.who), ["سالم (الشريك المدير)", "فريق المنصة", "صاحب المكتب"]);
});

test("N16: the case-file read logs the open, fail-open, and the log route reads through the session", () => {
  const get = repo("src/app/api/v1/service-requests/[id]/route.ts");
  const at = get.indexOf('supabase.rpc("log_restricted_case_open", { p_request: id })');
  assert.ok(at > 0);
  assert.ok(at > get.indexOf('{ error: "Service request not found" }'), "logged only after the RLS read found the case");
  assert.ok(at < get.indexOf('.from("request_events")'));
  const route = repo("src/app/api/v1/cases/[id]/open-log/route.ts");
  assert.match(route, /auth\.supabase\.rpc\("restricted_case_open_log_read", \{ p_request: id \}\)/);
  assert.ok(!route.includes("createServiceClient"));
  assert.match(repo("src/components/dashboard/caseNotes/CaseRestrictionToggle.tsx"), /\{state\.restricted && <CaseOpenLog caseId=\{caseId\} isDark=\{isDark\} \/>\}/);
});
