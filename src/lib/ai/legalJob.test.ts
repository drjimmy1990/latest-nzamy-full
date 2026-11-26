/**
 * legalJob.test.ts — batch l16 E-S3: the LegalJob v1 contract built from a
 * legal-drafter draft.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/legalJob.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { legalJobV1Issue, renderMemoMarkdown, toLegalJobV1 } from "./legalJob.ts";

const DRAFT = {
  phase: "draft",
  title: "لائحة دعوى",
  sections: [
    { heading: "الوقائع", body: "أبرم الطرفان عقداً [S1]." },
    { heading: "الأسانيد", body: "نصت المادة (77) على «...» [S2][S3]." },
  ],
  requests: ["إلزام المدعى عليه بالتسليم", "تحميله المصاريف"],
  cited: [],
};
const CITATIONS = [
  { sid: "S1", kind: "article", id: "labor__art-77", title: "نظام العمل — المادة ٧٧", url: "/laws/labor#labor__art-77" },
  { sid: "bad" },
];

test("a draft becomes LegalJob v1: clean Markdown memo, the parts, library citations only", () => {
  const job = toLegalJobV1(DRAFT, CITATIONS)!;
  assert.ok(job);
  assert.equal(legalJobV1Issue(job), null);
  assert.equal(job.v, 1);
  assert.equal(
    job.memo,
    "# لائحة دعوى\n\n## الوقائع\n\nأبرم الطرفان عقداً.\n\n## الأسانيد\n\nنصت المادة (77) على «...».\n\n## الطلبات\n\n1. إلزام المدعى عليه بالتسليم\n2. تحميله المصاريف",
  );
  assert.deepEqual(job.structured.sections, DRAFT.sections, "the parts keep their markers for the platform's own screen");
  assert.deepEqual(job.citations, [{ sid: "S1", source_kind: "library", kind: "article", id: "labor__art-77", title: "نظام العمل — المادة ٧٧", url: "/laws/labor#labor__art-77" }]);
  assert.equal(job.lawyer_notes, null);
  assert.equal(job.najiz, null);
  assert.equal(toLegalJobV1({ ...DRAFT, najiz: "نص ناجز", lawyer_notes: { adversary: "x" } }, [])?.najiz, "نص ناجز");
});

test("anything but a whole draft is not a LegalJob", () => {
  assert.equal(toLegalJobV1({ ...DRAFT, phase: "issues" }, []), null);
  assert.equal(toLegalJobV1({ phase: "section", heading: "h", body: "b" }, []), null);
  assert.equal(toLegalJobV1({ ...DRAFT, sections: [{ heading: "h" }] }, []), null);
  assert.equal(toLegalJobV1(null, []), null);
});

test("the checker refuses a broken contract", () => {
  const job = toLegalJobV1(DRAFT, CITATIONS)!;
  assert.ok(legalJobV1Issue({ ...job, memo: "" }));
  assert.ok(legalJobV1Issue({ ...job, memo: "نص [S1]" }));
  assert.ok(legalJobV1Issue({ ...job, citations: [{ sid: "S1", source_kind: "web" }] }));
  assert.ok(legalJobV1Issue({ ...job, structured: { ...job.structured, sections: [] } }));
  assert.ok(legalJobV1Issue({ ...job, v: 2 }));
  assert.equal(renderMemoMarkdown({ title: "ع", sections: [{ heading: "ق", body: "ن" }], requests: [] }), "# ع\n\n## ق\n\nن");
});
