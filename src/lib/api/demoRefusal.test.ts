/**
 * demoRefusal.test.ts — S3 / R11 (20261125_50): the database's demo tokens map
 * to fixed Arabic sentences (403); nothing else does, and no error text leaks.
 * Run: node --test src/lib/api/demoRefusal.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  DEMO_FLAG_LOCKED_AR,
  DEMO_LIMIT_AR,
  DEMO_LIVE_PAYMENT_AR,
  DEMO_NO_PAYMENT_AR,
  DEMO_OPEN_REQUEST_AR,
  DEMO_READONLY_AR,
  DEMO_SANDBOX_AR,
  demoRefusal,
} from "./dbErrorCore.ts";

const pg = (message: string) => ({ code: "P0001", message, details: "community_posts", hint: null });

test("every token 20261125_50 raises maps to its sentence with a 403", () => {
  const cases: Array<[string, string]> = [
    ["demo_account", DEMO_NO_PAYMENT_AR],
    ["demo_account:no_payment", DEMO_NO_PAYMENT_AR],
    ["demo_account:readonly", DEMO_READONLY_AR],
    ["demo_account:live_payment", DEMO_LIVE_PAYMENT_AR],
    ["demo_account:open_request", DEMO_OPEN_REQUEST_AR],
    ["demo_account:sandbox", DEMO_SANDBOX_AR],
    ["demo_account:flag_locked", DEMO_FLAG_LOCKED_AR],
    ["demo_account:limit:cases", DEMO_LIMIT_AR.cases],
    ["demo_account:limit:consultations", DEMO_LIMIT_AR.consultations],
    ["demo_account:limit:clients", DEMO_LIMIT_AR.clients],
  ];
  for (const [token, text] of cases) {
    const r = demoRefusal(pg(token));
    assert.ok(r, token);
    assert.equal(r.status, 403, token);
    assert.equal(r.message, text, token);
    assert.ok(!r.message.includes("community_posts"), "no table name leaks");
  }
});

test("anything else is not a demo refusal", () => {
  for (const e of [
    null,
    undefined,
    "",
    pg("duplicate key value violates unique constraint"),
    pg("demo_account:limit:everything"),
    pg("demo_accountx"),
    pg("xdemo_account:readonly"),
    { code: "P0001" },
    new Error("boom"),
  ]) {
    assert.equal(demoRefusal(e), null, JSON.stringify(e));
  }
});

test("the SQL raises exactly the tokens the app maps (no drift)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, "../../../supabase/migrations/20261125_50_demo_accounts.sql"), "utf8");
  for (const token of [
    "demo_account:readonly",
    "demo_account:sandbox",
    "demo_account:no_payment",
    "demo_account:flag_locked",
    "demo_account:limit:%",
    "return 'demo_account'",
  ]) {
    assert.ok(sql.includes(token), token);
  }
  // the cap kinds the SQL raises are exactly the mapped ones
  for (const kind of ["'cases'", "'consultations'", "'clients'"]) assert.ok(sql.includes(kind), kind);
  assert.deepEqual(Object.keys(DEMO_LIMIT_AR).sort(), ["cases", "clients", "consultations"]);
});

test("dbErrorJson branches on demoRefusal before its generic answer", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "dbError.ts"), "utf8");
  const demoAt = src.indexOf("demoRefusal(err)");
  const genericAt = src.indexOf("opts.message ?? DB_ERROR_AR");
  assert.ok(demoAt > 0 && genericAt > demoAt);
});

test("20261127_80 raises exactly the two tokens it adds (no drift)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, "../../../supabase/migrations/20261127_80_test_account_mode.sql"), "utf8");
  for (const token of ["demo_account:live_payment", "demo_account:open_request", "demo_account:sandbox", "demo_account:limit:%"]) {
    assert.ok(sql.includes(token), token);
  }
  // the test-mode sentence never says a test account cannot pay at all
  assert.ok(DEMO_LIVE_PAYMENT_AR.includes("وضع الاختبار"));
});
