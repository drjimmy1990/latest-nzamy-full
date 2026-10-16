/**
 * N15 (fix plan 2026-10-16): the permission table lived inside useUser.ts,
 * which `node --test` cannot load, so «admin gets full permissions on every
 * tier» (fix/a3) had no test. The table is now ./userPermissions.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getPermissions } from "./userPermissions.ts";
import { LAWYER_AI_TOOLS } from "../constants/lawyerAiCatalog.ts";
import type { UserTier, UserType } from "./useUser.ts";

const TIERS: UserTier[] = ["free", "shield", "ai", "pro", "max", "corp", "enterprise"];
const DASHBOARD = ["dashboard:team", "dashboard:finance", "dashboard:analytics", "dashboard:hrm", "cases:assign"];

test("an admin holds the same full set on every one of the seven tiers", () => {
  const free = getPermissions("admin", "free");
  assert.ok(free.length > 0);
  for (const tier of TIERS) assert.deepEqual(getPermissions("admin", tier), free, tier);
});

test("the admin set covers every lawyer AI tool, the dashboards and the corporate tools", () => {
  const admin = new Set<string>(getPermissions("admin", "shield"));
  for (const tool of LAWYER_AI_TOOLS) assert.ok(admin.has(tool.permission), tool.permission);
  for (const key of [...DASHBOARD, "ai:corp:clm", "ai:corp:compliance", "ai:corp:advisor", "ai:corp:hr", "ai:micro"]) {
    assert.ok(admin.has(key), key);
  }
});

test("a lawyer has the AI tools on every lawyer tier; finance and analytics from pro", () => {
  const tools = LAWYER_AI_TOOLS.map((t) => t.permission);
  for (const tier of ["free", "shield", "ai", "pro", "max"] as const) {
    const got = new Set<string>(getPermissions("lawyer", tier));
    for (const p of tools) assert.ok(got.has(p), `${tier}: ${p}`);
    assert.equal(got.has("dashboard:finance"), tier === "pro" || tier === "max", tier);
  }
});

test("no type, or one the table does not list, gets nothing", () => {
  assert.deepEqual(getPermissions("" as UserType, "max"), []);
  assert.deepEqual(getPermissions("nobody" as UserType, "max"), []);
});

test("useUser.ts re-exports the table's getPermissions instead of keeping its own", () => {
  const hook = readFileSync(new URL("./useUser.ts", import.meta.url), "utf8");
  assert.match(hook, /import \{ getPermissions \} from "@\/hooks\/userPermissions";/);
  assert.match(hook, /export \{ getPermissions \};/);
  assert.doesNotMatch(hook, /const PERMISSIONS\b|function getPermissions\(/);
});
