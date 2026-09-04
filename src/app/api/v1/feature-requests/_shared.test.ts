/**
 * _shared.test.ts — run with:  node --test src/app/api/v1/feature-requests/_shared.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { toFeatureRequestDto, featureRequestDbErrorResponse, type FeatureRequestRow } from "./_shared.ts";

const ROW: FeatureRequestRow = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  title: "أضيفوا تصدير القضايا إلى PDF",
  description: "نحتاج تصدير ملخص القضية كملف PDF لمشاركته مع العميل.",
  category: "ui",
  priority: "high",
  status: "planned",
  implemented_note: null,
  created_at: "2026-09-04T08:00:00.000Z",
  updated_at: "2026-09-04T09:00:00.000Z",
};

test("toFeatureRequestDto maps every snake_case column to its camelCase field", () => {
  const dto = toFeatureRequestDto(ROW);
  assert.deepEqual(dto, {
    id: ROW.id,
    userId: ROW.user_id,
    userName: null,
    title: ROW.title,
    description: ROW.description,
    category: ROW.category,
    priority: "high",
    status: "planned",
    implementedNote: null,
    createdAt: ROW.created_at,
    updatedAt: ROW.updated_at,
  });
});

test("toFeatureRequestDto: no snake_case key leaks into the DTO", () => {
  const dto = toFeatureRequestDto(ROW) as unknown as Record<string, unknown>;
  for (const key of Object.keys(dto)) {
    assert.ok(!key.includes("_"), `DTO key "${key}" looks like a snake_case column, not a camelCase field`);
  }
});

test("toFeatureRequestDto: userName defaults to null when omitted, and passes through when given", () => {
  assert.equal(toFeatureRequestDto(ROW).userName, null);
  assert.equal(toFeatureRequestDto(ROW, "محمد العتيبي").userName, "محمد العتيبي");
  assert.equal(toFeatureRequestDto(ROW, null).userName, null);
});

test("toFeatureRequestDto: implementedNote passes through a non-null value untouched", () => {
  const dto = toFeatureRequestDto({ ...ROW, implemented_note: "أُضيف في الإصدار ٢.٣" });
  assert.equal(dto.implementedNote, "أُضيف في الإصدار ٢.٣");
});

test("featureRequestDbErrorResponse maps every known Postgres/PostgREST code", () => {
  assert.deepEqual(featureRequestDbErrorResponse({ code: "PGRST116" }), { status: 404, message: "الطلب غير موجود." });
  assert.equal(featureRequestDbErrorResponse({ code: "23505" }).status, 409);
  assert.equal(featureRequestDbErrorResponse({ code: "23514" }).status, 400);
  assert.equal(featureRequestDbErrorResponse({ code: "23503" }).status, 400);
  assert.equal(featureRequestDbErrorResponse({ code: "42501" }).status, 403);
  assert.equal(featureRequestDbErrorResponse({ code: "unknown" }).status, 500);
  assert.equal(featureRequestDbErrorResponse(null).status, 500);
  assert.equal(featureRequestDbErrorResponse(undefined).status, 500);
});
