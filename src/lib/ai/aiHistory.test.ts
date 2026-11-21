import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AI_HISTORY_COLUMNS,
  AI_HISTORY_TOOLS,
  AI_RUN_HIDE_CLEARS,
  historyCursor,
  historyItem,
  historyToolFilter,
  isMissingHiddenColumn,
  parseRetentionMonths,
  retentionSettingIssue,
  runAnswer,
  runQuestion,
} from "./aiHistory.ts";

const APP = join(import.meta.dirname, "../../app");
const RUN = "11111111-2222-4333-8444-555555555555";

test("the question and the answer: the tool's own field, one line, capped", () => {
  assert.equal(runQuestion({ message: "  ما حكم \n الشرط الجزائي؟ " }), "ما حكم الشرط الجزائي؟");
  assert.equal(runQuestion({ facts: "وقائع الدعوى" }), "وقائع الدعوى");
  assert.equal(runQuestion({ case: { claim: "مطالبة مالية" } }), "مطالبة مالية", "one level down");
  assert.equal(runQuestion(null), "");
  assert.equal(runQuestion({ pages: 3 }), "");
  const long = runQuestion({ message: "كلمة ".repeat(200) });
  assert.ok(long.length <= 301 && long.endsWith("…"));
  assert.equal(runAnswer({ reply: "الجواب [S1] هنا" }), "الجواب هنا", "source markers stripped");
  assert.equal(runAnswer({ answer: "ج" }), "ج");
  assert.equal(runAnswer("نص"), "نص");
});

test("historyItem: date, tool, question, answer, points; refunded = 0; a review row shows no answer", () => {
  const row = {
    id: RUN, tool: "quick-answer", status: "succeeded", charged: true, charged_points: 5, refunded_at: null,
    input: { message: "س" }, output: { reply: "ج" }, created_at: "2026-11-20T10:00:00Z",
  };
  const item = historyItem(row)!;
  assert.equal(item.toolLabel, "سؤال قانوني سريع");
  assert.equal(item.points, 5);
  assert.equal(item.question, "س");
  assert.equal(item.answer, "ج");
  assert.equal(item.href, `/ai/runs/${RUN}`);
  assert.equal(item.toolHref, "/ai/quick-answer");
  assert.equal(historyItem({ ...row, refunded_at: "2026-11-20T10:01:00Z" })!.points, 0);
  assert.equal(historyItem({ ...row, status: "review" })!.answer, "", "a held row's answer is not its owner's");
  assert.equal(historyItem({ ...row, tool: "library-assistant" })!.toolHref, "/laws");
  assert.equal(historyItem({ ...row, id: "x" }), null);
});

test("filters: only a labelled tool, never the test echo tools; the cursor is a time", () => {
  assert.equal(historyToolFilter("legal-drafter"), "legal-drafter");
  assert.equal(historyToolFilter("echo-fast"), null);
  assert.equal(historyToolFilter("x'; drop"), null);
  assert.equal(historyToolFilter(null), null);
  assert.ok(AI_HISTORY_TOOLS.every((t) => !t.id.startsWith("echo-")));
  assert.equal(historyCursor("2026-11-20T10:00:00Z"), "2026-11-20T10:00:00.000Z");
  assert.equal(historyCursor("not a date"), null);
});

test("retention setting: 1–60 months, anything else 12", () => {
  assert.equal(parseRetentionMonths({ months: 6 }), 6);
  assert.equal(parseRetentionMonths({ months: 0 }), 12);
  assert.equal(parseRetentionMonths({ months: 61 }), 12);
  assert.equal(parseRetentionMonths({ months: "6" }), 12);
  assert.equal(parseRetentionMonths(null), 12);
  assert.equal(retentionSettingIssue({ months: 12 }), null);
  assert.ok(retentionSettingIssue({ months: 0 }));
  assert.ok(retentionSettingIssue({ months: 12, extra: 1 }));
  assert.ok(retentionSettingIssue(12));
});

test("the delete clears the question, the answer and the sources, never the money facts", () => {
  assert.deepEqual(Object.keys(AI_RUN_HIDE_CLEARS).sort(), ["citations", "error_message", "input", "output", "source_ids"]);
  for (const kept of ["price_points", "charged_points", "charged", "refunded_at", "created_at"]) {
    assert.ok(!(kept in AI_RUN_HIDE_CLEARS), kept);
  }
  assert.ok(isMissingHiddenColumn({ code: "42703", message: 'column ai_runs.user_hidden_at does not exist' }));
  assert.ok(!isMissingHiddenColumn({ code: "42703", message: "column ai_runs.other does not exist" }));
  assert.ok(!isMissingHiddenColumn({ code: "42501", message: "permission denied" }));
});

test("the history columns never include usage / model / source_ids", () => {
  assert.doesNotMatch(AI_HISTORY_COLUMNS, /usage|model|source_ids|error_message/);
});

test("«سجلّي» route: every query is the SESSION user's own rows; no user id is taken from the request", () => {
  const src = readFileSync(join(APP, "api/v1/ai/history/route.ts"), "utf8");
  assert.ok(src.includes("requireApiUser(supabase, SIGN_IN)"));
  // both verbs pin the owner to the verified session
  assert.equal((src.match(/const userId = auth\.user\.id;/g) ?? []).length, 2);
  assert.equal((src.match(/\.eq\("user_id", userId\)/g) ?? []).length, 2, "the GET read and the DELETE update");
  assert.doesNotMatch(src, /searchParams\.get\("user/, "no user id from the query");
  assert.doesNotMatch(src, /request\.json\(/, "no body is read (no user id from a body)");
  // the delete never touches a running run and keeps money facts
  assert.ok(src.includes('.neq("status", "running")'));
  assert.ok(src.includes("...AI_RUN_HIDE_CLEARS"));
});

test("a deleted run is gone from its owner's run page too", () => {
  const src = readFileSync(join(APP, "api/v1/ai/runs/[id]/route.ts"), "utf8");
  assert.ok(src.includes('q.is("user_hidden_at", null)'));
  assert.ok(src.includes('.eq("user_id", auth.user.id)'));
});

test("L11-log (l12 integration): the single-screen lawyer tools show their own last five runs", () => {
  for (const tool of ["brief-check", "communicate", "contract-negotiator"]) {
    const page = readFileSync(new URL(`../../app/ai/${tool}/page.tsx`, import.meta.url), "utf8");
    assert.ok(page.includes(`<AiHistoryList isDark={isDark} tool="${tool}" recent />`), tool);
  }
});


test("L11-log (l12 integration): /privacy states the AI history retention the setting defaults to (12 months at most)", async () => {
  const { AI_RETENTION_DEFAULT_MONTHS } = await import("./aiHistory.ts");
  assert.equal(AI_RETENTION_DEFAULT_MONTHS, 12);
  const privacy = readFileSync(new URL("../../app/privacy/page.tsx", import.meta.url), "utf8");
  assert.ok(privacy.includes("أسئلتك إلى أدوات الذكاء الاصطناعي وأجوبتها تُحفظ في «سجلّي» مدة أقصاها ١٢ شهراً، ولك حذف أي منها قبل ذلك، ثم يُمسح نصها ولا يبقى إلا قيد العملية وتاريخها ونقاطها."));
  assert.ok(privacy.includes("kept in «My history» for 12 months at most"));
  const sql = readFileSync(new URL("../../../supabase/migrations/20261202_40_l12_ai_history_draft_limits.sql", import.meta.url), "utf8");
  assert.match(sql, /v_months int := 12;/, "the SQL default the page states");
});
