/**
 * freeQuestion.test.ts — owner ٤١٢ (batch 2026-11-08 B4): one free quick question
 * a day per VERIFIED phone of an individual account, inert until phone OTP exists.
 * The Riyadh day (midnight Riyadh = 21:00 UTC), eligibility (a typed
 * profiles.phone never counts), the status the page reads (fails closed), and the
 * run start: ai_start_free_question at price 0 only when asked, every refusal
 * uncharged and never turned into a charge or an unlocked free run. The claim
 * table, its uniqueness across accounts and its RLS are proved in Docker
 * (supabase/tests/rls/free_daily_question_1108.test.sql).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/freeQuestion.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeDb, has, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import { AI_TOOLS, LIB_QUERIES_PATH } from "./tools.ts";
import {
  FREE_QUESTION_COPY,
  freeQuestionEligible,
  freeQuestionStatusWith,
  freeRunRefundText,
  riyadhDay,
} from "./freeQuestion.ts";

const USER = "00000000-0000-0000-0000-00000000d001";
const RUN = "11111111-2222-4333-8444-555555555555";

// ── the Riyadh day ───────────────────────────────────────────────────────────

test("riyadhDay: the day turns at 21:00 UTC (midnight in Riyadh, UTC+3 all year)", () => {
  assert.equal(riyadhDay(new Date("2026-11-08T20:59:59.999Z")), "2026-11-08");
  assert.equal(riyadhDay(new Date("2026-11-08T21:00:00.000Z")), "2026-11-09");
  assert.equal(riyadhDay(new Date("2026-11-08T00:30:00.000Z")), "2026-11-08", "03:30 Riyadh");
  assert.equal(riyadhDay(new Date("2026-12-31T21:00:00.000Z")), "2027-01-01", "the year turns in Riyadh first");
  assert.equal(riyadhDay(new Date("2028-02-28T21:30:00.000Z")), "2028-02-29", "leap day");
  // Summer and winter alike: no daylight saving in Saudi Arabia.
  assert.equal(riyadhDay(new Date("2026-07-01T20:59:00.000Z")), "2026-07-01");
  assert.equal(riyadhDay(new Date("2026-07-01T21:00:00.000Z")), "2026-07-02");
});

// ── eligibility ──────────────────────────────────────────────────────────────

test("eligible: an individual account with a server-verified Saudi mobile, nothing else", () => {
  assert.equal(freeQuestionEligible({ userType: "individual", verifiedPhone: "+966500000001" }), true);
  assert.equal(freeQuestionEligible({ userType: "individual", verifiedPhone: null }), false, "not verified");
  assert.equal(freeQuestionEligible({ userType: "individual", verifiedPhone: "0500000001" }), false, "a typed local number is not a verified one");
  for (const t of ["lawyer", "firm", "corporate", "micro", "admin", ""]) {
    assert.equal(freeQuestionEligible({ userType: t, verifiedPhone: "+966500000001" }), false, t);
  }
});

// ── the status the page reads ────────────────────────────────────────────────

type Answers = {
  userType?: string;
  phone?: string | null;
  phoneError?: { code: string; message: string };
  claim?: { run_id: string | null } | null;
  claimError?: { code: string; message: string };
  runStatus?: string;
};
function statusDb(a: Answers) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "profiles") return { data: { user_type: a.userType ?? "individual" } };
    if (q.table === "verified_phones") return a.phoneError ? { error: a.phoneError } : { data: a.phone === null ? null : { phone_e164: a.phone ?? "+966500000001" } };
    if (q.table === "ai_free_question_claims") return a.claimError ? { error: a.claimError } : { data: a.claim ?? null };
    if (q.table === "ai_runs") return { data: { status: a.runStatus ?? "succeeded" } };
    return {};
  });
}
const NOW = new Date("2026-11-08T21:30:00.000Z");

test("status: open to a verified individual with no claim today, keyed on the phone and the Riyadh day", async () => {
  const { client, log } = statusDb({});
  assert.deepEqual(await freeQuestionStatusWith(client, USER, NOW), { available: true });
  const claim = log.find((q) => q.table === "ai_free_question_claims")!;
  assert.ok(has(claim, "eq", "phone_e164", "+966500000001"));
  assert.ok(has(claim, "eq", "riyadh_day", "2026-11-09"), "21:30 UTC is already the next day in Riyadh");
});

test("status: closed for another account type, an unverified phone, or today's claim taken; open again when that run failed", async () => {
  const lawyer = statusDb({ userType: "lawyer" });
  assert.deepEqual(await freeQuestionStatusWith(lawyer.client, USER, NOW), { available: false });
  assert.equal(lawyer.log.some((q) => q.table === "verified_phones"), false, "nothing else is read");
  assert.deepEqual(await freeQuestionStatusWith(statusDb({ phone: null }).client, USER, NOW), { available: false });
  assert.deepEqual(await freeQuestionStatusWith(statusDb({ claim: { run_id: RUN }, runStatus: "succeeded" }).client, USER, NOW), { available: false });
  assert.deepEqual(await freeQuestionStatusWith(statusDb({ claim: { run_id: RUN }, runStatus: "running" }).client, USER, NOW), { available: false });
  assert.deepEqual(await freeQuestionStatusWith(statusDb({ claim: { run_id: null } }).client, USER, NOW), { available: false });
  assert.deepEqual(await freeQuestionStatusWith(statusDb({ claim: { run_id: RUN }, runStatus: "failed" }).client, USER, NOW), { available: true });
});

test("status fails closed: tables not created yet (42P01 / PGRST205) or any read error → not available", async () => {
  for (const code of ["42P01", "PGRST205", "57014"]) {
    assert.deepEqual(await freeQuestionStatusWith(statusDb({ phoneError: { code, message: "x" } }).client, USER, NOW), { available: false }, code);
    assert.deepEqual(await freeQuestionStatusWith(statusDb({ claimError: { code, message: "x" } }).client, USER, NOW), { available: false }, code);
  }
  const throwing = { from: () => { throw new Error("boom"); } };
  assert.deepEqual(await freeQuestionStatusWith(throwing as never, USER, NOW), { available: false });
});

// ── the run start ────────────────────────────────────────────────────────────

const INDIVIDUAL: RunActor = { userId: USER, userType: "individual", practiceKind: "advocate", displayName: null };

function db(startError: { code?: string; message: string } | null = null) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: { "quick-answer": { mode: "live" }, communicate: { mode: "live" } } } };
    if (q.op === "rpc" && q.table.startsWith("ai_start")) {
      if (startError) return { error: startError };
      const price = (q.payload as Record<string, unknown>).p_price as number;
      return { data: [{ run_id: RUN, created: true, status: "running", charged: price > 0, charged_points: price }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    return {};
  });
}
function deps(): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    // The answer itself is not what these tests look at: the start is.
    n8n: async (call) =>
      call.path === LIB_QUERIES_PATH
        ? { kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: ["فسخ الإيجار"] } } }
        : { kind: "failed", code: "timeout", detail: "test" },
    libraryAccess: async () => null,
    retrieve: async () => ({ sources: [{ sid: "S1", kind: "article", title: "t", text: "…" }], map: { S1: { kind: "article", id: "a" } } }) as never,
  };
}
const ask = (over: Record<string, unknown> = {}) => ({
  tool: "quick-answer", input: { question: "متى يحق للمؤجر فسخ عقد الإيجار؟" }, idempotencyKey: "key-free-0001", ...over,
});
const start = (log: FakeQuery[]) => log.find((q) => q.op === "rpc" && q.table.startsWith("ai_start"));

test("quick-answer stays 10 points; the registry marks it as the free-daily-question tool, and only it", () => {
  assert.equal(AI_TOOLS["quick-answer"].price({}, { pages: null }), 10);
  assert.deepEqual(Object.values(AI_TOOLS).filter((t) => t.freeDailyQuestion).map((t) => t.id), ["quick-answer"]);
});

test("start: without useFreeQuestion the question is the usual 10-point ai_start_run", async () => {
  const { client, log } = db();
  await startRunWith(client as never, deps(), INDIVIDUAL, ask());
  assert.equal(start(log)!.table, "ai_start_run");
  assert.equal((start(log)!.payload as Record<string, unknown>).p_price, 10);
});

test("start: useFreeQuestion → ai_start_free_question at price 0, never a founder credit", async () => {
  const { client, log } = db();
  await startRunWith(client as never, deps(), INDIVIDUAL, ask({ useFreeQuestion: true, useCredit: true }));
  const s = start(log)!;
  assert.equal(s.table, "ai_start_free_question");
  const p = s.payload as Record<string, unknown>;
  assert.equal(p.p_price, 0);
  assert.equal(p.p_tool, "quick-answer");
  assert.equal(p.p_credit_kind, undefined);
});

test("start: useFreeQuestion on any other tool is ignored (its own price, its own start)", async () => {
  const { client, log } = db();
  await startRunWith(client as never, deps(), { ...INDIVIDUAL, userType: "lawyer" }, {
    tool: "communicate", input: { type: "letter", tone: "رسمي", body: "نص الرسالة" }, idempotencyKey: "key-free-0002", useFreeQuestion: true,
  });
  assert.equal(start(log)!.table, "ai_start_run");
});

test("start: every refusal is uncharged and never retried as a charge or an unlocked free run", async () => {
  for (const [err, status, code, error] of [
    [{ code: "P0001", message: "free_question_used" }, 409, "free_question_used", FREE_QUESTION_COPY.used],
    [{ code: "P0001", message: "free_question_not_eligible" }, 403, "free_question_not_eligible", FREE_QUESTION_COPY.notEligible],
    [{ code: "42883", message: "function public.ai_start_free_question does not exist" }, 503, "free_question_unavailable", FREE_QUESTION_COPY.unavailable],
    [{ code: "PGRST202", message: "Could not find the function" }, 503, "free_question_unavailable", FREE_QUESTION_COPY.unavailable],
    [{ code: "42P01", message: "relation public.verified_phones does not exist" }, 503, "free_question_unavailable", FREE_QUESTION_COPY.unavailable],
  ] as const) {
    const { client, log } = db(err);
    const r = await startRunWith(client as never, deps(), INDIVIDUAL, ask({ useFreeQuestion: true }));
    assert.equal(r.status, status, err.message);
    assert.equal(r.body.code, code);
    assert.equal(r.body.error, error);
    assert.equal(log.filter((q) => q.op === "rpc" && q.table.startsWith("ai_start")).length, 1, "one start, no fallback");
  }
});

test("a free question that failed says the free question was not used, not that points came back", () => {
  assert.equal(freeRunRefundText("تعذّر إكمال الطلب، وأُعيدت نقاطك", true), "تعذّر إكمال الطلب، ولم يُحتسب سؤالك المجاني");
  assert.equal(freeRunRefundText("لا تجيب النصوص المتاحة في المكتبة عن هذا السؤال — أُعيدت نقاطك.", true), "لا تجيب النصوص المتاحة في المكتبة عن هذا السؤال — لم يُحتسب سؤالك المجاني.");
  assert.equal(freeRunRefundText("تعذّر إكمال الطلب، وأُعيدت نقاطك", false), "تعذّر إكمال الطلب، وأُعيدت نقاطك");
});

// ── source contracts ─────────────────────────────────────────────────────────

test("source contract: /ai/quick-answer offers the free question only when the server says it is open", () => {
  const src = readFileSync("src/app/ai/quick-answer/page.tsx", "utf8");
  assert.match(src, /fetch\("\/api\/v1\/ai\/free-question"/);
  assert.match(src, /freeOpen \? \{ useFreeQuestion: true \} : \{\}/);
  assert.match(src, /\{freeOpen && \(\s*<span[\s\S]*?FREE_QUESTION_COPY\.badge/);
  assert.match(src, /freeOpen \? FREE_QUESTION_COPY\.price : /);
  assert.match(src, /useState\(false\)/, "closed until the server answers");
  assert.equal(FREE_QUESTION_COPY.badge, "سؤالك المجاني اليوم");
});

test("source contract: the status route signs the user in and fails closed", () => {
  const src = readFileSync("src/app/api/v1/ai/free-question/route.ts", "utf8");
  assert.match(src, /requireApiUser/);
  assert.match(src, /freeQuestionStatusWith\(admin, auth\.user\.id\)/);
  assert.match(src, /\{ available: false \}/);
});
