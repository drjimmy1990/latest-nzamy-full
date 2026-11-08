/**
 * dbError.test.ts — failed database calls answer with fixed text (SAST-06).
 * Run with:
 *   node --test src/lib/api/dbError.test.ts
 *
 * Two halves:
 *   1. the pure core (./dbErrorCore.ts): the body carries no code / hint /
 *      details and not the raw message, and the raw fields go to the log;
 *   2. a source guard over src/app/api: no route hands a Postgres error's
 *      `.message` / `.code` / `.hint` / `.details` to NextResponse.json.
 *      (dbError.ts itself imports next/server, which does not load here.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { DB_ERROR_AR, dbErrorBody, describeDbError, logDbError } from "./dbErrorCore.ts";

const PG_ERROR = {
  message: 'duplicate key value violates unique constraint "example_table_key"',
  code: "23505",
  details: "Key (owner_id, slug)=(abc, def) already exists.",
  hint: "Check the example_table table.",
};

test("the body is the fixed message only: no code, hint, details, or raw text", () => {
  const body = dbErrorBody();
  assert.deepEqual(Object.keys(body), ["error"]);
  assert.equal(body.error, DB_ERROR_AR);
  const text = JSON.stringify(body);
  assert.ok(!("code" in body) && !("hint" in body) && !("details" in body));
  assert.ok(!text.includes(PG_ERROR.message));
  assert.ok(!text.includes("example_table"));
});

test("a route's own message and extra fields are kept, the error still wins the `error` key", () => {
  const body = dbErrorBody("تعذّر حفظ الملاحظة.", { success: false, error: "should be overwritten" });
  assert.deepEqual(body, { success: false, error: "تعذّر حفظ الملاحظة." });
});

test("the raw fields go to the server log under the tag", () => {
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { calls.push(args); };
  try {
    logDbError("example POST", PG_ERROR);
  } finally {
    console.error = original;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "[example POST]");
  assert.deepEqual(calls[0][1], PG_ERROR);
});

test("describeDbError copes with Error instances, strings, and nothing", () => {
  assert.deepEqual(describeDbError(null), {});
  assert.deepEqual(describeDbError("boom"), { message: "boom" });
  assert.deepEqual(describeDbError(new Error("relation x does not exist")), { message: "relation x does not exist" });
  assert.deepEqual(describeDbError({ code: "42501", message: "" }), { code: "42501" });
});

// ── source guard ────────────────────────────────────────────────────────────
const API_ROOT = fileURLToPath(new URL("../../app/api", import.meta.url));

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...routeFiles(full));
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

// `error: someError.message` / `error: e?.message || "…"` inside a response
// body, and `hint:` / `details:` copied off an error. (`code:` alone is left
// out: routes send their own app codes such as "invalid_request".)
// Mappers that return their own fixed Arabic (`mapped.message`,
// `caps.message`, `gate.message`, …) are not DB text.
const LEAK = /\b(error|hint|details)\s*:\s*[A-Za-z_][\w]*\??\.(?:error\??\.)?(message|hint|details)\b/;
const SAFE_SOURCES = /^\s*(mapped|caps|gate|phoneDecision)\??\.message\b/;

// Deliberate exceptions, each with its reason.
const ALLOWED: { file: RegExp; text: string; why: string }[] = [
  {
    file: /admin[\\/]teams[\\/]route\.ts$/,
    text: "{ error: authError.message }",
    why: "staff-only invite form: the auth service's own validation text (bad email, weak password), not database text",
  },
  {
    file: /admin[\\/]founder[\\/]orders[\\/]\[id\][\\/]activate[\\/]route\.ts$/,
    text: "{ error: result.message",
    why: "activationAnswer / outcomeFromFulfil (src/lib/membership/founderAdmin.ts) return fixed Arabic plus an app reason token",
  },
];

test("no API route sends a database error's text or code to the client", () => {
  const offenders: string[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || /console\.(error|warn|log)/.test(line)) return;
      const m = LEAK.exec(line);
      if (!m) return;
      const rhs = line.slice(m.index).replace(/^[^:]*:/, "");
      if (SAFE_SOURCES.test(rhs)) return;
      if (ALLOWED.some((a) => a.file.test(file) && line.includes(a.text))) return;
      offenders.push(`${relative(API_ROOT, file)}:${i + 1}: ${trimmed}`);
    });
  }
  assert.deepEqual(offenders, []);
});
