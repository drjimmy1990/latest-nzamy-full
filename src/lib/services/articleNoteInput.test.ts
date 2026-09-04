import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateArticleNoteInput,
  mergeArticleNoteFields,
  isValidAudioPath,
  isValidNotePosition,
  ARTICLE_NOTE_DEFAULTS,
  type ArticleNoteFields,
} from "./articleNoteInput.ts";

const USER = "11111111-1111-1111-1111-111111111111";

// ─── pageId ─────────────────────────────────────────────────────────────

test("accepts a minimal body with only pageId — no other key present in the patch", () => {
  const result = validateArticleNoteInput({ pageId: "law-1-article-4" }, USER);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value, { pageId: "law-1-article-4" });
  }
});

test("rejects a missing pageId", () => {
  const result = validateArticleNoteInput({}, USER);
  assert.equal(result.ok, false);
});

test("rejects an empty-string pageId", () => {
  const result = validateArticleNoteInput({ pageId: "" }, USER);
  assert.equal(result.ok, false);
});

test("accepts a pageId at exactly 200 chars", () => {
  const result = validateArticleNoteInput({ pageId: "a".repeat(200) }, USER);
  assert.equal(result.ok, true);
});

test("rejects a pageId over 200 chars", () => {
  const result = validateArticleNoteInput({ pageId: "a".repeat(201) }, USER);
  assert.equal(result.ok, false);
});

test("rejects a non-string pageId", () => {
  const result = validateArticleNoteInput({ pageId: 123 }, USER);
  assert.equal(result.ok, false);
});

// ─── noteText ───────────────────────────────────────────────────────────

test("accepts noteText at exactly the 20000-char ceiling", () => {
  const result = validateArticleNoteInput({ pageId: "p1", noteText: "a".repeat(20000) }, USER);
  assert.equal(result.ok, true);
});

test("rejects noteText over the 20000-char ceiling", () => {
  const result = validateArticleNoteInput({ pageId: "p1", noteText: "a".repeat(20001) }, USER);
  assert.equal(result.ok, false);
});

test("rejects a non-string noteText", () => {
  const result = validateArticleNoteInput({ pageId: "p1", noteText: 5 }, USER);
  assert.equal(result.ok, false);
});

// ─── strokes ────────────────────────────────────────────────────────────

test("stores strokes exactly as given", () => {
  const strokes = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
  const result = validateArticleNoteInput({ pageId: "p1", strokes }, USER);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.strokes, strokes);
});

test("rejects strokes that are not an array", () => {
  const result = validateArticleNoteInput({ pageId: "p1", strokes: { a: 1 } }, USER);
  assert.equal(result.ok, false);
});

test("accepts an empty strokes array", () => {
  const result = validateArticleNoteInput({ pageId: "p1", strokes: [] }, USER);
  assert.equal(result.ok, true);
});

// ─── position — isValidNotePosition ────────────────────────────────────

test("isValidNotePosition: null is valid", () => {
  assert.equal(isValidNotePosition(null), true);
});

test("isValidNotePosition: {x,y} numbers is valid", () => {
  assert.equal(isValidNotePosition({ x: 10, y: 20.5 }), true);
});

test("isValidNotePosition: rejects a string coordinate", () => {
  assert.equal(isValidNotePosition({ x: "10", y: 20 }), false);
});

test("isValidNotePosition: rejects a missing coordinate", () => {
  assert.equal(isValidNotePosition({ x: 10 }), false);
});

test("isValidNotePosition: rejects extra keys", () => {
  assert.equal(isValidNotePosition({ x: 10, y: 20, z: 30 }), false);
});

test("isValidNotePosition: rejects an array", () => {
  assert.equal(isValidNotePosition([10, 20]), false);
});

test("isValidNotePosition: rejects a bare number", () => {
  assert.equal(isValidNotePosition(5), false);
});

test("validateArticleNoteInput: rejects an invalid position shape", () => {
  const result = validateArticleNoteInput({ pageId: "p1", position: { x: 1 } }, USER);
  assert.equal(result.ok, false);
});

test("validateArticleNoteInput: accepts a valid position", () => {
  const result = validateArticleNoteInput({ pageId: "p1", position: { x: 1, y: 2 } }, USER);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.position, { x: 1, y: 2 });
});

// ─── isVisible ──────────────────────────────────────────────────────────

test("accepts isVisible: false", () => {
  const result = validateArticleNoteInput({ pageId: "p1", isVisible: false }, USER);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.isVisible, false);
});

test("rejects a non-boolean isVisible", () => {
  const result = validateArticleNoteInput({ pageId: "p1", isVisible: "yes" }, USER);
  assert.equal(result.ok, false);
});

// ─── audioPath — the prefix rule ───────────────────────────────────────

test("isValidAudioPath: null is valid", () => {
  assert.equal(isValidAudioPath(null, USER), true);
});

test("isValidAudioPath: a path under the caller's own notes folder is valid", () => {
  assert.equal(isValidAudioPath(`${USER}/notes/memo-1.webm`, USER), true);
});

test("isValidAudioPath: rejects another user's folder", () => {
  const otherUser = "22222222-2222-2222-2222-222222222222";
  assert.equal(isValidAudioPath(`${otherUser}/notes/memo-1.webm`, USER), false);
});

test("isValidAudioPath: rejects a path outside the notes/ subfolder", () => {
  assert.equal(isValidAudioPath(`${USER}/contracts/memo-1.webm`, USER), false);
});

test("isValidAudioPath: rejects a path traversal attempt", () => {
  assert.equal(isValidAudioPath(`../${USER}/notes/memo-1.webm`, USER), false);
});

test("isValidAudioPath: rejects a non-string", () => {
  assert.equal(isValidAudioPath(42, USER), false);
});

test("validateArticleNoteInput: 400s when audioPath belongs to someone else", () => {
  const otherUser = "22222222-2222-2222-2222-222222222222";
  const result = validateArticleNoteInput({ pageId: "p1", audioPath: `${otherUser}/notes/x.webm` }, USER);
  assert.equal(result.ok, false);
});

test("validateArticleNoteInput: accepts a well-formed audioPath", () => {
  const result = validateArticleNoteInput({ pageId: "p1", audioPath: `${USER}/notes/x.webm` }, USER);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.audioPath, `${USER}/notes/x.webm`);
});

// ─── body shape ─────────────────────────────────────────────────────────

test("rejects a non-object body", () => {
  assert.equal(validateArticleNoteInput(null, USER).ok, false);
  assert.equal(validateArticleNoteInput("x", USER).ok, false);
  assert.equal(validateArticleNoteInput([], USER).ok, false);
});

// ─── patch presence: omitted vs. explicit null ──────────────────────────
// The whole reason validateArticleNoteInput returns a patch instead of a
// fully-defaulted value: mergeArticleNoteFields needs to tell "the caller
// didn't mention this field" apart from "the caller wants this field null".

test("validateArticleNoteInput: omitting audioPath leaves it out of the patch entirely", () => {
  const result = validateArticleNoteInput({ pageId: "p1", noteText: "hi" }, USER);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal("audioPath" in result.value, false);
});

test("validateArticleNoteInput: an explicit null audioPath is present in the patch as null", () => {
  const result = validateArticleNoteInput({ pageId: "p1", audioPath: null }, USER);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal("audioPath" in result.value, true);
    assert.equal(result.value.audioPath, null);
  }
});

test("validateArticleNoteInput: omitting position leaves it out of the patch entirely", () => {
  const result = validateArticleNoteInput({ pageId: "p1" }, USER);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal("position" in result.value, false);
});

test("validateArticleNoteInput: an explicit null position is present in the patch as null", () => {
  const result = validateArticleNoteInput({ pageId: "p1", position: null }, USER);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal("position" in result.value, true);
    assert.equal(result.value.position, null);
  }
});

// ─── mergeArticleNoteFields ──────────────────────────────────────────────

const FULL_NOTE: ArticleNoteFields = {
  noteText: "نص الملاحظة الأصلي",
  audioPath: null,
  strokes: [{ x: 1, y: 2 }],
  position: { x: 10, y: 20 },
  isVisible: false,
};

test("mergeArticleNoteFields: existing === null (new note) falls back to the column defaults", () => {
  const result = mergeArticleNoteFields(null, { pageId: "p1" });
  assert.deepEqual(result, ARTICLE_NOTE_DEFAULTS);
});

test("mergeArticleNoteFields: existing === null, patch fields override the defaults", () => {
  const result = mergeArticleNoteFields(null, { pageId: "p1", noteText: "جديد", isVisible: false });
  assert.deepEqual(result, { ...ARTICLE_NOTE_DEFAULTS, noteText: "جديد", isVisible: false });
});

// The exact scenario the audit flagged: uploadNoteAudio() finishes, the
// caller saves only { pageId, audioPath } — noteText/strokes/position/
// isVisible must survive untouched, not reset to their column defaults.
test("mergeArticleNoteFields: a patch with only audioPath preserves every other field", () => {
  const result = mergeArticleNoteFields(FULL_NOTE, {
    pageId: "p1",
    audioPath: `${USER}/notes/memo-1.webm`,
  });
  assert.deepEqual(result, { ...FULL_NOTE, audioPath: `${USER}/notes/memo-1.webm` });
});

test("mergeArticleNoteFields: an absent audioPath keeps the existing value", () => {
  const result = mergeArticleNoteFields(FULL_NOTE, { pageId: "p1", noteText: "محدّث" });
  assert.equal(result.audioPath, FULL_NOTE.audioPath);
});

test("mergeArticleNoteFields: an explicit null audioPath clears it even though there is an existing value", () => {
  const withAudio: ArticleNoteFields = { ...FULL_NOTE, audioPath: `${USER}/notes/old.webm` };
  const result = mergeArticleNoteFields(withAudio, { pageId: "p1", audioPath: null });
  assert.equal(result.audioPath, null);
  // nothing else moved
  assert.deepEqual({ ...result, audioPath: withAudio.audioPath }, withAudio);
});

test("mergeArticleNoteFields: an absent position keeps the existing value", () => {
  const result = mergeArticleNoteFields(FULL_NOTE, { pageId: "p1", isVisible: true });
  assert.deepEqual(result.position, FULL_NOTE.position);
});

test("mergeArticleNoteFields: an explicit null position clears it even though there is an existing value", () => {
  const result = mergeArticleNoteFields(FULL_NOTE, { pageId: "p1", position: null });
  assert.equal(result.position, null);
});

test("mergeArticleNoteFields: { pageId } alone on an existing note is a no-op (patch, not a reset)", () => {
  const result = mergeArticleNoteFields(FULL_NOTE, { pageId: "p1" });
  assert.deepEqual(result, FULL_NOTE);
});

test("mergeArticleNoteFields: strokes and isVisible follow the same absent-vs-explicit rule", () => {
  const clearedStrokes = mergeArticleNoteFields(FULL_NOTE, { pageId: "p1", strokes: [] });
  assert.deepEqual(clearedStrokes.strokes, []);
  assert.deepEqual(clearedStrokes.position, FULL_NOTE.position);

  const hiddenOnly = mergeArticleNoteFields(FULL_NOTE, { pageId: "p1", isVisible: false });
  assert.equal(hiddenOnly.isVisible, false);
  assert.deepEqual(hiddenOnly.strokes, FULL_NOTE.strokes);
});
