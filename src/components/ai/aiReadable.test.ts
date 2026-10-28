import test from "node:test";
import assert from "node:assert/strict";
import { isAiReadable, splitAiReadable } from "./aiReadable.ts";

test("PDF and images are readable; Word and the rest are not", () => {
  for (const n of ["صحيفة.pdf", "A.PDF", "scan.jpg", "scan.jpeg", "p.png", "p.webp "]) assert.equal(isAiReadable(n), true, n);
  for (const n of ["مذكرة.docx", "x.doc", "pdf", "a.pdf.exe", ""]) assert.equal(isAiReadable(n), false, n);
});

test("the readable files' ids go out in order; the others are named", () => {
  const files = [
    { documentId: "a", name: "عقد.pdf" },
    { documentId: "b", name: "مذكرة.docx" },
    { documentId: "c", name: "إنذار.jpg" },
  ];
  assert.deepEqual(splitAiReadable(files), { ids: ["a", "c"], skipped: ["مذكرة.docx"] });
});
