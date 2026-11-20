/**
 * T10-F5 (batch l11) — the case lists' search box runs on the server.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { caseMatchesSearch, caseSearchOrFilter, normalizeCaseSearch, withCaseSearch, CASE_SEARCH_MAX_LENGTH } from "./caseSearchFilter.ts";

const repo = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");

test("T10-F5: one or-filter over title, client name and court, values quoted", () => {
  assert.equal(
    caseSearchOrFilter("عقد"),
    'title.ilike."*عقد*",requester->>name.ilike."*عقد*",metadata->>court.ilike."*عقد*"',
  );
});

test("T10-F5: nothing to search → no filter", () => {
  for (const v of ["", "   ", null, undefined, 5, "%%", "*_*", '"\\']) assert.equal(caseSearchOrFilter(v), null, String(v));
});

test("T10-F5: a term cannot open another condition or a wildcard", () => {
  const f = caseSearchOrFilter('x",assigned_to.is.null,title.ilike."*') ?? "";
  // the quote is gone, so the commas stay inside one quoted value per field
  assert.equal((f.match(/"/g) ?? []).length, 6);
  assert.doesNotMatch(f, /[%_]/);
  assert.equal(normalizeCaseSearch("50%_off*"), "50 off");
  assert.equal(normalizeCaseSearch("a\u0000b\n c"), "a b c");
  assert.equal(normalizeCaseSearch("ب".repeat(500)).length, CASE_SEARCH_MAX_LENGTH);
});

test("T10-F5: the on-screen match is the same term, any case", () => {
  const row = { title: "Lease dispute", client: "محمد", court: "المحكمة التجارية" };
  assert.equal(caseMatchesSearch(row, "lease"), true);
  assert.equal(caseMatchesSearch(row, "التجارية"), true);
  assert.equal(caseMatchesSearch(row, "عمالية"), false);
  assert.equal(caseMatchesSearch(row, "  "), true);
});

test("T10-F5: the search joins the ownership filter in one AND tree", () => {
  const own = "requester_user_id.eq.u1,assigned_to.eq.u1";
  assert.equal(withCaseSearch(own, ""), own);
  assert.equal(withCaseSearch(own, null), own);
  assert.equal(
    withCaseSearch(own, "عقد"),
    'and(or(requester_user_id.eq.u1,assigned_to.eq.u1),or(title.ilike."*عقد*",requester->>name.ilike."*عقد*",metadata->>court.ilike."*عقد*"))',
  );
  const route = repo("src/app/api/v1/service-requests/route.ts");
  assert.match(route, /query = query\.or\(withCaseSearch\(ownRequestsOrFilter\(\{ uid: user\.id, receiver, \.\.\.scope \}\), searchParams\.get\("q"\)\)\);/);
  assert.equal((route.match(/query\.or\(/g) ?? []).length, 1, "a single or= on the list query");
});

test("T10-F5: both case lists send `q` and refetch from the first page", () => {
  const lawyer = repo("src/app/dashboard/lawyer/cases/page.tsx");
  assert.match(lawyer, /\{ receiver: "lawyer", limit: LIST_LIMIT, offset, \.\.\.\(q \? \{ q \} : \{\}\) \}/);
  assert.match(lawyer, /fetchLawyerRows\(0, serverQuery\)/);
  assert.match(lawyer, /fetchLawyerRows\(rawLoaded, serverQuery\)/);
  assert.match(lawyer, /\}, \[reloadKey, serverQuery\]\);/);
  assert.doesNotMatch(lawyer, /!c\.title\.includes\(search\)/);
  const firm = repo("src/app/dashboard/firm/cases/page.tsx");
  assert.match(firm, /\{ limit: LIST_LIMIT, \.\.\.\(serverQuery \? \{ q: serverQuery \} : \{\}\) \}/);
  assert.match(firm, /\}, \[reloadKey, serverQuery\]\);/);
  assert.match(firm, /cases\.length === 0 && !serverQuery \?/);
});
