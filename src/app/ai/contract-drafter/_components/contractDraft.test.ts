/**
 * contractDraft.test.ts — q345: the AI contract as export blocks.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/app/ai/contract-drafter/_components/contractDraft.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { contractBlocks } from "./contractDraft.ts";

test("a contract as blocks: title, preamble, each section; no markers", () => {
  assert.deepEqual(
    contractBlocks({ title: "عقد عمل [S1]", preamble: "إنه في يوم [....]", sections: [{ heading: "البند الأول [S2]", body: "نص [S3]\nثانٍ" }], citation_check: [] }),
    [
      { kind: "title", text: "عقد عمل" },
      { kind: "para", text: "إنه في يوم [....]" },
      { kind: "heading", text: "البند الأول" },
      { kind: "para", text: "نص" },
      { kind: "para", text: "ثانٍ" },
    ],
  );
});

test("no preamble: no empty paragraph", () => {
  assert.deepEqual(contractBlocks({ title: "عقد", preamble: "", sections: [{ heading: "البند", body: "نص" }], citation_check: [] }), [
    { kind: "title", text: "عقد" },
    { kind: "heading", text: "البند" },
    { kind: "para", text: "نص" },
  ]);
});
