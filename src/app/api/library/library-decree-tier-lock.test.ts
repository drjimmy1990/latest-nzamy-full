/**
 * Source contract for migration 20261108_10 (owner ٤٢٤ / ٣٨٠ / ٣١٩): a
 * decree's number (ref), date, official link, its raw summaries and the fts
 * built from them are SERVER-ONLY. anon / authenticated keep SELECT on the
 * catalogue columns parsed from the migration's grant — and nothing else.
 *
 * What this pins (library-column-lock.test.ts scans every request-client read
 * of the locked tables against the same allow-list; this file pins the
 * decree-specific pieces):
 *   1. the allow-list is the same in the grant, the migration's verify, its
 *      final SELECT, the RLS harness and the verify snippet;
 *   2. every literal `.from('decrees_circulars')` read in src/ runs on the
 *      service client; the two request-client reads the scanner cannot see
 *      (dynamic table names) name allowed columns only;
 *   3. the routes that moved to the service role still mask per tier exactly
 *      as before;
 *   4. the migration's shape (guard, revoke + column grant, marker, raising
 *      verify, one transaction, deploy-order header, rollback).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)); // src/app/api/library
const repo = path.resolve(here, "../../../..");
const read = (rel: string) => readFileSync(path.join(repo, rel), "utf8");

const MIGRATION = read("supabase/migrations/20261108_10_library_decree_tier_columns_lock.sql");
const HARNESS = read("supabase/tests/rls/library_tier_columns_1108.test.sql");
/**
 * The verify block: from _verify.sql once the controller has merged it, else
 * from the batch snippet (docs/plans/2026-11-08-snippets/A1-verify.sql).
 */
const SNIPPET = (() => {
  const verify = read("supabase/migrations/_verify.sql");
  const start = verify.indexOf("-- >>> verify:library_tier_columns_1108");
  if (start >= 0) {
    const endMark = "-- <<< verify:library_tier_columns_1108";
    const end = verify.indexOf(endMark, start);
    assert.ok(end > start, "_verify.sql opens verify:library_tier_columns_1108 but never closes it");
    return verify.slice(start, end + endMark.length);
  }
  return read("docs/plans/2026-11-08-snippets/A1-verify.sql");
})();

/** Live columns of library.decrees_circulars (controller-verified 2026-10-18). */
const LIVE = [
  "id", "title", "type", "issuer", "ref", "date", "summary", "summary_brief", "category", "preamble",
  "hashtags", "official_url", "fts", "created_at", "updated_at", "instrument_ar",
];

const grant = /grant select \(([^)]*)\) on library\.decrees_circulars to anon, authenticated;/.exec(MIGRATION);
assert.ok(grant, "20261108_10 must grant an explicit column list on library.decrees_circulars");
const ALLOWED = grant[1].split(",").map((c) => c.trim()).filter(Boolean);
const LOCKED = LIVE.filter((c) => !ALLOWED.includes(c));
const quoted = (body: string) => [...body.matchAll(/'(\w+)'/g)].map((m) => m[1]);

/** The tier fields the routes mask (maskDecreeOfficialFields, summaryForViewer) — never anon-readable. */
const TIER_FIELDS = ["ref", "date", "official_url", "summary", "summary_brief"];

test("the allow-list: catalogue columns only; every tier-masked field, fts and the preamble are locked", () => {
  assert.deepEqual(ALLOWED, ["id", "title", "type", "issuer", "category", "hashtags", "created_at", "updated_at", "instrument_ar"]);
  for (const c of ALLOWED) assert.ok(LIVE.includes(c), `${c} is granted but not a live column`);
  assert.deepEqual([...LOCKED].sort(), ["date", "fts", "official_url", "preamble", "ref", "summary", "summary_brief"]);
  // The route-side list of masked official fields is a subset of the lock.
  const meta = read("src/app/api/library/laws/[slug]/_official-meta.ts");
  const fields = /export const DECREE_OFFICIAL_FIELDS = \[([^\]]*)\] as const;/.exec(meta);
  assert.ok(fields, "DECREE_OFFICIAL_FIELDS");
  for (const f of quoted(fields[1].replace(/"/g, "'"))) assert.ok(LOCKED.includes(f), `masked field ${f} is anon-readable`);
  for (const f of TIER_FIELDS) assert.ok(LOCKED.includes(f));
});

test("the migration's verify, its final SELECT, the harness and the verify snippet carry the same lists", () => {
  const mv = /allowed constant text\[\] := array\[([\s\S]*?)\];/.exec(MIGRATION);
  assert.ok(mv, "migration verify allow-list");
  assert.deepEqual(quoted(mv[1]), ALLOWED);
  const finalSelect = MIGRATION.slice(MIGRATION.lastIndexOf("notify pgrst"));
  const fs = [...finalSelect.matchAll(/any \(array\[([^\]]*)\]\)/g)];
  assert.equal(fs.length, 2, "the final SELECT names the allow-list twice (should_read, ok)");
  for (const m of fs) assert.deepEqual(quoted(m[1]), ALLOWED);
  assert.match(finalSelect, / as ok\b/);

  const hAllowed = /foreach col in array array\[([^\]]*)\] loop\s*if not has_column_privilege\(r, 'library\.decrees_circulars'/.exec(HARNESS);
  assert.ok(hAllowed, "harness allow-list");
  assert.deepEqual(quoted(hAllowed[1]), ALLOWED);
  const hLocked = /foreach col in array array\[([^\]]*)\] loop\s*if has_column_privilege\(r, 'library\.decrees_circulars'/.exec(HARNESS);
  assert.ok(hLocked, "harness locked list");
  assert.deepEqual([...quoted(hLocked[1])].sort(), [...LOCKED].sort());
  // The harness chain runs the migration twice and after each documented re-open.
  assert.equal((HARNESS.match(/\$M\/20261108_10_library_decree_tier_columns_lock\.sql/g) ?? []).length, 4);

  assert.match(SNIPPET, /^-- >>> verify:library_tier_columns_1108$/m);
  assert.match(SNIPPET, /^-- <<< verify:library_tier_columns_1108\s*$/m);
  const sLocked = /cross join \(values ([^)]*(?:\)[^)]*)*?)\) as c\(col\)\s*union all/.exec(SNIPPET);
  assert.ok(sLocked, "snippet locked-column list");
  assert.deepEqual([...quoted(sLocked[1])].sort(), [...LOCKED].sort());
  const sAllowed = /allowed constant text\[\] := array\[([^\]]*)\];/.exec(SNIPPET);
  assert.ok(sAllowed, "snippet allow-list");
  assert.deepEqual(quoted(sAllowed[1]), ALLOWED);
  assert.match(SNIPPET, /ILIKE '%tier columns server-only since 20261108_10%'/i);
});

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(repo, dir), { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
    .map((e) => path.relative(repo, path.join(e.parentPath, e.name)).split(path.sep).join("/"));
}

test("every literal decrees_circulars read in src runs on the service client", () => {
  // src/lib/supabaseLibrary.ts is dead code (its own dead-fetch test pins that).
  const files = sourceFiles("src").filter((f) => f !== "src/lib/supabaseLibrary.ts");
  const reads: string[] = [];
  for (const f of files) {
    const src = read(f);
    const re = /(\w+)\s*\.schema\(\s*['"]library['"]\s*\)\s*\.from\(\s*['"]decrees_circulars['"]\s*\)/g;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      const before = src.slice(0, m.index);
      const decls = [...before.matchAll(new RegExp(String.raw`(?:const|let|var)\s+${m[1]}\s*=\s*(?:await\s+)?(\w+)\(`, "g"))];
      const ctor = decls.at(-1)?.[1] ?? "unknown";
      reads.push(`${f}: ${m[1]} (${ctor})`);
      assert.equal(ctor, "createServiceClient", `${f}: library.decrees_circulars read through "${m[1]}" (${ctor}) — the request client may read only ${ALLOWED.join(", ")}`);
    }
  }
  // The decree page (header + preamble), search, autocomplete, monitor, sitemap, libraryDocumentSeo.
  assert.ok(reads.length >= 7, reads.join("\n"));
  for (const f of [
    "src/app/api/library/decrees/[id]/route.ts",
    "src/app/api/library/search/route.ts",
    "src/app/api/library/autocomplete/route.ts",
    "src/app/api/library/monitor/route.ts",
  ]) {
    assert.ok(reads.some((r) => r.startsWith(`${f}:`)), `${f} reads decrees_circulars`);
  }
});

test("the reads the scanner cannot see: init and autocomplete pass the service client; the request-client ones name allowed columns", () => {
  const init = read("src/app/api/library/init/route.ts");
  assert.match(init, /const serverOnly = await createServiceClient\(\);/);
  assert.match(init, /fetchSection\("decrees_circulars", DECREE_LIST_COLUMNS, "decrees", \(q\) => q\.order\("id"\), serverOnly\)/);
  const auto = read("src/app/api/library/autocomplete/route.ts");
  assert.match(auto, /count\('decrees_circulars', serverOnly\),/);
  assert.match(auto, /\.textSearch\('fts', ftsQuery/);

  // libraryStats: an anon-key count on `id`.
  const stats = read("src/lib/library/libraryStats.ts");
  const st = /decrees: \{ table: "decrees_circulars", column: "(\w+)", serverOnly: (true|false) \}/.exec(stats);
  assert.ok(st, "libraryStats decrees entry");
  assert.ok(st[2] === "true" || ALLOWED.includes(st[1]), `libraryStats counts decrees_circulars.${st[1]} with the anon key`);
  // folders/titles: `${idColumn}, title` on the request client — id and title.
  const titles = read("src/app/api/library/folders/titles/route.ts");
  assert.match(titles, /orders: \{ table: 'decrees_circulars', idColumn: 'id' \}/);
  assert.match(titles, /\.select\(`\$\{idColumn\}, title`\)\s*\.in\(idColumn, ids\)/);
  assert.ok(ALLOWED.includes("id") && ALLOWED.includes("title"));
});

test("the moved routes still mask per tier exactly as before", () => {
  const decree = read("src/app/api/library/decrees/[id]/route.ts");
  assert.match(decree, /const serverOnly = await createServiceClient\(\);\s*\/\/ Fetch decree metadata[^\n]*\n\s*const \{ data: decree, error: decreeError \} = await serverOnly/);
  assert.match(decree, /const official = maskDecreeOfficialFields\(\s*\{ ref: decree\.ref \|\| '', date: decree\.date \|\| '', official_url: decree\.official_url \|\| '' \},\s*isSubscriber,\s*\);/);
  assert.match(decree, /summary: typeof decree\.summary === 'string' \? summaryForViewer\(decree\.summary, isSubscriber\) : decree\.summary,/);
  assert.match(decree, /summary_brief: typeof decree\.summary_brief === 'string' \? summaryForViewer\(decree\.summary_brief, isSubscriber\) : decree\.summary_brief,/);
  assert.match(decree, /officialMetaLocked: !isSubscriber && Boolean\(decree\.ref \|\| decree\.date \|\| decree\.official_url\),/);
  // Auth still reads the cookie session through the request client.
  assert.match(decree, /const \{ data: \{ user \} \} = await supabase\.auth\.getUser\(\);/);

  const init = read("src/app/api/library/init/route.ts");
  assert.match(init, /for \(const key of \["summary_brief", "summary"\]\) \{\s*if \(typeof shaped\[key\] === "string"\) shaped\[key\] = summaryForViewer\(shaped\[key\] as string, hasFullAccess\);\s*\}\s*return \{ \.\.\.maskDecreeOfficialFields\(shaped, hasFullAccess\), free: isFree, locked: !isFree \};/);

  const search = read("src/app/api/library/search/route.ts");
  assert.match(search, /const orderQuery = \(head = false\) => \{\s*let q = serverOnly\s*\.schema\('library'\)\s*\.from\('decrees_circulars'\)/);
  assert.match(search, /const brief = summaryForViewer\(r\.summary_brief as string \|\| '', hasFullAccess\);/);
  assert.match(search, /const official = maskDecreeOfficialFields\(\{ ref: r\.ref \?\? '', date: r\.date \?\? '' \}, hasFullAccess\);/);

  const auto = read("src/app/api/library/autocomplete/route.ts");
  assert.match(auto, /serverOnly\s*\.schema\('library'\)\s*\.from\('decrees_circulars'\)\s*\.select\('id, title, type'\)/);
  // The autocomplete card carries the title only — never the number.
  const orderMatches = auto.slice(auto.indexOf("const orderMatches"), auto.indexOf("const bookMatches"));
  assert.doesNotMatch(orderMatches, /\bref\b|\bdate\b/);

  const monitor = read("src/app/api/library/monitor/route.ts");
  assert.match(monitor, /serverOnly\s*\.schema\("library"\)\s*\.from\("decrees_circulars"\)\s*\.select\(ORDER_COLUMNS\)/);
  assert.match(monitor, /latest: maskOfficialDates\(buildLatest\(latestLawRows, orderRows, todayHijri\), isSubscriber\),/);
});

test("the migration: guard, revoke + column grant, service_role kept, RLS, marker, raising verify, deploy order, rollback", () => {
  assert.match(MIGRATION, /raise exception '20261108_10: library\.decrees_circulars is missing/);
  assert.match(MIGRATION, /raise exception '20261108_10: library\.decrees_circulars\.instrument_ar is missing/);
  assert.match(MIGRATION, /not ilike '%preamble server-only since 20261019_40%' then\s*raise exception '20261108_10: apply 20261019_40/);
  assert.match(MIGRATION, /^revoke all on library\.decrees_circulars from anon, authenticated, public;$/m);
  assert.match(MIGRATION, /^grant all on library\.decrees_circulars to service_role;$/m);
  assert.match(MIGRATION, /^alter table library\.decrees_circulars enable row level security;$/m);
  // The comment keeps the 20261019_40 marker (still true) and adds this one.
  assert.match(MIGRATION, /comment on table library\.decrees_circulars is\s*'[^']*PREAMBLE SERVER-ONLY since 20261019_40[^']*TIER COLUMNS SERVER-ONLY since 20261108_10/);
  assert.match(MIGRATION, /has_column_privilege\(r, tbl, a\.name, 'SELECT'\)/, "the pg_attribute sweep");
  assert.match(MIGRATION, /raise exception '20261108_10 verify:%'/);
  assert.equal((MIGRATION.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((MIGRATION.match(/^commit;$/gm) ?? []).length, 1);
  assert.match(MIGRATION, /^commit;\s*\n[\s\S]*^notify pgrst, 'reload schema';$/m);
  assert.match(MIGRATION, /DEPLOY ORDER — RUN AFTER THE DEPLOY OF THIS COMMIT \(CODE FIRST\)/);
  assert.match(MIGRATION, /BEFORE APPLYING — readers outside this repo that would break/);
  assert.match(MIGRATION, /n8n\.asra3\.com/);
  assert.match(MIGRATION, /Re-running 20261019_40_library_decree_preamble_lock\.sql: its grant puts/);
  assert.match(MIGRATION, /-- ROLLBACK \(/);
  // 20261019_40 warns against being re-run after this file.
  assert.match(read("supabase/migrations/20261019_40_library_decree_preamble_lock.sql"), /NOT AFTER 20261108_10_library_decree_tier_columns_lock\.sql/);
});
