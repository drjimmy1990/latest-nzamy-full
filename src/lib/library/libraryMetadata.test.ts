/**
 * libraryMetadata — owner note ١٤ phase 1 (answers ٣١٨ / ٣١٩): what a library
 * document may say in <head>, JSON-LD and the sitemaps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLibraryJsonLd,
  cutAtWord,
  decodeRouteSlug,
  guestPlainText,
  lawDateModified,
  libraryDocPath,
  libraryPageTitle,
  librarySitemapEntry,
  librarySitemapUrls,
  publicDescription,
  publicDocumentTitle,
  publicTextLeaks,
  removeLinks,
  serializeJsonLd,
  stripBrandSuffix,
  LIBRARY_SITEMAP_IDS,
  type LibraryDocSeo,
} from "./libraryMetadata.ts";

/** Everything a guest's public text must never carry. */
const FORBIDDEN = [/م\s*\/\s*[0-9٠-٩]/u, /[0-9٠-٩]{1,4}\s*[/.]\s*[0-9٠-٩]{1,2}\s*[/.]\s*[0-9٠-٩]{1,4}/u, /1442|١٤٤٢/u, /gov\.sa/i, /https?:/i, /www\./i, /رقم\s*\(?\s*[0-9٠-٩]/u];
const assertClean = (s: string, label: string) => {
  for (const re of FORBIDDEN) assert.doesNotMatch(s, re, `${label}: ${s}`);
};

const LEAKY_SUMMARY = [
  "## 📝 موجز النظام",
  "- صدر بالمرسوم الملكي رقم (م/‏14) وتاريخ ١٤٤٢/٩/٢٢هـ.",
  "- يُعمل به من 22 رمضان 1442هـ ويُنشر في [الجريدة الرسمية](https://www.boe.gov.sa/ar/Laws/1).",
  "- **يهدف** النظام إلى تنظيم العمل وحماية حقوق العامل وصاحب العمل، والمهلة ٣٠ يوماً.",
  "- المصدر: www.boe.gov.sa/Laws",
].join("\n");

test("the description drops decree numbers, dates and every link, keeps the substance (٣١٩ + ٣١٨)", () => {
  const d = publicDescription("law", LEAKY_SUMMARY);
  assertClean(d, "description");
  assert.match(d, /يهدف النظام إلى تنظيم العمل/);
  assert.match(d, /٣٠ يوماً/, "other numbers are untouched");
  assert.doesNotMatch(d, /\*|#|\[|\]/, "no markdown");
  assert.doesNotMatch(d, /موجز النظام|📝/, "the heading is a label, not the text");
  assert.ok(d.length <= 160);
});

test("the description is cut at a word to ~160 characters", () => {
  const long = "تنظيم ".repeat(60);
  const d = publicDescription("law", long);
  assert.ok(d.length <= 160, String(d.length));
  assert.ok(d.endsWith("…"));
  assert.equal(cutAtWord("قصير"), "قصير");
});

test("nothing safe left → the generic line, never the leak", () => {
  const d = publicDescription("law", "مرسوم ملكي رقم م/14 وتاريخ 1442/09/22هـ", "https://www.boe.gov.sa/x");
  assertClean(d, "fallback");
  assert.match(d, /مكتبة نظامي/);
  assert.equal(publicDescription("book"), "كتاب فقهي في مكتبة نظامي.");
});

test("a collection's fallback line loses its year without a dangling «لعام»", () => {
  const d = publicDescription("collection", "", "مبادئ المحكمة الإدارية العليا لعام ١٤٤٣هـ — المحكمة الإدارية العليا");
  assert.equal(d, "مبادئ المحكمة الإدارية العليا — المحكمة الإدارية العليا");
});

test("removeLinks: markdown link → its text; bare URL, www. and bare .gov.sa domains go", () => {
  assert.equal(removeLinks("[هيئة الخبراء](https://www.boe.gov.sa/a)").trim(), "هيئة الخبراء");
  assertClean(removeLinks("المصدر https://laws.boe.gov.sa/BoeLaws/Laws/LawDetails/1 و www.moj.gov.sa و ncar.gov.sa/x"), "removeLinks");
  assert.equal(publicTextLeaks("انظر boe.gov.sa"), true);
  assert.equal(publicTextLeaks("نظام العمل"), false);
});

test("guestPlainText strips with the hidden U+200F inside «م/14»", () => {
  const t = guestPlainText("صدر بالمرسوم رقم (م/‏14) لتنظيم السوق.");
  assertClean(t, "guestPlainText");
  assert.match(t, /لتنظيم السوق/);
});

test("brand: appended once, never «| نظامي - نظامي»", () => {
  assert.equal(libraryPageTitle("نظام العمل"), "نظام العمل | نظامي");
  assert.equal(libraryPageTitle("نظام العمل - نظامي | Nezamy"), "نظام العمل | نظامي");
  assert.equal(libraryPageTitle("نظام العمل | نظامي - نظامي"), "نظام العمل | نظامي");
  assert.equal(stripBrandSuffix("نظام العمل — Nezamy"), "نظام العمل");
  // A real title that contains the word is untouched.
  assert.equal(stripBrandSuffix("المبادئ النظامي ة"), "المبادئ النظامي ة");
  assert.equal(libraryPageTitle("الإجراء النظامي"), "الإجراء النظامي | نظامي");
  for (const t of ["نظام العمل - نظامي | Nezamy", "نظام | نظامي | نظامي"]) {
    assert.doesNotMatch(libraryPageTitle(t), /نظامي\s*[|\-–—]\s*(?:نظامي|Nezamy)/);
  }
});

test("a decree whose title is only its number and date gets its subject from the موجز", () => {
  const t = publicDocumentTitle("order", {
    title: "المرسوم الملكي رقم م/44 وتاريخ 1446/02/08هـ",
    type: "royal",
    summary: "إنشاء الهيئة العليا لأندية الفروسية بتاريخ 1446/02/08هـ",
  });
  assertClean(t, "order title");
  assert.equal(t, "المرسوم الملكي — إنشاء الهيئة العليا لأندية الفروسية");
  const cabinet = publicDocumentTitle("order", { title: "قرار مجلس الوزراء رقم (135) وتاريخ 1442/2/26هـ", type: "cabinet" });
  assertClean(cabinet, "cabinet title");
  assert.equal(cabinet, "قرار مجلس الوزراء");
  // A plain title is kept as it is.
  assert.equal(publicDocumentTitle("order", { title: "تعميم بشأن ضوابط الإعلانات العقارية", type: "circular" }), "تعميم بشأن ضوابط الإعلانات العقارية");
});

test("a law title loses a decree date; a collection keeps its year (its identity)", () => {
  assertClean(publicDocumentTitle("law", { title: "نظام العمل الصادر بالمرسوم م/51 وتاريخ 1426/08/23هـ" }), "law title");
  assert.equal(publicDocumentTitle("law", { title: "نظام العمل" }), "نظام العمل");
  assert.equal(publicDocumentTitle("collection", { title: "مبادئ المحكمة الإدارية العليا لعام ١٤٤٣هـ" }), "مبادئ المحكمة الإدارية العليا لعام ١٤٤٣هـ");
  assert.equal(publicDocumentTitle("law", { title: "" , type: "نظام" }), "نظام");
});

const LAW: LibraryDocSeo = {
  kind: "law",
  id: "nizam-al-amal",
  name: "نظام العمل",
  description: "يهدف النظام إلى تنظيم العمل.",
  dateModified: "2026-07-24",
  legislationType: "نظام",
};

test("Legislation JSON-LD: jurisdiction SA, dateModified only from the ISO day, nothing locked", () => {
  const ld = buildLibraryJsonLd(LAW) as { "@graph": Array<Record<string, unknown>> };
  const [main, crumbs] = ld["@graph"];
  assert.equal(main["@type"], "Legislation");
  assert.equal(main.legislationJurisdiction, "SA");
  assert.equal(main.dateModified, "2026-07-24");
  assert.equal(main.url, "https://nezamy.sa/laws/nizam-al-amal");
  assert.equal(crumbs["@type"], "BreadcrumbList");
  const json = serializeJsonLd(ld);
  for (const banned of ["FAQPage", "sameAs", "datePublished", "legislationDate", "legislationIdentifier", "legislationPassedBy", "areaServed", "spatialCoverage", "HowTo", "GovernmentService", "gov.sa"]) {
    assert.ok(!json.includes(banned), banned);
  }
  const noDate = buildLibraryJsonLd({ ...LAW, dateModified: null }) as { "@graph": Array<Record<string, unknown>> };
  assert.equal("dateModified" in noDate["@graph"][0], false, "omitted when null");
  const badDate = buildLibraryJsonLd({ ...LAW, dateModified: "1446/02/08هـ" }) as { "@graph": Array<Record<string, unknown>> };
  assert.equal("dateModified" in badDate["@graph"][0], false, "only a YYYY-MM-DD day");
});

test("the @type comes from the kind: order → Legislation (no date), collection → Collection, book → Book", () => {
  const order = buildLibraryJsonLd({ ...LAW, kind: "order", id: "0b1c2d3e-0000-4000-8000-000000000000", dateModified: "2026-01-01" }) as { "@graph": Array<Record<string, unknown>> };
  assert.equal(order["@graph"][0]["@type"], "Legislation");
  assert.equal("dateModified" in order["@graph"][0], false, "a decree's own date is a subscriber's");
  const col = buildLibraryJsonLd({ ...LAW, kind: "collection", collectionSize: 120 }) as { "@graph": Array<Record<string, unknown>> };
  assert.equal(col["@graph"][0]["@type"], "Collection");
  assert.equal(col["@graph"][0].collectionSize, 120);
  const book = buildLibraryJsonLd({ ...LAW, kind: "book", id: "المغني - الجزء 01", author: "ابن قدامة" }) as { "@graph": Array<Record<string, unknown>> };
  assert.equal(book["@graph"][0]["@type"], "Book");
  assert.deepEqual(book["@graph"][0].author, { "@type": "Person", name: "ابن قدامة" });
  assert.equal(book["@graph"][0].url, `https://nezamy.sa/book/${encodeURIComponent("المغني - الجزء 01")}`);
});

test("a leaky name or description never reaches the JSON-LD", () => {
  const json = serializeJsonLd(buildLibraryJsonLd({ ...LAW, name: "مرسوم م/14", description: "انظر https://www.boe.gov.sa" }));
  // Only our own URLs (and the schema.org context) remain.
  const own = json.replace(/https:\/\/(?:nezamy\.sa|schema\.org)[^"]*/g, "");
  assertClean(own, "json-ld");
  assert.ok(!json.includes("boe"));
});

test("serializeJsonLd escapes < > & and U+2028 — a title cannot close the script", () => {
  const ls = String.fromCharCode(0x2028);
  const s = serializeJsonLd({ name: `</script><script>alert(1)</script> & ${ls}` });
  assert.ok(!s.includes("<") && !s.includes(">") && !s.includes("&"));
  assert.ok(!s.includes(ls));
  assert.equal(JSON.parse(s).name, `</script><script>alert(1)</script> & ${ls}`);
});

test("lawDateModified = latestLegislativeEvent(...).iso, the later of the two dates", () => {
  const iso = lawDateModified({ latest_update: { date_hijri: "1448/01/08" }, issue_date_hijri: "1426/08/23" });
  assert.match(String(iso), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(iso?.slice(0, 4), "2026");
  assert.equal(lawDateModified({ issue_date_hijri: "1446هـ" }), null, "a year alone has no day");
  assert.equal(lawDateModified({}), null);
});

test("paths encode the id exactly once; route params decode once", () => {
  const id = "الأسس العامة للعقود الإدارية";
  assert.equal(libraryDocPath("book", id), `/book/${encodeURIComponent(id)}`);
  assert.equal(libraryDocPath("book", encodeURIComponent(id)), `/book/${encodeURIComponent(id)}`, "an encoded id is not encoded twice");
  assert.equal(libraryDocPath("order", "abc"), "/laws/orders/abc");
  assert.equal(libraryDocPath("collection", "x"), "/precedents/x");
  assert.equal(decodeRouteSlug(encodeURIComponent(id)), id);
  assert.equal(decodeRouteSlug("100%"), "100%", "a malformed escape is kept, not thrown");
});

test("sitemap entries: documents only, URL encoded once, lastModified only from an ISO day", () => {
  assert.deepEqual([...LIBRARY_SITEMAP_IDS], ["laws", "orders", "collections", "books"]);
  assert.deepEqual(librarySitemapUrls(), [
    "https://nezamy.sa/library-sitemaps/sitemap/laws.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/orders.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/collections.xml",
    "https://nezamy.sa/library-sitemaps/sitemap/books.xml",
  ]);
  const e = librarySitemapEntry("book", "المغني", "2026-07-24");
  assert.equal(e?.url, `https://nezamy.sa/book/${encodeURIComponent("المغني")}`);
  assert.equal(e?.lastModified, "2026-07-24");
  assert.equal("lastModified" in (librarySitemapEntry("law", "x", null) ?? {}), false, "no date → none, not today");
  assert.equal("lastModified" in (librarySitemapEntry("law", "x", "1446/01/01") ?? {}), false);
  assert.equal(librarySitemapEntry("law", "  "), null);
});
