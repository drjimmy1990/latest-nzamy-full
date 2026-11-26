/**
 * Owner answer ٢٢٩ (27 Nov 2026, batch l18-answers): a firm contract's fee
 * schedule is seen and edited only by the firm owner, the managing partner and
 * the finance manager; a solo lawyer keeps his own.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/contracts/contractFeeAccess.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTRACT_FEES_FIRM_ONLY_AR, CONTRACT_FEES_FIRM_ROLES, contractFeesAllowed } from "./contractFeeAccess.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

function db(owned: unknown[] | Error, member: unknown[] | Error) {
  const calls: Array<{ table: string; ops: Array<[string, unknown[]]> }> = [];
  return {
    calls,
    client: {
      from(table: string) {
        const entry = { table, ops: [] as Array<[string, unknown[]]> };
        calls.push(entry);
        const res = table === "firm_profiles" ? owned : member;
        const chain: Record<string, unknown> = {};
        for (const op of ["select", "eq", "in"]) chain[op] = (...a: unknown[]) => { entry.ops.push([op, a]); return chain; };
        chain.limit = () => (res instanceof Error ? Promise.resolve({ data: null, error: { code: "XX" } }) : Promise.resolve({ data: res, error: null }));
        return chain;
      },
    },
  };
}

test("the same three as the firm fee statements: owner + managing partner + finance manager", () => {
  assert.deepEqual([...CONTRACT_FEES_FIRM_ROLES].sort(), ["finance_manager", "managing_partner"]);
  assert.match(CONTRACT_FEES_FIRM_ONLY_AR, /صاحب المكتب والشريك المدير والمدير المالي/);
});

test("a contract with no firm: his own (no read at all)", async () => {
  const d = db([], []);
  assert.equal(await contractFeesAllowed(d.client as never, "u", null), true);
  assert.equal(d.calls.length, 0);
});

test("a firm contract: the owner or an ACTIVE managing partner / finance manager of THAT firm; anything else, or an error, no", async () => {
  assert.equal(await contractFeesAllowed(db([{ id: "f" }], []).client as never, "u", "f"), true);
  assert.equal(await contractFeesAllowed(db([], [{ role: "finance_manager" }]).client as never, "u", "f"), true);
  assert.equal(await contractFeesAllowed(db([], []).client as never, "u", "f"), false);
  assert.equal(await contractFeesAllowed(db(new Error("x"), [{ role: "managing_partner" }]).client as never, "u", "f"), false);
  const d = db([], []);
  await contractFeesAllowed(d.client as never, "u", "f");
  const m = d.calls.find((c) => c.table === "firm_members")!;
  assert.deepEqual(m.ops.filter(([op]) => op !== "select"), [
    ["eq", ["firm_id", "f"]], ["eq", ["user_id", "u"]], ["eq", ["status", "active"]], ["in", ["role", ["managing_partner", "finance_manager"]]],
  ]);
  const o = d.calls.find((c) => c.table === "firm_profiles")!;
  assert.deepEqual(o.ops.filter(([op]) => op === "eq"), [["eq", ["id", "f"]], ["eq", ["owner_user_id", "u"]]]);
});

test("the routes refuse (403) before any payment read or write; the detail hides the schedule", () => {
  const post = read("src/app/api/v1/lawyer/contracts/[id]/payments/route.ts");
  assert.ok(post.indexOf("contractFeesAllowed(supabase, user.id, contract.firm_id") < post.indexOf('.from("contract_payments")'));
  const pid = read("src/app/api/v1/lawyer/contracts/[id]/payments/[pid]/route.ts");
  for (const verb of ["export async function PATCH", "export async function DELETE"]) {
    const body = pid.slice(pid.indexOf(verb));
    assert.ok(body.indexOf("contractFeesAllowed(supabase, user.id, contract.firm_id") < body.indexOf('.from("contract_payments")'), verb);
    assert.match(body, /\{ error: CONTRACT_FEES_FIRM_ONLY_AR \}, \{ status: 403 \}/);
  }
  const shared = read("src/app/api/v1/lawyer/contracts/_shared.ts");
  assert.match(shared, /const feesVisible = await contractFeesAllowed\(supabase, viewerId, contract\.firm_id\);/);
  assert.match(shared, /\.\.\.\(feesVisible \? \{\} : \{ paymentsHidden: true \}\),/);
  const detailRoute = read("src/app/api/v1/lawyer/contracts/[id]/route.ts");
  assert.match(detailRoute, /loadContractDetail\(supabase, id, user\.id\)/);
  const page = read("src/app/dashboard/lawyer/_components/contracts/ContractDetail.tsx");
  assert.match(page, /TABS\.filter\(\(t\) => !\(t\.key === "payments" && detail\.paymentsHidden\)\)/);
  assert.match(page, /\{tab === "payments" && !detail\.paymentsHidden && \(/);
});

test("20261208_53: a restrictive FOR ALL policy, the same two roles, nothing changed", () => {
  const sql = read("supabase/migrations/20261208_53_l18_contract_fees_firm_roles.sql");
  assert.match(sql, /as restrictive\n\s+for all\n\s+to authenticated\n\s+using \(public\.contract_fees_visible\(contract_id\)\)\n\s+with check \(public\.contract_fees_visible\(contract_id\)\);/);
  assert.match(sql, /m\.role in \('managing_partner', 'finance_manager'\)/);
  assert.match(sql, /m\.status = 'active'/);
  assert.doesNotMatch(sql.toLowerCase(), /\b(delete from|update public\.|insert into public\.)/);
});
