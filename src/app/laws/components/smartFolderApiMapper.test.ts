/**
 * smartFolderApiMapper.test.ts — run with:
 *   node --test src/app/laws/components/smartFolderApiMapper.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mapApiFolderToSmartFolder, type ApiSmartFolderRow } from "./smartFolderApiMapper.ts";

test("mapApiFolderToSmartFolder maps a full row, items included", () => {
  const row: ApiSmartFolderRow = {
    id: "f1",
    name: "العقارات",
    color: "#0ea5e9",
    icon: "star",
    is_pinned: true,
    updated_at: "2026-09-01T10:00:00.000Z",
    created_at: "2026-08-01T10:00:00.000Z",
    smart_folder_items: [
      {
        id: "item-1",
        entity_type: "law",
        entity_id: "labor-law",
        title: "نظام العمل",
        title_en: "Labor Law",
        cat_id: "SA-06",
      },
    ],
  };

  const folder = mapApiFolderToSmartFolder(row);

  assert.equal(folder.id, "f1");
  assert.equal(folder.name, "العقارات");
  assert.equal(folder.nameEn, "العقارات"); // DB only stores one name — used for both
  assert.equal(folder.color, "#0ea5e9");
  assert.equal(folder.icon, "star");
  assert.equal(folder.isDefault, false);
  assert.equal(folder.isPinned, true);
  assert.equal(folder.lastModified, new Date(row.updated_at as string).getTime());
  assert.deepEqual(folder.laws, [
    {
      slug: "labor-law",
      title: "نظام العمل",
      titleEn: "Labor Law",
      catId: "SA-06",
      type: "law",
      _itemDbId: "item-1",
    },
  ]);
});

test("mapApiFolderToSmartFolder defaults: no color, the folder emoji icon, unset pin, no items", () => {
  const row: ApiSmartFolderRow = { id: "f2", name: "بلا لون" };
  const folder = mapApiFolderToSmartFolder(row);

  assert.equal(folder.color, "#C8A762");
  assert.equal(folder.icon, "default");
  assert.equal(folder.isPinned, false);
  assert.deepEqual(folder.laws, []);
});

test("mapApiFolderToSmartFolder: the 📁 icon maps to 'default', a real icon id passes through", () => {
  assert.equal(mapApiFolderToSmartFolder({ id: "a", name: "x", icon: "📁" }).icon, "default");
  assert.equal(mapApiFolderToSmartFolder({ id: "b", name: "x", icon: "book" }).icon, "book");
});

test("mapApiFolderToSmartFolder: lastModified prefers updated_at over created_at", () => {
  const folder = mapApiFolderToSmartFolder({
    id: "f3",
    name: "x",
    updated_at: "2026-09-02T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(folder.lastModified, new Date("2026-09-02T00:00:00.000Z").getTime());
});

test("mapApiFolderToSmartFolder: lastModified falls back to created_at, then to now", () => {
  const withCreatedOnly = mapApiFolderToSmartFolder({ id: "f4", name: "x", created_at: "2026-01-01T00:00:00.000Z" });
  assert.equal(withCreatedOnly.lastModified, new Date("2026-01-01T00:00:00.000Z").getTime());

  const before = Date.now();
  const withNeither = mapApiFolderToSmartFolder({ id: "f5", name: "x" });
  const after = Date.now();
  assert.ok(withNeither.lastModified! >= before && withNeither.lastModified! <= after);
});

test("mapApiFolderToSmartFolder: an item missing title/title_en/cat_id falls back to entity_id / empty catId", () => {
  const folder = mapApiFolderToSmartFolder({
    id: "f6",
    name: "x",
    smart_folder_items: [{ id: "item-2", entity_id: "some-slug" }],
  });
  assert.deepEqual(folder.laws[0], {
    slug: "some-slug",
    title: "some-slug",
    titleEn: "some-slug",
    catId: "",
    type: "law",
    _itemDbId: "item-2",
  });
});
