/**
 * runCore.test.ts — the AI run pipeline against a recording fake of the
 * service client (plan §1, §1.2, §2): every check before the charge, the
 * charge before the webhook, and the money settled only on n8n's answer.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/runCore.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { AI_COPY, callbackWith, mapCitations, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { N8nOutcome } from "./n8nClient.ts";
import { resolveToolRuntime, aiToolsSettingIssue } from "./aiToolsConfig.ts";
import { AI_TOOLS } from "./tools.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const LAWYER: RunActor = { userId: "u-1", userType: "lawyer", practiceKind: "advocate", displayName: null };
const ON = { "echo-fast": { mode: "live" }, "echo-job": { mode: "live" } };

function db(opts: { setting?: unknown; start?: { data?: unknown; error?: { code?: string; message?: string } }; updated?: boolean; run?: unknown } = {}) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: opts.setting === undefined ? ON : opts.setting } };
    if (q.op === "rpc" && q.table === "ai_start_run") {
      return opts.start ?? { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: 1 }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    if (q.table === "ai_runs" && q.op === "update") return { data: opts.updated === false ? [] : [{ id: RUN }] };
    if (q.table === "ai_runs" && q.op === "select") return { data: opts.run ?? null };
    return {};
  });
}

function deps(outcome: N8nOutcome, seen: unknown[] = []): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      seen.push(call);
      return outcome;
    },
  };
}

const okReply = (output: unknown = { echo: "مرحبا" }) => ({
  kind: "result" as const,
  result: { run_id: RUN, status: "succeeded", output, citations: [], usage: { model: "claude-haiku-5-5", input_tokens: 10, output_tokens: 5 } },
});
const body = (over: Record<string, unknown> = {}) => ({ tool: "echo-fast", input: { text: "مرحبا" }, idempotencyKey: "key-abcdef01", ...over });
const rpcs = (log: FakeQuery[]) => log.filter((q) => q.op === "rpc").map((q) => q.table);

test("the checks before the charge refuse without starting a run", async () => {
  const cases: Array<[string, RunActor, Record<string, unknown>, unknown, number, string]> = [
    ["unknown tool", LAWYER, body({ tool: "nope" }), ON, 404, "unknown_tool"],
    ["wrong role", { ...LAWYER, userType: "individual" }, body(), ON, 403, "role"],
    ["tool off by default", LAWYER, body(), {}, 423, "tool_off"],
    ["bad input", LAWYER, body({ input: { text: "" } }), ON, 422, "invalid_input"],
    ["bad key", LAWYER, body({ idempotencyKey: "x" }), ON, 422, "invalid_key"],
    ["files on a tool without files", LAWYER, body({ fileIds: ["a"] }), ON, 422, "files_not_accepted"],
  ];
  for (const [name, actor, b, setting, status, code] of cases) {
    const { client, log } = db({ setting });
    const seen: unknown[] = [];
    const r = await startRunWith(client as never, deps(okReply(), seen), actor, b);
    assert.equal(r.status, status, name);
    assert.equal(r.body.code, code, name);
    assert.deepEqual(rpcs(log), [], `${name}: no money function ran`);
    assert.equal(seen.length, 0, `${name}: n8n was not called`);
  }
});

test("a setting that cannot be read leaves the tool off", async () => {
  const { client } = fakeDb((q) => (q.table === "platform_settings" ? { error: { code: "XX000", message: "down" } } : {}));
  const r = await startRunWith(client as never, deps(okReply()), LAWYER, body());
  assert.equal(r.status, 423);
});

test("an admin passes the role check and is exempt from the charge", async () => {
  const { client, log } = db();
  const r = await startRunWith(client as never, deps(okReply()), { ...LAWYER, userType: "admin" }, body());
  assert.equal(r.status, 200);
  const start = log.find((q) => q.table === "ai_start_run")!;
  assert.equal((start.payload as Record<string, unknown>).p_exempt, true);
});

test("the start call carries the price, the limit and the deadline; the package is complete", async () => {
  const { client, log } = db({ setting: { "echo-fast": { mode: "live", daily_limit: 7 } } });
  const seen: Array<{ path: string; mode: string; body: Record<string, unknown>; timeoutMs: number }> = [];
  const r = await startRunWith(client as never, deps(okReply(), seen as never), LAWYER, body());
  assert.equal(r.status, 200);
  const p = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
  assert.equal(p.p_price, 1);
  assert.equal(p.p_daily_limit, 7);
  assert.equal(p.p_exempt, false);
  assert.ok(typeof p.p_deadline === "string");
  assert.equal(seen.length, 1);
  assert.equal(seen[0].path, "nzamy-ai/echo-fast");
  assert.equal(seen[0].mode, "sync");
  assert.equal(seen[0].timeoutMs, 50_000);
  const pkg = seen[0].body;
  assert.equal(pkg.run_id, RUN);
  assert.deepEqual(pkg.respond, { mode: "sync" });
  assert.deepEqual(pkg.input, { text: "مرحبا", use_model: false });
  for (const k of ["sources", "history", "files"]) assert.ok(Array.isArray(pkg[k]), k);
  assert.equal((pkg.actor as Record<string, unknown>).display_name, null);
});

test("the money refusals map to 402 / 429 / 503 / 409", async () => {
  const cases: Array<[{ data?: unknown; error?: { code?: string; message?: string } }, number, string]> = [
    [{ error: { code: "P0001", message: "insufficient_points" } }, 402, "insufficient_points"],
    [{ error: { code: "P0001", message: "daily_limit" } }, 429, "daily_limit"],
    [{ error: { code: "PGRST202", message: "missing" } }, 503, "not_ready"],
    [{ data: [{ run_id: RUN, created: false, status: "succeeded", charged: true, charged_points: 1 }] }, 409, "duplicate"],
  ];
  for (const [start, status, code] of cases) {
    const { client } = db({ start });
    const seen: unknown[] = [];
    const r = await startRunWith(client as never, deps(okReply(), seen), LAWYER, body());
    assert.equal(r.status, status, code);
    assert.equal(r.body.code, code);
    assert.equal(seen.length, 0, `${code}: n8n was not called`);
  }
});

test("a fast reply is stored once and returned; only status running is updated", async () => {
  const { client, log } = db();
  const r = await startRunWith(client as never, deps(okReply()), LAWYER, body());
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.output, { echo: "مرحبا" });
  assert.equal(r.body.chargedPoints, 1);
  const upd = log.find((q) => q.table === "ai_runs" && q.op === "update")!;
  assert.deepEqual(upd.filters, [["eq", "id", RUN], ["eq", "status", "running"]]);
  assert.equal((upd.payload as Record<string, unknown>).model, "claude-haiku-5-5");
  assert.ok(!rpcs(log).includes("ai_fail_run"));
});

test("every bad answer from n8n fails the run and refunds it", async () => {
  const cases: Array<[N8nOutcome, number, string]> = [
    [{ kind: "failed", code: "n8n_http", detail: "HTTP 500" }, 502, "n8n_http"],
    [{ kind: "failed", code: "timeout", detail: "slow" }, 504, "timeout"],
    [{ kind: "failed", code: "n8n_unconfigured", detail: "unset" }, 502, "n8n_unconfigured"],
    [{ kind: "accepted" }, 502, "bad_reply"],
    [okReply({ wrong: 1 }), 502, "schema_invalid"],
    [{ kind: "result", result: { run_id: "other", status: "succeeded", output: { echo: "x" } } }, 502, "bad_reply"],
    [{ kind: "result", result: { run_id: RUN, status: "failed", error: { code: "model_refused" } } }, 502, "model_refused"],
    [{ kind: "result", result: { run_id: RUN, status: "failed", error: { code: "weird" } } }, 502, "model_error"],
  ];
  for (const [outcome, status, failCode] of cases) {
    const { client, log } = db();
    const r = await startRunWith(client as never, deps(outcome), LAWYER, body());
    assert.equal(r.status, status, failCode);
    const fail = log.find((q) => q.table === "ai_fail_run");
    assert.ok(fail, `${failCode}: refunded`);
    assert.equal((fail!.payload as Record<string, unknown>).p_code, failCode);
    assert.ok([AI_COPY.failed, AI_COPY.timeout].includes(r.body.error as never));
  }
});

test("a fast result for a run already final (swept) changes nothing and reports a timeout", async () => {
  const { client, log } = db({ updated: false });
  const r = await startRunWith(client as never, deps(okReply()), LAWYER, body());
  assert.equal(r.status, 504);
  assert.ok(!rpcs(log).includes("ai_fail_run"));
});

test("a job tool answers 202 with the run left running, and a fast 202 is a failure", async () => {
  const { client, log } = db();
  const seen: Array<{ mode: string; body: Record<string, unknown> }> = [];
  const r = await startRunWith(client as never, deps({ kind: "accepted" }, seen as never), LAWYER, body({ tool: "echo-job" }));
  assert.equal(r.status, 202);
  assert.equal(r.body.status, "running");
  assert.equal(seen[0].mode, "async");
  assert.deepEqual(seen[0].body.respond, { mode: "async", callback_url: "https://app.test/api/v1/ai/callback" });
  assert.ok(!rpcs(log).includes("ai_fail_run"));
});

test("citations keep only sources the app sent, once each", () => {
  const sources = { S1: { kind: "article", id: "a1" }, S2: { kind: "principle", id: "p2" } };
  assert.deepEqual(mapCitations(["S2", "S9", "S2", 4, "S1"], sources), [
    { sid: "S2", kind: "principle", id: "p2" },
    { sid: "S1", kind: "article", id: "a1" },
  ]);
  assert.deepEqual(mapCitations("S1", sources), []);
  assert.deepEqual(mapCitations(["__proto__", "toString"], sources), []);
});

test("the callback settles a running job once and answers 200 when it is already final", async () => {
  const running = { id: RUN, tool: "echo-job", status: "running", class: "job", source_ids: {} };
  {
    const { client, log } = db({ run: running });
    const r = await callbackWith(client as never, { run_id: RUN, status: "succeeded", output: { echo: "x" }, citations: [] });
    assert.equal(r.status, 200);
    assert.equal(r.body.final, "succeeded");
    assert.ok(log.some((q) => q.table === "ai_runs" && q.op === "update"));
  }
  {
    const { client, log } = db({ run: { ...running, status: "failed" } });
    const r = await callbackWith(client as never, { run_id: RUN, status: "succeeded", output: { echo: "x" } });
    assert.equal(r.status, 200);
    assert.ok(!log.some((q) => q.op === "update" || q.op === "rpc"));
  }
  {
    const { client } = db({ run: null });
    assert.equal((await callbackWith(client as never, { run_id: RUN, status: "succeeded" })).status, 404);
  }
  {
    const { client } = db({ run: running });
    assert.equal((await callbackWith(client as never, { run_id: "not-a-uuid" })).status, 400);
  }
  {
    const { client, log } = db({ run: { ...running, tool: "echo-fast", class: "fast" } });
    const r = await callbackWith(client as never, { run_id: RUN, status: "succeeded", output: { echo: "x" } });
    assert.equal(r.status, 200);
    assert.ok(log.some((q) => q.table === "ai_fail_run"), "a fast run never settles through the callback");
  }
});

test("a progress callback only moves the step of a running run", async () => {
  const { client, log } = db({ run: { id: RUN, tool: "echo-job", status: "running", class: "job", source_ids: {} } });
  assert.equal((await callbackWith(client as never, { run_id: RUN, status: "progress", step: "drafting" })).status, 200);
  const upd = log.find((q) => q.op === "update")!;
  assert.deepEqual(upd.payload, { progress_step: "drafting" });
  assert.deepEqual(upd.filters, [["eq", "id", RUN], ["eq", "status", "running"]]);
  assert.equal((await callbackWith(client as never, { run_id: RUN, status: "progress", step: "hacking" })).status, 400);
});

test("runtime config: a malformed entry never turns a tool live", () => {
  const spec = AI_TOOLS["echo-fast"];
  assert.deepEqual(resolveToolRuntime(spec, null), { mode: "off", dailyLimit: 30 });
  assert.deepEqual(resolveToolRuntime(spec, { "echo-fast": { mode: "LIVE", daily_limit: -1 } }), { mode: "off", dailyLimit: 30 });
  assert.deepEqual(resolveToolRuntime(spec, { "echo-fast": { mode: "live", daily_limit: 3 } }), { mode: "live", dailyLimit: 3 });
  const known = Object.keys(AI_TOOLS);
  assert.equal(aiToolsSettingIssue({ "echo-fast": { mode: "live", daily_limit: 5 } }, known), null);
  assert.ok(aiToolsSettingIssue({ nope: {} }, known));
  assert.ok(aiToolsSettingIssue({ "echo-fast": { mode: "on" } }, known));
  assert.ok(aiToolsSettingIssue({ "echo-fast": { daily_limit: 1.5 } }, known));
  assert.ok(aiToolsSettingIssue({ "echo-fast": { price: 0 } }, known));
  assert.ok(aiToolsSettingIssue([], known));
});

test("a job tool is refused before any charge when there is no https callback URL", async () => {
  const { client, log } = db();
  const seen: unknown[] = [];
  const r = await startRunWith(client as never, { ...deps({ kind: "accepted" }, seen), callbackUrl: "" }, LAWYER, body({ tool: "echo-job" }));
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "not_ready");
  assert.deepEqual(rpcs(log), []);
  assert.equal(seen.length, 0);
});
