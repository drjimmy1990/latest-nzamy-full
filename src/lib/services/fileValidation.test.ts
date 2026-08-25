import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUploadFile, MAX_UPLOAD_BYTES, partitionUploadFiles } from "./fileValidation.ts";

test("accepts a normal pdf with an Arabic name", () => {
  assert.equal(validateUploadFile({ name: "عقد.pdf", size: 1024 }), null);
});

test("accepts doc, docx, png, jpg, jpeg", () => {
  for (const n of ["a.doc", "a.docx", "a.png", "a.jpg", "a.jpeg"]) {
    assert.equal(validateUploadFile({ name: n, size: 10 }), null, n);
  }
});

test("rejects an unsupported extension and says so", () => {
  const msg = validateUploadFile({ name: "clip.mp4", size: 10 });
  assert.ok(msg && msg.includes("صيغة"));
});

test("rejects a file with no extension at all", () => {
  assert.ok(validateUploadFile({ name: "README", size: 10 }));
});

test("rejects a file over the ceiling", () => {
  const msg = validateUploadFile({ name: "big.pdf", size: MAX_UPLOAD_BYTES + 1 });
  assert.ok(msg && msg.includes("الحجم"));
});

test("accepts a file exactly at the ceiling", () => {
  assert.equal(validateUploadFile({ name: "edge.pdf", size: MAX_UPLOAD_BYTES }), null);
});

test("rejects an empty file — a zero-byte upload is always a mistake", () => {
  assert.ok(validateUploadFile({ name: "empty.pdf", size: 0 }));
});

test("extension matching is case-insensitive", () => {
  assert.equal(validateUploadFile({ name: "SCAN.PDF", size: 10 }), null);
});

// ─── partitionUploadFiles — the batch entry point ──────────────────────────
// A single validateUploadFile() call per file, run in a loop by the caller,
// is what let a later file's success clear an earlier file's rejection
// (each attachFile() call resets attachError at its own start). These tests
// pin the fix: one pass over the whole selection, one combined message.

test("acceptance: [a 50MB pdf, a valid pdf] keeps the valid file and leaves the rejection readable", () => {
  const { accepted, rejectedMessage } = partitionUploadFiles([
    { name: "big.pdf", size: 50 * 1024 * 1024 },
    { name: "good.pdf", size: 1024 },
  ]);
  assert.deepEqual(accepted.map(f => f.name), ["good.pdf"]);
  assert.ok(rejectedMessage);
  assert.ok(rejectedMessage.includes("big.pdf"));
  assert.ok(rejectedMessage.includes("الحجم"));
});

test("partitionUploadFiles: accepts everything when the whole batch is valid", () => {
  const { accepted, rejectedMessage } = partitionUploadFiles([
    { name: "a.pdf", size: 10 },
    { name: "b.docx", size: 10 },
  ]);
  assert.equal(accepted.length, 2);
  assert.equal(rejectedMessage, null);
});

test("partitionUploadFiles: names every rejected file when more than one fails", () => {
  const { accepted, rejectedMessage } = partitionUploadFiles([
    { name: "clip.mp4", size: 10 },
    { name: "huge.pdf", size: MAX_UPLOAD_BYTES + 1 },
  ]);
  assert.equal(accepted.length, 0);
  assert.ok(rejectedMessage?.includes("clip.mp4"));
  assert.ok(rejectedMessage?.includes("huge.pdf"));
});

test("partitionUploadFiles: an empty selection accepts nothing and rejects nothing", () => {
  const { accepted, rejectedMessage } = partitionUploadFiles([]);
  assert.equal(accepted.length, 0);
  assert.equal(rejectedMessage, null);
});
