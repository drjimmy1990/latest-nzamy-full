/**
 * route.test.ts — POST /api/v1/share/[token]/verify, the passcode lockout
 * (security review 2026-11-08, SAST-04 — 20261109_11). A source-contract test:
 * the route imports next/server and the Supabase service client, so it cannot
 * be executed under node --test. The database half is proven in Docker by
 * supabase/tests/rls/share_passcode_lockout.test.sql.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routeSource = readFileSync(join(import.meta.dirname, "route.ts"), "utf8");

/** The route without comment lines, so prose cannot satisfy a rule about code. */
function codeOnly(source: string): string {
  return source
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trimStart();
      return !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    })
    .join("\n");
}

const code = codeOnly(routeSource);

function fnBody(name: string): string {
  const at = code.indexOf(`function ${name}(`);
  assert.ok(at > -1, `${name} is gone`);
  const end = code.indexOf("\n}\n", at);
  return code.slice(at, end > at ? end : undefined);
}

test("the passcode is checked by the database function, with both sides hashed", () => {
  const helper = fnBody("checkPasscodeInDb");
  assert.ok(helper.includes('supabase.rpc("share_passcode_check", {'), "the route calls share_passcode_check");
  assert.ok(helper.includes("p_token_hash: tokenHash") && helper.includes("p_passcode_hash: passcodeHash"));
  assert.ok(
    code.includes("await checkPasscodeInDb(supabase, sha256Hex(token), sha256Hex(passcode))"),
    "the plaintext token and passcode never reach the database, only their sha256",
  );
});

test("a locked share answers one 429 message, whatever passcode was sent", () => {
  assert.ok(/const LOCKED_MESSAGE =\s*"[^"]*١٥ دقيقة/.test(code), "the locked message is Arabic and says when to retry");
  assert.ok(
    /if \(verdict === "locked"\) \{\s*return NextResponse\.json\(\{ error: LOCKED_MESSAGE \}, \{ status: 429 \}\);/.test(code),
    "locked → 429 with the fixed message",
  );
  const lockedAt = code.indexOf('if (verdict === "locked")');
  const compareAt = code.indexOf("passcodeMatchesInApp(passcode, storedHash)");
  assert.ok(lockedAt > -1 && lockedAt < compareAt, "the lock is answered before any comparison result is used");
  assert.equal(code.split("LOCKED_MESSAGE").length - 1, 2, "one definition, one use: no second, revealing locked answer");
});

test("the in-app compare runs ONLY while the function is missing; other errors fail closed", () => {
  const helper = fnBody("checkPasscodeInDb");
  assert.ok(
    /error\.code === "PGRST202" \|\| error\.code === "42883" \|\| error\.code === "42703"\)[\s\S]*?return "missing";/.test(helper),
    "missing function / column → the old compare",
  );
  assert.equal(helper.split('return "missing";').length - 1, 1, "only one arm hands over to the in-app compare");
  assert.ok(
    code.includes('const matches = verdict === "ok" || (verdict === "missing" && passcodeMatchesInApp(passcode, storedHash));'),
    "the in-app compare is reached only on 'missing'",
  );
  assert.ok(
    /if \(verdict === "error"\) \{\s*return NextResponse\.json\(\{ error: "تعذر التحقق من الرابط" \}, \{ status: 500 \}\);/.test(code),
    "a database error fails closed",
  );
});

test("the fallback keeps the constant-time compare", () => {
  const helper = fnBody("passcodeMatchesInApp");
  assert.ok(/submittedHash\.length === stored\.length && timingSafeEqual\(submittedHash, stored\)/.test(helper));
});

test("a wrong passcode is still a 401 with the old Arabic message", () => {
  assert.ok(code.includes('const WRONG_PASSCODE_MESSAGE = "الرجاء إدخال باسكود صحيح مكون من 6 أرقام";'));
  assert.ok(/if \(!matches\) \{\s*return NextResponse\.json\(\{ error: WRONG_PASSCODE_MESSAGE \}, \{ status: 401 \}\);/.test(code));
});
