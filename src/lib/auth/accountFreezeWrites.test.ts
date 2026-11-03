/**
 * accountFreezeWrites.test.ts — D6 review finding 6: a frozen account (a
 * pending deletion) could still pay, post and write through every API route
 * that does its own `getUser()` instead of assertRole. Read as source (the
 * routes import next/server and "@/…", so `node --test` cannot load them —
 * the technique of accountFreezeGates.test.ts).
 *
 * The rule, walked over every src/app/api/**\/route.ts: each POST / PUT /
 * PATCH / DELETE handler is gated by one of
 *   * assertRole / assertCaseWorker / requireStaff / requireAdmin (they refuse
 *     a frozen account themselves, or are staff-only),
 *   * requireApiUser WITHOUT { allowFrozen: true } (refuses by default),
 *   * libraryAiAccess() (the library assistant's gate, which refuses),
 *   * or, when it calls `auth.getUser()` itself, `frozenAccountResponse(user)`
 *     after its 401 —
 * unless it is in ALLOWED below, each with its reason. A handler that never
 * reads a session (a public form, a webhook) is not a frozen account's write.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/accountFreezeWrites.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(import.meta.dirname, "..", "..");
const API = join(SRC, "app", "api");

/** Handlers a frozen account may still reach, or that are not his session's write. */
const ALLOWED: Record<string, string> = {
  "v1/me/account-deletion/route.ts": "its own deletion status and request (requireApiUser allowFrozen)",
  "v1/me/account-deletion/cancel/route.ts": "«استعادة الحساب» (requireApiUser allowFrozen)",
  "v1/ai-review-requests/route.ts": "an anonymous-capable request for a human review; writes no account data",
  "library/search/route.ts": "a search: POST for the body, reads only",
  "library/scoped-search/route.ts": "a search: POST for the body, reads only",
  "library/folders/titles/route.ts": "a catalogue title lookup: POST for the body (≤ 400 ids), reads only",
  "v1/leads/business-assessment/route.ts": "the public lead form; the session is read only to tag the lead",
};

function routes(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...routes(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

const EXPORT = /^export (?:async )?function (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Each exported handler's own source, comment lines dropped. */
function handlers(source: string): Array<{ method: string; body: string }> {
  const code = source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
  const hits = [...code.matchAll(EXPORT)];
  return hits.map((m, i) => ({
    method: m[1],
    body: code.slice(m.index, i + 1 < hits.length ? hits[i + 1].index : code.length),
  }));
}

const GATES = [/\bassertRole\(/, /\bassertCaseWorker\(/, /\brequireStaff\(/, /\brequireAdmin\(/, /\blibraryAiAccess\(/];

test("every API write a session makes refuses a frozen account", () => {
  const offenders: string[] = [];
  let checked = 0;
  for (const file of routes(API)) {
    const rel = relative(API, file).split(sep).join("/");
    if (rel in ALLOWED) continue;
    for (const h of handlers(readFileSync(file, "utf8"))) {
      if (!MUTATING.has(h.method)) continue;
      const readsSession = h.body.includes("auth.getUser(") || h.body.includes("requireApiUser(");
      const gated =
        GATES.some((g) => g.test(h.body)) ||
        (h.body.includes("requireApiUser(") && !h.body.includes("allowFrozen")) ||
        (h.body.includes("auth.getUser(") && h.body.includes("frozenAccountResponse(user)"));
      if (!readsSession && !GATES.some((g) => g.test(h.body))) continue; // no session: a public form / webhook / cron
      checked++;
      if (!gated) offenders.push(`${rel} ${h.method}`);
    }
  }
  assert.ok(checked > 60, `the walk reached the session writes (${checked})`);
  assert.deepEqual(offenders, [], "these handlers write for a session without refusing a frozen account");
});

test("no blind spot: no session read hides in a helper above the handlers, no session-client write goes ungated", () => {
  const hidden: string[] = [];
  const ungated: string[] = [];
  for (const file of routes(API)) {
    const rel = relative(API, file).split(sep).join("/");
    const src = readFileSync(file, "utf8");
    const code = src
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join("\n");
    const first = code.search(/^export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/m);
    // Only a file that exports a write can hide one there: a read-only route
    // (the ZIP's per-scope helpers above its GET) has no write to miss.
    const writes = /^export (?:async )?function (POST|PUT|PATCH|DELETE)\b/m.test(code);
    if (first > -1 && writes && /auth\.getUser\(/.test(code.slice(0, first))) hidden.push(rel);
    if (rel in ALLOWED) continue;
    for (const h of handlers(src)) {
      if (!MUTATING.has(h.method)) continue;
      const anyGate = GATES.some((g) => g.test(h.body)) || /requireApiUser\(|auth\.getUser\(|answerInvitation\(/.test(h.body);
      if (!anyGate && /\bcreateClient\(/.test(h.body)) ungated.push(`${rel} ${h.method}`);
    }
  }
  assert.deepEqual(hidden, [], "a getUser() above the first handler is invisible to the per-handler scan");
  assert.deepEqual(ungated, [], "a session-client write with no gate at all");
});

test("frozenAccountResponse comes after the 401, before the handler reads its body", () => {
  for (const rel of ["v1/payments/checkout/route.ts", "v1/service-requests/route.ts", "v1/community/posts/route.ts"]) {
    const post = handlers(readFileSync(join(API, ...rel.split("/")), "utf8")).find((h) => h.method === "POST");
    assert.ok(post, rel);
    const unauth = post.body.search(/status: 401|, 401\)/);
    const frozen = post.body.indexOf("frozenAccountResponse(user)");
    const json = post.body.indexOf("request.json()");
    assert.ok(unauth > -1 && frozen > unauth && frozen < json, `${rel}: 401 → frozen → body`);
  }
});

test("allowFrozen is used by the two self-service deletion routes only", () => {
  const users: string[] = [];
  for (const file of routes(API)) {
    if (readFileSync(file, "utf8").includes("allowFrozen")) users.push(relative(API, file).split(sep).join("/"));
  }
  assert.deepEqual(users.sort(), ["v1/me/account-deletion/cancel/route.ts", "v1/me/account-deletion/route.ts"]);
});

test("/checkout: a frozen account is sent to /account-frozen right after the sign-in redirect", () => {
  const page = readFileSync(join(SRC, "app", "checkout", "page.tsx"), "utf8");
  const signIn = page.indexOf("if (!user) redirect(");
  const frozen = page.indexOf("if (freezeStateFromUser(user).frozen) redirect(ACCOUNT_FROZEN_PATH);");
  const gateway = page.indexOf("let gatewayOn = false;");
  assert.ok(signIn > -1 && frozen > signIn && frozen < gateway);
});

test("the helper: only app_metadata decides, and anything but status 'frozen' passes", () => {
  const src = readFileSync(join(SRC, "lib", "auth", "apiAuth.ts"), "utf8");
  const body = src.slice(src.indexOf("export function frozenAccountResponse"));
  assert.ok(body.includes("if (!freezeStateFromUser(user).frozen) return null;"));
  assert.ok(body.includes("status: 403"));
  const req = src.slice(src.indexOf("export async function requireApiUser"), src.indexOf("export function frozenAccountResponse"));
  assert.ok(req.includes("if (!options.allowFrozen) {"), "requireApiUser refuses by default");
});
