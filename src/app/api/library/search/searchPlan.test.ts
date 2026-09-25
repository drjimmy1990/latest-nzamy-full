import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_SECTION_PREVIEW,
  LAW_TITLE_HITS_LAWS,
  SEARCH_MIN_FETCH,
  fetchSizeFor,
  dedupeResults,
  dedupeTitleKey,
  isSectionCountExact,
  isPastEndError,
  isTimeoutError,
  lawFetchWindow,
  lawPageArticles,
  lawTitleSlots,
  nizamTitleFor,
  orderRowsByIds,
  pastEndTotal,
  queryWantsTitleHits,
  rankLawTitleCandidates,
  rankedLawOrderApplies,
  readPage,
  resolveSectionCount,
  scoreLawTitle,
  sectionCount,
  shouldRetryLawsWithoutHistory,
  stripDefiniteArticle,
  titlePhrasePattern,
  titlePrefixPattern,
  titleStemPatterns,
  type LawTitleCandidate,
  type SearchResultItem,
} from "./searchPlan.ts";

test("resolveSectionCount: a short page is an exact count", () => {
  assert.equal(resolveSectionCount(524, 0, 3, 6), 3);
  assert.equal(resolveSectionCount(99999, 40, 7, 20), 47);
  assert.equal(resolveSectionCount(null, 0, 0, 6), 0);
});

test("resolveSectionCount: a full page is at least what was seen, else the estimate", () => {
  assert.equal(resolveSectionCount(68564, 0, 6, 6), 68564);
  // A planner estimate below what the page proves is lifted to the proof.
  assert.equal(resolveSectionCount(10, 100, 50, 50), 150);
  assert.equal(resolveSectionCount(null, 0, 6, 6), 6);
  assert.equal(resolveSectionCount(Number.NaN, 0, 6, 6), 6);
});

test("isTimeoutError recognises statement_timeout and client aborts only", () => {
  assert.equal(isTimeoutError({ code: "57014", message: "canceling statement due to statement timeout" }), true);
  assert.equal(isTimeoutError({ message: "AbortError: This operation was aborted" }), true);
  assert.equal(isTimeoutError({ name: "TimeoutError", message: "signal timed out" }), true);
  assert.equal(isTimeoutError({ code: "42703", message: "column articles.original_text does not exist" }), false);
  assert.equal(isTimeoutError({ message: "Bad Request" }), false);
  assert.equal(isTimeoutError(null), false);
});

const item = (id: string, title: string, snippet: string, section: SearchResultItem["section"] = "laws"): SearchResultItem => ({
  id, section, title, snippet, locked: false, meta: {},
});

test("LIB-11: dedupeResults drops the same hit stored under two slugs, keeping order", () => {
  const rows = [
    item("a1", "قرار وزاري رقم (18632) — الأولى", "نص"),
    item("b1", "قرار وزاري رقم (18632) — الأولى", "نص"), // same circular, other slug
    item("a2", "قرار وزاري رقم (18632) — الثانية", "نص"),
    item("p1", "قرار وزاري رقم (18632) — الأولى", "نص", "orders"), // other section: kept
    item("c1", "نظام العمل التطوعي_0", ""),
    item("c2", "نظام العمل التطوعي", ""),
  ];
  assert.deepEqual(dedupeResults(rows).map((r) => r.id), ["a1", "a2", "p1", "c1"]);
});

test("dedupeTitleKey strips only a copy suffix and normalises Arabic", () => {
  assert.equal(dedupeTitleKey("نظام العمل التطوعي_0"), dedupeTitleKey("نظام العمل التطوعي"));
  assert.equal(dedupeTitleKey("لائحة_1 — المادة 3"), dedupeTitleKey("لائحة — المادة 3"));
  assert.notEqual(dedupeTitleKey("نظام الشركات لعام 1437"), dedupeTitleKey("نظام الشركات لعام 1443"));
  assert.equal(dedupeTitleKey("الإثبات"), dedupeTitleKey("الاثبات"));
});

const law = (slug: string, title: string, type = "قرار"): LawTitleCandidate => ({ slug, title, type });

test("LIB-11: «نظام العمل» ranks the Labor Law first among title candidates", () => {
  const candidates = [
    law("circ-1", "قرار وزاري رقم (18632) بشأن تنظيم العمل"),
    law("elderly", "نظام حقوق كبير السن", "نظام"),
    law("volunteer", "نظام العمل التطوعي", "نظام"),
    law("labor-reg", "اللائحة التنفيذية لنظام العمل", "لائحة تنفيذية"),
    law("labor", "نظام العمل", "نظام"),
    law("labor-dup", "نظام العمل", "نظام"),
  ];
  const ranked = rankLawTitleCandidates(candidates, "نظام العمل", ["نظام", "العمل"], 3);
  assert.deepEqual(ranked.map((c) => c.slug), ["labor", "volunteer", "labor-reg"]);
});

test("title hits need every term in the title; a description-only match is not one", () => {
  assert.equal(scoreLawTitle(law("x", "نظام حقوق كبير السن", "نظام"), "نظام العمل", ["نظام", "العمل"]), null);
  assert.notEqual(scoreLawTitle(law("y", "اللائحة التنفيذية لنظام العمل"), "نظام العمل", ["نظام", "العمل"]), null);
});

test("stopword-only queries produce no title hits", () => {
  const candidates = [law("a", "من"), law("b", "نظام في المرافعات", "نظام")];
  assert.deepEqual(rankLawTitleCandidates(candidates, "من", ["من"], 3), []);
  assert.deepEqual(rankLawTitleCandidates(candidates, "في", ["في"], 3), []);
  assert.deepEqual(rankLawTitleCandidates(candidates, "نظام", ["نظام"], 0), []);
});

test("titlePhrasePattern only lets letters, digits and spaces through", () => {
  assert.equal(titlePhrasePattern("نظام  العمل"), "%نظام العمل%");
  assert.equal(titlePhrasePattern("نظام 1441"), "%نظام 1441%");
  assert.equal(titlePhrasePattern("عمل*"), null);
  assert.equal(titlePhrasePattern("50%"), null);
  assert.equal(titlePhrasePattern("a_b"), null);
  assert.equal(titlePhrasePattern("\"نظام العمل\""), null);
  assert.equal(titlePhrasePattern("م"), null);
});

test("orderRowsByIds follows the ranked id order and drops unlisted rows", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(orderRowsByIds(rows, ["c", "a", "zzz"]).map((r) => r.id), ["c", "a"]);
});

// An offset EQUAL to the total is not PGRST103: PostgREST answers 206 with []
// and the count (measured: orders «الحسابات البنكية» offset 28 → 206, count 28).
// An offset past the total is PGRST103 (readPage / pastEndTotal tests below).
test("resolveSectionCount: an empty page at offset == total keeps PostgREST's count", () => {
  assert.equal(resolveSectionCount(55, 100, 0, 50), 55);
  assert.equal(resolveSectionCount(null, 100, 0, 50), 100);
});

test("isSectionCountExact: exact only for a short page or a PostgREST-counted total", () => {
  assert.equal(isSectionCountExact(99999, 40, 7, 20), true, "a short page reached the end");
  assert.equal(isSectionCountExact(null, 0, 0, 6), true, "no match at all");
  assert.equal(isSectionCountExact(951, 0, 6, 6), true, "<= max-rows is counted exactly");
  assert.equal(isSectionCountExact(1000, 0, 6, 6), true);
  assert.equal(isSectionCountExact(1001, 0, 6, 6), false, "1001 is the capped floor");
  assert.equal(isSectionCountExact(1109, 0, 50, 50), false, "a planner estimate is never exact");
  assert.equal(isSectionCountExact(null, 0, 6, 6), false, "a missing count is never exact");
  assert.equal(isSectionCountExact(55, 55, 0, 50), true, "empty page at offset == total (206 []), counted total");
  assert.equal(isSectionCountExact(55, 100, 0, 50), true, "PGRST103 total fed back as the count");
  assert.equal(isSectionCountExact(5000, 100, 0, 50), false);
});

const order = (id: string, title: string, meta: Record<string, unknown>): SearchResultItem => ({
  id, section: "orders", title, snippet: "", locked: false, meta,
});

test("orders dedupe keeps the copy with the more complete metadata, in the first copy's place", () => {
  const title = "تحديث قواعد الحسابات البنكية";
  const rows = [
    order("first", "تعميم آخر", { ref: "1", date: "1447/01/01" }),
    order("df447fb0", title, { ref: "", date: "", issuer: "البنك المركزي السعودي", type: "circular" }),
    order("ef4884ef", title, { ref: "482004268", date: "1448/01/16", issuer: "البنك المركزي السعودي (ساما)", type: "circular" }),
  ];
  assert.deepEqual(dedupeResults(rows).map((r) => r.id), ["first", "ef4884ef"]);
  // Reversed input keeps the complete row too.
  assert.deepEqual(dedupeResults([rows[2], rows[1]]).map((r) => r.id), ["ef4884ef"]);
});

test("orders dedupe keeps two same-titled decrees whose ref or date differ", () => {
  const rows = [
    order("a", "تعميم بشأن الحسابات", { ref: "100", date: "1446/01/01" }),
    order("b", "تعميم بشأن الحسابات", { ref: "200", date: "1446/01/01" }),
    order("c", "تعميم بشأن الحسابات", { ref: "100", date: "1447/05/05" }),
    order("d", "تعميم بشأن الحسابات", { ref: "100", date: "1446/01/01" }),
  ];
  assert.deepEqual(dedupeResults(rows).map((r) => r.id), ["a", "b", "c"]);
});

test("queryWantsTitleHits: no title hits for stopwords or a single document-type word", () => {
  assert.equal(queryWantsTitleHits(["نظام"]), false);
  assert.equal(queryWantsTitleHits(["لائحة"]), false);
  assert.equal(queryWantsTitleHits(["من"]), false);
  assert.equal(queryWantsTitleHits([]), false);
  assert.equal(queryWantsTitleHits(["العمل"]), true);
  assert.equal(queryWantsTitleHits(["نظام", "العمل"]), true);
});

test("law title slots: the bound comes from the request only", () => {
  const limit = 50;
  assert.equal(lawTitleSlots({ hasStatusFilter: false, terms: ["نظام", "العمل"], limit }), LAW_TITLE_HITS_LAWS);
  assert.equal(lawTitleSlots({ hasStatusFilter: true, terms: ["نظام", "العمل"], limit }), 0);
  assert.equal(lawTitleSlots({ hasStatusFilter: false, terms: ["نظام"], limit }), 0);
  assert.equal(lawTitleSlots({ hasStatusFilter: false, terms: ["العمل"], limit: 3 }), 0, "tiny pages keep only articles");
});

test("section=laws pages: no slot for a missing hit, every article listed once, never more than limit", () => {
  const articles = Array.from({ length: 173 }, (_, i) => `a${i}`);
  const maxSlots = LAW_TITLE_HITS_LAWS;
  for (const limit of [10, 50]) {
    for (let hits = 0; hits <= maxSlots; hits++) {
      const listed: string[] = [];
      for (let page = 1; page <= 20; page++) {
        const { from, size } = lawFetchWindow(page, limit, maxSlots);
        if (from >= articles.length) break;
        const fetched = articles.slice(from, from + size);
        const rows = lawPageArticles(fetched, page, limit, maxSlots, hits);
        const pageLen = (page === 1 ? hits : 0) + rows.length;
        assert.ok(pageLen <= limit, `page ${page} lists ${pageLen} > ${limit}`);
        if (page === 1) assert.equal(pageLen, limit, "page 1 is full: no slot reserved for a missing hit");
        listed.push(...rows);
      }
      assert.deepEqual(listed, articles, `limit ${limit}, ${hits} hits: contiguous, no repeat, no skip`);
    }
  }
  // The fetch window does not depend on the hits, so it runs in parallel.
  assert.deepEqual(lawFetchWindow(1, 50, 3), { from: 0, size: 50 });
  assert.deepEqual(lawFetchWindow(2, 50, 3), { from: 47, size: 53 });
  assert.deepEqual(lawFetchWindow(2, 50, 0), { from: 50, size: 50 });
});

test("the ranked RPC orders only the section=all preview", () => {
  assert.equal(rankedLawOrderApplies("all"), true);
  for (const s of ["laws", "precedents", "orders", "feqh"] as const) assert.equal(rankedLawOrderApplies(s), false);
});

// The literal error supabase-js returned for orders «الحسابات البنكية» page 2 (self-hosted, 2026-09-25).
const PGRST103 = {
  code: "PGRST103",
  details: "An offset of 50 was requested, but there are only 28 rows.",
  hint: null,
  message: "Requested range not satisfiable",
};

test("PGRST103: a page past the end is a proven-empty page with the total, not a failure", () => {
  assert.equal(isPastEndError(PGRST103), true);
  assert.equal(pastEndTotal(PGRST103), 28);
  assert.equal(pastEndTotal({ ...PGRST103, details: "An offset of 100 was requested, but there are only 1 row." }), 1);
  assert.equal(pastEndTotal({ ...PGRST103, details: null }), null, "unrecognised wording → the route runs a head count");
  assert.equal(pastEndTotal({ code: "57014", message: "only 3 rows" }), null, "only PGRST103 carries a total");
  assert.deepEqual(readPage({ data: null, count: null, error: PGRST103 }), { kind: "past_end", total: 28 });
  assert.deepEqual(readPage({ data: null, count: null, error: { ...PGRST103, details: "" } }), { kind: "past_end", total: null });
});

test("readPage: every other error or a malformed payload is a failure, never an empty page", () => {
  assert.deepEqual(readPage({ data: null, count: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }), { kind: "failed" });
  assert.deepEqual(readPage({ data: null, count: null, error: { code: "42703", message: "column does not exist" } }), { kind: "failed" });
  assert.deepEqual(readPage({ data: null, count: 5, error: null }), { kind: "failed" });
  assert.deepEqual(readPage({ data: [{ id: 1 }], count: 28, error: null }), { kind: "rows", rows: [{ id: 1 }], count: 28 });
  assert.deepEqual(readPage({ data: [], count: undefined, error: null }), { kind: "rows", rows: [], count: null });
});

test("the laws original_text retry skips timeouts and pages past the end", () => {
  assert.equal(shouldRetryLawsWithoutHistory({ code: "42703", message: "column articles.original_text does not exist" }), true);
  assert.equal(shouldRetryLawsWithoutHistory(PGRST103), false);
  assert.equal(shouldRetryLawsWithoutHistory({ code: "57014", message: "canceling statement due to statement timeout" }), false);
  assert.equal(shouldRetryLawsWithoutHistory(null), false);
});

test("sectionCount: a page past the end reports the PGRST103 total as exact", () => {
  // orders «الحسابات البنكية» page 2 L50: 28 matches.
  assert.deepEqual(sectionCount({ estimate: 28, offset: 50, rawRows: 0, requested: 50 }), { count: 28, exact: true });
  // laws «بطلان» page 3 L50 with no title hit: 55 matches.
  assert.deepEqual(sectionCount({ estimate: 55, offset: 97, rawRows: 0, requested: 53, extra: 0 }), { count: 55, exact: true });
  // …with 2 title hits, the count is what the list holds.
  assert.deepEqual(sectionCount({ estimate: 55, offset: 97, rawRows: 0, requested: 53, extra: 2 }), { count: 57, exact: true });
});

test("sectionCount: the number equals what the section lists", () => {
  // orders: the whole match set on one page, de-duplicated after counting.
  assert.deepEqual(sectionCount({ estimate: 28, offset: 0, rawRows: 28, requested: 50, listedWhenComplete: 27 }), { count: 27, exact: true });
  // laws: 38 articles + 3 title hits, all on page 1.
  assert.deepEqual(sectionCount({ estimate: 38, offset: 0, rawRows: 38, requested: 50, extra: 3, listedWhenComplete: 41 }), { count: 41, exact: true });
  // A full page: PostgREST's count plus the title hits; exact only <= 1000.
  assert.deepEqual(sectionCount({ estimate: 55, offset: 0, rawRows: 50, requested: 50, extra: 3, listedWhenComplete: 99 }), { count: 58, exact: true });
  assert.deepEqual(sectionCount({ estimate: 1109, offset: 0, rawRows: 50, requested: 50, extra: 3 }), { count: 1112, exact: false });
  // No match at all.
  assert.deepEqual(sectionCount({ estimate: 0, offset: 0, rawRows: 0, requested: 6, listedWhenComplete: 0 }), { count: 0, exact: true });
});

test("title ranking: «نظام <phrase>» of type نظام outranks a starts-with title of another type", () => {
  const candidates = [
    law("work", "العمل أثناء الدراسة", "قرار"),
    law("labor-law-qadha", "نظام العمل", "نظام"),
    law("volunteer-work-law", "نظام العمل التطوعي", "نظام"),
  ];
  const ranked = rankLawTitleCandidates(candidates, "العمل", ["العمل"], 3);
  assert.equal(ranked[0].slug, "labor-law-qadha");
  // Only a نظام gets the tier: a قرار titled «نظام العمل» does not.
  const s1 = scoreLawTitle(law("x", "نظام العمل", "قرار"), "العمل", ["العمل"]) as number;
  const s2 = scoreLawTitle(law("work", "العمل أثناء الدراسة", "قرار"), "العمل", ["العمل"]) as number;
  assert.ok(s1 < s2);
  // An exact title still comes first; the query «نظام العمل» is unchanged.
  const exact = rankLawTitleCandidates([...candidates, law("exact", "العمل", "قرار")], "العمل", ["العمل"], 3);
  assert.equal(exact[0].slug, "exact");
  assert.equal(rankLawTitleCandidates(candidates, "نظام العمل", ["نظام", "العمل"], 1)[0].slug, "labor-law-qadha");
});

test("title matching strips the query's «ال»: «الجرائم المعلوماتية» hits «نظام مكافحة جرائم المعلوماتية»", () => {
  const cyber = law("anti-cybercrime-law", "نظام مكافحة جرائم المعلوماتية", "نظام");
  assert.notEqual(scoreLawTitle(cyber, "الجرائم المعلوماتية", ["الجرائم", "المعلوماتية"]), null);
  assert.deepEqual(rankLawTitleCandidates([cyber], "الجرائم المعلوماتية", ["الجرائم", "المعلوماتية"], 3).map((c) => c.slug), ["anti-cybercrime-law"]);
  // Still every word: a title without «المعلوماتية» is not a hit.
  assert.equal(scoreLawTitle(law("p", "نظام الإجراءات الجزائية", "نظام"), "الجرائم المعلوماتية", ["الجرائم", "المعلوماتية"]), null);
  assert.equal(stripDefiniteArticle("الجرائم"), "جرائم");
  assert.equal(stripDefiniteArticle("الى"), null, "short words keep their «ال»");
  assert.equal(stripDefiniteArticle("جرائم"), null);
});

test("title candidate lookups: stem patterns and the «نظام <phrase>» title", () => {
  assert.deepEqual(titleStemPatterns("الجرائم المعلوماتية"), ["%جرائم%", "%معلوماتية%"]);
  assert.deepEqual(titleStemPatterns("مكافحة الجرائم"), ["%مكافحة%", "%جرائم%"]);
  assert.equal(titleStemPatterns("جرائم معلوماتية"), null, "nothing to strip: the contains lookup covers it");
  assert.equal(titleStemPatterns("الجرائم*"), null);
  assert.equal(nizamTitleFor("العمل"), "نظام العمل");
  assert.equal(nizamTitleFor("  العمل   التطوعي "), "نظام العمل التطوعي");
  assert.equal(nizamTitleFor("نظام العمل"), null);
  assert.equal(nizamTitleFor("50%"), null);
});

test("titlePrefixPattern anchors the phrase at the start of the title", () => {
  assert.equal(titlePrefixPattern("نظام العمل"), "نظام العمل%");
  assert.equal(titlePrefixPattern("عمل*"), null);
});

test("a small window is never sent to PostgREST: the 6-row preview fetches 50 (a tiny LIMIT with order(id) walks the primary key)", () => {
  assert.equal(fetchSizeFor(ALL_SECTION_PREVIEW), SEARCH_MIN_FETCH);
  assert.equal(fetchSizeFor(10), 50);
  assert.equal(fetchSizeFor(50), 50);
  assert.equal(fetchSizeFor(100), 100);
});

test("a count proven over the larger fetch window stays exact for the preview", () => {
  // 23 matches, preview shows 6 of them: the 50-row fetch came back short at offset 0.
  assert.deepEqual(
    sectionCount({ estimate: 23, offset: 0, rawRows: 23, requested: fetchSizeFor(ALL_SECTION_PREVIEW), listedWhenComplete: 23 }),
    { count: 23, exact: true },
  );
});

