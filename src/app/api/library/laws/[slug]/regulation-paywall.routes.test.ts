/**
 * A4 / F01 + F13 — the law-detail route cannot be unit-executed (it imports
 * next/server and the "@/…" aliased Supabase server client, which node's test
 * runner does not resolve), so this is a source-contract test in the same shape
 * as search/route-fail-closed.test.ts.
 *
 * It holds two facts that cost production a full day of blank law pages and a
 * free copy of every executive regulation:
 *   1. a failed articles query is an ERROR, never a 200 with an empty law;
 *   2. the flat «اللائحة وحدها» view locks on the SAME predicate the per-article
 *      view locks on, and omits — never truncates — what it withholds.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const pageSource = readFileSync(
  new URL("../../../../laws/[slug]/page.tsx", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL("../../../../../../supabase/migrations/20260922_01_library_grants.sql", import.meta.url),
  "utf8",
);

test("the articles query reads its error and fails loudly instead of serving an empty law", () => {
  assert.match(
    routeSource,
    /const \{ data: articles, error: articlesError \} = await supabase/,
    "the articles query must destructure `error` — dropping it is what turned 42501 into a 200",
  );

  // The guard exists, covers a null payload as well, and answers 500 in Arabic.
  assert.match(
    routeSource,
    /if \(articlesError \|\| !Array\.isArray\(articles\)\) \{[\s\S]{0,600}?status: 500/,
    "a failed or malformed articles payload must return 500 from inside the guard",
  );
  assert.match(routeSource, /error: 'تعذّر تحميل مواد هذا النظام'/);

  // The Postgres message reaches the server log — the missing grant was
  // invisible for a day precisely because nothing logged it.
  assert.match(
    routeSource,
    /console\.error\([\s\S]{0,200}?Articles query failed[\s\S]{0,300}?articlesError\?\.message/,
  );

  // …and it returns BEFORE any response object is built.
  const guard = routeSource.indexOf("if (articlesError || !Array.isArray(articles))");
  const payload = routeSource.indexOf("const lawSystem = {");
  assert.ok(guard > -1 && payload > -1 && guard < payload, "the guard must precede the payload");
});

test("one lock predicate serves both views, and the flat regulation view calls it", () => {
  // Exactly one definition of the rule. Two copies is how the flat view drifted
  // out of the paywall in the first place.
  assert.equal(
    (routeSource.match(/!hasFullAccess && freeLimit !== -1 && globalIndex >= freeLimit/g) || []).length,
    1,
    "the lock rule must be written once",
  );
  assert.match(routeSource, /function isArticleLocked\(/);
  assert.match(
    routeSource,
    /const isLocked = isArticleLocked\(article, hasFullAccess, freeLimit\);/,
    "formatArticleWithPaywall must use the shared predicate",
  );
  assert.match(
    routeSource,
    /const parentLocked = isArticleLocked\(article, hasFullAccess, freeLimit\);/,
    "the regulationInstruments loop must use the shared predicate",
  );
});

test("a locked article's regulations are omitted from the flat view and counted, not truncated", () => {
  const start = routeSource.indexOf("const regulationsByRef = new Map");
  const end = routeSource.indexOf("const regulationInstruments = Array.from(");
  assert.ok(start > -1 && end > start, "the regulationInstruments build block must exist");
  const block = routeSource.slice(start, end);

  assert.match(block, /let regulationInstrumentsLocked = 0;/);
  assert.match(
    block,
    /if \(parentLocked\) \{\s*[\s\S]{0,120}?regulationInstrumentsLocked\+\+;\s*return;\s*\}/,
    "a locked parent must skip the row and count it",
  );

  // Omission, not a preview: no truncation helper may appear in this block.
  assert.doesNotMatch(block, /preview\(/);
  assert.doesNotMatch(block, /substring\(/);
  assert.doesNotMatch(block, /slice\(0,/);

  // The skip must come before the row is collected.
  assert.ok(
    block.indexOf("if (parentLocked)") < block.indexOf("regulationsByRef.get(ref)!.push(r)"),
    "the lock check must precede the push",
  );

  // And the count ships with the payload.
  assert.match(routeSource, /^\s*regulationInstrumentsLocked,$/m);
});

test("the page carries the count through its whitelist and shows the existing lock affordance", () => {
  assert.match(
    pageSource,
    /regulationInstrumentsLocked: data\.regulationInstrumentsLocked \|\| 0,/,
    "the setLaw mapping is a whitelist — an omitted field is silently discarded",
  );
  assert.match(
    pageSource,
    /viewMode === "regulation" &&[\s\S]{0,200}?regulationInstrumentsLocked \?\? 0\) > 0/,
    "the tab must open when everything it would show is locked, instead of falling through empty",
  );
  assert.match(
    pageSource,
    /lockedRegCount > 0 && \([\s\S]{0,1400}?setShowPaywall\(true\)[\s\S]{0,300}?اشترك للوصول/,
    "the withheld notice must offer the same upgrade affordance the article view offers",
  );

  // The tab BUTTON is gated on `a.regulations`, which the API emits for unlocked
  // articles only — so a law whose every regulation is locked would lose the
  // entry point, not just the content behind it.
  assert.match(
    pageSource,
    /law\.chapters\.some\(ch => ch\.articles\.some\(a => a\.regulations && a\.regulations\.length > 0\)\) \|\|\s*\(law\.regulationInstrumentsLocked \?\? 0\) > 0\) && \(/,
    "the regulation tab button must also open on the withheld count",
  );

  // The gate for unbuilt features is DashboardComingSoon; this copy must never
  // become a "coming soon" placeholder. Bounded to the notice itself.
  const noticeStart = pageSource.indexOf("lockedRegCount > 0 && (");
  assert.ok(noticeStart > -1);
  assert.doesNotMatch(pageSource.slice(noticeStart, noticeStart + 1200), /قريبا/);

  // The count is law-wide, but the card also renders while the chips above
  // filter the list to one instrument — so the copy must not claim the
  // articles are missing from THIS list ("هنا"), only from this law.
  assert.doesNotMatch(
    pageSource.slice(noticeStart, noticeStart + 1200),
    /لا تظهر هنا/,
    "a law-wide count must not be worded as if it were scoped to the active filter",
  );
});

test("the migration grants the request roles, not only service_role, and verifies itself", () => {
  assert.match(migrationSource, /grant select on library\.article_regulations to anon, authenticated;/);
  assert.match(migrationSource, /grant all\s+on library\.article_regulations to service_role;/);
  assert.match(migrationSource, /grant select on library\.cross_section_search to anon, authenticated, service_role/);
  assert.match(migrationSource, /grant select on library\.v_laws_enactment_status to anon, authenticated, service_role/);
  assert.match(
    migrationSource,
    /alter default privileges in schema library grant select on tables\s+to anon, authenticated;/,
    "the default privileges are what stop the next child table from blanking a page",
  );

  // One transaction, and a verify block that raises rather than notices.
  assert.equal((migrationSource.match(/^begin;$/gm) || []).length, 1);
  assert.equal((migrationSource.match(/^commit;$/gm) || []).length, 1);
  assert.match(
    migrationSource,
    /has_table_privilege\('anon', 'library\.article_regulations', 'SELECT'\)/,
  );
  assert.match(migrationSource, /raise exception '20260922_01 verify:/);
});

test("the chapters query fails closed too — same class, three lines earlier", () => {
  assert.match(
    routeSource,
    /const \{ data: chapters, error: chaptersError \} = await supabase/,
    "the chapters query must destructure `error`: a null payload yields zero chapters, and the ungrouped fallback does not rescue a law whose articles carry a chapter_id",
  );
  assert.match(
    routeSource,
    /if \(chaptersError \|\| !Array\.isArray\(chapters\)\) \{[\s\S]{0,700}?status: 500/,
    "a failed or malformed chapters payload must return 500 from inside the guard",
  );
  assert.match(routeSource, /error: 'تعذّر تحميل أبواب هذا النظام'/);

  const guard = routeSource.indexOf("if (chaptersError || !Array.isArray(chapters))");
  const articlesQuery = routeSource.indexOf("const { data: articles, error: articlesError }");
  assert.ok(guard > -1 && articlesQuery > -1 && guard < articlesQuery, "the chapters guard must precede the articles query");
});

test("every error body this route returns is Arabic", () => {
  // Project rule: API errors are {error:"<Arabic>"}. This file had one Arabic
  // branch and two English ones ('Law not found', 'Internal server error').
  const bodies = [...routeSource.matchAll(/\{ error: '([^']+)' \}/g)].map((m) => m[1]);
  assert.ok(bodies.length >= 4, `expected 4 error bodies (404 + 3 × 500), found ${bodies.length}`);
  for (const body of bodies) {
    assert.match(body, /^[\u0600-\u06FF\s]+$/u, `error body is not Arabic: "${body}"`);
  }
});

test("the migration's default-privilege assertion cannot raise on a correctly granted database", () => {
  // pg_default_acl holds one row PER GRANTOR (defaclrole, schema, objtype), so
  // count(*) over aclexplode grows with the number of roles that ever set a
  // default on this schema. An equality test there raises on a database that is
  // MORE correctly granted — and because it lives inside the migration's own
  // transaction, raising ROLLS BACK every grant above it and re-opens the
  // outage. Reproduced at 4-of-2 with a second granting role.
  assert.match(migrationSource, /select count\(distinct r\.rolname\) into n_defacl/);
  assert.match(migrationSource, /if n_defacl < 2 then/);
  // No equality test survives anywhere in the file. (The service_role
  // default-write check further down keeps count(*), but compares with `< 1`,
  // which no number of grantor roles can break.)
  assert.doesNotMatch(migrationSource, /if n_defacl <> /);
});

test("article_regulations gets RLS and a public-read policy, idempotently", () => {
  assert.match(migrationSource, /alter table library\.article_regulations enable row level security;/);
  assert.match(
    migrationSource,
    /drop policy if exists "Allow public read on library\.article_regulations"[\s\S]{0,60}?on library\.article_regulations;/,
    "a bare `create policy` dies with 42710 on re-run — the same defect that makes 20260730 non-re-runnable",
  );
  assert.match(
    migrationSource,
    /create policy "Allow public read on library\.article_regulations"[\s\S]{0,200}?for select[\s\S]{0,80}?to anon, authenticated[\s\S]{0,80}?using \(true\);/,
    "the policy must match the 17 sibling content tables (20260626:790-796)",
  );

  // With RLS on, the SELECT grant no longer proves readability: no policy means
  // ZERO ROWS with no error — byte-for-byte the outage this migration closes.
  assert.match(
    migrationSource,
    /raise exception '20260922_01 verify: RLS is on for library\.article_regulations with no public-read policy/,
  );
});
