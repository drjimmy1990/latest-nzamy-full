import test from "node:test";
import assert from "node:assert/strict";
import { toArchivedNoteDto, toArchivedDocumentDto, archivedNameIds } from "./archivedView.ts";

const names = new Map([["u-s", "سالم"], ["u-o", "صاحب المكتب"]]);

test("an archived note: who wrote it, who archived it, and whether it is mine", () => {
  const dto = toArchivedNoteDto(
    { id: "n1", author_user_id: "u-s", visibility: "firm", body: "نص", created_at: "c", deleted_at: "d", deleted_by: "u-s" },
    "u-o",
    names,
  );
  assert.deepEqual(dto, {
    id: "n1", body: "نص", visibility: "firm", authorName: "سالم", mine: false,
    createdAt: "c", deletedAt: "d", deletedByName: "سالم",
  });
  const odd = toArchivedNoteDto(
    { id: "n2", author_user_id: "u-x", visibility: "weird", body: "", created_at: "c", deleted_at: "d", deleted_by: null },
    "u-x",
    names,
  );
  assert.equal(odd.visibility, "private", "an unknown scope is shown as the narrowest one");
  assert.equal(odd.mine, true);
  assert.equal(odd.authorName, null, "no invented name");
  assert.equal(odd.deletedByName, null);
});

test("an archived document never carries its storage path", () => {
  const row = { id: 77, file_name: "لائحة.pdf", owner_user_id: "u-s", created_at: "c", deleted_at: "d", deleted_by: "u-s", storage_path: "case-x/لائحة.pdf" };
  const dto = toArchivedDocumentDto(row, names);
  assert.equal(dto.id, "77");
  assert.equal(dto.name, "لائحة.pdf");
  assert.ok(!JSON.stringify(dto).includes("case-x/"));
  assert.equal(toArchivedDocumentDto({ ...row, file_name: "  " }, names).name, "مستند");
});

test("archivedNameIds collects authors, uploaders and archivers once", () => {
  const ids = archivedNameIds(
    [{ id: "n", author_user_id: "a", visibility: "firm", body: "", created_at: "", deleted_at: "", deleted_by: "b" }],
    [{ id: 1, file_name: "", owner_user_id: "a", created_at: "", deleted_at: "", deleted_by: null }],
  );
  assert.deepEqual(ids.sort(), ["a", "b"]);
});
