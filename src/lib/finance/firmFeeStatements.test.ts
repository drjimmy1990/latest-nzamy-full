/**
 * O23 (batch l11) — firm-wide fee statements. The pure half here; the route is
 * pinned by source assertions (it imports next/server); the SQL policy is
 * proved in Docker: supabase/tests/rls/l11_firm_statements_party_ids.test.sql.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  canReadFirmStatements,
  FIRM_FEE_STATEMENT_ROLES,
  FIRM_STATEMENT_STATUSES,
  FIRM_STATEMENTS_MAX_LIMIT,
  firmStatementStatus,
  mapFirmStatement,
  parseFirmStatementsQuery,
} from "./firmFeeStatements.ts";

const repo = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");
const params = (o: Record<string, string>) => new URLSearchParams(o);

test("O23: owner, managing partner and finance manager read; nobody else", () => {
  assert.equal(canReadFirmStatements({ isOwner: true, role: "lawyer" }), true);
  assert.equal(canReadFirmStatements({ isOwner: false, role: "managing_partner" }), true);
  assert.equal(canReadFirmStatements({ isOwner: false, role: "finance_manager" }), true);
  for (const role of ["partner", "senior_lawyer", "lawyer", "trainee", "legal_secretary", "office_admin", "hr_manager", "compliance_manager"]) {
    assert.equal(canReadFirmStatements({ isOwner: false, role }), false, role);
  }
  assert.equal(canReadFirmStatements(null), false);
});

test("O23: the TS role list is the one the SQL helper checks", () => {
  const sql = repo("supabase/migrations/20261201_40_firm_statements_party_ids.sql");
  const m = sql.match(/m\.role in \(([^)]*)\)/);
  assert.ok(m, "role list in firm_fee_statement_reader");
  const sqlRoles = m[1].split(",").map((s) => s.trim().replace(/'/g, "")).sort();
  assert.deepEqual(sqlRoles, [...FIRM_FEE_STATEMENT_ROLES].sort());
  assert.match(sql, /firm_id is not null\s*\n\s*and \(metadata ->> 'invoice'\) = 'true'/);
  assert.match(sql, /revoke all on function public\.firm_fee_statement_reader\(uuid\) from anon;/);
});

test("O23: the query is bounded and malformed values fall back", () => {
  assert.deepEqual(parseFirmStatementsQuery(params({})), { limit: 50, offset: 0, filter: "all", issuer: null });
  const q = parseFirmStatementsQuery(params({ limit: "9999", offset: "-4", filter: "drop table", issuer: "x' or 1=1" }));
  assert.equal(q.limit, FIRM_STATEMENTS_MAX_LIMIT);
  assert.equal(q.offset, 0);
  assert.equal(q.filter, "all");
  assert.equal(q.issuer, null);
  const ok = parseFirmStatementsQuery(params({ limit: "10", offset: "20", filter: "open", issuer: "ABCDEF12-0000-4000-8000-000000000001" }));
  assert.deepEqual(ok, { limit: 10, offset: 20, filter: "open", issuer: "abcdef12-0000-4000-8000-000000000001" });
});

test("O23: filters read only statement statuses (never not_required / refunded)", () => {
  for (const list of Object.values(FIRM_STATEMENT_STATUSES)) {
    for (const s of list) assert.ok(["requires_payment", "paid", "failed", "void"].includes(s), s);
  }
});

test("O23: status and figures come from the row, nothing invented", () => {
  assert.equal(firmStatementStatus("paid", 100, 0), "paid");
  assert.equal(firmStatementStatus("failed", 100, 0), "overdue");
  assert.equal(firmStatementStatus("requires_payment", 100, 40), "partial");
  assert.equal(firmStatementStatus("requires_payment", 100, 0), "pending");
  assert.equal(firmStatementStatus("void", 100, 0), "void");

  const names = new Map([["u1", "أ. سالم"]]);
  const dto = mapFirmStatement(
    { id: "p1", amount: "1150.00", status: "requires_payment", currency: "SAR", owner_user_id: "u1",
      created_at: "2026-11-01T10:00:00Z", metadata: { client: "شركة س", description: "أتعاب", paidAmount: 150, caseTitle: "قضية ١" } },
    names,
  );
  assert.equal(dto.issuerName, "أ. سالم");
  assert.equal(dto.totalFee, 1150);
  assert.equal(dto.paidAmount, 150);
  assert.equal(dto.status, "partial");
  assert.equal(dto.client, "شركة س");
  assert.equal(dto.caseTitle, "قضية ١");
  assert.equal(dto.voidReason, null);

  const unknown = mapFirmStatement({ id: "p2", amount: 10, status: "void", owner_user_id: "u9", void_reason: "خطأ", metadata: null }, names);
  assert.equal(unknown.issuerName, "عضو في المكتب");
  assert.equal(unknown.status, "void");
  assert.equal(unknown.voidReason, "خطأ");
  assert.equal(unknown.client, "عميل");
});

test("O23: the route gates twice, reads under RLS, uses the service role for names only", () => {
  const route = repo("src/app/api/v1/firm/fee-statements/route.ts");
  const gate1 = route.indexOf("canReadFirmStatements(firm)");
  const gate2 = route.indexOf('supabase.rpc("firm_fee_statement_reader", { p_firm: firm.id })');
  const read = route.indexOf('.from("payments")');
  const service = route.indexOf("createServiceClient()");
  assert.ok(gate1 > 0 && gate2 > gate1 && read > gate2 && service > read, "owner/role check → SQL gate → RLS read → names");
  assert.match(route, /supabase\s*\n\s*\.from\("payments"\)/, "payments are read with the session client");
  assert.doesNotMatch(route, /service\s*\n?\s*\.from\("payments"\)/);
  assert.match(route, /\.eq\("firm_id", firm\.id\)/);
  assert.match(route, /available: false, statements: \[\]/);
  assert.match(route, /status: 403/);
});

test("O23: /dashboard/firm/fees mounts the firm-wide panel above the issuer's own page", () => {
  const page = repo("src/app/dashboard/firm/fees/page.tsx");
  assert.ok(page.indexOf("<FirmMemberStatements />") < page.indexOf("<LawyerFinancePage />"));
  const panel = repo("src/app/dashboard/firm/fees/_components/FirmMemberStatements.tsx");
  assert.match(panel, /\/api\/v1\/firm\/fee-statements/);
  assert.match(panel, /kind: "hidden"/);
  assert.doesNotMatch(panel, /reduce\(/, "no sum over a page");
});
