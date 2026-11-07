/**
 * runCore.test.ts — the AI run pipeline against a recording fake of the
 * service client (plan §1, §1.2, §2): every check before the charge, the
 * charge before the webhook, and the money settled only on n8n's answer.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/runCore.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { AI_COPY, callbackWith, mapCitations, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import { resolveAiFiles } from "./aiFiles.ts";
import { serveFileText } from "./fileTextServe.ts";
import { FILE_TEXT_TTL_MS } from "./fileTextToken.ts";
import { pastedFileUrlFrom } from "./textFilesConfig.ts";
import type { N8nOutcome } from "./n8nClient.ts";
import { resolveToolRuntime, aiToolsSettingIssue, effectiveToolMode, REVIEW_MODE_REFUSED_AR } from "./aiToolsConfig.ts";
import { AI_TOOLS, LIB_QUERIES_PATH, NAJIZ_NEEDS_CHECK, countNeedsCheck } from "./tools.ts";
import type { Retrieved } from "./retrieval.ts";
import { STEP_LABEL_AR, type ProgressEvent } from "./progressEvents.ts";

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
  const r = await startRunWith(client as never, { ...deps(okReply(), seen as never), clock: () => 0 }, LAWYER, body());
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

test("task 2 review M1: onRunCreated fires once for a created run — never for a refusal or a duplicate", async () => {
  const cases: Array<[{ data?: unknown; error?: { code?: string; message?: string } } | undefined, string[]]> = [
    [undefined, ["echo-fast"]],
    [{ data: [{ run_id: RUN, created: false, status: "succeeded", charged: true, charged_points: 1 }] }, []],
    [{ error: { code: "P0001", message: "insufficient_points" } }, []],
    [{ error: { code: "P0001", message: "daily_limit" } }, []],
  ];
  for (const [start, expected] of cases) {
    const { client } = db(start ? { start } : {});
    const created: string[] = [];
    await startRunWith(client as never, { ...deps(okReply()), onRunCreated: (t) => created.push(t) }, LAWYER, body());
    assert.deepEqual(created, expected, JSON.stringify(start ?? "created"));
  }
  // A refusal before the charge (bad input) never reaches it either.
  const { client } = db();
  const created: string[] = [];
  await startRunWith(client as never, { ...deps(okReply()), onRunCreated: (t) => created.push(t) }, LAWYER, body({ input: { text: "" } }));
  assert.deepEqual(created, []);
  // A throwing tally does not fail the run.
  const r = await startRunWith(db().client as never, { ...deps(okReply()), onRunCreated: () => { throw new Error("tally"); } }, LAWYER, body());
  assert.equal(r.status, 200);
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

// ── wave 1 ───────────────────────────────────────────────────────────────────

const W1_ON = { communicate: { mode: "live" }, "najiz-optimizer": { mode: "live" } };
const MEMO = `${"وحيث إن المدعى عليه أخل بالتزامه التعاقدي إخلالاً جسيماً. ".repeat(160)}استناداً إلى المادة (٧٧) من نظام العمل والحكم رقم ٤٤٣٠١٢٣`;

test("communicate: the letter tool signs with the user's name, the echo tool does not", async () => {
  const actor = { ...LAWYER, displayName: "أ. سارة" };
  const seen: Array<{ path: string; body: Record<string, unknown> }> = [];
  const { client, log } = db({ setting: W1_ON });
  const input = { type: "letter", tone: "رسمي", recipient: " شركة النور ", subject: "", body: "طلب سداد المستحقات" };
  const r = await startRunWith(client as never, deps(okReply({ text: "السادة شركة النور المحترمين" }), seen as never), actor, body({ tool: "communicate", input }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.output, { text: "السادة شركة النور المحترمين" });
  assert.equal(seen[0].path, "nzamy-ai/communicate");
  assert.equal((seen[0].body.actor as Record<string, unknown>).display_name, "أ. سارة");
  assert.deepEqual(seen[0].body.input, { type: "letter", tone: "رسمي", recipient: "شركة النور", subject: null, body: "طلب سداد المستحقات" });
  assert.equal((log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>).p_price, 5);

  const echoSeen: Array<{ body: Record<string, unknown> }> = [];
  const { client: c2 } = db();
  await startRunWith(c2 as never, deps(okReply(), echoSeen as never), actor, body());
  assert.equal((echoSeen[0].body.actor as Record<string, unknown>).display_name, null);
});

test("communicate: bad type, tone or body is refused before any charge", async () => {
  const good = { type: "email", tone: "حازم", body: "نص" };
  for (const input of [
    { ...good, type: "sms" },
    { ...good, tone: "ساخر" },
    { ...good, body: "   " },
    { ...good, body: "ب".repeat(3001) },
    { ...good, recipient: "ج".repeat(151) },
    "نص",
  ]) {
    const { client, log } = db({ setting: W1_ON });
    const r = await startRunWith(client as never, deps(okReply({ text: "x" })), LAWYER, body({ tool: "communicate", input }));
    assert.equal(r.status, 422, JSON.stringify(input).slice(0, 60));
    assert.deepEqual(rpcs(log), []);
  }
});

test("najiz R5: a memo within 9,000 characters is refused, a consultant is refused, a longer one is sent with its references", async () => {
  {
    const { client, log } = db({ setting: W1_ON });
    const r = await startRunWith(client as never, deps(okReply({ text: "x" })), LAWYER, body({ tool: "najiz-optimizer", input: { text: "قصير ".repeat(100) } }));
    assert.equal(r.status, 422);
    assert.deepEqual(rpcs(log), []);
  }
  {
    const { client, log } = db({ setting: W1_ON });
    const r = await startRunWith(client as never, deps(okReply({ text: "x" })), { ...LAWYER, practiceKind: "consultant" }, body({ tool: "najiz-optimizer", input: { text: MEMO } }));
    assert.equal(r.status, 403);
    assert.equal(r.body.code, "consultant_blocked");
    assert.deepEqual(rpcs(log), []);
  }
  {
    const seen: Array<{ body: Record<string, unknown> }> = [];
    const { client } = db({ setting: W1_ON });
    const short = "وفق المادة 77 والحكم رقم 4430123 يلزم المدعى عليه بالسداد.";
    const r = await startRunWith(client as never, deps(okReply({ text: short, kept_citations: ["anything"] }), seen as never), LAWYER, body({ tool: "najiz-optimizer", input: { text: MEMO } }));
    assert.equal(r.status, 200);
    assert.deepEqual((seen[0].body.input as Record<string, unknown>).must_keep, ["مادة 77", "رقم 4430123"]);
    assert.deepEqual(r.body.output, { text: short, kept_refs: ["مادة 77", "رقم 4430123"] }, "the app's list, not the model's");
  }
});

test("najiz R5: an output that drops a reference or is still too long fails and refunds", async () => {
  for (const text of ["يلزم المدعى عليه بالسداد وفق المادة 77.", `المادة 77 والحكم رقم 4430123 ${"ن".repeat(9000)}`]) {
    const { client, log } = db({ setting: W1_ON });
    const r = await startRunWith(client as never, deps(okReply({ text })), LAWYER, body({ tool: "najiz-optimizer", input: { text: MEMO } }));
    assert.equal(r.status, 502);
    assert.equal((log.find((q) => q.table === "ai_fail_run")!.payload as Record<string, unknown>).p_code, "schema_invalid");
  }
});

test("the callback checks a job's output against the input stored on the run", () => {
  const spec = AI_TOOLS["najiz-optimizer"];
  const input = spec.validateInput({ text: MEMO });
  assert.ok(input.ok);
  if (!input.ok) return;
  assert.equal(spec.validateOutput({ text: "المادة 77 والحكم رقم 4430123" }, input.input) !== null, true);
  assert.equal(spec.validateOutput({ text: "المادة 77 والحكم رقم 4430123" }, {}), null, "no stored input: nothing is proven");
  assert.equal(spec.validateOutput({ text: "الحكم رقم 4430123" }, input.input), null);
});

test("٤١٦: the condense must keep every «[يحتاج تحقق]» of the cleaned memo, or the run fails and refunds", async () => {
  const spec = AI_TOOLS["najiz-optimizer"];
  const marked = `رقم الهوية: ${NAJIZ_NEEDS_CHECK}\nالتاريخ: ${NAJIZ_NEEDS_CHECK}\n${MEMO}`;
  const input = spec.validateInput({ text: marked });
  assert.ok(input.ok);
  if (!input.ok) return;
  const refs = "المادة 77 والحكم رقم 4430123";
  assert.equal(countNeedsCheck(marked), 2);
  assert.notEqual(spec.validateOutput({ text: `${NAJIZ_NEEDS_CHECK} ${NAJIZ_NEEDS_CHECK} ${refs}` }, input.input), null, "both kept");
  assert.equal(spec.validateOutput({ text: `${NAJIZ_NEEDS_CHECK} ${refs}` }, input.input), null, "one dropped");
  assert.equal(spec.validateOutput({ text: `يحتاج تحقق يحتاج تحقق ${refs}` }, input.input), null, "brackets stripped");
  // A memo with no marker is unaffected.
  const plain = spec.validateInput({ text: MEMO });
  assert.ok(plain.ok && spec.validateOutput({ text: refs }, plain.input) !== null);
  // Through the pipeline: refunded as schema_invalid.
  const { client, log } = db({ setting: W1_ON });
  const r = await startRunWith(client as never, deps(okReply({ text: `${NAJIZ_NEEDS_CHECK} ${refs}` })), LAWYER, body({ tool: "najiz-optimizer", input: { text: marked } }));
  assert.equal(r.status, 502);
  assert.equal((log.find((q) => q.table === "ai_fail_run")!.payload as Record<string, unknown>).p_code, "schema_invalid");
});

test("staff mode runs the tool for an admin and refuses everyone else before any charge", async () => {
  const staff = { communicate: { mode: "staff" } };
  const input = { type: "letter", tone: "رسمي", body: "نص" };
  {
    const { client, log } = db({ setting: staff });
    const r = await startRunWith(client as never, deps(okReply({ text: "x" })), LAWYER, body({ tool: "communicate", input }));
    assert.equal(r.status, 423);
    assert.deepEqual(rpcs(log), []);
  }
  {
    const { client } = db({ setting: staff });
    const r = await startRunWith(client as never, deps(okReply({ text: "x" })), { ...LAWYER, userType: "admin" }, body({ tool: "communicate", input }));
    assert.equal(r.status, 200);
  }
  assert.equal(aiToolsSettingIssue({ communicate: { mode: "staff" } }, Object.keys(AI_TOOLS)), null);
});

// ── "review" retired (Wave 1 Task 3; slice C §3.1-3, R4) ─────────────────────
// It charged, hid the result, and nothing released or refunded it. A stored
// "review" now runs as "staff"; the admin write refuses it.

test("review retired: a stored review resolves to staff; every other mode is unchanged", () => {
  assert.equal(effectiveToolMode("review"), "staff");
  for (const m of ["off", "staff", "live"] as const) assert.equal(effectiveToolMode(m), m);
  const spec = AI_TOOLS["communicate"];
  assert.deepEqual(resolveToolRuntime(spec, { communicate: { mode: "review", daily_limit: 4 } }), {
    mode: "staff",
    dailyLimit: 4,
    legacyMode: "review",
  });
  assert.deepEqual(resolveToolRuntime(spec, { communicate: { mode: "staff" } }), { mode: "staff", dailyLimit: spec.dailyLimit });
  // A registry default of "review" would be mapped the same way.
  assert.deepEqual(resolveToolRuntime({ ...spec, defaultMode: "review" }, null), {
    mode: "staff",
    dailyLimit: spec.dailyLimit,
    legacyMode: "review",
  });
});

test("review retired: the admin write refuses review with the Arabic message; off / staff / live still pass", () => {
  const known = Object.keys(AI_TOOLS);
  const issue = aiToolsSettingIssue({ communicate: { mode: "review" } }, known);
  assert.ok(issue && issue.startsWith(REVIEW_MODE_REFUSED_AR), String(issue));
  assert.ok(issue!.includes("communicate"));
  for (const mode of ["off", "staff", "live"]) {
    assert.equal(aiToolsSettingIssue({ communicate: { mode } }, known), null, mode);
  }
  // The other messages no longer offer review either.
  assert.doesNotMatch(String(aiToolsSettingIssue([], known)), /review/);
  assert.doesNotMatch(String(aiToolsSettingIssue({ communicate: { mode: "on" } }, known)), /review/);
});

test("review retired: a non-admin on a stored-review tool gets the staff refusal before any charge", async () => {
  const input = { type: "letter", tone: "رسمي", body: "نص" };
  const results: Array<{ status: number; body: Record<string, unknown> }> = [];
  for (const setting of [{ communicate: { mode: "review" } }, { communicate: { mode: "staff" } }]) {
    const { client, log } = db({ setting });
    const seen: unknown[] = [];
    const r = await startRunWith(client as never, deps(okReply({ text: "x" }), seen), LAWYER, body({ tool: "communicate", input }));
    assert.deepEqual(rpcs(log), [], "ai_start_run never ran");
    assert.equal(seen.length, 0, "n8n was not called");
    results.push(r);
  }
  assert.deepEqual(results[0], results[1], "stored review answers exactly as staff");
  assert.equal(results[0].status, 423);
  assert.equal(results[0].body.code, "tool_off");
  assert.equal(results[0].body.error, AI_COPY.off);
});

test("review retired: an admin on a stored-review tool gets the output, stored as succeeded", async () => {
  const input = { type: "letter", tone: "رسمي", body: "نص" };
  const { client, log } = db({ setting: { communicate: { mode: "review" } } });
  const r = await startRunWith(client as never, deps(okReply({ text: "x" })), { ...LAWYER, userType: "admin" }, body({ tool: "communicate", input }));
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "succeeded");
  assert.deepEqual(r.body.output, { text: "x" });
  const upd = log.find((q) => q.table === "ai_runs" && q.op === "update")!;
  assert.equal((upd.payload as Record<string, unknown>).status, "succeeded");
});

test("review retired: a job callback for a stored-review tool settles as succeeded, never held", async () => {
  const running = { id: RUN, tool: "echo-job", status: "running", class: "job", source_ids: {} };
  const { client, log } = db({ run: running, setting: { "echo-job": { mode: "review" } } });
  const r = await callbackWith(client as never, { run_id: RUN, status: "succeeded", output: { echo: "x" }, citations: [] });
  assert.equal(r.body.final, "succeeded");
  const upd = log.find((q) => q.table === "ai_runs" && q.op === "update")!;
  assert.equal((upd.payload as Record<string, unknown>).status, "succeeded");
});

// ── founder credits (P3 Task 6) ──────────────────────────────────────────────

const CONV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const FACTS = "عمل الموكل لدى الشركة خمس سنوات ثم فُصل دون إنذار ولم تُصرف مستحقاته.";
const issuesInput = (over: Record<string, unknown> = {}) => ({
  phase: "issues", kind: "claim", client_role: "plaintiff", branch: "عمالي", facts: FACTS, ...over,
});
const draftInput = (over: Record<string, unknown> = {}) => ({
  phase: "draft", kind: "appeal", client_role: "plaintiff", branch: "عمالي", facts: FACTS,
  issues: [{ title: "مشروعية الفصل", detail: "فُصل دون إنذار" }],
  defenses: [{ title: "الفصل دون سبب مشروع", basis: "[S1]" }],
  requests: ["إلزام المدعى عليها بمكافأة نهاية الخدمة"],
  ...over,
});
const ANALYSIS = {
  facts_summary: "عمل المدعي خمس سنوات ثم فُصل.",
  issues: [{ title: "مشروعية الفصل", detail: "دون إنذار" }],
  defenses: [{ title: "الفصل دون سبب مشروع", basis: "المادة ٧٧ [S1]", issue: 1 }],
  requests: ["مكافأة نهاية الخدمة"],
  missing: [],
  cited: [{ law: "نظام العمل", article: 77, as_written: "المادة ٧٧" }],
};
const FOUND: Retrieved = {
  sources: [{ sid: "S1", kind: "article", title: "نظام العمل — السابعة والسبعون", text: "…" }],
  map: { S1: { kind: "article", id: "labor__art-77", title: "نظام العمل — السابعة والسبعون", url: "/laws/labor#labor__art-77" } },
};

/** Answers both start functions; the credit one reports credit_used unless `credit` overrides it. */
function creditDb(opts: { prior?: unknown[]; credit?: { data?: unknown; error?: { code?: string; message?: string } } } = {}) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: { ...ON, "legal-drafter": { mode: "live" } } } };
    if (q.table === "ai_runs" && q.op === "select") return { data: opts.prior ?? [] };
    if (q.op === "rpc" && q.table === "ai_start_run") {
      const price = (q.payload as Record<string, unknown>).p_price as number;
      return { data: [{ run_id: RUN, created: true, status: "running", charged: price > 0, charged_points: price }] };
    }
    if (q.op === "rpc" && q.table === "ai_start_run_with_credit") {
      return opts.credit ?? { data: [{ run_id: RUN, created: true, status: "running", charged: false, charged_points: 0, credit_used: true }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    if (q.table === "ai_runs" && q.op === "update") return { data: [{ id: RUN }] };
    return {};
  });
}

function drafterDeps(calls: Array<{ path: string }> = []): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      calls.push(call);
      return call.path === LIB_QUERIES_PATH
        ? { kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: ["فصل العامل دون سبب مشروع"] } } }
        : { kind: "accepted" };
    },
    libraryAccess: async () => null,
    retrieve: async () => FOUND,
    resolveFiles: async () => ({ ok: true, files: [], pages: 0 }) as never,
  };
}

const drafterBody = (input: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  tool: "legal-drafter", input, idempotencyKey: "key-abcdef01", useCredit: true, ...over,
});
const payloadOf = (log: FakeQuery[], fn: string) =>
  log.find((q) => q.op === "rpc" && q.table === fn)?.payload as Record<string, unknown> | undefined;

test("founder: useCredit on the drafter's first turn (appeal) spends a drafting work through ai_start_run_with_credit", async () => {
  const { client, log } = creditDb();
  const r = await startRunWith(client as never, drafterDeps(), LAWYER, drafterBody(issuesInput({ kind: "appeal" })));
  assert.equal(r.status, 202);
  assert.deepEqual(rpcs(log), ["ai_start_run_with_credit"], "the credit function only, never ai_start_run too");
  const p = payloadOf(log, "ai_start_run_with_credit")!;
  assert.equal(p.p_credit_kind, "drafting_work");
  assert.equal(p.p_tool, "legal-drafter");
  assert.equal(p.p_exempt, false);
  assert.equal((p.p_input as Record<string, unknown>).kind, "appeal");
  // Every ai_start_run argument is passed through, plus p_credit_kind.
  for (const k of ["p_user", "p_tool", "p_variant", "p_class", "p_price", "p_daily_limit", "p_idempotency_key", "p_deadline", "p_exempt", "p_input", "p_file_ids", "p_pages", "p_conversation", "p_source_ids"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(p, k), k);
  }
  assert.equal(r.body.creditUsed, true);
  assert.equal(r.body.chargedPoints, 0);
});

test("founder: the drafter's second turn never spends a second work — plain ai_start_run at price 0", async () => {
  const prior = [{ input: issuesInput({ kind: "appeal", search_text: FACTS }), output: ANALYSIS, status: "succeeded" }];
  const { client, log } = creditDb({ prior });
  const r = await startRunWith(client as never, drafterDeps(), LAWYER, drafterBody(draftInput(), { conversationId: CONV }));
  assert.equal(r.status, 202);
  assert.deepEqual(rpcs(log), ["ai_start_run"]);
  assert.equal(payloadOf(log, "ai_start_run")!.p_price, 0);
  assert.equal(r.body.creditUsed, false);
});

test("founder: useCredit with an ineligible tool falls back to the points path; the rejoinder spends a work", async () => {
  {
    const { client, log } = creditDb();
    const r = await startRunWith(client as never, deps(okReply()), LAWYER, body({ useCredit: true }));
    assert.equal(r.status, 200);
    assert.deepEqual(rpcs(log), ["ai_start_run"], "echo-fast: no credit function");
    assert.equal(payloadOf(log, "ai_start_run")!.p_price, 1);
    assert.equal(r.body.creditUsed, false);
  }
  {
    // Owner ٤١٠ (20261107_60): the rejoinder is covered — a work, not 500 points.
    const { client, log } = creditDb();
    const r = await startRunWith(client as never, drafterDeps(), LAWYER, drafterBody(issuesInput({ kind: "rejoinder" })));
    assert.equal(r.status, 202);
    assert.deepEqual(rpcs(log), ["ai_start_run_with_credit"]);
    assert.equal(payloadOf(log, "ai_start_run_with_credit")!.p_credit_kind, "drafting_work");
  }
  {
    // Without useCredit an eligible run is charged points as before.
    const { client, log } = creditDb();
    const r = await startRunWith(client as never, drafterDeps(), LAWYER, drafterBody(issuesInput({ kind: "appeal" }), { useCredit: undefined }));
    assert.equal(r.status, 202);
    assert.deepEqual(rpcs(log), ["ai_start_run"]);
    assert.equal(payloadOf(log, "ai_start_run")!.p_price, 1000);
  }
});

test("founder: an admin (exempt) never spends a credit, even with useCredit", async () => {
  const { client, log } = creditDb();
  const r = await startRunWith(client as never, drafterDeps(), { ...LAWYER, userType: "admin" }, drafterBody(issuesInput({ kind: "appeal" })));
  assert.equal(r.status, 202);
  assert.deepEqual(rpcs(log), ["ai_start_run"]);
  assert.equal(payloadOf(log, "ai_start_run")!.p_exempt, true);
  assert.equal(r.body.creditUsed, false);
});

test("founder: no credit left → 402 with the Arabic message; not eligible → 400; the tool is never called", async () => {
  const cases: Array<[string, number]> = [
    ["no_credit", 402],
    ["credit_not_eligible", 400],
  ];
  for (const [message, status] of cases) {
    const { client, log } = creditDb({ credit: { error: { code: "P0001", message } } });
    const calls: Array<{ path: string }> = [];
    const r = await startRunWith(client as never, drafterDeps(calls), LAWYER, drafterBody(issuesInput({ kind: "appeal" })));
    assert.equal(r.status, status, message);
    assert.equal(r.body.code, message);
    assert.ok(!rpcs(log).includes("ai_start_run"), `${message}: no fallback to points`);
    assert.ok(!calls.some((c) => c.path === "nzamy-ai/legal-drafter"), `${message}: the tool was not called`);
  }
  const { client } = creditDb({ credit: { error: { code: "P0001", message: "no_credit" } } });
  const r = await startRunWith(client as never, drafterDeps(), LAWYER, drafterBody(issuesInput({ kind: "appeal" })));
  assert.equal(r.body.error, "لا يتبقى لك رصيد من باقة المؤسس لهذه الأداة");
  assert.equal(r.body.error, AI_COPY.noCredit);
});

// ── B4: pasted text travels as one virtual text file ─────────────────────────

const PASTE_ON = { "brief-check": { mode: "live" }, wargaming: { mode: "live" } };
const PASTED_MEMO = "م".repeat(300);
const WAR_INPUT = { role: "plaintiff", area: "عمالي", case_summary: "فُصل الموظف بعد سبع سنوات دون إنذار ودون صرف مستحقاته", targets: ["opponent"] };
const REAL_FILE = { id: "37", name: "ملف.pdf", mime: "application/pdf", bytes: 10, pages: 2, url: "https://s/f", url_expires_at: "2026-11-05T00:15:00.000Z" };

function pasteDeps(over: Partial<StartRunDeps> = {}, seen: Array<{ body: Record<string, unknown> }> = []): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      seen.push(call as never);
      return { kind: "accepted" };
    },
    resolveFiles: async () => ({ ok: true, files: [REAL_FILE], pages: 2 }),
    pastedFileUrl: (r, _u, f) => `https://s/t/${r}/${f}`,
    ...over,
  };
}
const briefBody = (input: Record<string, unknown> = { client_capacity: "مدعٍ", memo_text: PASTED_MEMO }, over: Record<string, unknown> = {}) => ({
  tool: "brief-check",
  input,
  fileIds: [],
  idempotencyKey: "key-abcdef01",
  ...over,
});
const warBody = (input: Record<string, unknown>, over: Record<string, unknown> = {}) => ({ tool: "wargaming", input, idempotencyKey: "key-abcdef01", ...over });

test("B4: a pasted memo is sent as one text file and left out of the package input", async () => {
  const { client, log } = db({ setting: PASTE_ON });
  const seen: Array<{ body: Record<string, unknown> }> = [];
  const now = new Date("2026-11-05T10:00:00Z");
  const r = await startRunWith(client as never, pasteDeps({ now: () => now }, seen), LAWYER, briefBody());
  assert.equal(r.status, 202);
  const pkg = seen[0].body as { files: Array<Record<string, unknown>>; input: Record<string, unknown> };
  assert.equal(pkg.files.length, 1);
  assert.deepEqual(pkg.files[0], {
    id: "paste:memo_text",
    name: "نص المذكرة (ملصق).txt",
    mime: "text/plain",
    bytes: new TextEncoder().encode(PASTED_MEMO).length,
    pages: 1,
    url: `https://s/t/${RUN}/memo_text`,
    url_expires_at: new Date(now.getTime() + FILE_TEXT_TTL_MS).toISOString(),
  });
  assert.equal("memo_text" in pkg.input, false, "the text travels once, as the file");
  assert.equal(pkg.input.client_capacity, "مدعٍ");
  const start = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
  assert.equal((start.p_input as Record<string, unknown>).memo_text, PASTED_MEMO, "the link reads it from ai_runs.input");
  assert.deepEqual(start.p_file_ids, [], "a virtual file is not an attachment id");
  assert.equal(start.p_pages, 1);
  assert.equal(JSON.stringify(r.body).includes("https://s/t/"), false, "the link never reaches the browser");
});

test("B4: no pastedFileUrl (the flag off) → 422 paste_unavailable, nothing charged, n8n not called", async () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["brief-check", briefBody()],
    ["wargaming", warBody({ ...WAR_INPUT, docs_text: "و".repeat(60) })],
  ];
  for (const [name, b] of cases) {
    const { client, log } = db({ setting: PASTE_ON });
    const seen: Array<{ body: Record<string, unknown> }> = [];
    const r = await startRunWith(client as never, pasteDeps({ pastedFileUrl: undefined }, seen), LAWYER, b);
    assert.equal(r.status, 422, name);
    assert.equal(r.body.code, "paste_unavailable", name);
    assert.equal(r.body.error, "لصق النص غير متاح بعد — ارفع ملفاً", name);
    assert.deepEqual(rpcs(log), [], `${name}: no money function ran`);
    assert.equal(seen.length, 0, `${name}: n8n was not called`);
  }
});

test("B4: the flag off refuses a .docx through the real file check, nothing charged", async () => {
  const { client, log } = fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: PASTE_ON } };
    if (q.table === "attachments") {
      return { data: [{ id: 37, file_name: "مذكرة.docx", storage_path: "u-1/37.docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size_bytes: 10 }] };
    }
    return {};
  });
  const seen: Array<{ body: Record<string, unknown> }> = [];
  const deps = pasteDeps({ pastedFileUrl: undefined, resolveFiles: (userId, ids, rules) => resolveAiFiles(client, userId, ids, rules) }, seen);
  const r = await startRunWith(client as never, deps, LAWYER, briefBody({ client_capacity: "مدعٍ" }, { fileIds: [37] }));
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "file_type");
  assert.deepEqual(rpcs(log), []);
  assert.equal(seen.length, 0);
});

test("B4: a file and a pasted memo together → 422 too_many_files, nothing charged", async () => {
  const { client, log } = db({ setting: PASTE_ON });
  const r = await startRunWith(client as never, pasteDeps(), LAWYER, briefBody(undefined, { fileIds: [37] }));
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "too_many_files");
  assert.equal(r.body.error, "اختر طريقة واحدة: ملف أو نص ملصق");
  assert.deepEqual(rpcs(log), []);
});

test("B4: brief-check with neither a file nor a memo is refused uncharged, or n8n would never call back", async () => {
  for (const over of [{}, { pastedFileUrl: undefined }]) {
    const { client, log } = db({ setting: PASTE_ON });
    const seen: Array<{ body: Record<string, unknown> }> = [];
    const r = await startRunWith(client as never, pasteDeps(over, seen), LAWYER, briefBody({ client_capacity: "مدعٍ" }));
    assert.equal(r.status, 422);
    assert.equal(r.body.code, "files_required");
    assert.equal(r.body.error, "أرفق ملفاً واحداً على الأقل");
    assert.deepEqual(rpcs(log), []);
    assert.equal(seen.length, 0);
  }
});

test("B4: brief-check with an uploaded memo is unchanged", async () => {
  const { client, log } = db({ setting: PASTE_ON });
  const seen: Array<{ body: Record<string, unknown> }> = [];
  const r = await startRunWith(client as never, pasteDeps({ pastedFileUrl: undefined }, seen), LAWYER, briefBody({ client_capacity: "مدعٍ" }, { fileIds: [37] }));
  assert.equal(r.status, 202);
  assert.deepEqual((seen[0].body as { files: unknown[] }).files, [REAL_FILE]);
  const start = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
  assert.deepEqual(start.p_file_ids, ["37"]);
  assert.equal(start.p_pages, 2);
});

test("B4: wargaming's pasted documents join its files, and the pages add up", async () => {
  const { client, log } = db({ setting: PASTE_ON });
  const seen: Array<{ body: Record<string, unknown> }> = [];
  const docs = "و".repeat(3001);
  const r = await startRunWith(client as never, pasteDeps({}, seen), LAWYER, warBody({ ...WAR_INPUT, docs_text: docs }, { fileIds: [37] }));
  assert.equal(r.status, 202);
  const pkg = seen[0].body as { files: Array<{ id: string; pages: number }>; input: Record<string, unknown> };
  assert.deepEqual(pkg.files.map((f) => [f.id, f.pages]), [["37", 2], ["paste:docs_text", 2]]);
  assert.equal("docs_text" in pkg.input, false);
  const start = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
  assert.equal(start.p_pages, 4);
  assert.deepEqual(start.p_file_ids, ["37"]);
});

test("B4: wargaming with no paste needs no link and sends no file", async () => {
  const { client } = db({ setting: PASTE_ON });
  const seen: Array<{ body: Record<string, unknown> }> = [];
  const r = await startRunWith(client as never, pasteDeps({ pastedFileUrl: undefined }, seen), LAWYER, warBody(WAR_INPUT));
  assert.equal(r.status, 202);
  assert.deepEqual((seen[0].body as { files: unknown[] }).files, []);
});

test("B4: pasted pages over the tool's cap → 422 too_many_pages, nothing charged", async () => {
  const { client, log } = db({ setting: PASTE_ON });
  const deps = pasteDeps({ resolveFiles: async () => ({ ok: true, files: [REAL_FILE], pages: 30 }) });
  const r = await startRunWith(client as never, deps, LAWYER, warBody({ ...WAR_INPUT, docs_text: "و".repeat(60) }, { fileIds: [37] }));
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "too_many_pages");
  assert.deepEqual(rpcs(log), []);
});

test("B4: more files than the tool takes, once the paste is counted → 422 too_many_files, nothing charged", async () => {
  const { client, log } = db({ setting: PASTE_ON });
  const six = Array.from({ length: 6 }, (_, i) => ({ ...REAL_FILE, id: String(i + 1), pages: 1 }));
  const deps = pasteDeps({ resolveFiles: async () => ({ ok: true, files: six, pages: 6 }) });
  const r = await startRunWith(client as never, deps, LAWYER, warBody({ ...WAR_INPUT, docs_text: "و".repeat(60) }, { fileIds: [1, 2, 3, 4, 5, 6] }));
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "too_many_files");
  assert.deepEqual(rpcs(log), []);
});

test("B4: a link that cannot be signed after the charge refunds the run; n8n is not called", async () => {
  const { client, log } = db({ setting: PASTE_ON });
  const seen: Array<{ body: Record<string, unknown> }> = [];
  const logged = console.error;
  console.error = () => {};
  try {
    const deps = pasteDeps({ pastedFileUrl: () => { throw new Error("no secret"); } }, seen);
    const r = await startRunWith(client as never, deps, LAWYER, briefBody());
    assert.equal(r.status, 502);
    assert.equal(r.body.code, "tool_failed");
    assert.equal(r.body.runId, RUN);
  } finally {
    console.error = logged;
  }
  assert.deepEqual(rpcs(log), ["ai_start_run", "ai_fail_run"]);
  assert.equal(seen.length, 0);
});

test("B4: n8n unreachable after a paste refunds the run once", async () => {
  const { client, log } = db({ setting: PASTE_ON });
  const deps = pasteDeps({ n8n: async () => ({ kind: "failed", code: "n8n_unreachable", detail: "down" }) });
  const r = await startRunWith(client as never, deps, LAWYER, briefBody());
  assert.equal(r.status, 502);
  assert.deepEqual(rpcs(log), ["ai_start_run", "ai_fail_run"]);
});

test("B4: a repeated request is the duplicate reply: no second charge and no link signed", async () => {
  const { client } = db({ setting: PASTE_ON, start: { data: [{ run_id: RUN, created: false, status: "running", charged: true, charged_points: 200 }] } });
  let signed = 0;
  const r = await startRunWith(client as never, pasteDeps({ pastedFileUrl: () => (signed++, "x") }), LAWYER, briefBody());
  assert.equal(r.status, 409);
  assert.equal(signed, 0);
});

test("B4: the whole way — the link runCore sends serves the pasted text, and only while the run runs", async () => {
  const option = { secret: "test-secret-not-a-real-key", baseUrl: "https://site.test" };
  const { client, log } = db({ setting: PASTE_ON });
  const seen: Array<{ body: Record<string, unknown> }> = [];
  await startRunWith(client as never, pasteDeps({ pastedFileUrl: pastedFileUrlFrom(option) }, seen), LAWYER, briefBody());
  const url = (seen[0].body as { files: Array<{ url: string }> }).files[0].url;
  assert.ok(url.startsWith("https://site.test/api/v1/ai/file-text/"));
  const token = url.split("/").at(-1)!;
  const stored = (log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>).p_input;
  const reader = (status: string) =>
    fakeDb((q) => (q.table === "ai_runs" ? { data: { tool: "brief-check", status, input: stored } } : {})).client;
  const opts = { secret: option.secret, now: Date.now() };
  assert.deepEqual(await serveFileText(reader("running"), token, opts), { status: 200, text: PASTED_MEMO });
  assert.deepEqual(await serveFileText(reader("succeeded"), token, opts), { status: 404 });
  assert.deepEqual(await serveFileText(reader("running"), token, { secret: option.secret, now: Date.now() + FILE_TEXT_TTL_MS + 1000 }), { status: 404 });
});

test("the runs route: the paste link is passed only under the same flag as the file text", () => {
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "v1", "ai", "runs", "route.ts"), "utf8");
  assert.match(route, /\.\.\.\(textFiles \? \{ pastedFileUrl: pastedFileUrlFrom\(textFiles\) \} : \{\}\)/);
  assert.equal(route.match(/pastedFileUrl:/g)?.length, 1, "no other way in");
});

// ── E3: real progress, never a text ──────────────────────────────────────────

type Reported = { runId: string; userId: string; events: ProgressEvent[] };
const QUICK_ON = { "quick-answer": { mode: "live" } };
const QUICK_BODY = { tool: "quick-answer", input: { question: "ما أجر العامل عند الفصل؟" }, idempotencyKey: "key-abcdef01" };
const SECRET_FOUND: Retrieved = {
  sources: [{ sid: "S1", kind: "article", title: "نظام العمل — المادة ٧٧", text: "NEVER" }],
  map: { S1: { kind: "article", id: "labor__art-77", title: "نظام العمل — المادة ٧٧", url: "/laws/labor#labor__art-77" } },
};

function libraryDeps(over: Partial<StartRunDeps> = {}, calls: Array<{ path: string }> = []): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      calls.push(call);
      if (call.path === LIB_QUERIES_PATH) {
        return { kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: ["أجر العامل"] } } };
      }
      return call.mode === "async"
        ? { kind: "accepted" }
        : { kind: "result", result: { run_id: RUN, status: "succeeded", output: { answer: "الجواب" }, citations: ["S1"] } };
    },
    libraryAccess: async () => null,
    retrieve: async () => SECRET_FOUND,
    ...over,
  };
}
const collector = (reported: Reported[]) => (runId: string, userId: string, events: ProgressEvent[]) => {
  reported.push({ runId, userId, events });
};
const kindsOf = (reported: Reported[]) => reported.flatMap((r) => r.events.map((e) => e.kind));

test("E3: progress gets files, then searches, then law titles, never texts", async () => {
  const { client } = db({ setting: QUICK_ON });
  const reported: Reported[] = [];
  const r = await startRunWith(client as never, libraryDeps({ progress: collector(reported) }), LAWYER, QUICK_BODY);
  assert.equal(r.status, 200);
  assert.deepEqual(kindsOf(reported), ["query", "law", "step"]);
  assert.ok(reported.every((x) => x.runId === RUN && x.userId === LAWYER.userId), "each report names the run and its owner");
  assert.deepEqual(reported[1].events, [{ kind: "law", label: "نظام العمل — المادة ٧٧" }]);
  assert.deepEqual(reported[2].events, [{ kind: "step", label: STEP_LABEL_AR.sent }]);
  assert.ok(!JSON.stringify(reported).includes("NEVER"));
});

test("E3: the step is reported before the tool is called, so a slow tool shows it", async () => {
  const { client } = db({ setting: QUICK_ON });
  const order: string[] = [];
  const deps = libraryDeps({
    progress: (_r, _u, events) => order.push(...events.map((e) => e.kind)),
  });
  const n8n = deps.n8n;
  deps.n8n = async (call) => {
    order.push(call.path);
    return n8n(call);
  };
  await startRunWith(client as never, deps, LAWYER, QUICK_BODY);
  assert.deepEqual(order, [LIB_QUERIES_PATH, "query", "law", "step", "nzamy-ai/quick-answer"]);
});

test("E3: a pasted file reports its fixed name; neither the text, the link nor a real file's link is reported", async () => {
  const { client } = db({ setting: PASTE_ON });
  const reported: Reported[] = [];
  const secretFile = { ...REAL_FILE, name: "ملف.pdf", url: "https://s/SECRET-SIGNED-LINK" };
  const memo = `SECRET-PASTED-TEXT ${"م".repeat(300)}`;
  const deps = pasteDeps({
    progress: collector(reported),
    resolveFiles: async () => ({ ok: true, files: [secretFile], pages: 2 }),
    pastedFileUrl: () => "https://site.test/api/v1/ai/file-text/SECRET-TOKEN",
  });
  const r = await startRunWith(client as never, deps, LAWYER, briefBody({ client_capacity: "مدعٍ", memo_text: memo }, { fileIds: ["37"] }));
  assert.equal(r.status, 422, "brief-check takes one file: the paste is refused first when a real file is there");
  assert.equal(reported.length, 0, "a refusal reports nothing");

  const { client: c2 } = db({ setting: PASTE_ON });
  const r2 = await startRunWith(c2 as never, { ...deps, resolveFiles: undefined }, LAWYER, briefBody({ client_capacity: "مدعٍ", memo_text: memo }));
  assert.equal(r2.status, 202);
  assert.deepEqual(reported[0].events, [{ kind: "file", label: "نص المذكرة (ملصق).txt" }]);

  const { client: c3 } = db({ setting: PASTE_ON });
  reported.length = 0;
  await startRunWith(c3 as never, deps, LAWYER, warBody({ ...WAR_INPUT, docs_text: memo }, { fileIds: ["37"] }));
  assert.deepEqual(reported[0].events.map((e) => e.label), ["ملف.pdf", "نص المستندات (ملصق).txt"]);
  const text = JSON.stringify(reported);
  for (const secret of ["SECRET-PASTED-TEXT", "SECRET-SIGNED-LINK", "SECRET-TOKEN"]) assert.ok(!text.includes(secret), secret);
});

test("E3: a progress that throws never touches the money path", async () => {
  const { client, log } = db({ setting: QUICK_ON });
  const logged = console.error;
  const lines: unknown[][] = [];
  console.error = (...args: unknown[]) => void lines.push(args);
  try {
    const r = await startRunWith(client as never, libraryDeps({ progress: () => { throw new Error("SECRET"); } }), LAWYER, QUICK_BODY);
    assert.equal(r.status, 200);
  } finally {
    console.error = logged;
  }
  assert.ok(!rpcs(log).includes("ai_fail_run"));
  assert.ok(!JSON.stringify(lines).includes("SECRET"));
});

test("E3: a refusal and a duplicate report nothing", async () => {
  const reported: Reported[] = [];
  const { client } = db({ setting: QUICK_ON, start: { error: { code: "P0001", message: "insufficient_points" } } });
  await startRunWith(client as never, libraryDeps({ progress: collector(reported) }), LAWYER, QUICK_BODY);
  const { client: c2 } = db({ setting: QUICK_ON, start: { data: [{ run_id: RUN, created: false, status: "running", charged: true, charged_points: 20 }] } });
  await startRunWith(c2 as never, libraryDeps({ progress: collector(reported) }), LAWYER, QUICK_BODY);
  assert.deepEqual(reported, []);
});

test("E3: a job's callback reports the library's citation check by count, to the run's owner", async () => {
  const running = { id: RUN, user_id: "owner-1", tool: "brief-check", status: "running", class: "job", source_ids: {}, input: { client_capacity: "مدعٍ" } };
  const { client } = fakeDb((q: FakeQuery) => {
    if (q.table === "ai_runs" && q.op === "select") return { data: running };
    if (q.table === "ai_runs" && q.op === "update") return { data: [{ id: RUN }] };
    return {};
  });
  const admin = Object.assign(client, {
    schema: () => ({
      from: (table: string) =>
        table === "laws"
          ? { select: () => ({ ilike: () => ({ limit: async () => ({ data: [{ slug: "labor", title: "نظام العمل", status: "active" }], error: null }) }) }) }
          : { select: () => ({ in: () => ({ in: async () => ({ data: [{ id: "labor__art-80", number: 80, status: "active", law_slug: "labor" }], error: null }) }) }) },
    }),
  });
  const reported: Reported[] = [];
  const r = await callbackWith(
    admin as never,
    {
      run_id: RUN,
      status: "succeeded",
      output: {
        summary: "SECRET-SUMMARY",
        findings: [{ severity: "high", location: "الدفع", issue: "لا سند", fix: "أضف المادة (80)" }],
        cited: [{ law: "نظام العمل", article: 80, as_written: "SECRET-QUOTE" }],
      },
      citations: [],
    },
    { progress: collector(reported) },
  );
  assert.equal(r.body.final, "succeeded");
  assert.deepEqual(reported, [{ runId: RUN, userId: "owner-1", events: [{ kind: "verify", label: "تحقق من ١ إحالة نظامية في المكتبة" }] }]);
});

test("E3: a failed or repeated callback reports nothing, and a callback without progress still settles", async () => {
  const running = { id: RUN, user_id: "owner-1", tool: "echo-job", status: "running", class: "job", source_ids: {} };
  const reported: Reported[] = [];
  for (const run of [running, { ...running, status: "succeeded" }]) {
    const { client } = db({ run });
    await callbackWith(client as never, { run_id: RUN, status: "failed", error: { code: "model_error" } }, { progress: collector(reported) });
  }
  assert.deepEqual(reported, []);
  const { client } = db({ run: running });
  assert.equal((await callbackWith(client as never, { run_id: RUN, status: "succeeded", output: { echo: "x" } })).status, 200);
});

test("E3: both routes bind progress through progressSink and after", () => {
  for (const segs of [["runs"], ["callback"]]) {
    const route = readFileSync(join(process.cwd(), "src", "app", "api", "v1", "ai", ...segs, "route.ts"), "utf8");
    assert.match(route, /import \{[^}]*\bafter\b[^}]*\} from "next\/server"/, segs[0]);
    assert.match(route, /progress: progressSink\(admin, \(work\) => after\(work\)\)/, segs[0]);
  }
});

// ── E4: a job run answers before its searches; every way out ends visibly ─────

const CONSULT_ON = { "legal-opinion-consult": { mode: "live" } };
const CONSULT_BODY = {
  tool: "legal-opinion-consult",
  input: { question: "هل يحق لصاحب العمل فصل العامل دون إنذار؟" },
  idempotencyKey: "key-abcdef01",
};
const CONSULT_START = { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: 75 }] };
const failCalls = (log: FakeQuery[]) => log.filter((q) => q.op === "rpc" && q.table === "ai_fail_run");
const failCode = (q: FakeQuery) => (q.payload as Record<string, unknown>).p_code;

function capture() {
  const tasks: Array<() => Promise<void>> = [];
  return { tasks, defer: (task: () => Promise<void>) => void tasks.push(task) };
}

async function quietly<T>(fn: () => Promise<T> | T, seen: { text: string } = { text: "" }): Promise<T> {
  const saved = { error: console.error, warn: console.warn, info: console.info, log: console.log };
  const spy = (...args: unknown[]) => {
    seen.text += `${args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}: ${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`;
  };
  console.error = spy;
  console.warn = spy;
  console.info = spy;
  console.log = spy;
  try {
    return await fn();
  } finally {
    Object.assign(console, saved);
  }
}

test("E4: a job tool answers 202 before lib-queries, retrieval and the webhook, then dispatches", async () => {
  const { client, log } = db({ setting: CONSULT_ON, start: CONSULT_START });
  const calls: Array<{ path: string }> = [];
  const { tasks, defer } = capture();
  let retrieved = 0;
  const deps = libraryDeps({ defer, retrieve: async () => ((retrieved += 1), SECRET_FOUND) }, calls);
  const r = await startRunWith(client as never, deps, LAWYER, CONSULT_BODY);
  assert.equal(r.status, 202);
  assert.deepEqual(r.body, { runId: RUN, status: "running", chargedPoints: 75, creditUsed: false });
  assert.deepEqual(rpcs(log), ["ai_start_run"], "charged, nothing refunded");
  assert.equal(calls.length, 0, "no call to n8n yet");
  assert.equal(retrieved, 0, "no retrieval yet");
  assert.equal(tasks.length, 1);

  await tasks[0]();
  assert.deepEqual(calls.map((c) => c.path), [LIB_QUERIES_PATH, "nzamy-ai/legal-opinion-consult"]);
  assert.equal(retrieved, 1);
  assert.equal(failCalls(log).length, 0, "accepted by n8n: the run stays running for its callback");
  const sent = (calls[1] as unknown as { body: Record<string, unknown> }).body;
  assert.equal((sent.respond as Record<string, unknown>).mode, "async", "the package is unchanged");
  assert.equal((sent.sources as unknown[]).length, 1);
});

test("E4 (must prove): a debit taken before the 202 is refunded once when the dispatch fails", async () => {
  const outcomes: Array<[N8nOutcome, string]> = [
    [{ kind: "failed", code: "n8n_unreachable", detail: "connection refused" }, "n8n_unreachable"],
    [{ kind: "failed", code: "n8n_unconfigured", detail: "unset" }, "n8n_unconfigured"],
    [{ kind: "failed", code: "n8n_http", detail: "HTTP 500" }, "n8n_http"],
    [{ kind: "failed", code: "timeout", detail: "no answer" }, "timeout"],
    [{ kind: "failed", code: "bad_reply", detail: "not JSON" }, "bad_reply"],
  ];
  for (const [outcome, code] of outcomes) {
    const { client, log } = db({ setting: { "echo-job": { mode: "live" } } });
    const { tasks, defer } = capture();
    const r = await startRunWith(client as never, { ...deps(outcome), defer }, LAWYER, body({ tool: "echo-job" }));
    assert.equal(r.status, 202, code);
    assert.equal(failCalls(log).length, 0, `${code}: nothing refunded before the dispatch ran`);
    await tasks[0]();
    assert.deepEqual(failCalls(log).map(failCode), [code], `${code}: refunded exactly once`);
  }
});

test("E4: every failure in the background searches refunds under its own code", async () => {
  const none: Retrieved = { sources: [], map: {} };
  {
    // The search writer answered nothing.
    const { client, log } = db({ setting: CONSULT_ON, start: CONSULT_START });
    const { tasks, defer } = capture();
    const deps = libraryDeps({ defer, n8n: async () => ({ kind: "failed", code: "n8n_unreachable", detail: "down" }) });
    assert.equal((await startRunWith(client as never, deps, LAWYER, CONSULT_BODY)).status, 202);
    await tasks[0]();
    assert.deepEqual(failCalls(log).map(failCode), ["no_queries"]);
  }
  {
    // No library text matched.
    const { client, log } = db({ setting: CONSULT_ON, start: CONSULT_START });
    const { tasks, defer } = capture();
    const calls: Array<{ path: string }> = [];
    assert.equal((await startRunWith(client as never, libraryDeps({ defer, retrieve: async () => none }, calls), LAWYER, CONSULT_BODY)).status, 202);
    await tasks[0]();
    assert.deepEqual(failCalls(log).map(failCode), ["no_sources"]);
    assert.deepEqual(calls.map((c) => c.path), [LIB_QUERIES_PATH], "the tool itself is never called");
  }
  {
    // The sources could not be stored.
    const { client, log } = fakeDb((q: FakeQuery) => {
      if (q.table === "platform_settings") return { data: { value: CONSULT_ON } };
      if (q.op === "rpc" && q.table === "ai_start_run") return CONSULT_START;
      if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
      if (q.table === "ai_runs" && q.op === "update") return { error: { code: "XX000", message: "down" } };
      return {};
    });
    const { tasks, defer } = capture();
    await quietly(async () => {
      assert.equal((await startRunWith(client as never, libraryDeps({ defer }), LAWYER, CONSULT_BODY)).status, 202);
      await tasks[0]();
    });
    assert.deepEqual(failCalls(log).map(failCode), ["store_failed"]);
  }
});

test("E4: a retrieval that throws refunds as no_sources, and its message is not logged", async () => {
  const { client, log } = db({ setting: CONSULT_ON, start: CONSULT_START });
  const { tasks, defer } = capture();
  const seen = { text: "" };
  await quietly(async () => {
    const deps = libraryDeps({ defer, retrieve: async () => { throw new Error("SECRET law text"); } });
    assert.equal((await startRunWith(client as never, deps, LAWYER, CONSULT_BODY)).status, 202);
    await tasks[0]();
  }, seen);
  assert.deepEqual(failCalls(log).map(failCode), ["no_sources"]);
  assert.match(seen.text, /retrieval threw/);
  assert.ok(!seen.text.includes("SECRET"));
});

test("E4: a background throw refunds as internal, carries no text to the log or the row, and the task itself never rejects", async () => {
  const thrown: unknown[] = ["SECRET non-error", new Error("SECRET error with a token"), { message: "SECRET" }, null];
  for (const value of thrown) {
    const { client, log } = db({ setting: CONSULT_ON, start: CONSULT_START });
    const { tasks, defer } = capture();
    const seen = { text: "" };
    await quietly(async () => {
      const deps = libraryDeps({ defer, n8n: async () => { throw value; } });
      assert.equal((await startRunWith(client as never, deps, LAWYER, CONSULT_BODY)).status, 202);
      await tasks[0]();
    }, seen);
    assert.deepEqual(failCalls(log).map(failCode), ["internal"]);
    const message = (failCalls(log)[0].payload as Record<string, unknown>).p_message as string;
    assert.ok(!message.includes("SECRET"), message);
    assert.ok(!seen.text.includes("SECRET"), seen.text);
  }
});

test("E4: a refund that cannot be recorded leaves the task resolved, for the sweeper to retry", async () => {
  const replies: Array<() => Promise<{ data: unknown; error: unknown }> | never> = [
    () => Promise.resolve({ data: null, error: { code: "XX000", message: "down" } }),
    () => Promise.reject(new Error("SECRET network")),
  ];
  for (const reply of replies) {
    const { client } = db({ setting: { "echo-job": { mode: "live" } } });
    const realRpc = (client as unknown as { rpc: (fn: string, args: unknown) => unknown }).rpc;
    (client as unknown as { rpc: unknown }).rpc = (fn: string, args: unknown) => (fn === "ai_fail_run" ? reply() : realRpc(fn, args));
    const { tasks, defer } = capture();
    const seen = { text: "" };
    await quietly(async () => {
      const r = await startRunWith(client as never, { ...deps({ kind: "failed", code: "n8n_unreachable", detail: "x" }), defer }, LAWYER, body({ tool: "echo-job" }));
      assert.equal(r.status, 202);
      await tasks[0]();
    }, seen);
    assert.match(seen.text, /ai_fail_run/, "the operator is told");
    assert.ok(!seen.text.includes("SECRET"));
  }
});

test("E4: when the background cannot be scheduled, the run goes the old way: dispatched in the request, refunded if it fails", async () => {
  const refuse = () => { throw new Error("`after` was called outside a request scope"); };
  {
    const { client, log } = db({ setting: { "echo-job": { mode: "live" } } });
    const seen: unknown[] = [];
    const r = await quietly(() => startRunWith(client as never, { ...deps({ kind: "accepted" }, seen), defer: refuse }, LAWYER, body({ tool: "echo-job" })));
    assert.equal(r.status, 202);
    assert.equal(seen.length, 1, "dispatched once, in the request");
    assert.equal(failCalls(log).length, 0);
  }
  {
    const { client, log } = db({ setting: { "echo-job": { mode: "live" } } });
    const r = await quietly(() =>
      startRunWith(client as never, { ...deps({ kind: "failed", code: "n8n_unreachable", detail: "x" }), defer: refuse }, LAWYER, body({ tool: "echo-job" })),
    );
    assert.equal(r.status, 502);
    assert.equal(r.body.runId, RUN);
    assert.deepEqual(failCalls(log).map(failCode), ["n8n_unreachable"]);
  }
});

test("E4 (must prove): a duplicate request is not charged again, not dispatched again, and not refunded", async () => {
  const replies = [
    { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: 1 }] },
    { data: [{ run_id: RUN, created: false, status: "running", charged: true, charged_points: 1 }] },
  ];
  let starts = 0;
  const { client, log } = fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: ON } };
    if (q.op === "rpc" && q.table === "ai_start_run") return replies[starts++];
    return {};
  });
  const seen: unknown[] = [];
  const { tasks, defer } = capture();
  const d = { ...deps({ kind: "accepted" }, seen), defer };
  const first = await startRunWith(client as never, d, LAWYER, body({ tool: "echo-job" }));
  const second = await startRunWith(client as never, d, LAWYER, body({ tool: "echo-job" }));
  assert.equal(first.status, 202);
  assert.equal(second.status, 409);
  assert.equal(second.body.code, "duplicate");
  assert.equal(second.body.runId, RUN);
  assert.equal(tasks.length, 1, "scheduled once");
  await tasks[0]();
  assert.equal(seen.length, 1, "dispatched once");
  assert.equal(failCalls(log).length, 0, "the first run is not refunded by the second request");
  // The charge itself is one transaction keyed on (user_id, idempotency_key):
  // supabase/tests/rls/progress_events.test.sql T7 proves one debit in Postgres.
});

test("E4: refusals before the charge never schedule anything", async () => {
  const { client } = db({ setting: CONSULT_ON, start: { error: { code: "P0001", message: "insufficient_points" } } });
  const { tasks, defer } = capture();
  const r = await startRunWith(client as never, libraryDeps({ defer }), LAWYER, CONSULT_BODY);
  assert.equal(r.status, 402);
  assert.equal(tasks.length, 0);
});

test("E4: a link that cannot be signed still refunds in the request, before anything is scheduled", async () => {
  const { client, log } = db({ setting: PASTE_ON });
  const { tasks, defer } = capture();
  const r = await quietly(() =>
    startRunWith(client as never, { ...pasteDeps({ pastedFileUrl: () => { throw new Error("SECRET"); } }), defer }, LAWYER, briefBody()),
  );
  assert.equal(r.status, 502);
  assert.equal(tasks.length, 0);
  assert.deepEqual(failCalls(log).map(failCode), ["paste_link_failed"]);
});

test("E4: a pasted run dispatches after the 202 with its link in the file, and only there", async () => {
  const { client, log } = db({ setting: PASTE_ON });
  const seen: Array<{ body: Record<string, unknown> }> = [];
  const { tasks, defer } = capture();
  const r = await startRunWith(client as never, { ...pasteDeps({}, seen), defer }, LAWYER, briefBody());
  assert.equal(r.status, 202);
  assert.equal(JSON.stringify(r.body).includes("https://s/t/"), false, "the link never reaches the browser");
  assert.equal(seen.length, 0);
  await tasks[0]();
  assert.equal(seen.length, 1);
  assert.equal(((seen[0].body.files as Array<{ url: string }>)[0]).url, `https://s/t/${RUN}/memo_text`);
  assert.equal("memo_text" in (seen[0].body.input as Record<string, unknown>), false);
  assert.equal(failCalls(log).length, 0);
});

test("E4: a credit run answers 202 with creditUsed, and a failed dispatch still goes through ai_fail_run", async () => {
  const { client, log } = creditDb();
  const { tasks, defer } = capture();
  const d: StartRunDeps = { ...drafterDeps(), defer, n8n: async () => ({ kind: "failed", code: "n8n_unreachable", detail: "x" }) };
  const r = await startRunWith(client as never, d, LAWYER, drafterBody(issuesInput({ kind: "appeal" })));
  assert.equal(r.status, 202);
  assert.equal(r.body.creditUsed, true);
  assert.equal(r.body.chargedPoints, 0);
  assert.equal(typeof r.body.conversationId, "string", "the next turn can still join this conversation");
  await tasks[0]();
  assert.deepEqual(failCalls(log).map(failCode), ["no_queries"]);
});

test("E4: fast tools stay in the request even when defer is given: their callers read the answer in the reply", async () => {
  const { client } = db();
  const { tasks, defer } = capture();
  const r = await startRunWith(client as never, { ...deps(okReply()), defer }, LAWYER, body());
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.output, { echo: "مرحبا" });
  assert.equal(tasks.length, 0);
});

test("E4: a fast tool that throws is refunded in the request too, not left to the sweeper", async () => {
  const { client, log } = db();
  const r = await quietly(() =>
    startRunWith(client as never, { ...deps(okReply()), n8n: async () => { throw new Error("SECRET"); } }, LAWYER, body()),
  );
  assert.equal(r.status, 502);
  assert.equal(r.body.code, "tool_failed");
  assert.deepEqual(failCalls(log).map(failCode), ["internal"]);
});

test("E4 (must prove): the callers that read an answer in the reply call only fast tools", () => {
  for (const [segs, tool] of [
    [["app", "ai", "assistant", "_assistant-client.ts"], "assistant"],
    [["app", "laws", "[slug]", "_library-assistant.ts"], "library-assistant"],
    [["app", "dashboard", "business", "kanban", "_graph-ai-card.ts"], "canvas-card"],
  ] as Array<[string[], string]>) {
    const src = readFileSync(join(process.cwd(), "src", ...segs), "utf8");
    assert.ok(src.includes(`tool: "${tool}"`), `${segs.join("/")} still calls ${tool}`);
    assert.equal(AI_TOOLS[tool].class, "fast", `${tool} stays in the request`);
  }
});

test("E4: the outer catch of both routes logs a thrown value by name only", () => {
  for (const segs of [["runs"], ["callback"]]) {
    const route = readFileSync(join(process.cwd(), "src", "app", "api", "v1", "ai", ...segs, "route.ts"), "utf8");
    assert.doesNotMatch(route, /(POST failed:|\/callback\] threw:)", err\)/, segs[0]);
  }
});

test("E4: the runs route defers through after", () => {
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "v1", "ai", "runs", "route.ts"), "utf8");
  assert.match(route, /defer: \(task\) => after\(task\)/);
});

test("E4: nothing protected reaches a log or the progress on any path through the background", async () => {
  const PASTED = `SECRET-PASTED ${"م".repeat(300)}`;
  const LINK = "https://site.test/api/v1/ai/file-text/SECRET-TOKEN";
  const paths: Array<[string, N8nOutcome | "throw"]> = [
    ["accepted", { kind: "accepted" }],
    ["unreachable", { kind: "failed", code: "n8n_unreachable", detail: "SECRET-DETAIL" }],
    ["throw", "throw"],
  ];
  for (const [name, outcome] of paths) {
    const { client } = db({ setting: PASTE_ON });
    const reported: Reported[] = [];
    const { tasks, defer } = capture();
    const seen = { text: "" };
    await quietly(async () => {
      const d = pasteDeps({
        defer,
        progress: collector(reported),
        pastedFileUrl: () => LINK,
        n8n: async () => {
          if (outcome === "throw") throw new Error(`SECRET-THROW ${LINK}`);
          return outcome;
        },
      });
      assert.equal((await startRunWith(client as never, d, LAWYER, briefBody({ client_capacity: "مدعٍ", memo_text: PASTED }))).status, 202, name);
      await tasks[0]();
    }, seen);
    assert.ok(!seen.text.includes("SECRET"), `${name}: the log is clean: ${seen.text}`);
    assert.ok(!JSON.stringify(reported).includes("SECRET"), `${name}: the progress is clean`);
    assert.ok(reported.length > 0, `${name}: the progress did run`);
  }
});

// ── E6: progress details from n8n ───────────────────────────────────────────

const E6_RUN = { id: RUN, user_id: "owner-1", tool: "echo-job", status: "running", class: "job", source_ids: {} };

test("E6: a progress callback with detail records a note", async () => {
  const reported: Reported[] = [];
  const { client } = db({ run: E6_RUN });
  const r = await callbackWith(
    client as never,
    { run_id: RUN, status: "progress", step: "reading", kind: "note", detail: "يقرأ ٢ ملف" },
    { progress: collector(reported) },
  );
  assert.equal(r.status, 200);
  assert.deepEqual(reported, [{ runId: RUN, userId: "owner-1", events: [{ kind: "note", label: "يقرأ ٢ ملف" }] }]);
});

test("E6: without detail the step label is used", async () => {
  const reported: Reported[] = [];
  const { client } = db({ run: E6_RUN });
  await callbackWith(client as never, { run_id: RUN, status: "progress", step: "drafting" }, { progress: collector(reported) });
  assert.deepEqual(reported[0].events, [{ kind: "step", label: "يكتب الناتج" }]);
});

test("E6: a strange kind is a step, a detail is cleaned, a blank one falls back to the label", async () => {
  const reported: Reported[] = [];
  const { client } = db({ run: E6_RUN });
  const progress = collector(reported);
  await callbackWith(client as never, { run_id: RUN, status: "progress", step: "reading", kind: "law", detail: "  سطر\n\tثانٍ " }, { progress });
  await callbackWith(client as never, { run_id: RUN, status: "progress", step: "reviewing", detail: " \n " }, { progress });
  await callbackWith(client as never, { run_id: RUN, status: "progress", step: "reading", detail: 42 }, { progress });
  assert.deepEqual(reported.flatMap((x) => x.events), [
    { kind: "step", label: "سطر ثانٍ" },
    { kind: "step", label: "يراجع الناتج" },
    { kind: "step", label: "يقرأ المستندات" },
  ]);
});

test("E6: a bad step, or a post that arrives after the run ended, records nothing and the app still answers", async () => {
  const reported: Reported[] = [];
  const progress = collector(reported);
  const running = db({ run: E6_RUN });
  assert.equal((await callbackWith(running.client as never, { run_id: RUN, status: "progress", step: "hacking", detail: "x" }, { progress })).status, 400);
  const ended = db({ run: { ...E6_RUN, status: "succeeded" } });
  assert.equal((await callbackWith(ended.client as never, { run_id: RUN, status: "progress", step: "drafting", detail: "متأخر" }, { progress })).status, 200);
  assert.deepEqual(reported, []);
});

test("E6: an old n8n's bare progress post still moves the step, with no progress sink at all", async () => {
  const { client, log } = db({ run: E6_RUN });
  assert.equal((await callbackWith(client as never, { run_id: RUN, status: "progress", step: "reading" })).status, 200);
  assert.deepEqual(log.find((q) => q.op === "update")!.payload, { progress_step: "reading" });
});
