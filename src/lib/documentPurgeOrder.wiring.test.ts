/**
 * documentPurgeOrder.wiring.test.ts — old note ب3 (Patch 0003, «غلاف الخزنة»).
 * A permanent delete of a vault document removes the ROW before the file: a row
 * and a storage object cannot share a transaction, and file-first left a row
 * pointing at a missing file whenever the row delete then failed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { stripComments } from "./ui/darkModeScan.ts";

test("documents/[id] permanent delete: the row goes first, a failed row delete returns before any file is touched", () => {
  const src = stripComments(readFileSync(join(import.meta.dirname, "../app/api/v1/documents/[id]/route.ts"), "utf8"));
  const rowDelete = src.indexOf('admin.from("attachments").delete().eq("id", id)');
  const failReturn = src.indexOf("return NextResponse.json({ error: \"تعذّر الحذف النهائي للمستند.\" }, { status: 500 })", rowDelete);
  const fileRemove = src.indexOf('.storage.from("documents").remove(');
  assert.ok(rowDelete > 0, "the row delete is there");
  assert.ok(failReturn > rowDelete, "a failed row delete answers 500");
  assert.ok(fileRemove > failReturn, "the file is removed only after the row is gone");
});
