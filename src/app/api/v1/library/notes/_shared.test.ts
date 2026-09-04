/**
 * _shared.test.ts — run with:  node --test src/app/api/v1/library/notes/_shared.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { toArticleNoteDto, articleNoteDbErrorResponse, type ArticleNoteRow } from "./_shared.ts";

const ROW: ArticleNoteRow = {
  id: "11111111-1111-1111-1111-111111111111",
  page_id: "law-1-article-4",
  note_text: "ملاحظة على هذه المادة",
  audio_path: "22222222-2222-2222-2222-222222222222/notes/memo-1.webm",
  strokes: [{ x: 1, y: 2 }],
  position: { x: 10, y: 20 },
  is_visible: true,
  created_at: "2026-09-04T08:00:00.000Z",
  updated_at: "2026-09-04T09:00:00.000Z",
};

test("toArticleNoteDto maps every snake_case column to its camelCase field", () => {
  const dto = toArticleNoteDto(ROW);
  assert.deepEqual(dto, {
    id: ROW.id,
    pageId: "law-1-article-4",
    noteText: "ملاحظة على هذه المادة",
    audioPath: ROW.audio_path,
    strokes: [{ x: 1, y: 2 }],
    position: { x: 10, y: 20 },
    isVisible: true,
    createdAt: ROW.created_at,
    updatedAt: ROW.updated_at,
  });
});

test("toArticleNoteDto: no snake_case key leaks into the DTO", () => {
  const dto = toArticleNoteDto(ROW) as unknown as Record<string, unknown>;
  for (const key of Object.keys(dto)) {
    assert.ok(!key.includes("_"), `DTO key "${key}" looks like a snake_case column, not a camelCase field`);
  }
});

test("toArticleNoteDto: a non-array strokes column (defensive) falls back to []", () => {
  const row: ArticleNoteRow = { ...ROW, strokes: null as unknown };
  const dto = toArticleNoteDto(row);
  assert.deepEqual(dto.strokes, []);
});

test("toArticleNoteDto: null audioPath and position pass through as null", () => {
  const row: ArticleNoteRow = { ...ROW, audio_path: null, position: null };
  const dto = toArticleNoteDto(row);
  assert.equal(dto.audioPath, null);
  assert.equal(dto.position, null);
});

test("articleNoteDbErrorResponse: 23505 duplicate -> 409", () => {
  const { status } = articleNoteDbErrorResponse({ code: "23505" });
  assert.equal(status, 409);
});

test("articleNoteDbErrorResponse: 23514 CHECK -> 400", () => {
  const { status } = articleNoteDbErrorResponse({ code: "23514" });
  assert.equal(status, 400);
});

test("articleNoteDbErrorResponse: 23503 FK -> 400", () => {
  const { status } = articleNoteDbErrorResponse({ code: "23503" });
  assert.equal(status, 400);
});

test("articleNoteDbErrorResponse: 42501 RLS -> 403", () => {
  const { status } = articleNoteDbErrorResponse({ code: "42501" });
  assert.equal(status, 403);
});

test("articleNoteDbErrorResponse: unknown code -> 500", () => {
  const { status } = articleNoteDbErrorResponse({ code: "99999" });
  assert.equal(status, 500);
});

test("articleNoteDbErrorResponse: every branch returns an Arabic message", () => {
  for (const code of ["23505", "23514", "23503", "42501", undefined]) {
    const { message } = articleNoteDbErrorResponse({ code });
    assert.ok(/[؀-ۿ]/.test(message), `message for ${code} should be Arabic: "${message}"`);
  }
});
