/**
 * freeQuestion.test.ts — owner ٣٠ (18 Nov 2026, batch l7 decision 6): the free
 * questions are given ONCE per account (10 lawyer / 5 individual) on the
 * LIBRARY ASSISTANT, replacing owner ٤١٢'s daily free quick question. The
 * status (the database's count, fails closed), and the run start: with
 * questions left a library question starts at price 0 through
 * ai_start_free_question with no opt-in; a refusal goes the normal way (the
 * founder credit, else the price shown) and is never an unlocked free run.
 * The allowance, the count under the lock and the grants are proved in Docker
 * (supabase/tests/rls/points_wallets_l7.test.sql).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/freeQuestion.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import { AI_TOOLS, LIB_QUERIES_PATH } from "./tools.ts";
import {
  FREE_QUESTION_COPY,
  freeQuestionFallsBack,
  freeQuestionStatusFrom,
  freeQuestionStatusWith,
  freeQuestionToolFor,
  freeQuestionToolSettingIssue,
  parseFreeQuestionTool,
  parseIndividualFreeQuestionTool,
} from "./freeQuestion.ts";

const USER = "00000000-0000-0000-0000-00000000d001";
const RUN = "11111111-2222-4333-8444-555555555555";
const NONE = { available: false, left: 0, total: 0 };

// ── the status ───────────────────────────────────────────────────────────────

test("status: the database's {allowance, used} → left; none, malformed or used up → not available", () => {
  assert.deepEqual(freeQuestionStatusFrom([{ allowance: 10, used: 3 }]), { available: true, left: 7, total: 10 });
  assert.deepEqual(freeQuestionStatusFrom({ allowance: 5, used: 5 }), { available: false, left: 0, total: 5 });
  assert.deepEqual(freeQuestionStatusFrom({ allowance: 5, used: 9 }), { available: false, left: 0, total: 5 });
  assert.deepEqual(freeQuestionStatusFrom({ allowance: 0, used: 0 }), NONE);
  assert.deepEqual(freeQuestionStatusFrom({ allowance: "10", used: 0 }), NONE);
  assert.deepEqual(freeQuestionStatusFrom(null), NONE);
});

test("status: read through ai_free_question_status; any error (the SQL not run yet) or a throw is none", async () => {
  const ok = fakeDb((q) => (q.table === "ai_free_question_status" ? { data: [{ allowance: 10, used: 1 }] } : {}));
  assert.deepEqual(await freeQuestionStatusWith(ok.client as never, USER), { available: true, left: 9, total: 10 });
  assert.deepEqual(ok.log[0].payload, { p_user: USER });
  const missing = fakeDb(() => ({ error: { code: "PGRST202", message: "not found" } }));
  assert.deepEqual(await freeQuestionStatusWith(missing.client as never, USER), NONE);
  const throwing = { rpc: () => { throw new Error("boom"); } };
  assert.deepEqual(await freeQuestionStatusWith(throwing as never, USER), NONE);
});

test("the copy counts in Arabic digits", () => {
  assert.equal(FREE_QUESTION_COPY.left(3, 10), "أسئلتك المجانية المتبقية: ٣ من ١٠ — تُستخدم قبل النقاط");
});

test("refusals that fall back: used / not eligible / SQL missing / the old quick-answer-only function", () => {
  for (const e of [
    { message: "free_question_used" }, { message: "free_question_not_eligible" },
    { code: "42883" }, { code: "PGRST202" }, { code: "42P01" }, { code: "22023", message: "ai_start_free_question: invalid arguments" },
  ]) assert.equal(freeQuestionFallsBack(e), true, JSON.stringify(e));
  for (const e of [null, { message: "daily_limit" }, { message: "insufficient_points" }, { code: "57014" }]) {
    assert.equal(freeQuestionFallsBack(e), false, JSON.stringify(e));
  }
});

// ── the run start ────────────────────────────────────────────────────────────

const LAWYER: RunActor = { userId: USER, userType: "lawyer", practiceKind: "advocate", displayName: null };

function db(freeError: { code?: string; message: string } | null = null) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: { "library-assistant": { mode: "live" }, "quick-answer": { mode: "live" } } } };
    if (q.op === "rpc" && q.table === "ai_start_free_question" && freeError) return { error: freeError };
    if (q.op === "rpc" && q.table.startsWith("ai_start")) {
      const price = q.table === "ai_start_free_question" ? 0 : ((q.payload as Record<string, unknown>).p_price as number);
      return { data: [{ run_id: RUN, created: true, status: "running", charged: price > 0, charged_points: price }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    return {};
  });
}
function deps(over: Partial<StartRunDeps> = {}): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) =>
      call.path === LIB_QUERIES_PATH
        ? { kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: ["فسخ الإيجار"] } } }
        : { kind: "failed", code: "timeout", detail: "test" },
    libraryAccess: async () => null,
    retrieve: async () => ({ sources: [{ sid: "S1", kind: "article", title: "t", text: "…" }], map: { S1: { kind: "article", id: "a" } } }) as never,
    ...over,
  };
}
const ask = (over: Record<string, unknown> = {}) => ({
  tool: "library-assistant", input: { message: "ما شروط فسخ عقد الإيجار؟" }, idempotencyKey: "key-free-0001", ...over,
});
const starts = (log: FakeQuery[]) => log.filter((q) => q.op === "rpc" && q.table.startsWith("ai_start"));

test("the registry: the library assistant (lawyer's 10) and quick-answer (individual's 5, register 4 / 36) have the free questions, and only they", () => {
  assert.deepEqual(Object.values(AI_TOOLS).filter((t) => t.freeQuestions).map((t) => t.id).sort(), ["library-assistant", "quick-answer"]);
  assert.equal(freeQuestionToolFor("individual"), "quick-answer");
  for (const t of ["lawyer", "firm", "corporate", "micro", "provider", "government", "ngo", "", null, undefined]) {
    assert.equal(freeQuestionToolFor(t), "library-assistant", String(t));
  }
  assert.equal(parseFreeQuestionTool("quick-answer"), "quick-answer");
  assert.equal(parseFreeQuestionTool("library-assistant"), "library-assistant");
  // Q121 (l12): «المساعد المتقدم» is the setting's other choice for an individual.
  assert.equal(parseFreeQuestionTool("assistant"), "assistant");
  assert.equal(parseFreeQuestionTool("contract-review"), null);
  assert.equal(AI_TOOLS["library-assistant"].price({}, { pages: null }), 5);
  assert.equal(AI_TOOLS["quick-answer"].price({}, { pages: null }), 10);
});

test("start: questions left → ai_start_free_question, no opt-in, before the founder credit", async () => {
  const { client, log } = db();
  let creditAsked = false;
  await startRunWith(client as never, deps({ freeQuestions: async () => true, founderLibraryCredit: async () => { creditAsked = true; return true; } }), LAWYER, ask());
  const s = starts(log);
  assert.equal(s.length, 1);
  assert.equal(s[0].table, "ai_start_free_question");
  assert.equal((s[0].payload as Record<string, unknown>).p_tool, "library-assistant");
  assert.equal((s[0].payload as Record<string, unknown>).p_credit_kind, undefined);
  assert.equal(creditAsked, false);
});

test("start: none left (or the read throws) → the usual 5-point start", async () => {
  for (const freeQuestions of [async () => false, async () => { throw new Error("x"); }]) {
    const { client, log } = db();
    await startRunWith(client as never, deps({ freeQuestions }), LAWYER, ask());
    assert.equal(starts(log)[0].table, "ai_start_run");
    assert.equal((starts(log)[0].payload as Record<string, unknown>).p_price, 5);
  }
});

test("start: a refusal falls back once — to the founder credit when he holds one, else the price", async () => {
  {
    const { client, log } = db({ code: "P0001", message: "free_question_used" });
    await startRunWith(client as never, deps({ freeQuestions: async () => true }), LAWYER, ask());
    assert.deepEqual(starts(log).map((q) => q.table), ["ai_start_free_question", "ai_start_run"]);
    assert.equal((starts(log)[1].payload as Record<string, unknown>).p_price, 5);
  }
  {
    const { client, log } = db({ code: "PGRST202", message: "Could not find the function" });
    await startRunWith(client as never, deps({ freeQuestions: async () => true, founderLibraryCredit: async () => true }), LAWYER, ask({ idempotencyKey: "key-free-0002" }));
    assert.deepEqual(starts(log).map((q) => q.table), ["ai_start_free_question", "ai_start_run_with_credit"]);
    assert.equal((starts(log)[1].payload as Record<string, unknown>).p_credit_kind, "library_question");
  }
});

test("start: another tool or an admin never takes a free question", async () => {
  const { client, log } = db();
  await startRunWith(client as never, deps({ freeQuestions: async () => true }), LAWYER, {
    tool: "quick-answer", input: { question: "متى يحق للمؤجر فسخ عقد الإيجار؟" }, idempotencyKey: "key-free-0003", useFreeQuestion: true,
  });
  assert.equal(starts(log)[0].table, "ai_start_run");
  const admin = db();
  await startRunWith(admin.client as never, deps({ freeQuestions: async () => true }), { ...LAWYER, userType: "admin" }, ask({ idempotencyKey: "key-free-0004" }));
  assert.notEqual(starts(admin.log)[0]?.table, "ai_start_free_question");
});

// ── source contracts ─────────────────────────────────────────────────────────

test("source contract: the runs route wires the status; the status route signs the user in and fails closed", () => {
  const runs = readFileSync("src/app/api/v1/ai/runs/route.ts", "utf8");
  // ٥٨ (l8): only an e-mail-verified account
  assert.match(runs, /freeQuestions: async \(userId\) =>\s*Boolean\(user\.email_confirmed_at\) && \(await freeQuestionStatusWith\(admin, userId\)\)\.available/);
  const src = readFileSync("src/app/api/v1/ai/free-question/route.ts", "utf8");
  assert.match(src, /requireApiUser/);
  assert.match(src, /freeQuestionStatusWith\(admin, auth\.user\.id\)/);
  // ٥٨ (l8): none for an unverified e-mail, none while the library is locked for the account
  assert.match(src, /if \(!auth\.user\.email_confirmed_at\) return NextResponse\.json\(NONE/);
  // register 4 / 36 (l9): the library lock only for the library assistant's questions;
  // a tool that is not the account's own free tool answers NONE
  assert.match(src, /if \(asked === FREE_QUESTION_TOOL && !\(await readLibraryAccountAccess\(auth\.user\.id\)\)\.allowed\) \{\s*return NextResponse\.json\(NONE/);
  // Q121 (l12): the account's tool comes from the setting (an individual's).
  assert.match(src, /if \(asked !== \(await freeQuestionToolOf\(admin, profile\?\.user_type\)\)\) return NextResponse\.json\(NONE/);
  assert.match(src, /const NONE = \{ available: false, left: 0, total: 0 \}/);
});

test("source contract: the library AI tab shows the count only when the server says some are left", () => {
  const src = readFileSync("src/app/laws/components/AiTabContent.tsx", "utf8");
  assert.match(src, /fetch\("\/api\/v1\/ai\/free-question"/);
  assert.match(src, /s\.available === true/);
  assert.match(src, /\{free && <>/);
});

// ── register 4 / 36 (batch l9): each account type on its own free tool ──────

const INDIVIDUAL: RunActor = { userId: USER, userType: "individual", practiceKind: "advocate", displayName: null };
const quick = () => ({ tool: "quick-answer", input: { question: "ما مدة الاعتراض على الحكم؟" }, idempotencyKey: "key-free-qa-01" });

test("an individual's question on quick-answer starts free; on the library assistant it does not", async () => {
  const one = db();
  await startRunWith(one.client as never, deps({ freeQuestions: async () => true }), INDIVIDUAL, quick());
  assert.equal(starts(one.log)[0]?.table, "ai_start_free_question");
  assert.equal((starts(one.log)[0].payload as Record<string, unknown>).p_tool, "quick-answer");

  const two = db();
  let asked = false;
  await startRunWith(two.client as never, deps({ freeQuestions: async () => { asked = true; return true; } }), INDIVIDUAL, ask({ idempotencyKey: "key-free-ind-lib" }));
  assert.equal(asked, false, "the status is not even asked on another tool");
  assert.notEqual(starts(two.log)[0]?.table, "ai_start_free_question");
});

test("a lawyer's question on quick-answer is never free (his are on the library assistant)", async () => {
  const { client, log } = db();
  let asked = false;
  await startRunWith(client as never, deps({ freeQuestions: async () => { asked = true; return true; } }), LAWYER, quick());
  assert.equal(asked, false);
  assert.equal(starts(log)[0]?.table, "ai_start_run");
});

test("source contract (l9 + Q121 l12): an account's free questions open its OWN free tool's Pro rule, nothing else; the library switch still applies", () => {
  const runs = readFileSync("src/app/api/v1/ai/runs/route.ts", "utf8").replace(/\r\n/g, "\n");
  assert.match(runs, /const gateRefused = await libraryGate\(\{ accountLock: isLibraryAiTool\(toolId\) \}\);/);
  assert.match(runs, /const refused = gateRefused \?\? \(\(freeOpensTier && \(await freeOpensTier\(toolId\)\)\) \? null : await libraryAiAccess\(toolId\)\);/);
  // Q121 (l12): the individual's quick-answer, the lawyer's library assistant.
  assert.match(runs, /const freeTool = await freeQuestionToolOf\(admin, userType\);/);
  assert.match(runs, /freeQuestionTool: freeTool,/);
  assert.match(runs, /if \(toolId !== freeTool\) return false;/);
  assert.match(runs, /if \(!user\.email_confirmed_at\) return false;/);
  // only while points are enforced (off: no use row is written, the opener would never close)
  assert.match(runs, /if \(enforcement\.error \|\| \(enforcement\.data as \{ value\?: unknown \} \| null\)\?\.value !== true\) return false;/);
  assert.match(runs, /return \(await freeQuestionStatusWith\(admin, user\.id\)\)\.available;/);
});

// ── Q121 (batch l12, 20261202_50): the individual's tool is a setting ───────

test("Q121: the setting — quick-answer by default, «المساعد المتقدم» the other choice, nothing else", () => {
  assert.equal(parseIndividualFreeQuestionTool(undefined), "quick-answer");
  assert.equal(parseIndividualFreeQuestionTool({ individual: "assistant" }), "assistant");
  assert.equal(parseIndividualFreeQuestionTool({ individual: "library-assistant" }), "quick-answer");
  assert.equal(freeQuestionToolFor("individual", "assistant"), "assistant");
  assert.equal(freeQuestionToolFor("lawyer", "assistant"), "library-assistant", "the setting never moves a lawyer's 10");
  assert.equal(freeQuestionToolSettingIssue({ individual: "assistant" }), null);
  assert.notEqual(freeQuestionToolSettingIssue({ individual: "library-assistant" }), null);
  assert.notEqual(freeQuestionToolSettingIssue({ individual: "quick-answer", lawyer: "quick-answer" }), null);
  assert.notEqual(freeQuestionToolSettingIssue("quick-answer"), null);
});

test("Q121: runCore follows the actor's tool — an individual switched to the assistant gets no free quick-answer", async () => {
  const { client, log } = db();
  let asked = false;
  await startRunWith(client as never, deps({ freeQuestions: async () => { asked = true; return true; } }),
    { ...INDIVIDUAL, freeQuestionTool: "assistant" }, { ...quick(), idempotencyKey: "key-free-q121-01" });
  assert.equal(asked, false, "the status is not asked on a tool that is not the account's");
  assert.notEqual(starts(log)[0]?.table, "ai_start_free_question");
  const two = db();
  await startRunWith(two.client as never, deps({ freeQuestions: async () => true }),
    { ...LAWYER, freeQuestionTool: "library-assistant" }, ask({ idempotencyKey: "key-free-q121-02" }));
  assert.equal(starts(two.log)[0]?.table, "ai_start_free_question", "a lawyer's library question is free while some are left");
  const sql = readFileSync("supabase/migrations/20261202_50_l12_rules.sql", "utf8");
  assert.match(sql, /p_tool not in \('library-assistant', 'quick-answer', 'assistant'\)/);
  assert.match(sql, /if p_tool is distinct from public\.ai_free_question_tool\(p_user\) then/);
  assert.match(sql, /\('free_question_tool_by_account_type', '\{"individual": "quick-answer"\}'::jsonb,/);
});
