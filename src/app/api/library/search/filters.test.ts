import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { SEARCH_MAX_LIMIT, validateSearchFilters, validateSearchRequest } from "./filters.ts";

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
  expectFailure({ book_slug: "commercial" }, "unknown_filter", /book_slug.*not supported/);
});

test("rejects public-but-unimplemented filters rather than claiming to apply them", () => {
  expectFailure({ dateFrom: "1436-01-01" }, "unimplemented_filter", /dateFrom.*not implemented/);
  expectFailure({ dateTo: "1436-12-30" }, "unimplemented_filter", /dateTo.*not implemented/);
  expectFailure({ legalBranch: "commercial" }, "unimplemented_filter", /legalBranch.*not implemented/);
});

test("accepts only filters that the requested section applies", () => {
  const lawFilters = { category: "SA-01", status: "active", lawType: "نظام" };
  const precedentFilters = { track: "admin", source: "ديوان المظالم", year: 1436, court: "المحكمة الإدارية" };
  const orderFilters = { category: "SA-04", issuer: "مجلس الوزراء", type: "royal" };

  assert.deepEqual(validateSearchFilters(lawFilters, "laws"), { ok: true, filters: lawFilters });
  assert.deepEqual(validateSearchFilters(precedentFilters, "precedents"), { ok: true, filters: precedentFilters });
  assert.deepEqual(validateSearchFilters(orderFilters, "orders"), { ok: true, filters: orderFilters });
  assert.deepEqual(validateSearchFilters(undefined), { ok: true, filters: {} });
  assert.deepEqual(validateSearchFilters({}), { ok: true, filters: {} });
});

test("rejects unknown article status values before a query can return a misleading zero", () => {
  expectFailure({ status: "invented_lifecycle" }, "invalid_filter_value", /status.*known article status/);
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
  expectFailure(null, "invalid_filters", /filters must be an object/);
  expectFailure([], "invalid_filters", /filters must be an object/);
  expectFailure({ category: 12 }, "invalid_filter_type", /category.*string/);
  expectFailure({ year: "1436" }, "invalid_filter_type", /year.*finite number/);
  expectFailure({ year: Number.NaN }, "invalid_filter_type", /year.*finite number/);
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
        assert.match(result.error, new RegExp(`${key}.*must not be empty`));
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
