/**
 * O1 / N01-20 / S1 (batch l11-sec, 20261201_10): the client-card fee columns
 * are closed to the session; the fees come through lawyer_client_fees.
 *   - the pure helpers (parse, merge);
 *   - source contracts: no session read in src names the two fee columns
 *     except the pre-migration fallback in _feeVisibility.ts, and the SQL role
 *     list equals FEE_VISIBLE_FIRM_ROLES.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  CARD_FEES_CHUNK,
  FEE_VISIBLE_FIRM_ROLES,
  isMissingFeeFunction,
  parseCardFeeRows,
  withCardFees,
} from "./clientFeeVisibility.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const MIGRATION = "supabase/migrations/20261201_10_l11_sec_fees_scope_device_phone.sql";

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...filesUnder(p));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

test("O1: parseCardFeeRows reads numbers and numeric strings, drops rows without an id", () => {
  const map = parseCardFeeRows([
    { id: "a", fee_total_sar: 1000, fee_paid_sar: "200.50" },
    { id: "b", fee_total_sar: null, fee_paid_sar: null },
    { fee_total_sar: 5 },
    null,
    "x",
  ]);
  assert.deepEqual([...map.keys()], ["a", "b"]);
  assert.deepEqual(map.get("a"), { fee_total_sar: 1000, fee_paid_sar: 200.5 });
  assert.deepEqual(map.get("b"), { fee_total_sar: null, fee_paid_sar: null });
  assert.equal(parseCardFeeRows(null).size, 0);
});

test("O1: withCardFees sets the fees from the map, null for an absent card or a failed read", () => {
  const rows = [{ id: "a", name: "x" }, { id: "b", name: "y" }];
  const fees = new Map([["a", { fee_total_sar: 10, fee_paid_sar: 2 }]]);
  assert.deepEqual(withCardFees(rows, fees), [
    { id: "a", name: "x", fee_total_sar: 10, fee_paid_sar: 2 },
    { id: "b", name: "y", fee_total_sar: null, fee_paid_sar: null },
  ]);
  assert.deepEqual(withCardFees(rows, null).map((r) => r.fee_total_sar), [null, null]);
});

test("O1: the missing-function codes, and the chunk stays under the SQL cap of 1000", () => {
  assert.equal(isMissingFeeFunction("PGRST202"), true);
  assert.equal(isMissingFeeFunction("42883"), true);
  assert.equal(isMissingFeeFunction("42501"), false);
  assert.ok(CARD_FEES_CHUNK > 0 && CARD_FEES_CHUNK <= 1000);
  assert.match(read(MIGRATION), /cardinality\(p_ids\) <= 1000/);
});

test("O1: the SQL fee rule names exactly FEE_VISIBLE_FIRM_ROLES", () => {
  const sql = read(MIGRATION);
  const m = sql.match(/m\.role in \(([^)]*)\)/);
  assert.ok(m, "lawyer_client_fee_visible role list not found");
  const roles = m[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
  assert.deepEqual([...roles].sort(), [...FEE_VISIBLE_FIRM_ROLES].sort());
});

test("O1: no session read in src names a lawyer_clients fee column outside the pre-migration fallback", () => {
  const allowed = new Set(["src/app/api/v1/lawyer/clients/_feeVisibility.ts"]);
  const offenders: string[] = [];
  for (const file of filesUnder(join(ROOT, "src"))) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (allowed.has(rel)) continue;
    const text = readFileSync(file, "utf8");
    // A select string that names a fee column.
    for (const m of text.matchAll(/select\(\s*["'`]([^"'`]*)["'`]/g)) {
      if (/\bfee_(total|paid)_sar\b/.test(m[1])) offenders.push(rel);
    }
    // A string constant that is a lawyer_clients column list (CARD_SELECT and the like).
    for (const m of text.matchAll(/=\s*\n?\s*"([^"]*owner_user_id[^"]*)"/g)) {
      if (/\bfee_(total|paid)_sar\b/.test(m[1])) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});

test("O1: the clients routes and the office graph read the fees through readCardFees", () => {
  for (const rel of [
    "src/app/api/v1/lawyer/clients/route.ts",
    "src/app/api/v1/lawyer/clients/[id]/route.ts",
    "src/app/api/v1/lawyer/office-graph/route.ts",
  ]) {
    assert.match(read(rel), /readCardFees\(/, rel);
  }
  assert.match(read("src/app/api/v1/lawyer/clients/_feeVisibility.ts"), /rpc\("lawyer_client_fees"/);
});
