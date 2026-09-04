import test from "node:test";
import assert from "node:assert/strict";
import { safeStorageFileName, contractVersionStorageKey } from "./storageKey.ts";

test("an Arabic filename becomes an ASCII key but keeps its extension", () => {
  assert.equal(safeStorageFileName("عقد الأتعاب.pdf"), "file.pdf");
  assert.equal(safeStorageFileName("Fee Agreement v2.PDF"), "Fee_Agreement_v2.pdf");
  assert.equal(safeStorageFileName("noext"), "noext");
  assert.equal(safeStorageFileName(".hidden"), ".hidden", "a dotfile has no extension to keep");
});

test("a version key lives under the uploader's folder", () => {
  const key = contractVersionStorageKey("aaaaaaaa-0000-0000-0000-000000000001", "NZ-ct-1", "عقد.pdf", 1725400000000);
  assert.equal(key, "aaaaaaaa-0000-0000-0000-000000000001/contracts/NZ-ct-1/1725400000000-file.pdf");
  assert.ok(key.startsWith("aaaaaaaa-0000-0000-0000-000000000001/"), "storage policies key on the first folder");
});
