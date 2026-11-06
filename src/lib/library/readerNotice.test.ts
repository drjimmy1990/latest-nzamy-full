/**
 * q390 (S1 Task 4): what the precedents and book readers say when the server
 * has no text for them — never a bundled fallback.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { bookNotice, collectionNotice } from "./readerNotice.ts";

const c = (status: number | null, slug: string, total: number | null = null, error: string | null = null) =>
  collectionNotice({ status, slug, total, error });
const b = (status: number | null, slug: string, blocks: number | null = null, error: string | null = null) =>
  bookNotice({ status, slug, blocks, error });

test("collection: a server error is load_error with its message, else the default", () => {
  assert.deepEqual(c(500, "tamyeez", null, "تعذّر تحميل مجموعة المبادئ"), {
    kind: "load_error",
    titleAr: "تعذّر تحميل المجموعة",
    bodyAr: "تعذّر تحميل مجموعة المبادئ",
  });
  const n = c(503, "x");
  assert.equal(n?.kind, "load_error");
  assert.equal(n?.bodyAr, "تعذّر تحميل المجموعة، حاول مجدداً");
});

test("collection: 404 on a legacy slug is coming_soon with its title", () => {
  assert.deepEqual(c(404, "tamyeez"), {
    kind: "coming_soon",
    titleAr: "تقريرات محكمة التمييز",
    bodyAr: "هذه المجموعة قريباً في المكتبة القانونية.",
  });
  assert.equal(c(404, "insurance-1438")?.kind, "coming_soon");
});

test("collection: 404 otherwise is not_found", () => {
  const n = c(404, "no-such-collection");
  assert.equal(n?.kind, "not_found");
  assert.equal(n?.bodyAr, "المجموعة المطلوبة غير موجودة في المكتبة.");
});

test("collection: 200 with no principles is text_pending", () => {
  const n = c(200, "مبادئ-قضائية", 0);
  assert.equal(n?.kind, "text_pending");
  assert.equal(n?.bodyAr, "نص هذه المجموعة قيد الإضافة — قريباً.");
  assert.equal(c(200, "tamyeez", 0)?.titleAr, "تقريرات محكمة التمييز");
});

test("collection: otherwise no notice", () => {
  assert.equal(c(200, "tamyeez", 1541), null);
  assert.equal(c(200, "x", null), null);
  assert.equal(c(null, "x"), null, "still loading");
  assert.equal(c(429, "x", null, "limit"), null, "the quota refusal has its own screen");
});

test("collection: a fetch that never got a status but failed is load_error", () => {
  const n = c(null, "x", null, "Failed to fetch");
  assert.equal(n?.kind, "load_error");
  assert.equal(n?.bodyAr, "Failed to fetch");
});

test("book: the same cases in «الكتاب» wording; not_found keeps today's heading", () => {
  assert.deepEqual(b(404, "no-such-book"), {
    kind: "not_found",
    titleAr: "عفواً، الكتاب غير موجود",
    bodyAr: "لم نتمكن من العثور على هذا الكتاب الفقهي في المكتبة.",
  });
  assert.deepEqual(b(404, "sources-of-right-1"), {
    kind: "coming_soon",
    titleAr: "مصادر الحق في الفقه الإسلامي",
    bodyAr: "هذا الكتاب قريباً في المكتبة القانونية.",
  });
  assert.equal(b(200, "x", 0)?.kind, "text_pending");
  assert.equal(b(200, "x", 0)?.bodyAr, "نص هذا الكتاب قيد الإضافة — قريباً.");
  assert.deepEqual(b(500, "x"), {
    kind: "load_error",
    titleAr: "تعذّر تحميل الكتاب",
    bodyAr: "تعذّر تحميل الكتاب، حاول مجدداً",
  });
  assert.equal(b(502, "x", null, "خطأ")?.bodyAr, "خطأ");
  assert.equal(b(200, "x", 12), null);
  assert.equal(b(null, "x"), null);
});
