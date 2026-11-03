/**
 * folderLibrarySearch.test.ts — «إدارة المحتوى» maps the REAL library's
 * answers to folder documents (owner notes ٠٤ §٢, ٠٥ §٢.٢).
 *   node --test src/app/laws/components/folderLibrarySearch.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  FOLDER_PICKER_TABS,
  SEARCH_SECTION_FOR_TAB,
  INIT_SECTION_FOR_TYPE,
  catIdFromSectionCode,
  dedupeDocs,
  docKey,
  filterDocsByTitle,
  interleaveDefaults,
  isSearchableQuery,
  mapInitRowsToDocs,
  mapSearchResultsToDocs,
} from "./folderLibrarySearch.ts";

test("five tabs, in the owner's order, each wired to a real search section", () => {
  assert.deepEqual(FOLDER_PICKER_TABS.map(t => t.label), ["الكل", "الأنظمة", "المبادئ والأحكام", "الأوامر والتعاميم", "الكتب الفقهية"]);
  assert.deepEqual(SEARCH_SECTION_FOR_TAB, { all: "all", law: "laws", precedent: "precedents", order: "orders", book: "feqh" });
  assert.deepEqual(INIT_SECTION_FOR_TYPE, { law: "laws", precedent: "collections", order: "decrees", book: "books" });
});

test("search hits become documents: an article saves its law, a principle its collection, a passage its book", () => {
  const titles = new Map([["moj-1434", "مجموعة الأحكام القضائية ١٤٣٤"]]);
  const docs = mapSearchResultsToDocs([
    { id: "law:labor-law", section: "laws", title: "نظام العمل", meta: { kind: "law", lawSlug: "labor-law", lawTitle: "نظام العمل", sectionCode: "SA-06" } },
    { id: "a1", section: "laws", title: "نظام العمل — المادة ٧٧", meta: { kind: "article", lawSlug: "labor-law", lawTitle: "نظام العمل" } },
    { id: "a2", section: "laws", title: "نظام الإثبات — المادة ١", meta: { kind: "article", lawSlug: "evidence-law", lawTitle: "نظام الإثبات" } },
    { id: "collection:moj-1435", section: "precedents", title: "مجموعة ١٤٣٥", meta: { kind: "collection", collectionSlug: "moj-1435" } },
    { id: "p1", section: "precedents", title: "مبدأ رقم ٣ — المحكمة العليا", meta: { collectionSlug: "moj-1434" } },
    { id: "p2", section: "precedents", title: "مبدأ رقم ٤", meta: { collectionSlug: "unknown-collection" } },
    { id: "3f2dd638-350c-42a1-a5e3-889decb7aa96", section: "orders", title: "تعميم وزارة العدل", meta: {} },
    { id: "book:زاد", section: "feqh", title: "زاد المستقنع", meta: { kind: "book", bookSlug: "زاد", bookTitle: "زاد المستقنع" } },
    { id: "b1", section: "feqh", title: "زاد المستقنع — البيع", meta: { bookSlug: "زاد", bookTitle: "زاد المستقنع" } },
  ], titles);
  assert.deepEqual(docs.map(d => [d.type, d.slug, d.title]), [
    ["law", "labor-law", "نظام العمل"],
    ["law", "evidence-law", "نظام الإثبات"],
    ["precedent", "moj-1435", "مجموعة ١٤٣٥"],
    ["precedent", "moj-1434", "مجموعة الأحكام القضائية ١٤٣٤"],
    ["order", "3f2dd638-350c-42a1-a5e3-889decb7aa96", "تعميم وزارة العدل"],
    ["book", "زاد", "زاد المستقنع"],
  ]);
  assert.equal(docs[0].catId, "SA-06");
  assert.ok(!docs.some(d => d.title.startsWith("مبدأ رقم")), "a principle hit never saves under its own «مبدأ رقم» title");
});

test("garbage in the answer is ignored, not thrown on", () => {
  assert.deepEqual(mapSearchResultsToDocs(null), []);
  assert.deepEqual(mapSearchResultsToDocs([null, 3, { section: "laws", meta: {} }]), []);
  assert.deepEqual(mapInitRowsToDocs("laws", undefined), []);
});

test("init rows: laws keep the catalogue order; collections newest year first; decrees newest date first", () => {
  assert.deepEqual(
    mapInitRowsToDocs("laws", [{ slug: "b", title: "ب", section_code: "07" }, { slug: "a", title: "أ" }]).map(d => [d.slug, d.catId]),
    [["b", "SA-07"], ["a", "SA-00"]],
  );
  assert.deepEqual(
    mapInitRowsToDocs("collections", [{ id: "c1", title: "١٤٣٠", year_hijri: 1430 }, { id: "c2", title: "١٤٤٤", year_hijri: "1444" }]).map(d => d.slug),
    ["c2", "c1"],
  );
  assert.deepEqual(
    mapInitRowsToDocs("decrees", [{ id: "d1", title: "قديم", date: "1440-01-01" }, { id: "d2", title: "حديث", date: "1446-05-01" }]).map(d => d.slug),
    ["d2", "d1"],
  );
  assert.deepEqual(mapInitRowsToDocs("books", [{ id: "زاد", title: "زاد المستقنع" }]).map(d => d.type), ["book"]);
});

test("«الكل» before typing: a few of each type, in the tab order", () => {
  const mk = (type: "law" | "precedent" | "order" | "book", n: number) =>
    Array.from({ length: n }, (_, i) => ({ slug: `${type}${i}`, title: `${type} ${i}`, titleEn: "", catId: "SA-00", type }));
  const all = interleaveDefaults({ book: mk("book", 9), law: mk("law", 9), order: mk("order", 2) }, 3);
  assert.deepEqual(all.map(d => d.slug), ["law0", "law1", "law2", "order0", "order1", "book0", "book1", "book2"]);
});

test("title filter folds Arabic spellings and needs every word", () => {
  const docs = [
    { slug: "1", title: "مجموعة الأحكام القضائية لعام ١٤٣٤", titleEn: "", catId: "SA-00", type: "precedent" as const },
    { slug: "2", title: "المبادئ التجارية", titleEn: "", catId: "SA-00", type: "precedent" as const },
  ];
  assert.deepEqual(filterDocsByTitle(docs, "الاحكام 1434").map(d => d.slug), ["1"]);
  assert.deepEqual(filterDocsByTitle(docs, "").length, 2);
});

test("dedupe, keys, section codes, query length", () => {
  const a = { slug: "x", title: "س", titleEn: "", catId: "SA-00", type: "law" as const };
  assert.equal(dedupeDocs([a, { ...a }, { ...a, type: "book" as const }]).length, 2);
  assert.notEqual(docKey({ slug: "x", type: "law" }), docKey({ slug: "x", type: "book" }));
  assert.equal(docKey({ slug: "x" }), docKey({ slug: "x", type: "law" }));
  assert.equal(catIdFromSectionCode("SA-04"), "SA-04");
  assert.equal(catIdFromSectionCode(4), "SA-04");
  assert.equal(catIdFromSectionCode("junk"), "SA-00");
  assert.equal(isSearchableQuery(" ع "), false);
  assert.equal(isSearchableQuery("عمل"), true);
});
