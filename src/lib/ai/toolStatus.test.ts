/**
 * toolStatus.test.ts — the answer behind GET /api/v1/ai/tool-status: one boolean,
 * read the way POST /api/v1/ai/runs reads the same caller, and closed on any doubt.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/toolStatus.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { toolStatusWith } from "./toolStatus.ts";
import { AI_TOOLS, type AiToolMode } from "./tools.ts";

const BLOCKED = AI_TOOLS["brief-check"]; // lawyer, firm; consultantBlocked
const OPEN = AI_TOOLS["case-brief"]; // lawyer, firm

function clients(opts: {
  userType?: unknown;
  practiceKind?: unknown;
  mode?: AiToolMode;
  profileError?: boolean;
  settingError?: boolean;
  throws?: boolean;
  tool?: string;
}) {
  const rls = fakeDb((q: FakeQuery) => {
    if (opts.throws) throw new Error("down");
    if (q.table === "profiles") return opts.profileError ? { error: { code: "XX", message: "no" } } : { data: { user_type: opts.userType } };
    if (q.table === "lawyer_profiles") return { data: { practice_kind: opts.practiceKind ?? "advocate" } };
    return {};
  });
  const admin = fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") {
      return opts.settingError ? { error: { code: "XX", message: "no" } } : { data: { value: { [opts.tool ?? OPEN.id]: { mode: opts.mode ?? "live" } } } };
    }
    return {};
  });
  return { rls, admin };
}

async function ask(spec: typeof OPEN, opts: Parameters<typeof clients>[0]) {
  const { rls, admin } = clients({ ...opts, tool: spec.id });
  const answer = await toolStatusWith(rls.client as never, admin.client as never, "u-1", spec);
  return { answer, settingReads: admin.log.filter((q) => q.table === "platform_settings").length };
}

test("usable or not, for each kind of caller", async () => {
  assert.deepEqual((await ask(OPEN, { userType: "lawyer", mode: "live" })).answer, { usable: true });
  assert.deepEqual((await ask(OPEN, { userType: "firm", mode: "live" })).answer, { usable: true });
  assert.deepEqual((await ask(OPEN, { userType: "lawyer", mode: "staff" })).answer, { usable: false });
  assert.deepEqual((await ask(OPEN, { userType: "lawyer", mode: "off" })).answer, { usable: false });
  assert.deepEqual((await ask(OPEN, { userType: "admin", mode: "staff" })).answer, { usable: true });
  assert.deepEqual((await ask(OPEN, { userType: "admin", mode: "off" })).answer, { usable: false });
  assert.deepEqual((await ask(BLOCKED, { userType: "lawyer", practiceKind: "consultant", mode: "live" })).answer, { usable: false });
  assert.deepEqual((await ask(BLOCKED, { userType: "lawyer", practiceKind: "advocate", mode: "live" })).answer, { usable: true });
});

test("a legacy stored review answers as the run path treats it: staff", async () => {
  assert.deepEqual((await ask(OPEN, { userType: "lawyer", mode: "review" })).answer, { usable: false });
  assert.deepEqual((await ask(OPEN, { userType: "admin", mode: "review" })).answer, { usable: true });
});

test("a role that cannot use the tool learns nothing: the same answer in every mode, and the setting is never read", async () => {
  for (const mode of ["off", "staff", "live"] as const) {
    const { answer, settingReads } = await ask(OPEN, { userType: "individual", mode });
    assert.deepEqual(answer, { usable: false }, mode);
    assert.equal(settingReads, 0, mode);
  }
  const blocked = await ask(BLOCKED, { userType: "lawyer", practiceKind: "consultant", mode: "live" });
  assert.equal(blocked.settingReads, 0);
});

test("the answer is one boolean: no mode, no limit, no price", async () => {
  for (const opts of [{ userType: "lawyer", mode: "live" }, { userType: "individual", mode: "live" }, { userType: "admin", mode: "staff" }] as const) {
    assert.deepEqual(Object.keys((await ask(OPEN, opts)).answer), ["usable"]);
  }
});

test("closed on any doubt: no profile, a failed read, a throw", async () => {
  assert.deepEqual((await ask(OPEN, { userType: undefined })).answer, { usable: false });
  assert.deepEqual((await ask(OPEN, { userType: "lawyer", profileError: true })).answer, { usable: false });
  // A failed settings read leaves the registry default, "off" for this tool.
  assert.equal(OPEN.defaultMode, "off");
  assert.deepEqual((await ask(OPEN, { userType: "lawyer", settingError: true })).answer, { usable: false });
  assert.deepEqual((await ask(OPEN, { userType: "lawyer", throws: true })).answer, { usable: false });
});

test("the route: signed in, per caller, no-store, and it answers nothing but the helper's boolean", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/v1/ai/tool-status/route.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(route, /requireApiUser\(supabase,/);
  assert.ok(route.indexOf("requireApiUser(") < route.indexOf("getAiTool("), "the sign-in check comes first, so a guest cannot probe tool ids");
  assert.match(route, /if \(auth instanceof NextResponse\) return auth;/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /status: 400/);
  assert.match(route, /toolStatusWith\(supabase, admin, auth\.user\.id, spec\)/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
  assert.doesNotMatch(route, /\b(price|dailyLimit|daily_limit|defaultMode|\.mode)\b/);
});
