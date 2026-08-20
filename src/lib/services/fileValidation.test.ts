import { test } from "node:test";
import assert from "node:assert/strict";
import { validateUploadFile, MAX_UPLOAD_BYTES } from "./fileValidation.ts";

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
