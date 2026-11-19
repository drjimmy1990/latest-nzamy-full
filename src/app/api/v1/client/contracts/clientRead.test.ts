/**
 * clientRead.test.ts — owner file 15 #4 (batch l9-secleak): the lawyer's
 * internal notes and his draft contracts never reach the client.
 *
 * A source-contract test: the routes import next/server and the Supabase
 * clients, so they cannot run under node --test. The database half (no direct
 * read by the client, the three definer functions, the draft rule, the lawyer
 * and the firm colleague keep their read) is proven in Docker by
 * supabase/tests/rls/l9_secleak.test.sql (C1–C7).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

/** Source without comment lines, so prose cannot satisfy (or break) a rule about code. */
function codeOnly(source: string): string {
  return source
    .split("\n")
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    })
    .join("\n");
}

const clientRead = codeOnly(read("src/app/api/v1/client/contracts/_clientRead.ts"));
const ROUTES = [
  "src/app/api/v1/client/contracts/route.ts",
  "src/app/api/v1/client/contracts/[id]/route.ts",
  "src/app/api/v1/client/contracts/[id]/versions/[vid]/url/route.ts",
];

function constant(name: string): string {
  const m = clientRead.match(new RegExp(`export const ${name} =([^;]+);`));
  assert.ok(m, `${name} is gone`);
  return m[1];
}

test("the whitelists never name notes or metadata", () => {
  for (const name of ["CLIENT_CONTRACT_COLUMNS", "CLIENT_VERSION_COLUMNS", "CLIENT_OBLIGATION_COLUMNS", "CLIENT_PAYMENT_COLUMNS"]) {
    const cols = constant(name);
    assert.doesNotMatch(cols, /\bnotes\b|\bmetadata\b/, name);
  }
  assert.match(constant("CLIENT_VERSION_COLUMNS"), /folder_owner_id/, "the download route needs the folder owner");
});

test("NEGATIVE: the lawyer's select DOES carry notes + metadata — so the client must never use it", () => {
  const shared = read("src/app/api/v1/lawyer/contracts/_shared.ts");
  assert.match(shared, /current_version_id, notes, metadata, created_at/);
  assert.doesNotMatch(clientRead, /CONTRACT_SELECT|VERSION_SELECT|OBLIGATION_SELECT|PAYMENT_SELECT|toContractDto|toVersionDto|toObligationDto|toPaymentDto|loadContractDetail/);
  for (const f of ROUTES) {
    const src = codeOnly(read(f));
    assert.doesNotMatch(src, /CONTRACT_SELECT|loadContractDetail|toContractDto|\.from\("contracts"\)|\.from\("contract_/, f);
  }
});

test("the client DTO mappers build key by key and never read notes / metadata", () => {
  for (const fn of ["toClientContractDto", "toClientVersionDto", "toClientObligationDto", "toClientPaymentDto"]) {
    const at = clientRead.indexOf(`export function ${fn}(`);
    assert.ok(at > -1, `${fn} is gone`);
    const body = clientRead.slice(at, clientRead.indexOf("\n}\n", at));
    assert.doesNotMatch(body, /notes|metadata|readCounterparty|\.\.\.row/, fn);
  }
  const types = read("src/lib/services/contractsService.ts");
  assert.match(types, /export type ClientContract = Omit<Contract, "notes" \| "counterpartyPhone" \| "counterpartyIdNo">;/);
  assert.match(types, /export type ClientContractVersion = Omit<ContractVersion, "notes">;/);
  assert.match(types, /export async function getClientContract\(id: string\): Promise<ClientContractDetail>/);
});

test("drafts: the definer functions first, the same draft filter in every fallback", () => {
  assert.match(clientRead, /export const CLIENT_HIDDEN_STATUS = "draft";/);
  for (const rpc of ['supabase.rpc("client_contracts_list")', 'supabase.rpc("client_contract_versions", { p_contract: contractId })',
                     'supabase.rpc("client_contract_detail", { p_contract: id })']) {
    assert.ok(clientRead.includes(rpc), rpc);
  }
  // every fallback read of public.contracts filters the client and the draft
  const contractReads = clientRead.split('.from("contracts")').slice(1);
  assert.equal(contractReads.length, 3, "three fallback contract reads");
  for (const r of contractReads) {
    const head = r.slice(0, r.indexOf(";"));
    assert.match(head, /\.eq\("client_user_id", userId\)/);
    assert.match(head, /\.neq\("status", CLIENT_HIDDEN_STATUS\)/);
  }
  // only a MISSING function falls back; any other error fails closed
  assert.match(clientRead, /return error\?\.code === "PGRST202" \|\| error\?\.code === "42883";/);
  assert.match(clientRead, /rows\.contract\.status === CLIENT_HIDDEN_STATUS\) return null;/);
});

test("the routes read through _clientRead.ts", () => {
  assert.match(read(ROUTES[0]), /listClientContracts\(supabase, user\.id\)/);
  assert.match(read(ROUTES[1]), /loadClientContractDetail\(supabase, user\.id, id\)/);
  assert.match(read(ROUTES[2]), /clientContractVersions\(supabase, user\.id, id\)/);
});

test("the SQL functions return the same whitelist (no notes, no metadata) and hide drafts", () => {
  const sql = read("supabase/migrations/20261129_20_secleak_contracts_shares_licences.sql");
  for (const fn of ["client_contracts_list()", "client_contract_versions(p_contract text)", "client_contract_detail(p_contract text)"]) {
    const at = sql.indexOf(`create or replace function public.${fn}`);
    assert.ok(at > -1, fn);
    const body = sql.slice(at, sql.indexOf("\n$$;", at));
    assert.doesNotMatch(body, /\bnotes\b|\bmetadata\b/, fn);
    assert.match(body, /c\.client_user_id = auth\.uid\(\)/, fn);
    assert.match(body, /c\.status <> 'draft'/, fn);
  }
});

test("the client screens show no note and no «مسودة» tab", () => {
  for (const f of ["src/app/dashboard/client/contracts/page.tsx", "src/app/dashboard/micro/contracts/page.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /detail\.notes|\.notes\b/, f);
    assert.match(src, /CONTRACT_STATUSES\.filter\(\(s\) => s !== ["']draft["']\)/, f);
  }
});
