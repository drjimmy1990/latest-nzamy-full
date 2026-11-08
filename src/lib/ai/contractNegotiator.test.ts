/**
 * contractNegotiator.test.ts — the negotiator job: 150 points for lawyers and firms,
 * off until an admin opens it, no file and no retrieval. An output that does not
 * answer the clauses it was given, in their order, fails the run and is refunded; an
 * article it cites and the library does not hold is stored as not_found.
 *
 * The money tests assert the exact refusal, not only that nothing was charged: an
 * unknown tool is not charged either, so "no charge" alone would pass with no code.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/contractNegotiator.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { callbackWith, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { ProgressEvent } from "./progressEvents.ts";
import { AI_TOOLS, CONTRACT_NEGOTIATOR_PRICE, NEGOTIATOR_CLAUSES_MAX } from "./tools.ts";
import { aiToolLabelAr, AI_TOOL_PAGES } from "./toolLabels.ts";
import { aiToolPointRange, registryPointsLabel, type PricedAiToolId } from "./toolPointsDisplay.ts";
import { isPointsStandingTool } from "./pointsStanding.ts";
import { creditKindForRun } from "../membership/founderPlan.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const TOOL = AI_TOOLS["contract-negotiator"];
const CLAUSE_TEXT = "يلتزم المستأجر بدفع غرامة عن كل يوم تأخير بلا سقف";
const clauseIn = (over: Record<string, unknown> = {}) => ({ text: CLAUSE_TEXT, their_demand: "إبقاء البند", our_goal: "سقف للغرامة", ...over });
const input = { our_party: "المستأجر", contract_type: "عقد إيجار", clauses: [clauseIn(), clauseIn(), clauseIn()] };
const alternative = (over: Record<string, unknown> = {}) => ({ stance: "firm", text: "تُحذف الغرامة", rationale: "لا سقف لها", ...over });
const clauseOut = (index: number, over: Record<string, unknown> = {}) => ({
  index,
  issue: "الغرامة بلا سقف",
  risk: "high",
  alternatives: [alternative(), alternative({ stance: "balanced" }), alternative({ stance: "flexible" })],
  fallback: "سقف بقيمة شهر",
  ...over,
});
const output = (over: Record<string, unknown> = {}) => ({
  summary: "ثلاثة بنود للتفاوض",
  clauses: [clauseOut(0), clauseOut(1), clauseOut(2)],
  cited: [{ law: "نظام المعاملات المدنية", article: 1, as_written: "المادة ١" }],
  ...over,
});

// ── the registry entry ───────────────────────────────────────────────────────

test("the registry entry: 150 points, lawyers and firms only (owner ٤١٧, 8 Nov), off by default, no files, no retrieval", () => {
  assert.equal(CONTRACT_NEGOTIATOR_PRICE, 150);
  assert.equal(NEGOTIATOR_CLAUSES_MAX, 10);
  assert.equal(TOOL.price({}, { pages: 0, turn: 0 }), 150);
  assert.equal(TOOL.n8nPath, "nzamy-ai/contract-negotiator");
  assert.equal(TOOL.class, "job");
  assert.equal(TOOL.tier, "deep");
  assert.deepEqual([...TOOL.roles], ["lawyer", "firm"]);
  assert.equal(TOOL.consultantBlocked, false);
  assert.equal(TOOL.dailyLimit, 5);
  assert.equal(TOOL.defaultMode, "off");
  assert.equal(TOOL.jobDeadlineSeconds, 15 * 60);
  assert.equal(TOOL.files, undefined);
  assert.equal(TOOL.retrieval, undefined);
});

test("a founder credit never pays for it", () => {
  assert.equal(creditKindForRun("contract-negotiator", {}, 0), null);
});

test("R2: label, page, and the shown price is the charged price", () => {
  assert.equal(aiToolLabelAr("contract-negotiator"), "مفاوض العقود");
  assert.equal(AI_TOOL_PAGES["contract-negotiator"], "/ai/contract-negotiator");
  assert.deepEqual([...aiToolPointRange("contract-negotiator" as PricedAiToolId)], [150, 150]);
  assert.equal(registryPointsLabel("contract-negotiator", "ar"), "١٥٠");
});

test("q296: the points-standing route does not answer for it — its short reply carries the price", () => {
  assert.equal(isPointsStandingTool("contract-negotiator"), false);
});

// ── the input ────────────────────────────────────────────────────────────────

test("the input: one to ten clauses, each field within its limit, refused and never cut", () => {
  const v = TOOL.validateInput;
  const none = { ok: false, error: "ألصق بنداً واحداً على الأقل (حتى ١٠ بنود)" };
  assert.deepEqual(v({ our_party: "المستأجر" }), none);
  assert.deepEqual(v({ our_party: "المستأجر", clauses: [] }), none);
  assert.deepEqual(v({ our_party: "المستأجر", clauses: "نص" }), none);
  assert.deepEqual(v({ our_party: "المستأجر", clauses: Array.from({ length: 11 }, () => clauseIn()) }), none);
  assert.equal(v({ our_party: "المستأجر", clauses: Array.from({ length: 10 }, () => clauseIn()) }).ok, true);

  assert.equal(v({ clauses: [clauseIn()] }).ok, false, "our party is required");
  assert.equal(v({ our_party: "  ", clauses: [clauseIn()] }).ok, false);
  assert.equal(v({ our_party: "x".repeat(150), clauses: [clauseIn()] }).ok, true);
  assert.equal(v({ our_party: "x".repeat(151), clauses: [clauseIn()] }).ok, false);
  assert.equal(v({ our_party: "م", contract_type: "x".repeat(151), clauses: [clauseIn()] }).ok, false);

  const one = (over: Record<string, unknown>) => v({ our_party: "م", clauses: [clauseIn(over)] }).ok;
  assert.equal(one({ text: "x".repeat(19) }), false);
  assert.equal(one({ text: "x".repeat(20) }), true);
  assert.equal(one({ text: "x".repeat(4000) }), true);
  assert.equal(one({ text: "x".repeat(4001) }), false);
  assert.equal(one({ text: 7 }), false);
  assert.equal(one({ their_demand: "x".repeat(1501) }), false);
  assert.equal(one({ our_goal: "x".repeat(1501) }), false);

  const clean = v({ our_party: " المستأجر ", contract_type: " ", clauses: [{ text: `  ${CLAUSE_TEXT}  `, their_demand: " ", our_goal: null, extra: "يُسقط" }], extra: "يُسقط" });
  assert.deepEqual(clean, {
    ok: true,
    input: { our_party: "المستأجر", contract_type: null, clauses: [{ text: CLAUSE_TEXT, their_demand: null, our_goal: null }] },
  });
});

// ── the output ───────────────────────────────────────────────────────────────

test("the output: answers each clause in order, and hands back only the known fields", () => {
  const r = TOOL.validateOutput(output({ extra: 1 }), input) as { summary: string; clauses: Array<Record<string, unknown>>; cited: unknown[]; extra?: unknown };
  assert.equal(r.clauses.length, 3);
  assert.deepEqual(r.clauses.map((c) => c.index), [0, 1, 2]);
  assert.equal(r.cited.length, 1);
  assert.equal(r.extra, undefined);
  assert.equal(TOOL.validateOutput(output({ clauses: [clauseOut(0, { alternatives: [alternative()] }), clauseOut(1), clauseOut(2)] }), input) === null, false, "one alternative is allowed");
  assert.equal((TOOL.validateOutput(output({ cited: Array.from({ length: 50 }, () => ({})) }), input) as { cited: unknown[] }).cited.length, 40);
});

test("a clause that was not in the input fails the run: wrong count, wrong order, or an index that does not exist", () => {
  const bad: Array<[string, unknown]> = [
    ["two for three", output({ clauses: [clauseOut(0), clauseOut(1)] })],
    ["four for three", output({ clauses: [clauseOut(0), clauseOut(1), clauseOut(2), clauseOut(3)] })],
    ["swapped", output({ clauses: [clauseOut(1), clauseOut(0), clauseOut(2)] })],
    ["an index past the end", output({ clauses: [clauseOut(0), clauseOut(1), clauseOut(9)] })],
    ["1-based", output({ clauses: [clauseOut(1), clauseOut(2), clauseOut(3)] })],
    ["index as text", output({ clauses: [clauseOut(0), clauseOut(1), clauseOut(2, { index: "2" })] })],
    ["index missing", output({ clauses: [clauseOut(0), clauseOut(1), clauseOut(2, { index: undefined })] })],
  ];
  for (const [name, raw] of bad) assert.equal(TOOL.validateOutput(raw, input), null, name);
});

test("the output is all or nothing", () => {
  const third = (over: Record<string, unknown>) => output({ clauses: [clauseOut(0), clauseOut(1), clauseOut(2, over)] });
  const bad: Array<[string, unknown]> = [
    ["not an object", null],
    ["no clauses", output({ clauses: undefined })],
    ["no summary", output({ summary: "" })],
    ["summary too long", output({ summary: "x".repeat(3001) })],
    ["issue too long", third({ issue: "x".repeat(1501) })],
    ["unknown risk", third({ risk: "severe" })],
    ["a number for a risk", third({ risk: 70 })],
    ["no alternatives", third({ alternatives: [] })],
    ["four alternatives", third({ alternatives: [alternative(), alternative(), alternative(), alternative()] })],
    ["unknown stance", third({ alternatives: [alternative({ stance: "aggressive" })] })],
    ["alternative with no text", third({ alternatives: [alternative({ text: "" })] })],
    ["alternative too long", third({ alternatives: [alternative({ text: "x".repeat(4001) })] })],
    ["rationale too long", third({ alternatives: [alternative({ rationale: "x".repeat(1501) })] })],
    ["fallback too long", third({ fallback: "x".repeat(1501) })],
    ["a clause that is no object", output({ clauses: [clauseOut(0), clauseOut(1), "نص"] })],
  ];
  for (const [name, raw] of bad) assert.equal(TOOL.validateOutput(raw, input), null, name);
});

test("owner ١٩٣: no percentage anywhere in the output", () => {
  const third = (over: Record<string, unknown>) => output({ clauses: [clauseOut(0), clauseOut(1), clauseOut(2, over)] });
  const leaks: Array<[string, unknown]> = [
    ["rationale", third({ alternatives: [alternative({ rationale: "فرصة القبول ٨٠%" })] })],
    ["text", third({ alternatives: [alternative({ text: "تخفض إلى ٢٪" })] })],
    ["issue", third({ issue: "احتمال الخسارة 70 %" })],
    ["fallback", third({ fallback: "سقف ۵٪" })],
    ["summary", output({ summary: "فرصتك 80%" })],
    ["cited", output({ cited: [{ law: "نظام", article: 1, as_written: "٥٪" }] })],
  ];
  for (const [name, raw] of leaks) assert.equal(TOOL.validateOutput(raw, input), null, name);
});

// ── the money ────────────────────────────────────────────────────────────────

const ROLES = ["lawyer", "firm"];
const OUTSIDERS = ["individual", "corporate", "micro", "provider", "government", "ngo", "arbitrator", "translator", "", "client"];
const actor = (userType: string): RunActor => ({ userId: "u-1", userType, practiceKind: "advocate", displayName: null });
const rpcs = (log: FakeQuery[]) => log.filter((q) => q.op === "rpc").map((q) => q.table);

function db(setting: unknown) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: setting } };
    if (q.op === "rpc" && q.table === "ai_start_run") return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: 150 }] };
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    return {};
  });
}

function deps(over: Partial<StartRunDeps> = {}) {
  const state = { n8n: 0 };
  const d: StartRunDeps = {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async () => {
      state.n8n += 1;
      return { kind: "accepted" };
    },
    ...over,
  };
  return { d, state };
}
const body = (over: Record<string, unknown> = {}) => ({ tool: "contract-negotiator", input, idempotencyKey: "key-abcdef01", ...over });

test("off: nobody is charged, for every role, whether the setting is empty, unreadable or says off", async () => {
  for (const setting of [null, {}, { "contract-negotiator": { mode: "off" } }]) {
    for (const role of [...ROLES, "admin"]) {
      const { client, log } = db(setting);
      const { d, state } = deps();
      const r = await startRunWith(client as never, d, actor(role), body());
      assert.equal(r.status, 423, role);
      assert.equal(r.body.code, "tool_off", role);
      assert.deepEqual(rpcs(log), [], `${role}: no money function`);
      assert.equal(state.n8n, 0, role);
    }
  }
});

test("staff: a lawyer and a firm are refused before the charge; an admin runs it exempt", async () => {
  const setting = { "contract-negotiator": { mode: "staff" } };
  for (const role of ROLES) {
    const { client, log } = db(setting);
    const { d, state } = deps();
    const r = await startRunWith(client as never, d, actor(role), body());
    assert.equal(r.body.code, "tool_off", role);
    assert.deepEqual(rpcs(log), [], role);
    assert.equal(state.n8n, 0, role);
  }
  const { client, log } = db(setting);
  const r = await startRunWith(client as never, deps().d, actor("admin"), body());
  assert.equal(r.status, 202);
  assert.equal((log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>).p_exempt, true);
});

test("any other role is refused before any charge, in every mode, and the setting is not read", async () => {
  for (const mode of ["off", "staff", "live"]) {
    for (const role of OUTSIDERS) {
      const { client, log } = db({ "contract-negotiator": { mode } });
      const { d, state } = deps();
      const r = await startRunWith(client as never, d, actor(role), body());
      assert.equal(r.status, 403, `${role}/${mode}`);
      assert.equal(r.body.code, "role", `${role}/${mode}`);
      assert.deepEqual(rpcs(log), [], `${role}/${mode}`);
      assert.equal(log.some((q) => q.table === "platform_settings"), false, "the role comes first");
      assert.equal(state.n8n, 0);
    }
  }
});

test("live: a lawyer and a firm are charged exactly the price shown, however many clauses", async () => {
  for (const role of ROLES) {
    for (const n of [1, 10]) {
      const { client, log } = db({ "contract-negotiator": { mode: "live" } });
      const { d, state } = deps();
      const r = await startRunWith(client as never, d, actor(role), body({ input: { our_party: "م", clauses: Array.from({ length: n }, () => clauseIn()) } }));
      assert.equal(r.status, 202, role);
      const start = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
      assert.equal(start.p_price, CONTRACT_NEGOTIATOR_PRICE);
      assert.equal(start.p_price, 150);
      assert.equal(start.p_exempt, false);
      assert.equal(state.n8n, 1);
    }
  }
});

test("eleven clauses are refused before the charge", async () => {
  const { client, log } = db({ "contract-negotiator": { mode: "live" } });
  const r = await startRunWith(client as never, deps().d, actor("lawyer"), body({ input: { our_party: "م", clauses: Array.from({ length: 11 }, () => clauseIn()) } }));
  assert.equal(r.status, 422);
  assert.deepEqual(rpcs(log), []);
});

test("the pasted clauses never reach the progress events or the error log", async () => {
  const { client } = db({ "contract-negotiator": { mode: "live" } });
  const events: ProgressEvent[] = [];
  const logged: unknown[][] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args);
  try {
    const r = await startRunWith(client as never, deps({ progress: (_run, _user, e) => void events.push(...e) }).d, actor("lawyer"), body());
    assert.equal(r.status, 202);
  } finally {
    console.error = realError;
  }
  assert.ok(events.length > 0, "the waiting screen did get its events");
  assert.equal(JSON.stringify(events).includes(CLAUSE_TEXT), false);
  assert.equal(JSON.stringify(logged).includes(CLAUSE_TEXT), false);
});

// ── settling ─────────────────────────────────────────────────────────────────

function settling() {
  const stored: Array<Record<string, unknown>> = [];
  const { client, log } = fakeDb((q: FakeQuery) => {
    if (q.table === "ai_runs" && q.op === "select") return { data: { id: RUN, user_id: "u-1", tool: "contract-negotiator", status: "running", class: "job", source_ids: {}, input } };
    if (q.table === "ai_runs" && q.op === "update") {
      stored.push(q.payload as Record<string, unknown>);
      return { data: [{ id: RUN }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    return {};
  });
  // The library the enricher reads: نظام العمل has article 80 and nothing else.
  const admin = Object.assign(client, {
    schema: () => ({
      from: (table: string) =>
        table === "laws"
          ? { select: () => ({ ilike: () => ({ limit: async () => ({ data: [{ slug: "labor", title: "نظام العمل", status: "active" }], error: null }) }) }) }
          : { select: () => ({ in: () => ({ in: async () => ({ data: [{ id: "labor__art-80", number: 80, status: "active", law_slug: "labor" }], error: null }) }) }) },
    }),
  });
  return { admin, log, stored };
}

test("a failed job is refunded once, through ai_fail_run", async () => {
  const { admin, log, stored } = settling();
  const r = await callbackWith(admin as never, { run_id: RUN, status: "failed", output: null, citations: [], error: { code: "model_failed", message: "no reply" } });
  assert.equal(r.status, 200);
  assert.deepEqual(rpcs(log), ["ai_fail_run"]);
  assert.equal(stored.length, 0);
});

test("an output naming a clause the input did not have, or a percentage, is refunded once and stored nowhere", async () => {
  for (const bad of [
    output({ clauses: [clauseOut(0), clauseOut(1)] }),
    output({ clauses: [clauseOut(0), clauseOut(1), clauseOut(9)] }),
    output({ clauses: [clauseOut(0), clauseOut(1), clauseOut(2, { alternatives: [alternative({ rationale: "فرصة القبول ٨٠%" })] })] }),
    {},
  ]) {
    const { admin, log, stored } = settling();
    await callbackWith(admin as never, { run_id: RUN, status: "succeeded", output: bad, citations: [] });
    assert.deepEqual(rpcs(log), ["ai_fail_run"]);
    assert.equal((log.find((q) => q.table === "ai_fail_run")!.payload as Record<string, unknown>).p_code, "schema_invalid");
    assert.equal(stored.length, 0);
  }
});

test("a cited article the library does not hold is stored as not_found, and the model's list is gone", async () => {
  const { admin, log, stored } = settling();
  const r = await callbackWith(admin as never, {
    run_id: RUN,
    status: "succeeded",
    output: output({ cited: [{ law: "نظام العمل", article: 80, as_written: "المادة (80)" }, { law: "نظام العمل", article: 999 }] }),
    citations: [],
  });
  assert.deepEqual(r.body, { ok: true, final: "succeeded" });
  assert.deepEqual(rpcs(log), []);
  const out = stored[0].output as Record<string, unknown>;
  assert.equal(out.cited, undefined);
  assert.deepEqual((out.citation_check as Array<{ article: number; status: string }>).map((c) => [c.article, c.status]), [[80, "ok"], [999, "not_found"]]);
});

test("a risk the model wrote differently is normalised here too; anything else still refuses", () => {
  const read = (risk: unknown) =>
    TOOL.validateOutput(output({ clauses: [clauseOut(0, { risk }), clauseOut(1), clauseOut(2)] }), input) as { clauses: Array<{ risk: string }> } | null;
  for (const [written, word] of [["High", "high"], [" MEDIUM ", "medium"], ["مرتفع", "high"], ["متوسط", "medium"], ["منخفض", "low"]]) {
    assert.equal(read(written)?.clauses[0].risk, word, written);
  }
  for (const bad of ["critical", "", "constructor", null, 1]) assert.equal(read(bad), null, String(bad));
});
