/**
 * noteDocRef.test.ts — «ملاحظاتي وتحديداتي» names each document in Arabic and
 * badges it with its real type (owner note ٠٣ §٢.٢).
 *   node --test src/app/laws/components/noteDocRef.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  bookIdCandidates,
  buildTitleLookup,
  fetchLibraryTitles,
  humaniseSlug,
  noteDisplayTitle,
  noteDocHref,
  noteTypeBadge,
  parseNotePageId,
  TITLE_LOOKUP_MAX_PER_KIND,
} from "./noteDocRef.ts";

const UUID = "3f2dd638-350c-42a1-a5e3-889decb7aa96";

test("the four readers' page keys parse to the right type (the bug badged every one «الأنظمة واللوائح»)", () => {
  assert.equal(parseNotePageId("real-estate-ownership-law").kind, "law");
  assert.equal(parseNotePageId(`order-${UUID}`).kind, "order");
  const prec = parseNotePageId("precedent-principles-moj-rulings-1434-v01");
  assert.deepEqual([prec.kind, prec.id], ["precedent", "moj-rulings-1434-v01"]);
  const book = parseNotePageId("feqh-الروض المربع-b12");
  assert.equal(book.kind, "book");
  assert.deepEqual(book.bookCandidates, ["الروض المربع-b12", "الروض المربع"]);
  // Older keys a browser may still hold.
  assert.equal(parseNotePageId("precedents-x").kind, "precedent");
  assert.equal(parseNotePageId("judgment-x").legacyJudgment, true);
  assert.equal(parseNotePageId("orders-x").kind, "order");
  assert.equal(parseNotePageId("book-x").kind, "book");
  // A percent-encoded Arabic slug (useParams) is decoded once.
  assert.equal(parseNotePageId(`precedent-principles-${encodeURIComponent("مبادئ-١٤٣٤")}`).id, "مبادئ-١٤٣٤");
});

test("badge names are the owner's four", () => {
  assert.equal(noteTypeBadge("law"), "الأنظمة واللوائح");
  assert.equal(noteTypeBadge("precedent"), "المبادئ والسوابق القضائية");
  assert.equal(noteTypeBadge("book"), "الكتب والمراجع");
  assert.equal(noteTypeBadge("order"), "الأوامر والتعاميم");
});

test("the Arabic title from the lookup wins; a book takes the longest id the library knows", () => {
  const titles = {
    laws: { "real-estate-ownership-law": "نظام تملك غير السعوديين للعقار" },
    precedents: { "moj-rulings-1434-v01": "مجموعة الأحكام القضائية لعام ١٤٣٤هـ" },
    orders: { [UUID]: "تعميم رقم ١٣/ت/١٢٣٤" },
    books: { "مصادر الحق - الجزء الأول": "مصادر الحق في الفقه الإسلامي — الجزء ١" },
  };
  assert.equal(noteDisplayTitle(parseNotePageId("real-estate-ownership-law"), titles, true), "نظام تملك غير السعوديين للعقار");
  assert.equal(noteDisplayTitle(parseNotePageId("precedent-principles-moj-rulings-1434-v01"), titles, true), "مجموعة الأحكام القضائية لعام ١٤٣٤هـ");
  assert.equal(noteDisplayTitle(parseNotePageId(`order-${UUID}`), titles, true), "تعميم رقم ١٣/ت/١٢٣٤");
  const book = parseNotePageId("feqh-مصادر الحق - الجزء الأول-blk-7");
  assert.equal(noteDisplayTitle(book, titles, true), "مصادر الحق في الفقه الإسلامي — الجزء ١");
  assert.equal(noteDocHref(book, titles), `/book/${encodeURIComponent("مصادر الحق - الجزء الأول")}`);
});

test("fallbacks: never a half-English slug while loading; humanised after; a bare uuid is named by its type", () => {
  const law = parseNotePageId("real-estate-ownership-law");
  assert.equal(noteDisplayTitle(law, null, false), "جارٍ جلب العنوان…");
  assert.equal(noteDisplayTitle(law, null, true), "real estate ownership law");
  assert.equal(noteDisplayTitle(parseNotePageId("labor-law-qadha"), null, false), "نظام العمل");
  assert.equal(noteDisplayTitle(parseNotePageId("نظام-العمل"), null, false), "نظام العمل");
  assert.equal(noteDisplayTitle(parseNotePageId(`order-${UUID}`), {}, true), "أمر أو تعميم");
  assert.equal(humaniseSlug("x---y_z"), "x - y z");
});

test("links open the right reader (precedents went to /laws/precedent-principles-… before)", () => {
  assert.equal(noteDocHref(parseNotePageId("precedent-principles-moj-1434"), null), "/precedents/moj-1434");
  assert.equal(noteDocHref(parseNotePageId(`order-${UUID}`), null), `/laws/orders/${UUID}`);
  assert.equal(noteDocHref(parseNotePageId("labor-law"), null), "/laws/labor-law");
  assert.equal(noteDocHref(parseNotePageId("judgment-j1"), null), "/precedents/judgment/j1");
});

test("one batched lookup: ids per table, uuids only for orders, every book split, capped", () => {
  const body = buildTitleLookup([
    parseNotePageId("labor-law"),
    parseNotePageId("labor-law"),
    parseNotePageId(`order-${UUID}`),
    parseNotePageId("order-not-a-uuid"),
    parseNotePageId("precedent-principles-c1"),
    parseNotePageId("feqh-a-b-c"),
  ]);
  assert.deepEqual(body, { laws: ["labor-law"], orders: [UUID], precedents: ["c1"], books: ["a-b-c", "a-b", "a"] });
  assert.equal(buildTitleLookup([]), null);
  const many = buildTitleLookup(Array.from({ length: 150 }, (_, i) => parseNotePageId(`law-${i}`)));
  assert.equal(many?.laws.length, TITLE_LOOKUP_MAX_PER_KIND);
  assert.deepEqual(bookIdCandidates("x-"), ["x"]);
});

test("fetchLibraryTitles: one POST; any failure is null (rows keep their fallback)", async () => {
  const calls: string[] = [];
  const ok = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${url}`);
    return new Response(JSON.stringify({ titles: { laws: { a: "أ" } }, degraded: [] }), { status: 200 });
  }) as unknown as typeof fetch;
  assert.deepEqual(await fetchLibraryTitles({ laws: ["a"], orders: [], precedents: [], books: [] }, ok), { laws: { a: "أ" } });
  assert.deepEqual(calls, ["POST /api/library/folders/titles"]);
  const down = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
  assert.equal(await fetchLibraryTitles({ laws: ["a"], orders: [], precedents: [], books: [] }, down), null);
  const thrown = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  assert.equal(await fetchLibraryTitles({ laws: ["a"], orders: [], precedents: [], books: [] }, thrown), null);
});
