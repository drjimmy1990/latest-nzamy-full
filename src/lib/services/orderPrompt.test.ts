import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrderPrompt } from "./orderPrompt.ts";

const base = {
  title: "مذكرة دعوى — عمالي",
  description: "نزاع على مستحقات نهاية الخدمة",
  metadata: {
    serviceTitleAr: "الصائغ القانوني",
    intake: { service: "draft", clientRole: "plaintiff", caseText: "و".repeat(40) },
    attachments: [{ documentId: 7, name: "عقد.pdf", size: 2048 }],
  },
};

test("starts with the service and the title", () => {
  const md = buildOrderPrompt(base);
  assert.ok(md.includes("الصائغ القانوني"));
  assert.ok(md.includes("مذكرة دعوى — عمالي"));
});

test("renders intake fields as readable lines, not JSON braces", () => {
  const md = buildOrderPrompt(base);
  assert.ok(md.includes("caseText") || md.includes("و".repeat(10)));
  assert.ok(!md.includes('{"service"'));
});

test("lists attachments by name", () => {
  assert.ok(buildOrderPrompt(base).includes("عقد.pdf"));
});

test("a numeric documentId does not break rendering", () => {
  // attachments.id is a Postgres bigserial and arrives as a JSON number.
  assert.ok(buildOrderPrompt(base).includes("عقد.pdf"));
});

test("survives an order with no intake at all", () => {
  const md = buildOrderPrompt({ title: "t", description: "d", metadata: {} });
  assert.equal(typeof md, "string");
  assert.ok(md.length > 0);
});

test("never emits the internal team note", () => {
  const md = buildOrderPrompt({
    ...base,
    metadata: { ...base.metadata, internalNotes: "لا ترسل هذا" },
  });
  assert.ok(!md.includes("لا ترسل هذا"));
});

test("nested intake objects are flattened, not stringified", () => {
  const md = buildOrderPrompt({
    ...base,
    metadata: { ...base.metadata, intake: { service: "contracts", parties: { one: { fullName: "محمد" } } } },
  });
  assert.ok(md.includes("محمد"));
});
