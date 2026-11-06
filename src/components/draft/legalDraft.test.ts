/**
 * legalDraft.test.ts — the L14 wizard's two run inputs and how it reads the
 * results back. The run's own checks (tools.ts) must accept what is built here.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/components/draft/legalDraft.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { AI_TOOLS } from "../../lib/ai/tools.ts";
import {
  analysisInput, asDraftAnalysis, asPleading, canAnalyse, draftBlocker, draftInput, pleadingBlocks, pleadingText, pleadingWordHtml,
  type WizardFacts,
} from "./legalDraft.ts";

const FACTS = "عمل الموكل لدى الشركة خمس سنوات ثم فُصل دون إنذار ولم تُصرف مستحقاته.";
const wizard = (over: Partial<WizardFacts> = {}): WizardFacts => ({
  kind: "claim", clientRole: "plaintiff", legalBranch: "عمالي", caseText: FACTS, notes: "", plaintiffName: "محمد", defendantName: "",
  judgment: { court: "", number: "", date: "", text: "", reasons: "" }, readableFiles: 0, ...over,
});
const tool = AI_TOOLS["legal-drafter"];

const analysisOut = {
  phase: "issues",
  facts_summary: "عمل المدعي خمس سنوات ثم فُصل دون إنذار ولم يُصرف له شيء.",
  issues: [{ title: "مشروعية الفصل", detail: "" }, { title: "المستحقات", detail: "مكافأة" }],
  defenses: [{ title: "الفصل دون سبب مشروع", basis: "المادة ٧٧ [S1]", issue: 1 }, { title: "دفع ضعيف", basis: "" }],
  requests: ["مكافأة نهاية الخدمة"],
  missing: ["عقد العمل"],
  cited: [],
};

test("the analysis input: typed facts sent; facts too short with files are «in the files»; the run accepts both", () => {
  const typed = analysisInput(wizard());
  assert.equal(typed.facts, FACTS);
  assert.equal(typed.facts_in_files, false);
  assert.ok(tool.validateInput(typed).ok);

  const filed = analysisInput(wizard({ caseText: "انظر المرفق", readableFiles: 2 }));
  assert.equal(filed.facts, "");
  assert.equal(filed.facts_in_files, true);
  assert.ok(tool.validateInput(filed).ok);

  assert.equal(canAnalyse(wizard({ caseText: "قصير" })), false);
  assert.equal(canAnalyse(wizard({ caseText: "قصير", readableFiles: 1 })), true);
});

test("the analysis read back, edited, and sent as the draft: only kept defences, markers out of the bases, the run accepts it", () => {
  const a = asDraftAnalysis(analysisOut)!;
  assert.equal(a.defenses[0].issue, 1);
  assert.equal(a.defenses[1].issue, null);
  assert.equal(draftBlocker(a), null);
  a.defenses[1].kept = false;
  a.issues.push({ title: "  ", detail: "x" });
  const sent = analysisInput(wizard());
  const b = draftInput(sent, a);
  assert.equal(b.phase, "draft");
  assert.equal(b.kind, "claim");
  assert.equal("facts_in_files" in b, false);
  assert.deepEqual(b.defenses, [{ title: "الفصل دون سبب مشروع", basis: "المادة ٧٧" }]);
  assert.equal((b.issues as unknown[]).length, 2, "a blank issue is dropped");
  assert.ok(tool.validateInput(b).ok);

  assert.equal(draftBlocker({ ...a, defenses: a.defenses.map((d) => ({ ...d, kept: false })) }), "اعتمد دفعاً واحداً على الأقل");
  assert.match(draftBlocker({ ...a, facts_summary: "قصير" }) ?? "", /الوقائع/);
  assert.equal(asDraftAnalysis({ ...analysisOut, phase: "draft" }), null);
});

test("the pleading: plain text without markers, and a right-to-left Word file with its text escaped", () => {
  const p = asPleading({
    phase: "draft",
    title: "لائحة دعوى <عمالية>",
    sections: [{ heading: "الوقائع", body: "عمل المدعي [S1]\nثم فُصل" }, { heading: "الأسانيد", body: "المادة ٧٧ [S2]" }],
    requests: ["إلزام المدعى عليها"],
    citation_check: [{ cited: "المادة ٧٧", law: "نظام العمل", article: 77, status: "ok" }],
  })!;
  assert.equal(p.citation_check.length, 1);
  const t = pleadingText(p);
  assert.doesNotMatch(t, /\[S\d\]/);
  assert.match(t, /الطلبات\n1\. إلزام المدعى عليها/);
  const doc = pleadingWordHtml(p);
  assert.match(doc, /dir="rtl"/);
  assert.match(doc, /<h1>لائحة دعوى &lt;عمالية&gt;<\/h1>/);
  assert.match(doc, /<p>عمل المدعي<\/p><p>ثم فُصل<\/p>/);
  assert.doesNotMatch(doc, /\[S\d\]/);
  assert.equal(asPleading({ phase: "issues", title: "x", sections: [] }), null);
});

test("B9: no branch, or «أخرى» with nothing typed, goes to the run as no branch; the run accepts it", () => {
  for (const legalBranch of ["", "  ", "أخرى"]) {
    const input = analysisInput(wizard({ legalBranch }));
    assert.equal(input.branch, null, legalBranch);
    assert.ok(tool.validateInput(input).ok, legalBranch);
  }
  assert.equal(analysisInput(wizard({ legalBranch: " عمالي " })).branch, "عمالي");
  assert.equal(analysisInput(wizard({ legalBranch: "بحري دولي" })).branch, "بحري دولي");
});

test("pleading blocks: the section's fixture", () => {
  assert.deepEqual(
    pleadingBlocks({ title: "لائحة دعوى", sections: [{ heading: "الوقائع", body: "نص [S1]" }], requests: ["إلزام المدعى عليه"], citation_check: [] }),
    [
      { kind: "title", text: "لائحة دعوى" },
      { kind: "heading", text: "الوقائع" },
      { kind: "para", text: "نص" },
      { kind: "heading", text: "الطلبات" },
      { kind: "list", ordered: true, items: ["إلزام المدعى عليه"] },
    ],
  );
});

test("pleading blocks: no marker anywhere, lines become paragraphs, no requests no heading", () => {
  const blocks = pleadingBlocks({ title: "لائحة [S1]", sections: [{ heading: "الدفوع[S2]", body: "أول [S3]\n\nثانٍ [S4]" }], requests: [], citation_check: [] });
  assert.deepEqual(blocks, [
    { kind: "title", text: "لائحة" },
    { kind: "heading", text: "الدفوع" },
    { kind: "para", text: "أول" },
    { kind: "para", text: "ثانٍ" },
  ]);
});
