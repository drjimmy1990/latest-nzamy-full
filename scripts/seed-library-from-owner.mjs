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
 * STRIPPED COLUMNS
 *   - is_synthetic_page (feqh_blocks): the column does not exist on the
 *     target (migration 20260821_feqh_blocks_is_synthetic_page.sql is not
 *     applied), so it is deleted from every row.
 *   - needs_human_review / review_* / editorial_notes* (any table, and inside
 *     `metadata`): INTERNAL for good (library contract 1.6, 2026-10-04 leak)
 *     — removed from every row by stripInternalContentKeys. Do NOT apply
 *     20260822_needs_human_review_columns.sql to bring them back as columns:
 *     a column on a public table is readable with the anon key.
 *
 * TWO-LEVEL CHAPTERS (2026-10-04)
 *   `chapters` rows that carry `level` (1|2) and `parent_chapter_id` (uuid of
 *   a level-1 chapter row of the same law) pass straight through — nothing
 *   strips them. Run migration 20261004_02_library_chapter_levels.sql FIRST:
 *   without it every chapter row carrying those keys fails (unknown column).
 *   parent_chapter_id is a foreign key to chapters.id, and this script upserts
 *   the JSONL in file order, 200 rows per request: a level-2 row whose parent
 *   row comes later in the file fails (23503) unless both land in the same
 *   request — the JSONL must list each parent before its children.
 *
 * Usage (2026-10-04 — DRY by default; the owner's guide is
 * دليل_المالك_تحميل_المكتبة_٢٠٢٦-١٠-٠٤.md):
 *   node scripts/seed-library-from-owner.mjs --help
 *   node scripts/seed-library-from-owner.mjs --rows <dir>                 # dry: reads, writes nothing
 *   node scripts/seed-library-from-owner.mjs --rows <dir> --apply --confirm-host auth.nezamy.sa   # LIVE
 *   … --table laws | --from chapters | --limit 500 | --allow-cloud
 *
 * Safety (src/lib/library/seedOwnerArgs.ts, tested):
 *   - an unknown option or a stray value stops the script before anything
 *     (2026-10-04: an unknown `--help` used to start a real production load;
 *     `npm run … --dry --rows X` without `--` hands the script only `X`);
 *   - `--rows <dir>` is required — no silent pick of "the newest package";
 *   - a write needs `--apply` AND `--confirm-host <host>` equal to the host
 *     of NEXT_PUBLIC_SUPABASE_URL;
 *   - refuses a *.supabase.co target (the old cloud project) unless
 *     --allow-cloud is passed explicitly.
 *   Run scripts/library-rows-diff.mjs on the same --rows folder first: an
 *   upsert never deletes, so renamed / moved / renumbered items would stay
 *   live next to their new copies.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
// Node ≥ 22.18 loads these .ts modules directly (type stripping). They are
// imported dynamically so the harmless "Module type … is not specified"
// notice they trigger can be kept off the owner's screen.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  if (String(warning).includes("Module type of file")) return;
  return emitWarning.call(process, warning, ...rest);
};
const { stripInternalContentKeys } = await import("../src/lib/library/internalContentFields.ts");
const { liveWriteDecision, parseSeedOwnerArgs, SEED_OWNER_USAGE } = await import("../src/lib/library/seedOwnerArgs.ts");

// Leave from the top level without a synchronous process.exit right after the
// dynamic .ts imports: on Windows that aborts Node itself (libuv
// "UV_HANDLE_CLOSING" assertion, exit 127) instead of returning the code.
// Sets the code, exits 50 ms later, and parks this module until then.
function quit(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 50);
  return new Promise(() => {});
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── CLI arguments (strict; see seedOwnerArgs.ts) ─────────────────────────────
const parsedArgs = parseSeedOwnerArgs(process.argv.slice(2));
if (!parsedArgs.ok) {
  console.error(`❌ ${parsedArgs.error}\n\n${SEED_OWNER_USAGE}`);
  await quit(2);
}
const cli = parsedArgs.options;
if (cli.help) {
  console.log(SEED_OWNER_USAGE);
  await quit(0);
}
const specificTable = cli.table ?? undefined;
const fromTable = cli.from ?? undefined;
const maxLimit = cli.limit ?? Infinity;
const allowCloud = cli.allowCloud;

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
  await quit(1);
}

// Dry unless --apply AND --confirm-host names this very host.
const decision = liveWriteDecision(cli, targetHost);
if (decision.error) {
  console.error(`❌ ${decision.error}`);
  await quit(2);
}
const isDry = !decision.live;

if (!isDry && !SERVICE_KEY) {
  console.error("❌ Error: SUPABASE_SERVICE_ROLE_KEY is missing in .env.local (required for --apply)");
  await quit(1);
}

const supabase = isDry
  ? null
  : createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "library" },
    });

// ── Rows directory: --rows only (no silent "newest package" pick) ────────────
const ROWS_DIR = path.resolve(process.cwd(), cli.rows);
if (!fs.existsSync(ROWS_DIR) || !fs.statSync(ROWS_DIR).isDirectory()) {
  console.error(`❌ --rows folder not found: ${ROWS_DIR}`);
  await quit(1);
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
    // Internal editorial/review notes never reach a public row — neither as a
    // column nor inside the `metadata` jsonb (2026-10-04: they were readable
    // through the public REST key on judicial_collections and principles).
    row = stripInternalContentKeys(row);

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
  console.log(isDry
    ? "  Mode: DRY — nothing is written. Add --apply --confirm-host <host> to load."
    : `  Mode: ⚠️  LIVE — upserting into ${targetHost} (confirmed with --confirm-host).`);
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
