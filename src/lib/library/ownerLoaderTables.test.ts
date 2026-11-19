import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  codePointLength,
  COLUMN_WIDTHS_RPC,
  createLongestValueTracker,
  findNarrowColumns,
  limitedColumns,
  OWNER_LOADER_TABLES,
  preflightColumnWidths,
  preflightRequiredColumns,
  rpcBatchStored,
  type ColumnWidth,
} from "./ownerLoaderTables.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const LOADER = readFileSync(path.join(here, "../../../scripts/seed-library-from-owner.mjs"), "utf8").replace(/\r\n/g, "\n");

test("note ١١: the loader knows all 15 library tables, the private details right after principle_paragraphs", () => {
  const names = OWNER_LOADER_TABLES.map((t) => t.name);
  assert.equal(names.length, 15);
  assert.deepEqual(names, [
    "laws", "chapters", "articles", "article_amendments", "article_regulations",
    "decrees_circulars", "decree_pages",
    "judicial_collections", "principles", "principle_paragraphs", "private_precedent_details",
    "feqh_books", "feqh_chapters", "feqh_sections", "feqh_blocks",
  ]);
  const priv = OWNER_LOADER_TABLES.find((t) => t.name === "private_precedent_details");
  assert.deepEqual(priv?.rpc, { name: "store_private_precedent_details", schema: "public", arg: "p_rows" });
  assert.equal(priv?.batchSize, 100, "the RPC refuses more than 100 rows a call");
  assert.equal(priv?.optionalFile, true);
});

test("note ١١: series_id / volume_number are REQUIRED, never optional or stripped", () => {
  const books = OWNER_LOADER_TABLES.find((t) => t.name === "feqh_books");
  assert.deepEqual(books?.requiredColumns, ["series_id", "volume_number"]);
  assert.ok(!books?.stripKeys.includes("series_id") && !books?.stripKeys.includes("volume_number"));
  assert.doesNotMatch(LOADER, /optionalColumns|missingOptionalColumns|stripKeys\.push/);
});

test("owner 2026-11-06: principles.printed_page is REQUIRED before the first write (migration 20261109_21)", () => {
  const principles = OWNER_LOADER_TABLES.find((t) => t.name === "principles");
  assert.ok(principles?.requiredColumns?.includes("printed_page"));
  assert.ok(!principles?.stripKeys.includes("printed_page"));
});

test("owner 2026-11-06: laws.merged_regulations is REQUIRED before the first write (migration 20261109_20)", () => {
  const laws = OWNER_LOADER_TABLES.find((t) => t.name === "laws");
  assert.ok(laws?.requiredColumns?.includes("merged_regulations"));
  assert.ok(!laws?.stripKeys.includes("merged_regulations"));
});

test("20261118_10: owner_links is REQUIRED on laws and decrees before the first write, never stripped", () => {
  for (const name of ["laws", "decrees_circulars"]) {
    const t = OWNER_LOADER_TABLES.find((x) => x.name === name);
    assert.ok(t?.requiredColumns?.includes("owner_links"), name);
    assert.ok(!t?.stripKeys.includes("owner_links"), name);
  }
});

test("preflight: a missing column, a permission error, a timeout or a throw each stop the load", async () => {
  const answers: Record<string, { error: { code?: string; message?: string } | null } | "throw"> = {
    series_id: { error: { code: "42703", message: "column feqh_books.series_id does not exist" } },
    volume_number: { error: { code: "57014", message: "canceling statement due to statement timeout" } },
  };
  // Columns this test does not name answer "present", so it keeps testing the
  // feqh_books pair while other tables gain required columns.
  const probe = async (_t: string, c: string) => {
    const a = answers[c] ?? { error: null };
    if (a === "throw") throw new Error("network down");
    return a;
  };
  const problems = await preflightRequiredColumns(OWNER_LOADER_TABLES, probe);
  assert.deepEqual(problems.map((p) => `${p.table}.${p.column}`), ["feqh_books.series_id", "feqh_books.volume_number"]);

  answers.series_id = { error: null };
  answers.volume_number = "throw";
  assert.deepEqual((await preflightRequiredColumns(OWNER_LOADER_TABLES, probe)).map((p) => p.reason), ["network down"]);

  answers.volume_number = { error: null };
  assert.deepEqual(await preflightRequiredColumns(OWNER_LOADER_TABLES, probe), []);
});

test("the loader runs the preflight before any write and exits 1 on a problem — never in a dry run", () => {
  const guard = LOADER.indexOf("preflightRequiredColumns(tablesToSeed");
  const firstSeed = LOADER.indexOf("tableStats.push(await seedTable(t))");
  assert.ok(guard > 0 && firstSeed > guard, "preflight comes before the first seedTable");
  assert.match(LOADER.slice(guard - 200, guard), /if \(!isDry\) \{/);
  assert.match(LOADER.slice(guard, firstSeed), /process\.exit\(1\)/);
  assert.match(LOADER, /const TABLES = OWNER_LOADER_TABLES;/);
});

test("the private details go through the RPC, all or nothing: a short count throws (no row-by-row retry)", () => {
  assert.equal(rpcBatchStored(100, 100, null), true);
  assert.equal(rpcBatchStored(100, "100", null), true);
  assert.equal(rpcBatchStored(100, 99, null), false);
  assert.equal(rpcBatchStored(100, 100, { message: "x" }), false);
  assert.equal(rpcBatchStored(3, null, null), false);
  const rpcBlock = LOADER.slice(LOADER.indexOf("if (tableConfig.rpc) {"), LOADER.indexOf("const { error } = await supabase.from(tableConfig.name).upsert"));
  assert.match(rpcBlock, /\.schema\(tableConfig\.rpc\.schema\)/);
  assert.match(rpcBlock, /throw new Error/);
  assert.match(rpcBlock, /stats\.rowsWritten \+= rows\.length;\n\s*return;\n\s*\}\s*$/);
});

test("20261129_70 (owner file 18 items 3 + 4): the amendment card and law summary columns are REQUIRED, never stripped", () => {
  const laws = OWNER_LOADER_TABLES.find((t) => t.name === "laws");
  for (const c of ["summary", "summary_card", "summary_status", "summary_reviewed_at"]) {
    assert.ok(laws?.requiredColumns?.includes(c), c);
    assert.ok(!laws?.stripKeys.includes(c), c);
  }
  // summary_brief stays stripped: it is GENERATED (reviewed summary_card first).
  assert.ok(laws?.stripKeys.includes("summary_brief"));
  const amendments = OWNER_LOADER_TABLES.find((t) => t.name === "article_amendments");
  assert.deepEqual(amendments?.requiredColumns, ["decree_id", "paragraphs", "text_status", "position"]);
  assert.deepEqual(amendments?.stripKeys, []);
});

// ── l10 (gap 1.6): the column-width preflight ────────────────────────────────
const widths = (numberText: string, numberTextMax: number | null, instrument = "text", instrumentMax: number | null = null): ColumnWidth[] => [
  { table_name: "articles", column_name: "id", data_type: "character varying(150)", max_chars: 150 },
  { table_name: "articles", column_name: "number", data_type: "character varying(20)", max_chars: 20 },
  { table_name: "articles", column_name: "number_text", data_type: numberText, max_chars: numberTextMax },
  { table_name: "articles", column_name: "text", data_type: "text", max_chars: null },
  { table_name: "laws", column_name: "slug", data_type: "character varying(200)", max_chars: 200 },
  { table_name: "laws", column_name: "issuing_instrument", data_type: instrument, max_chars: instrumentMax },
  { table_name: "laws", column_name: "official_source_url", data_type: "text", max_chars: null },
];

test("l10 width preflight: number_text still varchar(50) stops the load and names 20261130_10", () => {
  const problems = findNarrowColumns(widths("character varying(50)", 50), OWNER_LOADER_TABLES);
  assert.equal(problems.length, 1);
  assert.equal(`${problems[0].table}.${problems[0].column}`, "articles.number_text");
  assert.match(problems[0].reason, /narrower than the seeder's cap of 1000/);
  assert.match(problems[0].reason, /20261130_10_library_wide_text_columns\.sql/);
  // issuing_instrument still varchar(200) too
  assert.deepEqual(
    findNarrowColumns(widths("text", null, "character varying(200)", 200), OWNER_LOADER_TABLES).map((p) => p.column),
    ["issuing_instrument"],
  );
});

test("l10 width preflight: all three text passes; a table not being loaded is not judged", () => {
  assert.deepEqual(findNarrowColumns(widths("text", null), OWNER_LOADER_TABLES), []);
  const onlyFeqh = OWNER_LOADER_TABLES.filter((t) => t.name.startsWith("feqh_"));
  assert.deepEqual(findNarrowColumns(widths("character varying(50)", 50), onlyFeqh), []);
});

test("l10 width preflight: a row longer than its column stops the load, naming the row", () => {
  const problems = findNarrowColumns(widths("text", null), OWNER_LOADER_TABLES, [
    { table: "articles", column: "number", length: 21, key: "law__art-9" },
    { table: "articles", column: "number", length: 20, key: "law__art-8" },
    { table: "laws", column: "slug", length: 200, key: "x" },
  ]);
  assert.deepEqual(problems.map((p) => [p.table, p.column]), [["articles", "number"]]);
  assert.match(problems[0].reason, /row law__art-9 carries 21 characters/);
});

test("l10 width preflight: a missing RPC, an error, an empty answer or a throw each stop the load", async () => {
  const none = async () => [];
  const missing = await preflightColumnWidths(OWNER_LOADER_TABLES,
    async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function library.library_column_widths" } }), none);
  assert.equal(missing.length, 1);
  assert.match(missing[0].reason, /library_column_widths\(\): Could not find the function/);
  assert.match(missing[0].reason, /run supabase\/migrations\/20261130_10_library_wide_text_columns\.sql/);
  assert.equal((await preflightColumnWidths(OWNER_LOADER_TABLES, async () => ({ data: [], error: null }), none)).length, 1);
  const thrown = await preflightColumnWidths(OWNER_LOADER_TABLES, async () => { throw new Error("socket hang up"); }, none);
  assert.match(thrown[0].reason, /socket hang up/);
  const scanFails = await preflightColumnWidths(OWNER_LOADER_TABLES, async () => ({ data: widths("text", null), error: null }),
    async () => { throw new Error("EACCES"); });
  assert.match(scanFails[0].reason, /could not measure the rows: EACCES/);
  // all well: no problem, and the scan was asked only for the limited columns
  let asked: Map<string, string[]> | undefined;
  const ok = await preflightColumnWidths(OWNER_LOADER_TABLES, async () => ({ data: widths("text", null), error: null }),
    async (w) => { asked = w; return []; });
  assert.deepEqual(ok, []);
  assert.deepEqual(asked, new Map([["articles", ["id", "number"]], ["laws", ["slug"]]]));
  assert.equal(COLUMN_WIDTHS_RPC, "library_column_widths");
});

test("l10 longest-value tracker: code points (what varchar counts), the longest per column with its row key", () => {
  assert.equal(codePointLength("مادة"), 4);
  assert.equal(codePointLength("x😀"), 2, "an emoji pair is one character for Postgres");
  const t = createLongestValueTracker(limitedColumns(widths("character varying(50)", 50), OWNER_LOADER_TABLES));
  t.observe("articles", { id: "a1", number: "1", number_text: "قصير" }, "a1");
  t.observe("articles", { id: "a2", number: "2", number_text: "م".repeat(120) }, "a2");
  t.observe("articles", { id: "a3", number: null, number_text: 7 }, "a3");
  t.observe("feqh_blocks", { id: "b1", topic: "z".repeat(999) }, "b1");
  const snap = t.snapshot();
  assert.deepEqual(snap.find((l) => l.column === "number_text"), { table: "articles", column: "number_text", length: 120, key: "a2" });
  assert.equal(snap.some((l) => l.table === "feqh_blocks"), false);
  // and the judgement: 120 > varchar(50), plus the cap problem
  const problems = findNarrowColumns(widths("character varying(50)", 50), OWNER_LOADER_TABLES, snap);
  assert.equal(problems.filter((p) => p.column === "number_text").length, 2);
});

test("the loader runs the width preflight before the first write, live only, and exits 1", () => {
  const guard = LOADER.indexOf("preflightColumnWidths(");
  const required = LOADER.indexOf("preflightRequiredColumns(tablesToSeed");
  const firstSeed = LOADER.indexOf("tableStats.push(await seedTable(t))");
  assert.ok(guard > required && firstSeed > guard, "after the required-column probe, before the first seedTable");
  assert.match(LOADER.slice(guard, firstSeed), /\(\) => supabase\.rpc\(COLUMN_WIDTHS_RPC\)/);
  assert.match(LOADER.slice(guard, firstSeed), /scanLongestValues\(tablesToSeed, watch\)/);
  assert.match(LOADER.slice(guard, firstSeed), /process\.exit\(1\)/);
  assert.match(LOADER.slice(required - 200, guard), /if \(!isDry\) \{/);
});
