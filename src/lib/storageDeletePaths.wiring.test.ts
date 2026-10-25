/**
 * storageDeletePaths.wiring.test.ts — the three service-role delete paths
 * remove a row's file from the folder it was WRITTEN in (folder_owner_id,
 * 20261026_72), not the row's current owner (final branch review, item 1).
 *
 * The scenario they closed: a firm member is removed → 20261026_70 moves his
 * copy of a firm file to the firm owner; the file stays in the member's folder
 * (folder_owner_id = member); the owner bins it; the purge deleted the row but
 * kept the bytes (not in the owner's folder) → no row held the path → the
 * member's own-folder Storage SELECT (20261026_71) let him download it.
 *
 * The routes import through `@/`, which node --test cannot resolve, so this
 * reads their source; the rule itself is unit-tested in
 * storagePathOwnership.test.ts (isRemovableWithRow, isMissingFolderOwnerColumn).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/storageDeletePaths.wiring.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(import.meta.dirname, "../app/api/v1", p), "utf8");

const ROUTES = [
  { path: "documents/[id]/route.ts", writer: "doc.owner_user_id", folder: "doc.folder_owner_id", row: "doc" },
  { path: "cron/deadlines/route.ts", writer: "row.owner_user_id", folder: "row.folder_owner_id", row: "row" },
  {
    path: "lawyer/contracts/[id]/versions/[vid]/route.ts",
    writer: "deletedRow.uploaded_by",
    folder: "deletedRow.folder_owner_id",
    row: "deletedRow",
  },
] as const;

for (const r of ROUTES) {
  test(`${r.path}: selects folder_owner_id and removes only from the folder the file was written in`, () => {
    const src = read(r.path);
    assert.match(src, /folder_owner_id"\)|, folder_owner_id`\)/, "folder_owner_id is read with the row");
    assert.ok(
      src.includes(`isRemovableWithRow(${r.row}.storage_path, ${r.folder}, ${r.writer})`),
      "the remove guard is the written-in folder, falling back to the writer",
    );
    assert.equal(/isPathInOwnerFolder\(/.test(src), false, "no delete guard on the row's current owner is left");
    // The guard decides the removal: it comes before the storage remove call.
    const guard = src.indexOf("isRemovableWithRow(");
    const remove = src.indexOf('.storage.from("documents").remove(');
    assert.ok(guard > 0 && remove > guard, "the guard comes before the removal");
  });

  test(`${r.path}: retries without folder_owner_id only when 72 has not added it`, () => {
    const src = read(r.path);
    assert.match(src, /if \(isMissingFolderOwnerColumn\([a-zA-Z]+\.error\)\) \{/);
    const withCol = src.search(/folder_owner_id"\)|, folder_owner_id`\)/);
    const retry = src.indexOf("isMissingFolderOwnerColumn(", withCol);
    assert.ok(withCol > 0 && retry > withCol, "the fallback follows the read that names the column");
  });
}

test("contract version delete: the retry is the delete itself, before the current-version fixup", () => {
  const src = read("lawyer/contracts/[id]/versions/[vid]/route.ts");
  const retry = src.indexOf("isMissingFolderOwnerColumn(");
  const fixup = src.indexOf("current_version_id: newestRemainingId");
  assert.ok(retry > 0 && fixup > retry, "a failed first delete changed nothing, so the fixup runs once, after the retry");
  assert.match(src, /const deleteVersion = \(columns: string\) =>\s+supabase\.from\("contract_versions"\)\.delete\(\)\.eq\("id", vid\)\.eq\("contract_id", id\)\.select\(columns\)/);
});
