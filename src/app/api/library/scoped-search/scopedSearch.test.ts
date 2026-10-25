/**
 * N2.6 — the in-document search: request rules (Arabic, operators, empty and
 * very long queries, odd scopes) and the paywall of each hit, held to the
 * global search's rules. Plus source pins on route.ts (it needs a database).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  hashiyahNotes,
  SCOPED_MAX_LIMIT,
  SCOPED_QUERY_MAX,
  shapeHit,
  validateScopedRequest,
  type ScopeVolume,
  type ViewerAccess,
} from "./scopedSearch.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROUTE = readFileSync(path.join(here, "route.ts"), "utf8").replace(/\r\n/g, "\n");

const ok = (v: unknown) => {
  const r = validateScopedRequest(v);
  assert.ok(r.ok, JSON.stringify(r));
  return r.request;
};
const fail = (v: unknown, code: string) => {
  const r = validateScopedRequest(v);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, code);
};

test("scopes: law / collection / book with an id, NFC; anything else refused", () => {
  assert.deepEqual(ok({ scope: "law:companies-law", query: "فسخ" }), { kind: "law", id: "companies-law", query: "فسخ", page: 1, limit: 20 });
  // a decomposed Arabic file name arrives in the stored (NFC) form
  const nfd = "المغني_الجزء_٤".normalize("NFD");
  assert.equal(ok({ scope: `book:${nfd}`, query: "غبن" }).id, "المغني_الجزء_٤".normalize("NFC"));
  assert.equal(ok({ scope: "collection:moj-rulings-1434-v02", query: "غرامة" }).kind, "collection");
  fail({ scope: "decree:x", query: "فسخ" }, "invalid_scope");
  fail({ scope: "law:", query: "فسخ" }, "invalid_scope");
  fail({ scope: "law:   ", query: "فسخ" }, "invalid_scope");
  fail({ scope: "law:a\u0000b", query: "فسخ" }, "invalid_scope");
  fail({ scope: `book:${"ب".repeat(201)}`, query: "فسخ" }, "invalid_scope");
  fail({ scope: ["law:x"], query: "فسخ" }, "invalid_scope");
  fail(null, "invalid_request");
});

test("queries: operators pass through untouched; empty, one letter and very long are refused", () => {
  assert.equal(ok({ scope: "law:x", query: '  "غرامة تأخير" + سحب / فسخ -تحكيم تعويض*  ' }).query, '"غرامة تأخير" + سحب / فسخ -تحكيم تعويض*');
  fail({ scope: "law:x", query: "" }, "query_too_short");
  fail({ scope: "law:x", query: "  ف " }, "query_too_short");
  fail({ scope: "law:x", query: 5 }, "invalid_query");
  fail({ scope: "law:x", query: "ع".repeat(SCOPED_QUERY_MAX + 1) }, "query_too_long");
  assert.equal(ok({ scope: "law:x", query: "ع".repeat(SCOPED_QUERY_MAX) }).query.length, SCOPED_QUERY_MAX);
});

test("paging: positive integers, limit ≤ 50, no window past the first 1,000", () => {
  assert.equal(ok({ scope: "law:x", query: "فسخ", page: 3, limit: 50 }).page, 3);
  fail({ scope: "law:x", query: "فسخ", page: 0 }, "invalid_page");
  fail({ scope: "law:x", query: "فسخ", page: 1.5 }, "invalid_page");
  fail({ scope: "law:x", query: "فسخ", limit: SCOPED_MAX_LIMIT + 1 }, "invalid_limit");
  fail({ scope: "law:x", query: "فسخ", page: 21, limit: 50 }, "page_too_deep");
  assert.equal(ok({ scope: "law:x", query: "فسخ", page: 20, limit: 50 }).page, 20);
});

const VOLS: ScopeVolume[] = [{ id: "v1", label: "المجلد 1" }, { id: "v2", label: "المجلد 2" }];
const access = (o: Partial<ViewerAccess> & { free?: string[] } = {}): ViewerAccess => ({
  hasFullAccess: o.hasFullAccess ?? false,
  whitelistedSlugs: [],
  freeItemsByType: o.freeItemsByType ?? {},
  isFree: o.isFree ?? ((_t, itemId) => (o.hasFullAccess ?? false) || (o.free ?? []).includes(itemId)),
});
const LONG = "مقدمة طويلة " + "كلام ".repeat(60) + "فسخ العقد هنا " + "تتمة ".repeat(60);

test("article: locked = the 100-character opening, not centred on the query, no body", () => {
  const row = { id: "law__a1", volume_id: "law", number: "12", number_text: "الثانية عشرة", status: "active", text: LONG, executive_reg_text: "لائحة" };
  const locked = shapeHit("law", row, [{ id: "law", label: null }], ["فسخ"], access());
  assert.equal(locked.locked, true);
  assert.equal(locked.body, null);
  assert.ok(locked.snippet.startsWith("مقدمة طويلة"), locked.snippet);
  assert.ok(locked.snippet.length <= 100);
  assert.doesNotMatch(locked.snippet, /فسخ/);
  // the law reader's own label (_article-label.ts), as the global search shows it
  assert.equal(locked.place, "الثانية عشرة");

  const open = shapeHit("law", row, [{ id: "law", label: null }], ["فسخ"], access({ hasFullAccess: true }));
  assert.equal(open.locked, false);
  assert.match(open.snippet, /فسخ/);
  assert.ok(open.snippet.length <= 200);
  assert.deepEqual(open.body, { title: null, text: LONG, regulation: "لائحة" });
});

test("article: a free (whitelisted) law opens for a non-subscriber; a repealed article reads original_text", () => {
  const row = { id: "w__a3", volume_id: "w", number: "3", status: "repealed", text: "", original_text: "كان النص قبل الإلغاء" };
  const hit = shapeHit("law", row, [{ id: "w", label: null }], ["النص"], access({ free: ["w"] }));
  assert.equal(hit.locked, false);
  assert.equal(hit.snippet, "كان النص قبل الإلغاء");
  assert.equal((hit.body as { text: string }).text, "كان النص قبل الإلغاء");
});

test("principle: per-principle lock, volume badge, the judgment parts only when free", () => {
  const row = { id: "v2__p118", volume_id: "v2", principle_number: "118", issuing_body: "المحكمة الإدارية العليا", session_date: "1444/4/9", text: LONG, facts: "وقائع", reasons: "أسباب", ruling: "منطوق", reference: "مرجع" };
  const locked = shapeHit("collection", row, VOLS, ["فسخ"], access());
  assert.equal(locked.place, "المجلد 2 — مبدأ رقم 118");
  assert.equal(locked.body, null);
  assert.ok(locked.snippet.startsWith("مقدمة طويلة") && locked.snippet.length <= 100);
  assert.equal(locked.meta.issuingBody, "المحكمة الإدارية العليا");
  const open = shapeHit("collection", row, VOLS, ["فسخ"], access({ free: ["v2__p118"] }));
  assert.equal(open.locked, false);
  assert.deepEqual(open.body, { reference: "مرجع", text: LONG, rulingBasis: null, facts: "وقائع", reasons: "أسباب", ruling: "منطوق" });
});

test("block: locked = its place and NO text (owner ١٨٣); free = matn, sharh, hashiyah", () => {
  const row = { id: "b__1", volume_id: "v1", topic: "خيار الغبن", volume_number: 4, page_number: 218, matn: "من غبن", sharh: "يثبت خيار الغبن", hashiyah: ["حاشية"], chapter_title: "كتاب البيوع" };
  const locked = shapeHit("book", row, VOLS, ["الغبن"], access());
  assert.equal(locked.locked, true);
  assert.equal(locked.snippet, "");
  assert.equal(locked.body, null);
  assert.equal(locked.place, "المجلد 1 — المجلد 4 — الصفحة 218");
  assert.equal(locked.meta.chapter, "كتاب البيوع");
  // a block listed as free opens for everyone; full access opens all
  assert.equal(shapeHit("book", row, VOLS, [], access({ freeItemsByType: { feqh: ["b__1"] } })).locked, false);
  const open = shapeHit("book", row, VOLS, ["الغبن"], access({ hasFullAccess: true }));
  assert.deepEqual(open.body, { matn: "من غبن", sharh: "يثبت خيار الغبن", hashiyah: ["حاشية"] });
  assert.equal(shapeHit("book", { id: "x", volume_id: "zz" }, VOLS, [], access()).place, "موضع غير مرقّم");
});

test("hashiyahNotes: jsonb array, one string, or nothing", () => {
  assert.deepEqual(hashiyahNotes(["أ", " ", "ب"]), ["أ", "ب"]);
  assert.deepEqual(hashiyahNotes("حاشية"), ["حاشية"]);
  assert.deepEqual(hashiyahNotes(null), []);
});

test("route: gate first, operator-safe parsing, the RPC with an inline fallback, no raw .or(), tier-shaped cache", () => {
  const gate = ROUTE.indexOf("await libraryGate()");
  assert.ok(gate > 0 && gate < ROUTE.indexOf("validateScopedRequest("), "libraryGate runs before anything else");
  assert.match(ROUTE, /parsed = parseSearchQuery\(req\.query\)/);
  assert.match(ROUTE, /error instanceof SearchQuerySyntaxError/);
  assert.match(ROUTE, /\.rpc\(SCOPED_RPC, \{/);
  assert.match(ROUTE, /isMissingFunctionError\(rpcRes\.error\)/);
  assert.match(ROUTE, /\.textSearch\('fts', tsquery, \{ config: LIBRARY_FTS_CONFIG \}\)/);
  assert.doesNotMatch(ROUTE, /\.or\(/, "no PostgREST .or() string in this route");
  assert.match(ROUTE, /'Cache-Control': TIER_SHAPED_CACHE_CONTROL/);
  assert.match(ROUTE, /getLibraryAccessForUser\(userId\)/);
  // the series is resolved on the server from the catalogue (anon allow-list columns)
  assert.match(ROUTE, /buildCollectionSeries\(/);
  assert.match(ROUTE, /buildBookSeries\(/);
  // every hit goes through shapeHit (the paywall); rows never reach the response raw
  assert.match(ROUTE, /rows\.map\(\(row\) => shapeHit\(scope\.kind, row, scope\.volumes, parsed\.plainTerms, access\)\)/);
});
