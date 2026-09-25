#!/usr/bin/env node
/**
 * scripts/seed-library-from-owner.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Direct Network Seeder for Nzamy Legal Library.
 *
 * Streams and batch-upserts the 14 verified JSONL tables from the owner's
 * delivery package into Supabase (self-hosted) via HTTPS/PostgREST.
 *
 * NO 800MB SQL FILE UPLOAD NEEDED.
 *
 * STRIPPED COLUMNS — READ BEFORE RE-RUNNING AFTER A SCHEMA CHANGE
 *   needs_human_review / review_reason (laws, decrees_circulars, principles)
 *   and is_synthetic_page (feqh_blocks) are deleted from every row before
 *   upsert. This is NOT a data-quality choice — those columns simply do not
 *   exist yet on the target database. They land with migrations
 *   20260821_feqh_blocks_is_synthetic_page.sql and
 *   20260822_needs_human_review_columns.sql, which are written but not
 *   applied on self-hosted as of this script's last edit. Applying the two
 *   migrations alone leaves every already-seeded row at the column default
 *   (false / null) — it does not backfill the real values. Once those
 *   migrations run, remove the corresponding stripKeys entries below and
 *   RE-SEED the four affected tables (laws, decrees_circulars, principles,
 *   feqh_blocks); the re-seed's upsert is what actually writes the values.
 *
 * Usage:
 *   node scripts/seed-library-from-owner.mjs                  # seed everything
 *   node scripts/seed-library-from-owner.mjs --dry             # parse-only, no network writes
 *   node scripts/seed-library-from-owner.mjs --table laws
 *   node scripts/seed-library-from-owner.mjs --from chapters
 *   node scripts/seed-library-from-owner.mjs --limit 500
 *   node scripts/seed-library-from-owner.mjs --rows /path/to/evidence/full/rows
 *   NZAMY_LIBRARY_ROWS_DIR=/path/to/rows node scripts/seed-library-from-owner.mjs
 *
 * Rows directory resolution (so the owner can keep the package OUTSIDE the repo):
 *   1. --rows <dir>
 *   2. env NZAMY_LIBRARY_ROWS_DIR
 *   3. newest nzamy-developer-test-<suffix>/evidence/full/rows found under the repo root
 *
 * Safety:
 *   Refuses to run against a target host ending in supabase.co (the old cloud
 *   project) unless --allow-cloud is passed explicitly.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── CLI arguments ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function getArg(flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  const value = argv[idx + 1];
  if (value === undefined || value.startsWith("--")) {
    console.error(`❌ ${flag} requires a value.`);
    process.exit(1);
  }
  return value;
}
const hasFlag = (flag) => argv.includes(flag);

const specificTable = getArg("--table");
const fromTable = getArg("--from");
const limitArg = getArg("--limit");
let maxLimit = Infinity;
if (limitArg !== undefined) {
  const parsedLimit = Number(limitArg);
  if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
    console.error(`❌ --limit must be a positive integer, got "${limitArg}".`);
    process.exit(1);
  }
  maxLimit = parsedLimit;
}
const rowsArg = getArg("--rows");
const allowCloud = hasFlag("--allow-cloud");
const isDry = hasFlag("--dry");

// ── Auto-load .env.local (from the repo root, not cwd) ──────────────────────
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://auth.nezamy.sa";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Cloud guard — never point this seeder at the old cloud project by accident
function assertNotCloud(url, allow) {
  let hostname;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`Invalid Supabase URL: "${url}"`);
  }
  if (!allow && (hostname === "supabase.co" || hostname.endsWith(".supabase.co"))) {
    throw new Error(
      `Refusing to seed cloud host "${hostname}". This project moved to self-hosted. ` +
        `Pass --allow-cloud to override (only if you really mean it).`
    );
  }
  return hostname;
}

let targetHost;
try {
  targetHost = assertNotCloud(SUPABASE_URL, allowCloud);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

if (!isDry && !SERVICE_KEY) {
  console.error("❌ Error: SUPABASE_SERVICE_ROLE_KEY is missing in .env.local (required unless --dry)");
  process.exit(1);
}

const supabase = isDry
  ? null
  : createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "library" },
    });

// ── Rows directory resolution ────────────────────────────────────────────────
function resolveRowsDir(explicitArg) {
  if (explicitArg) {
    const resolved = path.resolve(process.cwd(), explicitArg);
    if (!fs.existsSync(resolved)) {
      throw new Error(`--rows directory not found: ${resolved}`);
    }
    return resolved;
  }

  if (process.env.NZAMY_LIBRARY_ROWS_DIR) {
    const resolved = path.resolve(process.cwd(), process.env.NZAMY_LIBRARY_ROWS_DIR);
    if (!fs.existsSync(resolved)) {
      throw new Error(`NZAMY_LIBRARY_ROWS_DIR directory not found: ${resolved}`);
    }
    return resolved;
  }

  const candidates = [];
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("nzamy-developer-test-")) continue;
    const rowsPath = path.join(ROOT, entry.name, "evidence", "full", "rows");
    if (!fs.existsSync(rowsPath)) continue;
    const dateMatch = entry.name.match(/(\d{4}-\d{2}-\d{2})$/);
    candidates.push({
      name: entry.name,
      rowsPath,
      dateKey: dateMatch ? dateMatch[1] : "0000-00-00",
      mtime: fs.statSync(rowsPath).mtimeMs,
    });
  }

  if (candidates.length === 0) {
    throw new Error(
      `No owner package found. Looked for "nzamy-developer-test-*/evidence/full/rows" under ${ROOT}. ` +
        `Pass --rows <dir> or set NZAMY_LIBRARY_ROWS_DIR.`
    );
  }

  candidates.sort((a, b) => (a.dateKey !== b.dateKey ? (a.dateKey < b.dateKey ? 1 : -1) : b.mtime - a.mtime));
  return candidates[0].rowsPath;
}

let ROWS_DIR;
try {
  ROWS_DIR = resolveRowsDir(rowsArg);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

// 14 Tables in FK-safe dependency order
const TABLES = [
  { name: "laws", pkey: "slug", batchSize: 100, stripKeys: ["needs_human_review", "review_reason"] },
  { name: "chapters", pkey: "id", batchSize: 200, stripKeys: [] },
  { name: "articles", pkey: "id", batchSize: 100, stripKeys: [] },
  { name: "article_amendments", pkey: "id", batchSize: 200, stripKeys: [] },
  { name: "article_regulations", pkey: "id", batchSize: 200, stripKeys: [] },
  { name: "decrees_circulars", pkey: "id", batchSize: 100, stripKeys: ["needs_human_review", "review_reason"] },
  { name: "decree_pages", pkey: "id", batchSize: 200, stripKeys: [] },
  { name: "judicial_collections", pkey: "id", batchSize: 100, stripKeys: [] },
  { name: "principles", pkey: "id", batchSize: 100, stripKeys: ["needs_human_review", "review_reason"] },
  { name: "principle_paragraphs", pkey: "id", batchSize: 200, stripKeys: [] },
  { name: "feqh_books", pkey: "id", batchSize: 100, stripKeys: [] },
  { name: "feqh_chapters", pkey: "id", batchSize: 200, stripKeys: [] },
  { name: "feqh_sections", pkey: "id", batchSize: 200, stripKeys: [] },
  { name: "feqh_blocks", pkey: "id", batchSize: 100, stripKeys: ["is_synthetic_page"] },
];

async function seedTable(tableConfig) {
  const stats = {
    name: tableConfig.name,
    fileFound: true,
    rowsRead: 0,
    rowsWritten: 0,
    rowsSkipped: 0,
    duplicatePkeys: 0,
    skipMessages: [],
  };

  const filePath = path.join(ROWS_DIR, `${tableConfig.name}.jsonl`);
  if (!fs.existsSync(filePath)) {
    stats.fileFound = false;
    console.warn(`  ⚠️ Skipping ${tableConfig.name}: file not found at ${filePath}`);
    return stats;
  }

  const stat = fs.statSync(filePath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(1);
  console.log(`\n📦 Processing library.${tableConfig.name} (${sizeMB} MB)${isDry ? " [DRY RUN]" : ""}...`);

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let batch = [];
  let batchIndex = 0;
  const startTime = Date.now();
  const seenInstrumentIds = new Set();
  const seenPkeys = new Set();
  const nulledInstrumentIds = [];

  function recordSkip(message) {
    stats.rowsSkipped += 1;
    if (stats.skipMessages.length < 5) stats.skipMessages.push(message);
  }

  async function upsertBatch(rows) {
    if (rows.length === 0) return;
    const { error } = await supabase.from(tableConfig.name).upsert(rows, { onConflict: tableConfig.pkey });
    if (!error) {
      stats.rowsWritten += rows.length;
      return;
    }

    // Fallback: if the batch fails, upsert row-by-row so one bad row doesn't drop the whole batch
    if (rows.length > 1) {
      for (const singleRow of rows) {
        const { error: singleErr } = await supabase.from(tableConfig.name).upsert([singleRow], { onConflict: tableConfig.pkey });
        if (!singleErr) {
          stats.rowsWritten += 1;
        } else {
          recordSkip(`${tableConfig.pkey}=${singleRow[tableConfig.pkey]}: ${singleErr.message}`);
        }
      }
    } else {
      recordSkip(`${tableConfig.pkey}=${rows[0][tableConfig.pkey]}: ${error.message}`);
    }
  }

  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (!line.trim()) continue;
    stats.rowsRead++;

    let row;
    try {
      row = JSON.parse(line);
    } catch (e) {
      recordSkip(`line ${lineNo}: JSON parse error — ${e.message}`);
      if (stats.rowsRead >= maxLimit) break;
      continue;
    }

    for (const key of tableConfig.stripKeys) {
      delete row[key];
    }

    // Guard against unique index collision on duplicate instrument_id
    if (tableConfig.name === "laws" && row.instrument_id != null) {
      const cleanIid = String(row.instrument_id).trim();
      if (cleanIid) {
        if (seenInstrumentIds.has(cleanIid)) {
          nulledInstrumentIds.push({ slug: row.slug, instrumentId: cleanIid });
          row.instrument_id = null; // secondary duplicate — satisfy laws_instrument_id_unique_idx
        } else {
          seenInstrumentIds.add(cleanIid);
        }
      } else {
        row.instrument_id = null;
      }
    }

    // Informational: duplicate primary keys in the source (helps explain a later
    // check-counts row-count mismatch — the table will end up with fewer distinct
    // rows than JSONL lines, which is expected, not a bug in this script).
    const pkeyVal = row[tableConfig.pkey];
    if (pkeyVal !== undefined && pkeyVal !== null) {
      if (seenPkeys.has(pkeyVal)) stats.duplicatePkeys++;
      else seenPkeys.add(pkeyVal);
    }

    if (isDry) {
      stats.rowsWritten++; // "would write" — parsed and transformed cleanly
    } else {
      batch.push(row);
      if (batch.length >= tableConfig.batchSize) {
        await upsertBatch(batch);
        batch = [];
        batchIndex++;
        if (process.stdout.isTTY) {
          process.stdout.write(`   → Written: ${stats.rowsWritten.toLocaleString()} rows\r`);
        }
      }
    }

    if (stats.rowsRead >= maxLimit) break;
  }

  // Final remaining batch
  if (!isDry && batch.length > 0) {
    await upsertBatch(batch);
  }

  if (tableConfig.name === "laws" && nulledInstrumentIds.length > 0) {
    console.log(`   ℹ Nulled duplicate instrument_id on ${nulledInstrumentIds.length} law row(s) (kept first occurrence):`);
    for (const n of nulledInstrumentIds) {
      console.log(`      - ${n.slug ?? "(no slug)"} (instrument_id was: ${n.instrumentId})`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const verb = isDry ? "Parsed" : "Written";
  console.log(`   ✓ ${verb} library.${tableConfig.name}: ${stats.rowsWritten.toLocaleString()} / ${stats.rowsRead.toLocaleString()} rows in ${elapsed}s`);

  return stats;
}

function printSummary(tableStats) {
  const w1 = 24;
  const w2 = 13;
  const col = (s) => String(s).padStart(w2);
  console.log("\n" + "═".repeat(78));
  console.log(isDry ? "  DRY RUN SUMMARY (no network writes)" : "  SEED SUMMARY");
  console.log("═".repeat(78));
  console.log(
    "  " + "table".padEnd(w1) + col("read") + col(isDry ? "would-write" : "written") + col("skipped") + col("dup-pk")
  );
  for (const s of tableStats) {
    const label = s.fileFound ? s.name : `${s.name} (FILE NOT FOUND)`;
    console.log(
      "  " + label.padEnd(w1) + col(s.rowsRead) + col(s.rowsWritten) + col(s.rowsSkipped) + col(s.duplicatePkeys)
    );
  }
  for (const s of tableStats) {
    if (s.skipMessages.length === 0) continue;
    console.log(`\n  ${s.name} — first ${s.skipMessages.length} skip reason(s):`);
    for (const m of s.skipMessages) console.log(`    - ${m}`);
  }
}

async function main() {
  console.log("═".repeat(70));
  console.log("  🏛️  NZAMY LEGAL LIBRARY — DIRECT STREAMING SEEDER");
  console.log(`  Target: ${SUPABASE_URL} (${targetHost})${isDry ? "  [DRY RUN — no writes]" : ""}`);
  console.log(`  Rows dir: ${ROWS_DIR}`);
  console.log("═".repeat(70));

  let tablesToSeed = specificTable ? TABLES.filter((t) => t.name === specificTable) : TABLES;

  if (specificTable && tablesToSeed.length === 0) {
    console.error(`❌ Table '${specificTable}' not recognized.`);
    process.exit(1);
  }

  if (fromTable) {
    const idx = tablesToSeed.findIndex((t) => t.name === fromTable);
    if (idx !== -1) {
      tablesToSeed = tablesToSeed.slice(idx);
    } else {
      console.error(`❌ Table '${fromTable}' not found.`);
      process.exit(1);
    }
  }

  if (tablesToSeed.length === 0) {
    console.error(`❌ No tables to seed.`);
    process.exit(1);
  }

  const grandStart = Date.now();
  const tableStats = [];
  for (const t of tablesToSeed) {
    tableStats.push(await seedTable(t));
  }
  const grandElapsed = ((Date.now() - grandStart) / 1000).toFixed(1);

  printSummary(tableStats);

  const anySkipped = tableStats.some((s) => s.rowsSkipped > 0);
  const anyMissingFile = tableStats.some((s) => !s.fileFound);
  const failed = anySkipped || anyMissingFile;

  console.log("\n" + "═".repeat(70));
  if (isDry) {
    console.log(`  DRY RUN — no writes. ${failed ? "Issues found — see summary above." : "All rows parsed cleanly."}`);
  } else if (failed) {
    console.log(`  ⚠️ COMPLETED WITH ISSUES in ${grandElapsed}s — see summary above (rows skipped and/or files missing).`);
  } else {
    console.log(`  🎉 ALL TABLES COMPLETED SUCCESSFULLY IN ${grandElapsed}s!`);
  }
  console.log("═".repeat(70));

  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal Seeder Error:", err.message);
  process.exit(1);
});
