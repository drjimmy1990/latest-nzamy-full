import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasLocalArticleNoteData,
  buildMigrationPayload,
  parseDataUrl,
  serializeNotePayload,
  type LocalArticleNoteRaw,
} from "./articleNoteLocalMigration.ts";

const EMPTY_RAW: LocalArticleNoteRaw = {
  noteText: null,
  position: null,
  show: null,
  audioDataUrl: null,
  strokes: null,
};

// ─── hasLocalArticleNoteData ────────────────────────────────────────────────

test("hasLocalArticleNoteData: nothing set at all is nothing to migrate", () => {
  assert.equal(hasLocalArticleNoteData(EMPTY_RAW), false);
});

test("hasLocalArticleNoteData: an empty-string note text is still nothing", () => {
  assert.equal(hasLocalArticleNoteData({ ...EMPTY_RAW, noteText: "" }), false);
});

test("hasLocalArticleNoteData: a serialized empty strokes array is still nothing", () => {
  assert.equal(hasLocalArticleNoteData({ ...EMPTY_RAW, strokes: "[]" }), false);
});

test("hasLocalArticleNoteData: real note text counts", () => {
  assert.equal(hasLocalArticleNoteData({ ...EMPTY_RAW, noteText: "تذكير" }), true);
});

test("hasLocalArticleNoteData: an audio data URL counts on its own", () => {
  assert.equal(hasLocalArticleNoteData({ ...EMPTY_RAW, audioDataUrl: "data:audio/webm;base64,AA==" }), true);
});

test("hasLocalArticleNoteData: a non-empty strokes array counts", () => {
  assert.equal(hasLocalArticleNoteData({ ...EMPTY_RAW, strokes: '[{"id":"1"}]' }), true);
});

test("hasLocalArticleNoteData: a bare position or visibility flag with nothing else is not enough", () => {
  assert.equal(
    hasLocalArticleNoteData({ ...EMPTY_RAW, position: '{"x":10,"y":20}', show: "true" }),
    false,
  );
});

// ─── buildMigrationPayload ──────────────────────────────────────────────────

test("buildMigrationPayload: all fields present and well-formed", () => {
  const payload = buildMigrationPayload({
    noteText: "مرحبا",
    position: '{"x":10,"y":20}',
    show: "true",
    audioDataUrl: null,
    strokes: '[{"id":"1","points":[]}]',
  });
  assert.deepEqual(payload, {
    noteText: "مرحبا",
    position: { x: 10, y: 20 },
    isVisible: true,
    strokes: [{ id: "1", points: [] }],
  });
});

test("buildMigrationPayload: empty raw yields an empty payload — nothing to omit-vs-send wrong", () => {
  assert.deepEqual(buildMigrationPayload(EMPTY_RAW), {});
});

test("buildMigrationPayload: unparsable position JSON is omitted, not thrown", () => {
  const payload = buildMigrationPayload({ ...EMPTY_RAW, noteText: "x", position: "{not json" });
  assert.deepEqual(payload, { noteText: "x" });
});

test("buildMigrationPayload: a position missing x/y is omitted", () => {
  const payload = buildMigrationPayload({ ...EMPTY_RAW, noteText: "x", position: '{"x":1}' });
  assert.deepEqual(payload, { noteText: "x" });
});

test("buildMigrationPayload: show='false' is a real false, not omitted", () => {
  const payload = buildMigrationPayload({ ...EMPTY_RAW, noteText: "x", show: "false" });
  assert.equal(payload.isVisible, false);
});

test("buildMigrationPayload: unparsable strokes JSON is omitted, not thrown", () => {
  const payload = buildMigrationPayload({ ...EMPTY_RAW, noteText: "x", strokes: "[not json" });
  assert.deepEqual(payload, { noteText: "x" });
});

test("buildMigrationPayload: strokes that parse to a non-array is omitted", () => {
  const payload = buildMigrationPayload({ ...EMPTY_RAW, noteText: "x", strokes: '{"a":1}' });
  assert.deepEqual(payload, { noteText: "x" });
});

// ─── parseDataUrl ────────────────────────────────────────────────────────────

test("parseDataUrl: a plain audio/webm base64 URL", () => {
  const parsed = parseDataUrl("data:audio/webm;base64,SGVsbG8=");
  assert.deepEqual(parsed, { mime: "audio/webm", base64: "SGVsbG8=" });
});

test("parseDataUrl: an ogg data URL", () => {
  const parsed = parseDataUrl("data:audio/ogg;base64,AAECAw==");
  assert.deepEqual(parsed, { mime: "audio/ogg", base64: "AAECAw==" });
});

test("parseDataUrl: missing mime falls back to a safe default", () => {
  const parsed = parseDataUrl("data:;base64,AAECAw==");
  assert.deepEqual(parsed, { mime: "application/octet-stream", base64: "AAECAw==" });
});

test("parseDataUrl: not a data URL at all returns null", () => {
  assert.equal(parseDataUrl("https://example.com/audio.webm"), null);
});

test("parseDataUrl: a non-base64 data URL returns null", () => {
  assert.equal(parseDataUrl("data:text/plain,hello"), null);
});

// ─── serializeNotePayload ────────────────────────────────────────────────────

test("serializeNotePayload: two payloads built the same way serialize identically", () => {
  const a = serializeNotePayload({ noteText: "x", position: { x: 1, y: 2 }, isVisible: true, strokes: [] });
  const b = serializeNotePayload({ noteText: "x", position: { x: 1, y: 2 }, isVisible: true, strokes: [] });
  assert.equal(a, b);
});

test("serializeNotePayload: a changed field changes the serialization", () => {
  const a = serializeNotePayload({ noteText: "x", position: null, isVisible: true, strokes: [] });
  const b = serializeNotePayload({ noteText: "y", position: null, isVisible: true, strokes: [] });
  assert.notEqual(a, b);
});
