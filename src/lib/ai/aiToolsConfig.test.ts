/**
 * aiToolsConfig.test.ts — may this caller run this tool now? The screen asks
 * GET /api/v1/ai/tool-status and the server answers with startRunWith's refusal.
 * Both use the same two helpers (R5), and these tests drive the real run path, so
 * the two cannot drift, and a refusal never reaches the charge.
 *
 * Parity goes through effectiveToolMode, never a literal "review is refused": if
 * "review" ever comes back as a real mode, this must still hold.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/aiToolsConfig.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { effectiveToolMode, resolveToolRuntime, toolAccessFor, toolAvailability, toolRoleRefusal } from "./aiToolsConfig.ts";
import { startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import { AI_TOOLS, type AiToolMode, type AiToolSpec } from "./tools.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const MODES: readonly AiToolMode[] = ["off", "staff", "review", "live"];
const live = { mode: "live", dailyLimit: 5 } as const;
const staff = { mode: "staff", dailyLimit: 5 } as const;
const off = { mode: "off", dailyLimit: 5 } as const;
const spec = (over: Partial<AiToolSpec> = {}) => ({ roles: ["lawyer"], consultantBlocked: false, ...over }) as Pick<AiToolSpec, "roles" | "consultantBlocked">;

const actor = (userType: string, practiceKind: RunActor["practiceKind"] = "advocate"): RunActor => ({
  userId: "u-1",
  userType,
  practiceKind,
  displayName: null,
});

function db(tool: string, mode: AiToolMode) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: { [tool]: { mode } } } };
    if (q.op === "rpc" && q.table === "ai_start_run") {
      return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: 1 }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    if (q.table === "ai_runs" && q.op === "update") return { data: [{ id: RUN }] };
    return {};
  });
}

const deps: StartRunDeps = {
  callbackUrl: "https://app.test/api/v1/ai/callback",
  n8n: async () => ({
    kind: "result",
    result: { run_id: RUN, status: "succeeded", output: { echo: "مرحبا" }, citations: [], usage: { model: "m", input_tokens: 1, output_tokens: 1 } },
  }),
};

// ── toolAccessFor: the section's whole answer ───────────────────────────────

test("toolAccessFor: the same order and rules as the run path", () => {
  assert.equal(toolAccessFor(spec(), { userType: "individual", practiceKind: null }, live), "role");
  assert.equal(toolAccessFor(spec(), { userType: "admin", practiceKind: null }, staff), "ok");
  assert.equal(toolAccessFor(spec(), { userType: "lawyer", practiceKind: "advocate" }, staff), "tool_off");
  assert.equal(toolAccessFor(spec({ consultantBlocked: true }), { userType: "lawyer", practiceKind: "consultant" }, live), "consultant_blocked");
  assert.equal(toolAccessFor(spec(), { userType: "lawyer", practiceKind: "advocate" }, live), "ok");
});

test("toolAccessFor: a role that cannot use the tool hears «role» whatever the mode, so its answer shows no tool state", () => {
  for (const runtime of [off, staff, live]) {
    assert.equal(toolAccessFor(spec(), { userType: "individual", practiceKind: null }, runtime), "role");
  }
  for (const runtime of [off, staff, live]) {
    assert.equal(toolRoleRefusal(spec({ consultantBlocked: true }), { userType: "lawyer", practiceKind: "consultant" }), "consultant_blocked", runtime.mode);
  }
});

test("toolAccessFor: admin passes role and consultant, but off stops an admin too", () => {
  const blocked = spec({ consultantBlocked: true });
  assert.equal(toolAccessFor(blocked, { userType: "admin", practiceKind: "consultant" }, live), "ok");
  assert.equal(toolAccessFor(spec(), { userType: "admin", practiceKind: null }, off), "tool_off");
});

// ── R5: toolAvailability(mode, isAdmin) is the one rule ─────────────────────

test("toolAvailability: every mode × admin pair, read through effectiveToolMode", () => {
  const expected = (mode: AiToolMode, isAdmin: boolean) => {
    const m = effectiveToolMode(mode);
    return m === "live" || (m === "staff" && isAdmin) ? "ok" : "tool_off";
  };
  for (const mode of MODES) {
    for (const isAdmin of [true, false]) {
      assert.equal(toolAvailability(mode, isAdmin), expected(mode, isAdmin), `${mode} admin=${isAdmin}`);
    }
  }
  assert.equal(toolAvailability("off", true), "tool_off");
  assert.equal(toolAvailability("staff", true), "ok");
  assert.equal(toolAvailability("staff", false), "tool_off");
  assert.equal(toolAvailability("live", false), "ok");
});

test("R5 parity: for every stored mode × admin pair the screen's answer is the server's, and a refusal charges nothing", async () => {
  for (const stored of MODES) {
    for (const isAdmin of [true, false]) {
      const who = actor(isAdmin ? "admin" : "lawyer");
      const toolSpec = AI_TOOLS["echo-fast"];
      const { client, log } = db("echo-fast", stored);
      const seen: string[] = [];
      const r = await startRunWith(
        client as never,
        { ...deps, n8n: async (c) => { seen.push(String((c as { path?: unknown }).path)); return deps.n8n(c); } },
        who,
        { tool: "echo-fast", input: { text: "مرحبا" }, idempotencyKey: "key-abcdef01" },
      );
      const runtime = resolveToolRuntime(toolSpec, { "echo-fast": { mode: stored } });
      assert.equal(runtime.mode, effectiveToolMode(stored));
      const screen = toolAvailability(runtime.mode, isAdmin);
      assert.equal(screen, toolAvailability(stored, isAdmin), "the stored mode and the resolved mode agree");
      const charges = log.filter((q) => q.op === "rpc" && q.table === "ai_start_run").length;
      if (screen === "ok") {
        assert.notEqual(r.status, 423, `${stored} admin=${isAdmin}: the screen offers a run the server refuses`);
        assert.equal(charges, 1, `${stored} admin=${isAdmin}: a usable run is charged once`);
      } else {
        assert.equal(r.status, 423, `${stored} admin=${isAdmin}: the screen hides a tool the server would run`);
        assert.equal((r.body as { code?: string }).code, "tool_off");
        assert.equal(charges, 0, `${stored} admin=${isAdmin}: charged for a refused tool`);
        assert.equal(seen.length, 0, "n8n is not called");
      }
    }
  }
});

test("parity across every registry tool, mode and kind of caller: same answer, and no refused caller is charged", async () => {
  const callers = [actor("admin"), actor("lawyer"), actor("lawyer", "consultant"), actor("firm"), actor("individual"), actor("corporate"), actor("ngo"), actor("")];
  const refusals: Record<string, [number, string]> = { role: [403, "role"], consultant_blocked: [403, "consultant_blocked"], tool_off: [423, "tool_off"] };
  let compared = 0;
  for (const toolSpec of Object.values(AI_TOOLS)) {
    for (const stored of MODES) {
      const runtime = resolveToolRuntime(toolSpec, { [toolSpec.id]: { mode: stored } });
      for (const who of callers) {
        const { client, log } = db(toolSpec.id, stored);
        const r = await startRunWith(client as never, deps, who, { tool: toolSpec.id, input: null, idempotencyKey: "key-abcdef01" });
        const screen = toolAccessFor(toolSpec, who, runtime);
        const label = `${toolSpec.id} ${stored} ${who.userType}/${who.practiceKind}`;
        const code = (r.body as { code?: string }).code ?? "";
        if (screen === "ok") {
          assert.ok(!["role", "consultant_blocked", "tool_off"].includes(code), `${label}: the screen says usable, the server says ${code}`);
        } else {
          assert.deepEqual([r.status, code], refusals[screen], label);
          assert.equal(log.filter((q) => q.op === "rpc" && q.table === "ai_start_run").length, 0, `${label}: charged`);
        }
        compared++;
      }
    }
  }
  assert.ok(compared > 300, `only ${compared} cases — the grid broke`);
});

test("runCore has no refusal rule of its own, and exports the setting read", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/ai/runCore.ts"), "utf8");
  assert.ok(src.includes("export async function readAiToolsSetting"));
  assert.ok(src.includes("toolRoleRefusal(spec, actor)"));
  assert.ok(src.includes("toolAvailability(runtime.mode, isAdmin)"));
  assert.ok(!src.includes('runtime.mode === "off"'), "a second copy of the mode rule");
  assert.ok(!src.includes("spec.roles.includes"), "a second copy of the role rule");
});
