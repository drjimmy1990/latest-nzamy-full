import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// LIB-14: the blog sitemap query had no .range(), so it relied on
// PostgREST's implicit max-rows cap (1000) to stop it — fine at 614 published
// rows today, silently truncating the sitemap the day the blog passes 1,000.
// This is a source-contract test (network-free, matches the pattern in
// src/app/api/library/search/search-query-contract.test.ts): it asserts the
// fix is wired through selectAllPages with a deterministic, unique-keyed
// order, and that no unranged `.eq("status", "published")` select remains.
const sitemapSource = readFileSync(new URL("./sitemap.ts", import.meta.url), "utf8");

test("sitemap blog query is paged with selectAllPages, not a single unranged select", () => {
  assert.match(sitemapSource, /import \{ selectAllPages \} from ["']@\/lib\/supabase\/selectAllPages["']/);
  assert.match(sitemapSource, /selectAllPages<PublishedArticleRow>\(/);
  assert.match(sitemapSource, /\.range\(from, to\)/);
});

test("the paged query has a deterministic order ending in a unique key (id)", () => {
  assert.match(sitemapSource, /\.order\(["']slug["']\)\s*\n\s*\.order\(["']id["']\)/);
});

test("published-only filter still applies to the paged query", () => {
  assert.match(sitemapSource, /\.eq\("status", "published"\)/);
});

test("no per-law URL list was added — only the one resolved civil-procedure law (law pages are client-rendered shells — a documented follow-up)", () => {
  // Exactly one `/laws/${…}` template: the civil-procedure law, whose slug is
  // looked up in the DB because it differs between cloud and self-hosted.
  const lawTemplates = sitemapSource.match(/\/laws\/\$\{/g) ?? [];
  assert.equal(lawTemplates.length, 1);
  assert.match(sitemapSource, /url: `\$\{BASE_URL\}\/laws\/\$\{slug\}`/);
  assert.doesNotMatch(sitemapSource, /\/precedents\/\$\{/);
});

test("the /laws/civil-procedure 308 alias is not listed; the law is resolved per database, fail-empty", () => {
  assert.doesNotMatch(sitemapSource, /url: "\/laws\/civil-procedure"/);
  // Self-hosted slug first, cloud slug second (both verified 2026-09-25).
  assert.match(
    sitemapSource,
    /CIVIL_PROCEDURE_LAW_SLUGS = \[\s*"sharia-pleading-law-qadha-edition",\s*"ndham-almrafaat-alshrayh-jmayh-qda",\s*\]/,
  );
  assert.match(sitemapSource, /\.from\("laws"\)\s*\.select\("slug"\)\s*\.in\("slug"/);
  // A failed lookup lists nothing rather than a URL that may 404.
  assert.match(sitemapSource, /civil-procedure law lookup failed:", error\.message\);\s*return \[\];/);
});
