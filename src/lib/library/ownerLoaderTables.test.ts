import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { OWNER_LOADER_TABLES, preflightRequiredColumns, rpcBatchStored } from "./ownerLoaderTables.ts";

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

test("preflight: a missing column, a permission error, a timeout or a throw each stop the load", async () => {
  const answers: Record<string, { error: { code?: string; message?: string } | null } | "throw"> = {
    series_id: { error: { code: "42703", message: "column feqh_books.series_id does not exist" } },
    volume_number: { error: { code: "57014", message: "canceling statement due to statement timeout" } },
  };
  const probe = async (_t: string, c: string) => {
    const a = answers[c];
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
