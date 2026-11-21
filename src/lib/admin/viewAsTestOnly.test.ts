/**
 * viewAsTestOnly.test.ts — owner ١٠٨ (batch l12): «عرض كمستخدم» for test
 * accounts only. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/admin/viewAsTestOnly.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isTestAccountForViewAs } from "./viewAsTestOnly.ts";

type Rpc = Parameters<typeof isTestAccountForViewAs>[0];
const stub = (answer: { data?: unknown; error?: unknown } | Error): Rpc & { calls: unknown[][] } => {
  const calls: unknown[][] = [];
  return {
    calls,
    rpc: (async (...args: unknown[]) => {
      calls.push(args);
      if (answer instanceof Error) throw answer;
      return { data: answer.data ?? null, error: answer.error ?? null };
    }) as unknown as Rpc["rpc"],
  } as Rpc & { calls: unknown[][] };
};

test("a test account (the database says true) may be viewed", async () => {
  const s = stub({ data: true });
  assert.equal(await isTestAccountForViewAs(s, "u1"), true);
  assert.deepEqual(s.calls[0], ["is_test_account", { p_user: "u1" }]);
});

test("a real account, an error, a throw, or a non-boolean answer is refused (fail closed)", async () => {
  assert.equal(await isTestAccountForViewAs(stub({ data: false }), "u"), false);
  assert.equal(await isTestAccountForViewAs(stub({ error: { code: "42883" } }), "u"), false);
  assert.equal(await isTestAccountForViewAs(stub(new Error("down")), "u"), false);
  assert.equal(await isTestAccountForViewAs(stub({ data: "true" }), "u"), false);
  assert.equal(await isTestAccountForViewAs(stub({ data: 1 }), "u"), false);
});

const src = (...p: string[]) => readFileSync(join(import.meta.dirname, "..", "..", ...p), "utf8");

test("wiring: the route refuses before any read or audit row; the page offers the button only when the server allows it", () => {
  const route = src("app", "api", "v1", "admin", "users", "[id]", "view-as", "route.ts");
  const check = route.indexOf("isTestAccountForViewAs(admin, targetId)");
  assert.ok(check > 0, "the route checks the target");
  assert.ok(check < route.indexOf("readViewAsTarget(admin, targetId)"), "before the header read");
  assert.ok(check < route.indexOf("logAdminActionsStrict(rows)"), "before the audit rows");
  assert.match(route, /VIEW_AS_TEST_ONLY_CODE \}, 403\)/);
  const user = src("app", "api", "v1", "admin", "users", "[id]", "route.ts");
  assert.match(user, /view_as_allowed: viewAsAllowed,/);
  const page = src("app", "dashboard", "admin", "users", "[id]", "page.tsx");
  assert.match(page, /\{U\.view_as_allowed === true && \(\s*<Link href=\{`\/dashboard\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/view-as`\}/);
});
