/**
 * contractReviewRun.test.ts — what /ai/contracts sends to the AI contract review,
 * how it reads the report back, and the screens' promises about the price (R31, q296).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/contracts/contractReviewRun.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  asContractReview,
  contractReviewInput,
  contractReviewSource,
  contractReviewText,
  reviewRiskCounts,
  reviewRiskMatrix,
  type ContractReview,
} from "./contractReviewRun.ts";
import { CONTRACT_REVIEW_PASTE_MAX, CONTRACT_REVIEW_PASTE_MIN, REVIEW_CATEGORIES } from "../../lib/ai/tools.ts";
import { AI_DOC_FILE_COPY } from "../ai/aiReadable.ts";

const FIXTURE: Record<string, unknown> = {
  summary: "s",
  overall_risk: "high",
  clauses: [
    { ref: "البند ١", quote: "يلتزم", category: "payment", risk: "high", issue: "مشكلة أولى", defensive_edit: "دفاعي أول", negotiating_edit: "تفاوضي أول" },
    { ref: "البند ٢", quote: "يحق", category: "payment", risk: "medium", issue: "مشكلة ثانية", defensive_edit: "دفاعي ثان", negotiating_edit: "تفاوضي ثان" },
  ],
  missing: [{ title: "القوة القاهرة", why: "غير منظمة" }],
  citation_check: [{ cited: "المادة ٥", law: "نظام", article: 5, status: "not_found", missing: "article" }],
};
const review = asContractReview(FIXTURE) as ContractReview;
const SRC = join(process.cwd(), "src");
const code = (rel: string) =>
  readFileSync(join(SRC, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

test("contractReviewInput: the wizard's fields under the validator's names; the type by the name the model reads", () => {
  const i = contractReviewInput({ rPartyFocus: " المستأجر ", rFears: " الغرامات ", rOtherParty: "", contractType: "rent" });
  assert.deepEqual(i, { represented_party: "المستأجر", concerns: "الغرامات", other_party: null, contract_type: "عقد إيجار" });
  assert.equal(contractReviewInput({ rPartyFocus: "x", rFears: "", rOtherParty: "", contractType: "" }).contract_type, null);
  assert.equal(contractReviewInput({ rPartyFocus: "x", rFears: "", rOtherParty: "", contractType: "unknown" }).contract_type, null);
});

test("asContractReview: reads citation_check (the library's verdict), and refuses what is not a report", () => {
  assert.equal(review.clauses.length, 2);
  assert.equal(review.citation_check.length, 1);
  assert.equal(review.citation_check[0].status, "not_found");
  assert.equal(asContractReview({}), null);
  assert.equal(asContractReview(null), null);
  assert.equal(asContractReview({ ...FIXTURE, clauses: [] }), null);
  assert.equal(asContractReview({ ...FIXTURE, overall_risk: "x" }), null);
});

test("reviewRiskCounts and the matrix: counts of clauses by a risk word, only the categories that have any", () => {
  assert.deepEqual(reviewRiskCounts(review), { high: 1, medium: 1, low: 0 });
  assert.deepEqual(reviewRiskMatrix(review), [{ category: "payment", high: 1, medium: 1, low: 0 }]);
  const mixed = asContractReview({
    ...FIXTURE,
    clauses: [
      { category: "other", risk: "low", issue: "س" },
      { category: "payment", risk: "low", issue: "س" },
      { category: "لا يوجد", risk: "low", issue: "س" },
    ],
  }) as ContractReview;
  assert.deepEqual(reviewRiskMatrix(mixed).map((r) => r.category), ["payment", "other"]);
  assert.equal(reviewRiskMatrix(mixed)[1].low, 2, "an unknown category counts under other");
  assert.ok(REVIEW_CATEGORIES.includes("other"));
});

test("contractReviewText: a manual edit replaces the suggestions of that clause only; a blank one replaces nothing", () => {
  const t = contractReviewText(review, { 0: "نصي" });
  assert.ok(t.includes("نصي"));
  assert.ok(!t.includes("دفاعي أول"));
  assert.ok(!t.includes("تفاوضي أول"));
  assert.ok(t.includes("دفاعي ثان"));
  assert.ok(t.includes("القوة القاهرة"));
  assert.ok(t.includes("المادة ٥"), "the citations and their verdict go with the copy");
  assert.ok(contractReviewText(review, { 0: "   " }).includes("دفاعي أول"));
  assert.doesNotMatch(t, /[%٪]/);
});

// ── what a run sends ─────────────────────────────────────────────────────────

const file = (documentId: string, name: string) => ({ documentId, name, size: 1 });
const LONG_ENOUGH = "نص".repeat(CONTRACT_REVIEW_PASTE_MIN);

test("contractReviewSource: the first readable file; the rest are named as left out", () => {
  const s = contractReviewSource([file("1", "عقد.pdf"), file("2", "ملحق.pdf"), file("3", "قديم.docx")], "", false);
  assert.equal(s.kind, "file");
  assert.deepEqual(s.kind === "file" && s.fileIds, ["1"]);
  assert.deepEqual(s.kind === "file" && s.left, ["ملحق.pdf", "قديم.docx"]);
});

test("contractReviewSource: with the flag off a Word file says PDF or an image, before any charge", () => {
  const s = contractReviewSource([file("1", "عقد.docx")], "", false);
  assert.equal(s.kind, "none");
  assert.match(s.kind === "none" ? s.reason : "", /PDF أو صورة/);
  const on = contractReviewSource([file("1", "عقد.docx")], "", true);
  assert.equal(on.kind, "file", "with the flag on the server reads it as text");
  const legacy = contractReviewSource([file("1", "عقد.doc")], "", true);
  assert.equal(legacy.kind, "none");
  assert.ok((legacy.kind === "none" ? legacy.reason : "").includes(AI_DOC_FILE_COPY));
});

test("contractReviewSource: a paste goes only with the flag on and within its limits; a file wins over a paste", () => {
  assert.equal(contractReviewSource([], LONG_ENOUGH, false).kind, "none");
  assert.match((contractReviewSource([], LONG_ENOUGH, false) as { reason: string }).reason, /طلب الفريق/);
  const pasted = contractReviewSource([], `  ${LONG_ENOUGH}  `, true);
  assert.equal(pasted.kind, "paste");
  assert.equal(pasted.kind === "paste" && pasted.text, LONG_ENOUGH);
  assert.equal(contractReviewSource([], "قصير", true).kind, "none");
  assert.equal(contractReviewSource([], "x".repeat(CONTRACT_REVIEW_PASTE_MAX + 1), true).kind, "none");
  const both = contractReviewSource([file("1", "عقد.pdf")], LONG_ENOUGH, true);
  assert.equal(both.kind, "file");
  assert.equal(both.kind === "file" && both.pasteIgnored, true);
  assert.equal(contractReviewSource([], "", true).kind, "none");
});

// ── the screens ──────────────────────────────────────────────────────────────

const STEP = "components/contracts/steps/review/StepRAiReview.tsx";
const REPORT = "components/contracts/ContractReviewReport.tsx";

test("the page renders the AI review in the review submit step, from one tool-status read", () => {
  const page = code("app/ai/contracts/page.tsx");
  assert.match(page, /s\.step === "submit" && s\.contractMode === "review" && \(\s*<StepRAiReview/);
  assert.equal((page.match(/useToolUsable\("contract-review"\)/g) ?? []).length, 1);
  assert.match(page, /<StepRAiReview[\s\S]{0,300}usable=\{reviewUsable\}/);
  assert.match(page, /const reviewRun = useAiRun\(\)/, "the run lives in the page: leaving the step must not lose a charged run");
  assert.match(page, /disabled=\{s\.currentStepIndex === 0 \|\| run\.busy \|\| reviewRun\.busy\}/);
  assert.match(page, /reviewRun\.start\("contract-review"/);
});

test("the page's copy says «not available» only when tool-status said so", () => {
  const page = code("app/ai/contracts/page.tsx");
  const notYet = /reviewUsable === false\s*\?\s*"ارفع عقدك الحالي — يراجعه فريق نظامي ويرسل لك تقرير المخاطر والملاحظات \(المراجعة الآلية بالذكاء الاصطناعي لم تُتح بعد\)"/;
  assert.match(page, notYet);
  assert.equal((page.match(/لم تُتح بعد/g) ?? []).length, 1, "the step's own copy moved to StepRAiReview");
});

test("not usable: exactly today's human-order step, and no price anywhere before the usable branch", () => {
  const step = code(STEP);
  const notUsable = step.slice(step.indexOf("export function StepRAiReview"), step.indexOf("function UsableReview"));
  assert.ok(notUsable.length > 100, "the two branches were not found");
  assert.ok(notUsable.includes("usable === null"));
  assert.ok(notUsable.includes("<StepSubmit"));
  assert.ok(step.includes("مراجعة العقد بالذكاء الاصطناعي (تقسيم البنود وتقدير مخاطر كل بند) لم تُتح بعد؛ هذا طلب بشري يراجع فيه فريق نظامي العقد المرفوع ويرسل لك تقرير المراجعة، وسيصلك إشعار عند جهوزيته."));
  assert.ok(step.includes("أقر بأن البيانات المدخلة صحيحة، وأوافق على إرسال العقد المرفوع لفريق نظامي لمراجعته."));
  assert.doesNotMatch(notUsable, /CONTRACT_REVIEW_PRICE|نقطة|points/);
  const usable = step.slice(step.indexOf("function UsableReview"));
  assert.ok(usable.includes('CONTRACT_REVIEW_PRICE.toLocaleString("ar-SA")'));
  assert.ok(usable.includes("مراجعة العقد بالذكاء الاصطناعي — "));
});

test("no screen of this tool reads points-standing or a paywall (their replies carry the price)", () => {
  for (const f of [STEP, REPORT, "app/ai/contracts/page.tsx"]) assert.doesNotMatch(code(f), /usePointsShortfall|PaywallGate|points-standing/, f);
});

test("the report: real results, words not numbers about the outcome, no percent sign anywhere in the file", () => {
  const raw = readFileSync(join(SRC, REPORT), "utf8");
  assert.doesNotMatch(raw, /[%٪]/);
  assert.doesNotMatch(raw, /MOCK|setTimeout|Math\.random/);
  for (const needle of ["تعديل دفاعي", "تعديل تفاوضي", "تعديلي اليدوي", "<CitationCheckList", "<AiResultActions", "contractReviewText("]) {
    assert.ok(raw.includes(needle), needle);
  }
  assert.ok(!/text-gray-(100|200)/.test(raw));
});

test("the old mock page is gone and nothing leaves a dead file behind", () => {
  assert.equal(existsSync(join(SRC, "app/ai/contract-reviewer/page.tsx")), false);
  // Owner decision ٤: the old review steps stay on disk, unreferenced.
  for (const f of ["StepRAnalysis", "StepRDecisions", "StepRReport"]) {
    assert.ok(existsSync(join(SRC, `components/contracts/steps/review/${f}.tsx`)), f);
    assert.doesNotMatch(code("app/ai/contracts/page.tsx"), new RegExp(`<${f}\\b`), f);
    assert.doesNotMatch(code(STEP), new RegExp(`<${f}\\b`), f);
  }
});
