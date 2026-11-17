import { test } from "node:test";
import assert from "node:assert/strict";
import { aiDocumentFile, MAX_AI_DOCUMENT_CHARS, parseAiDocumentBody } from "./_fromAi.ts";

test("from-ai: an empty or missing text is refused", () => {
  assert.equal(parseAiDocumentBody(null).ok, false);
  assert.equal(parseAiDocumentBody({ text: "   " }).ok, false);
});

test("from-ai: an over-long text is refused", () => {
  assert.equal(parseAiDocumentBody({ text: "ا".repeat(MAX_AI_DOCUMENT_CHARS + 1) }).ok, false);
});

test("from-ai: the title defaults, loses control characters and is capped", () => {
  const a = parseAiDocumentBody({ text: "نص" });
  assert.ok(a.ok && a.value.title === "مخرج أداة الذكاء الاصطناعي");
  const b = parseAiDocumentBody({ text: "نص", title: "مذكرة\u0000 دفاع" });
  assert.ok(b.ok && b.value.title === "مذكرة  دفاع");
  const c = parseAiDocumentBody({ text: "نص", title: "x".repeat(500) });
  assert.ok(c.ok && c.value.title.length === 120);
});

test("from-ai: runId must be a uuid when given", () => {
  assert.equal(parseAiDocumentBody({ text: "نص", runId: "1; drop" }).ok, false);
  const ok = parseAiDocumentBody({ text: "نص", runId: "0f000000-0000-4000-8000-0000000000a1" });
  assert.ok(ok.ok && ok.value.runId === "0f000000-0000-4000-8000-0000000000a1");
  const none = parseAiDocumentBody({ text: "نص", runId: "" });
  assert.ok(none.ok && none.value.runId === null);
});

test("from-ai: the stored file keeps an Arabic name, an ASCII key and a BOM", () => {
  const f = aiDocumentFile("نص المذكرة", "مذكرة / دفاع");
  assert.equal(f.fileName, "مذكرة دفاع.txt");
  assert.match(f.storageName, /^[A-Za-z0-9._-]+$/);
  assert.equal(f.content.charCodeAt(0), 0xfeff);
  assert.equal(f.mimeType, "text/plain");
});
