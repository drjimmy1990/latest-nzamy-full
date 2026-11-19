/**
 * Source contract for the library's SEO files (owner note ١٤ phase 1). The
 * layouts and the sitemap read the database, so they are pinned here by their
 * source: every reader route has a server layout with generateMetadata, the
 * judgment screen is noindex, the reads go through the guest-shaped loader,
 * and no official link or FAQPage can be printed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

const READERS: Array<[string, string]> = [
  ["./laws/[slug]/layout.tsx", "law"],
  ["./laws/orders/[slug]/layout.tsx", "order"],
  ["./precedents/[slug]/layout.tsx", "collection"],
  ["./book/[slug]/layout.tsx", "book"],
];

test("every reader route has a server layout with its own generateMetadata and JSON-LD", () => {
  for (const [file, kind] of READERS) {
    const src = read(file);
    assert.doesNotMatch(src, /^\s*["']use client["']/m, `${file} must be a server layout`);
    assert.match(src, /export async function generateMetadata/, file);
    assert.match(src, new RegExp(`libraryDocMetadata\\("${kind}", slug\\)`), file);
    assert.match(src, new RegExp(`loadLibraryDocSeo\\("${kind}", slug\\)`), file);
    assert.match(src, /load\.status === "ok" && <LibraryJsonLd doc=\{load\.doc\} \/>/, file);
  }
});

test("/precedents/judgment/[slug] (a «قريباً» screen) is noindex", () => {
  const src = read("./precedents/judgment/[slug]/layout.tsx");
  assert.match(src, /robots: \{ index: false, follow: false/);
  assert.match(src, /alternates: \{ canonical: null \}/, "not the section's /precedents canonical");
  // Batch l9: only the training crawlers' group (tier 2) closes it — they do
  // not index; search crawlers and * must read the noindex tag.
  const robots = read("../lib/publicSeo/robotsTxt.ts");
  assert.doesNotMatch(robots, /PRIVATE_DISALLOW = \[[^\]]*precedents\/judgment/, "robots.txt must not hide the noindex tag from search");
  assert.match(robots, /FULL_TEXT_DISALLOW = \["\/precedents\/judgment\/", "\/library\/"\]/);
  // Not a sitemap kind: no route base points at it.
  assert.doesNotMatch(read("../lib/library/libraryMetadata.ts"), /:\s*"\/precedents\/judgment/);
});

test("the book shell and JSON-LD sit OUTSIDE LibraryGuard (the guard SSRs only a spinner)", () => {
  const src = read("./book/[slug]/layout.tsx");
  const guard = src.indexOf("<LibraryGuard>{children}</LibraryGuard>");
  assert.ok(guard > 0);
  assert.ok(src.indexOf("<LibraryJsonLd") < guard);
  assert.ok(src.indexOf("<LibraryDocumentShell") > guard);
});

test("P1-10: the law's shell and JSON-LD sit OUTSIDE its own LibraryGuard, and the section guard lets the reader through", () => {
  const src = read("./laws/[slug]/layout.tsx");
  const guard = src.indexOf("<LibraryGuard>{children}</LibraryGuard>");
  assert.ok(guard > 0, "the law layout guards the reader itself");
  assert.ok(src.indexOf("<LibraryJsonLd") < guard);
  assert.ok(src.indexOf("<LibraryDocumentShell doc={load.doc} shell={load.shell} />") > guard);
  // The guest-shaped loader only: the layout itself reads nothing (the one
  // article excerpt is the loader's, by the guest paywall — see below).
  assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /preamble|articles|createServiceClient|createClient/);
  const section = read("./laws/layout.tsx");
  assert.match(section, /<LibraryGuard lawReaderGuardsItself>/);
  const guardSrc = read("../components/library/LibraryGuard.tsx");
  // Owner 18 Nov, item 4.1: a decree's reader guards itself too.
  assert.match(guardSrc, /if \(lawReaderGuardsItself && \(isLawReaderPath\(pathname\) \|\| isOrderReaderPath\(pathname\)\)\) return <>\{children\}<\/>;/);
  // The shell prints the name, the موجز and the loader's excerpt — never a preamble or a raw article text.
  const shell = read("../components/library/LibraryDocumentShell.tsx").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.doesNotMatch(shell, /preamble|\.text\b|articles/);
  assert.match(shell, /\{shell\?\.excerpt && \(/);
});

test("owner 18 Nov, item 4.1: a decree's and a collection's public block and JSON-LD sit OUTSIDE their own guard", () => {
  for (const [file, section, prop] of [
    ["./laws/orders/[slug]/layout.tsx", "./laws/layout.tsx", "lawReaderGuardsItself"],
    ["./precedents/[slug]/layout.tsx", "./precedents/layout.tsx", "collectionReaderGuardsItself"],
  ]) {
    const src = read(file);
    const guard = src.indexOf("<LibraryGuard>{children}</LibraryGuard>");
    assert.ok(guard > 0, `${file} guards its reader itself`);
    assert.ok(src.indexOf("<LibraryJsonLd") < guard, file);
    assert.ok(src.indexOf('{load.status === "ok" && <LibraryDocumentShell doc={load.doc} />}') > guard, file);
    assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ""), /preamble|articles|principles|createServiceClient|createClient/, file);
    assert.match(read(section), new RegExp(`<LibraryGuard ${prop}>`), section);
  }
  const guardSrc = read("../components/library/LibraryGuard.tsx");
  assert.match(guardSrc, /if \(collectionReaderGuardsItself && isCollectionReaderPath\(pathname\)\) return <>\{children\}<\/>;/);
});

test("owner 18 Nov, item 4.1: one H1 — the server block's; the client readers' titles are <h2>", () => {
  const shell = read("../components/library/LibraryDocumentShell.tsx");
  assert.match(shell, /const TitleTag = doc\.kind === "book" \? "h2" : "h1";/);
  assert.match(shell, /<TitleTag className=[^>]*>\{doc\.name\}<\/TitleTag>/);
  assert.match(read("./laws/[slug]/page.tsx"), /<h2 className=\{`text-xl font-black mb-0\.5 [^`]*`\}>\{lawTitle\}<\/h2>/);
  assert.match(read("./laws/orders/[slug]/page.tsx"), /<h2 className=\{`text-xl font-black mb-0\.5 [^`]*`\}><Hl text=\{order\.title\} \/><\/h2>/);
  assert.match(read("./precedents/[slug]/page.tsx"), /<h2 className="text-2xl font-black">\{collection\.title\}<\/h2>/);
});

test("owner 18 Nov, item 4.1: the law excerpt follows the GUEST paywall — one row, the reader's order, the guest's free limit", () => {
  const src = read("../lib/library/libraryDocumentSeo.ts").replace(/\r\n/g, "\n");
  const fn = src.slice(src.indexOf("async function readLawExcerpt"), src.indexOf("async function readOrder"));
  assert.ok(fn.length > 100);
  assert.match(fn, /\.select\("id, text, status"\)\s*\.eq\("law_slug", slug\)\s*\.order\("order_index", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.limit\(1\)/);
  assert.match(fn, /checkLibraryAccess\(null, slug, 0\)/, "a guest's access, whoever asked");
  assert.match(fn, /lawPublicExcerpt\(\(rows \?\? \[\]\)\[0\], effectiveFreeLimit\(access, count\)\)/);
  assert.doesNotMatch(fn.replace(/\/\*[\s\S]*?\*\//g, ""), /original_text|article_regulations|preamble/);
  assert.match(fn, /catch \(err\) \{[\s\S]*?return null;/, "a failed read is no excerpt, not a failed page");
});

test("the loader reads as the service role, checks the library switch, and never uses the cookie client", () => {
  const src = read("../lib/library/libraryDocumentSeo.ts");
  assert.match(src, /const supabase = await createServiceClient\(\);/);
  assert.doesNotMatch(src, /\bcreateClient\(/);
  assert.match(src, /getLibraryStatus\(\)/);
  assert.match(src, /if \(await isClosed\(\)\) return \{ status: "closed" \};/);
  // Closed → no document read at all: the closed check precedes the reader call.
  const load = src.slice(src.indexOf("export const loadLibraryDocSeo"));
  assert.ok(load.indexOf("isClosed()") < load.indexOf("READERS[kind](id)"));
  // summary_brief (20261025_20) degrades to the read without it, as /api/library/init does.
  assert.match(src, /if \(isMissingColumnError\(error, "summary_brief"\)\)/);
  assert.match(src, /\.select\("slug, title, type, latest_update, issue_date_hijri"\)/);
  // A failed read keeps the document's own canonical; closed / not found are noindex.
  assert.match(src, /noIndex: load\.status !== "error", id: id \|\| undefined/);
  // No official link column is ever read.
  assert.doesNotMatch(src, /official_url|official_source_url|boe_source_url|gazette_url/);
});

test("no FAQPage, sameAs or official link in the library SEO sources", () => {
  for (const file of [
    "../lib/library/libraryMetadata.ts",
    "../lib/library/libraryDocumentSeo.ts",
    "../components/library/LibraryJsonLd.tsx",
    "../components/library/LibraryDocumentShell.tsx",
    "./library-sitemaps/sitemap.ts",
    ...READERS.map(([f]) => f),
  ]) {
    const code = read(file).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
    assert.doesNotMatch(code, /FAQPage|sameAs|datePublished|official_url|official_source_url/, file);
  }
});

test("the library sitemaps: documents only, paged, by primary key, empty when closed", () => {
  const src = read("./library-sitemaps/sitemap.ts");
  assert.match(src, /export async function generateSitemaps/);
  assert.match(src, /LIBRARY_SITEMAP_IDS\.map\(\(id\) => \(\{ id \}\)\)/);
  assert.match(src, /\.from\("laws"\)\s*\.select\("slug, latest_update, issue_date_hijri"\)\s*\.order\("slug", \{ ascending: true \}\)\s*\.range\(from, to\)/);
  for (const t of ["decrees_circulars", "judicial_collections", "feqh_books"]) {
    assert.match(src, new RegExp(`\\.from\\("${t}"\\)\\s*\\.select\\("id"\\)\\s*\\.order\\("id", \\{ ascending: true \\}\\)\\s*\\.range\\(from, to\\)`), t);
  }
  assert.doesNotMatch(src, /\.from\("articles"\)|\.from\("principles"\)/, "no article / principle rows");
  assert.match(src, /if \(\(await getLibraryStatus\(\)\)\.closed\) return \[\];/);
  assert.match(src, /const supabase = await createServiceClient\(\);/);
  // The root /sitemap.xml stays where it is (no generateSitemaps there).
  assert.doesNotMatch(read("./sitemap.ts"), /generateSitemaps/);
});
