import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  SEARCH_MAX_DEPTH,
  SEARCH_MAX_LIMIT,
  categoryStoredSpellings,
  normalizeCategoryFilter,
  validateSearchFilters,
  validateSearchRequest,
} from "./filters.ts";

function expectFailure(value: unknown, code: string, message: RegExp) {
  const result = validateSearchFilters(value);
  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.code, code);
  assert.match(result.error, message);
  // A rejected filter must not become a wider search result or be forwarded
  // into a query-shaped payload.
  assert.equal("filters" in result, false);
}

test("rejects an unknown filter instead of silently broadening the search", () => {
  expectFailure({ book_slug: "commercial" }, "unknown_filter", /book_slug.*غير مدعوم/);
});

test("rejects public-but-unimplemented filters rather than claiming to apply them", () => {
  expectFailure({ dateFrom: "1436-01-01" }, "unimplemented_filter", /dateFrom.*غير مطبّق/);
  expectFailure({ dateTo: "1436-12-30" }, "unimplemented_filter", /dateTo.*غير مطبّق/);
  expectFailure({ legalBranch: "commercial" }, "unimplemented_filter", /legalBranch.*غير مطبّق/);
});

test("accepts only filters that the requested section applies", () => {
  const lawFilters = { category: "SA-01", status: "active", lawType: "نظام" };
  const precedentFilters = { track: "admin", source: "ديوان المظالم", year: 1436, court: "المحكمة الإدارية" };
  const orderFilters = { category: "SA-04", issuer: "مجلس الوزراء", type: "royal" };

  // The category is returned in the stored spelling (LIB-02): 'SA-01' → '01'.
  assert.deepEqual(validateSearchFilters(lawFilters, "laws"), { ok: true, filters: { ...lawFilters, category: "01" } });
  assert.deepEqual(validateSearchFilters(precedentFilters, "precedents"), { ok: true, filters: precedentFilters });
  assert.deepEqual(validateSearchFilters(orderFilters, "orders"), { ok: true, filters: { ...orderFilters, category: "04" } });
  assert.deepEqual(validateSearchFilters(undefined), { ok: true, filters: {} });
  assert.deepEqual(validateSearchFilters({}), { ok: true, filters: {} });
});

test("rejects unknown article status values before a query can return a misleading zero", () => {
  expectFailure({ status: "invented_lifecycle" }, "invalid_filter_value", /status.*حالة مادة معروفة/);
  assert.deepEqual(
    validateSearchFilters({ status: "status_undeclared" }, "laws"),
    { ok: true, filters: { status: "status_undeclared" } },
  );
  assert.deepEqual(
    validateSearchFilters({ status: "active" }, "laws"),
    { ok: true, filters: { status: "active" } },
  );
});

test("rejects a filter in every section where the route would ignore it, including all", () => {
  const cases: Array<[Record<string, unknown>, "all" | "laws" | "precedents" | "orders" | "feqh"]> = [
    [{ category: "SA-01" }, "all"], [{ category: "SA-01" }, "precedents"], [{ category: "SA-01" }, "feqh"],
    [{ track: "admin" }, "all"], [{ track: "admin" }, "laws"], [{ track: "admin" }, "orders"],
    [{ source: "ديوان المظالم" }, "laws"], [{ year: 1436 }, "orders"], [{ court: "المحكمة الإدارية" }, "feqh"],
    [{ issuer: "مجلس الوزراء" }, "all"], [{ type: "royal" }, "laws"],
    [{ lawType: "نظام" }, "all"], [{ status: "status_undeclared" }, "orders"],
  ];
  for (const [filters, section] of cases) {
    const result = validateSearchFilters(filters, section);
    assert.equal(result.ok, false, `${JSON.stringify(filters)} must fail in ${section}`);
    if (!result.ok) assert.equal(result.code, "invalid_filter_scope");
  }
});

test("rejects non-object filters and wrong types before they can reach a query", () => {
  expectFailure(null, "invalid_filters", /filters.*كائناً/);
  expectFailure([], "invalid_filters", /filters.*كائناً/);
  expectFailure({ category: 12 }, "invalid_filter_type", /category.*نصاً/);
  expectFailure({ year: "1436" }, "invalid_filter_type", /year.*رقماً/);
  expectFailure({ year: Number.NaN }, "invalid_filter_type", /year.*رقماً/);
});

test("rejects empty textual filters instead of letting route truthiness ignore them", () => {
  for (const key of ["category", "track", "source", "issuer", "status", "type", "lawType", "court"] as const) {
    const section = key === "category" || key === "status" || key === "lawType"
      ? "laws"
      : key === "issuer" || key === "type"
        ? "orders"
        : "precedents";
    for (const value of ["", "   "]) {
      const result = validateSearchFilters({ [key]: value }, section);
      assert.equal(result.ok, false, `${key}=${JSON.stringify(value)} must not reach a truthiness guard`);
      if (!result.ok) {
        assert.equal(result.code, "invalid_filter_value");
        assert.match(result.error, new RegExp(`${key}.*يجب ألا يكون فارغاً`));
      }
    }
  }
});

test("rejects malformed request values and ignored sort before search client creation", () => {
  const valid = { query: "نظام", section: "laws", filters: { status: "active" }, page: 1, limit: 50, sort: "relevance" };
  assert.deepEqual(validateSearchRequest(valid), {
    ok: true,
    request: { query: "نظام", section: "laws", filters: { status: "active" }, page: 1, limit: 50 },
  });

  const cases: Array<[Record<string, unknown>, string]> = [
    [{ query: 12 }, "invalid_query"],
    [{ query: "نظام", section: "unknown" }, "invalid_section"],
    [{ query: "نظام", sort: "date-desc" }, "invalid_sort"],
    [{ query: "نظام", page: 0 }, "invalid_page"],
    [{ query: "نظام", page: 1.5 }, "invalid_page"],
    [{ query: "نظام", page: Number.MAX_SAFE_INTEGER + 1 }, "invalid_page"],
    [{ query: "نظام", page: Number.MAX_SAFE_INTEGER, limit: 100 }, "invalid_page"],
    [{ query: "نظام", page: Math.floor(Number.MAX_SAFE_INTEGER / 100) + 1, limit: 100 }, "invalid_page"],
    [{ query: "نظام", limit: 0 }, "invalid_limit"],
    [{ query: "نظام", limit: SEARCH_MAX_LIMIT + 1 }, "invalid_limit"],
    [{ query: "نظام", limit: 1.5 }, "invalid_limit"],
    [{ query: "نظام", section: "all", filters: { category: "SA-01" } }, "invalid_filter_scope"],
  ];
  for (const [request, code] of cases) {
    const result = validateSearchRequest(request);
    assert.equal(result.ok, false, JSON.stringify(request));
    if (!result.ok) assert.equal(result.code, code);
  }
});

test("the endpoint validates filters before creating its search database client", () => {
  const routeSource = fs.readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const validationIndex = routeSource.indexOf("const requestValidation = validateSearchRequest(await request.json());");
  const clientIndex = routeSource.indexOf("const supabase = await createClient();");

  assert.ok(validationIndex >= 0, "route must call the runtime filter validator");
  assert.ok(clientIndex > validationIndex, "invalid filters must return before any database client is created");
  assert.match(
    routeSource,
    /if \(!requestValidation\.ok\) \{[\s\S]*?\{ error: requestValidation\.error, code: requestValidation\.code \}[\s\S]*?status:\s*400/,
    "the rejected endpoint response must be an explicit 400 error, not a search response",
  );
});

test("LIB-02: the UI category id 'SA-06' reaches the query as the stored code '06'", () => {
  // library.laws.section_code and decrees_circulars.category hold '00'..'30';
  // the /laws page sends the taxonomy id. Unnormalised, 'SA-06' matched 0 rows
  // where '06' matched 1,407.
  for (const section of ["laws", "orders"] as const) {
    const fromUi = validateSearchFilters({ category: "SA-06" }, section);
    const bare = validateSearchFilters({ category: "06" }, section);
    assert.deepEqual(fromUi, { ok: true, filters: { category: "06" } });
    assert.deepEqual(bare, { ok: true, filters: { category: "06" } });
  }
  const request = validateSearchRequest({ query: "العمل", section: "laws", filters: { category: "SA-06" } });
  assert.equal(request.ok, true);
  if (request.ok) assert.equal(request.request.filters.category, "06");

  assert.equal(normalizeCategoryFilter("SA-99"), "99");
  assert.equal(normalizeCategoryFilter("sa-30"), "30");
  assert.equal(normalizeCategoryFilter(" 06 "), "06");
  // A single digit is padded to the stored two-digit form.
  assert.equal(normalizeCategoryFilter("SA-6"), "06");
  assert.equal(normalizeCategoryFilter("8"), "08");
  assert.equal(normalizeCategoryFilter("SA-123"), null);
  assert.equal(normalizeCategoryFilter("labor"), null);
});

test("LIB-02: a category that no row can hold is rejected, not searched as a silent zero", () => {
  expectFailure({ category: "labor" }, "invalid_filter_value", /التصنيف[\s\S]*SA-06/);
  for (const bad of ["SA-123", "SA-", "6a"]) {
    const result = validateSearchFilters({ category: bad }, "laws");
    assert.equal(result.ok, false, bad);
  }
});

test("the caller's filter object is not mutated by normalisation", () => {
  const filters = { category: "SA-06" };
  validateSearchFilters(filters, "laws");
  assert.equal(filters.category, "SA-06");
});

test("LIB-01: page depth is capped so a deep OFFSET cannot run past the statement timeout", () => {
  assert.equal(SEARCH_MAX_DEPTH, 1000);
  const ok = validateSearchRequest({ query: "في", section: "feqh", page: 10, limit: 100 });
  assert.equal(ok.ok, true, "results 901-1000 are still reachable");

  for (const request of [
    { query: "في", section: "feqh", page: 1000, limit: 100 },
    { query: "في", section: "laws", page: 690, limit: 100 },
    { query: "في", section: "laws", page: 21, limit: 50 },
  ]) {
    const result = validateSearchRequest(request);
    assert.equal(result.ok, false, JSON.stringify(request));
    if (!result.ok) {
      assert.equal(result.code, "page_too_deep");
      assert.match(result.error, /[\u0600-\u06FF]/, "the message is Arabic");
    }
  }
});

test("decree categories stored unpadded ('8', '9') are matched with the padded code", () => {
  // decrees_circulars holds '8' and '9' on some rows next to '08'/'09'.
  for (const input of ["SA-08", "08", "8", "SA-8"]) {
    const result = validateSearchFilters({ category: input }, "orders");
    assert.deepEqual(result, { ok: true, filters: { category: "08" } }, input);
    if (result.ok) assert.deepEqual(categoryStoredSpellings(result.filters.category as string), ["08", "8"]);
  }
  assert.deepEqual(categoryStoredSpellings("09"), ["09", "9"]);
  assert.deepEqual(categoryStoredSpellings("10"), ["10"]);
  assert.deepEqual(categoryStoredSpellings("00"), ["00", "0"]);
});

test("section=all ignores page, so the depth cap does not reject it", () => {
  const all = validateSearchRequest({ query: "العمل", section: "all", page: 30, limit: 50 });
  assert.equal(all.ok, true);
  const laws = validateSearchRequest({ query: "العمل", section: "laws", page: 30, limit: 50 });
  assert.equal(laws.ok, false);
  if (!laws.ok) assert.equal(laws.code, "page_too_deep");
});

test("every validation message is Arabic and keeps its error code", () => {
  const requests: Array<[unknown, string]> = [
    ["not-an-object", "invalid_request"],
    [{ query: 12 }, "invalid_query"],
    [{ query: "نظام", section: "unknown" }, "invalid_section"],
    [{ query: "نظام", sort: "date-desc" }, "invalid_sort"],
    [{ query: "نظام", page: 0 }, "invalid_page"],
    [{ query: "نظام", page: Number.MAX_SAFE_INTEGER, limit: 100 }, "invalid_page"],
    [{ query: "نظام", limit: 0 }, "invalid_limit"],
    [{ query: "نظام", section: "laws", page: 30, limit: 50 }, "page_too_deep"],
    [{ query: "نظام", filters: null }, "invalid_filters"],
    [{ query: "نظام", section: "laws", filters: { dateFrom: "x" } }, "unimplemented_filter"],
    [{ query: "نظام", section: "laws", filters: { x: "y" } }, "unknown_filter"],
    [{ query: "نظام", section: "laws", filters: { category: 1 } }, "invalid_filter_type"],
    [{ query: "نظام", section: "laws", filters: { category: "labor" } }, "invalid_filter_value"],
    [{ query: "نظام", section: "all", filters: { category: "SA-01" } }, "invalid_filter_scope"],
  ];
  for (const [request, code] of requests) {
    const result = validateSearchRequest(request);
    assert.equal(result.ok, false, JSON.stringify(request));
    if (result.ok) continue;
    assert.equal(result.code, code);
    assert.match(result.error, /[\u0600-\u06FF]/, `${code}: ${result.error}`);
    assert.doesNotMatch(result.error, /\b(must|is not|supported only)\b/, `${code} still English: ${result.error}`);
  }
});
