/**
 * _quickAnswer.test.ts — the quick answer's pure copy and its sidebar rows (S3-06).
 *
 * Owner ٤١٢ (7 Nov 2026): 10 points; the roles stay as they are. Owner ٤١٣
 * option A: an answer with no library text is shown under a label, charged.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/ai/quick-answer/_quickAnswer.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  QUICK_ANSWER_EXAMPLES,
  QUICK_ANSWER_FOLLOW_UPS,
  QUICK_ANSWER_UNGROUNDED_LABEL,
  isUngroundedAnswer,
  quickAnswerExportText,
  quickAnswerRefusalText,
} from "./_quickAnswer.ts";
import { LAWYER_SIDEBAR, FIRM_SIDEBAR } from "../../../constants/navigation.sidebars.legal.ts";
import { AI_TOOLS } from "../../../lib/ai/tools.ts";

const rows = (sidebar: typeof LAWYER_SIDEBAR) => sidebar.flatMap((g) => g.items);
const page = () => readFileSync(join(process.cwd(), "src/app/ai/quick-answer/page.tsx"), "utf8");

test("four neutral examples: no invented numbers, Latin or Arabic-Indic", () => {
  assert.equal(QUICK_ANSWER_EXAMPLES.length, 4);
  assert.equal(new Set(QUICK_ANSWER_EXAMPLES).size, 4);
  for (const q of QUICK_ANSWER_EXAMPLES) {
    assert.doesNotMatch(q, /[0-9٠-٩۰-۹]/u, q);
    assert.ok(q.length >= 8, `the page refuses a question under 8 characters: ${q}`);
  }
});

test("the refusals say the points came back; anything else keeps the server's own message", () => {
  assert.ok(quickAnswerRefusalText("no_sources")?.includes("أُعيدت نقاطك"));
  assert.ok(quickAnswerRefusalText("ungrounded")?.includes("أُعيدت نقاطك"));
  assert.equal(quickAnswerRefusalText("x"), null);
  assert.equal(quickAnswerRefusalText(null), null);
  // A refusal before any charge has its own server message and no refund claim.
  for (const code of ["tool_off", "role", "insufficient_points", "still_running"]) assert.equal(quickAnswerRefusalText(code), null, code);
});

test("the follow-ups are the three real next tools", () => {
  assert.deepEqual(QUICK_ANSWER_FOLLOW_UPS.map((f) => f.href), ["/ai/legal-opinion", "/ai/analyze", "/ai/wargaming"]);
  assert.deepEqual(QUICK_ANSWER_FOLLOW_UPS.map((f) => f.labelAr), ["الرأي الفصل", "عصارة المرفقات", "المحاكي الشامل"]);
});

test("the lawyer sidebar has one quick-answer row and keeps its one assistant row", () => {
  const lawyer = rows(LAWYER_SIDEBAR);
  const quick = lawyer.filter((r) => r.href === "/ai/quick-answer");
  assert.equal(quick.length, 1);
  assert.deepEqual(
    { label: quick[0].label, labelEn: quick[0].labelEn, icon: quick[0].icon, badge: quick[0].badge },
    { label: "سؤال قانوني سريع", labelEn: "Quick Legal Q&A", icon: "ChatCircle", badge: "قريباً" },
  );
  const assistant = lawyer.filter((r) => r.href === "/ai/assistant");
  assert.equal(assistant.length, 1);
  assert.equal(assistant[0].label, "المساعد المتقدم");
  assert.equal(assistant[0].labelEn, "Advanced Assistant");
  assert.ok(lawyer.indexOf(quick[0]) < lawyer.indexOf(assistant[0]), "the quick answer sits above the assistant");
  assert.equal(rows(FIRM_SIDEBAR).filter((r) => r.href === "/ai/quick-answer").length, 1);
});

test("٤١٢: 10 points and today's roles, with no free daily question", () => {
  const tool = AI_TOOLS["quick-answer"];
  assert.equal(tool.price({}, {} as never), 10);
  assert.deepEqual(tool.roles, ["lawyer", "firm"]);
  assert.ok(tool.retrieval, "the ungrounded rule stands on retrieval");
  assert.doesNotMatch(page(), /مجاني|سؤال يومي|free daily/i);
});

test("the page: examples, collapsible sources, the shared actions, a reset, and the stage kept (R4)", () => {
  const src = page();
  assert.ok(src.includes("QUICK_ANSWER_EXAMPLES.map"));
  assert.ok(src.includes("<details"), "the sources collapse");
  assert.ok(src.includes("open={i === 0}"), "the first source starts open");
  assert.ok(src.includes("<SourceList"));
  assert.match(src, /<AiResultActions[\s\S]{0,200}text=\{quickAnswerExportText\(stripCitationMarkers\(answer\), ungrounded\)\}[\s\S]{0,200}collectorSource="other"/);
  assert.ok(src.includes("اسأل سؤالاً آخر"));
  assert.ok(src.includes("QUICK_ANSWER_FOLLOW_UPS"));
  assert.ok(src.includes("quickAnswerRefusalText(run.code)"));
  assert.ok(src.includes("<AiThinkingStage"));
  assert.ok(src.includes('aiToolPriceText("quick-answer", "ar")'));
  assert.ok(src.includes("isConsultantBlockedPath"), "a consultant is not sent to /ai/wargaming, which refuses him");
});

test("٤١٣: an ungrounded answer is labelled on the page and in the exported text; a cited one is not", () => {
  assert.equal(QUICK_ANSWER_UNGROUNDED_LABEL, "إجابة عامة بلا سند مرجعي — تحقق منها");
  assert.equal(isUngroundedAnswer({ answer: "x", ungrounded: true }), true);
  for (const o of [{ answer: "x" }, { answer: "x", ungrounded: "true" }, null, undefined]) assert.equal(isUngroundedAnswer(o), false);
  assert.equal(quickAnswerExportText("جواب", true), `${QUICK_ANSWER_UNGROUNDED_LABEL}\n\nجواب`);
  assert.equal(quickAnswerExportText("جواب", false), "جواب");
  const src = page();
  assert.ok(src.includes("{ungrounded && ("), "the label shows only on an ungrounded answer");
  assert.ok(src.includes("{QUICK_ANSWER_UNGROUNDED_LABEL}"));
  assert.ok(src.indexOf("{QUICK_ANSWER_UNGROUNDED_LABEL}") < src.indexOf("<CitedText"), "the label sits above the answer");
  assert.ok(src.includes("{cites.length > 0 && ("), "no empty «المصادر» heading");
});
