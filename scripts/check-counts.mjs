#!/usr/bin/env node
/**
 * scripts/check-counts.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only sanity check for the self-hosted Nzamy database/storage:
 *   1. Each library.* table's live row count vs the owner package's JSONL
 *      line count (same rows-dir resolution as scripts/seed-library-from-owner.mjs).
 *   2. Blog: public.articles count vs blog-covers storage objects under images/.
 *   3. Reference/seed tables vs their expected minimum row counts.
 *
 * Read-only: no writes, no secrets printed. Refuses a target host ending in
 * supabase.co unless --allow-cloud.
 *
 * Usage:
 *   node scripts/check-counts.mjs
 *   node scripts/check-counts.mjs --rows /path/to/evidence/full/rows
 *   NZAMY_LIBRARY_ROWS_DIR=/path/to/rows node scripts/check-counts.mjs
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
const rowsArg = getArg("--rows");
const allowCloud = argv.includes("--allow-cloud");

// ── Auto-load .env.local (from the repo root, not cwd) ──────────────────────
const envPath = path.join(ROOT, ".env.local");
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = value;
  }
}
// process.env still wins if the shell already set these (matches the seeder's convention)
for (const [k, v] of Object.entries(env)) {
  if (!process.env[k]) process.env[k] = v;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://auth.nezamy.sa";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertNotCloud(targetUrl, allow) {
  let hostname;
  try {
    hostname = new URL(targetUrl).hostname;
  } catch {
    throw new Error(`Invalid Supabase URL: "${targetUrl}"`);
  }
  if (!allow && (hostname === "supabase.co" || hostname.endsWith(".supabase.co"))) {
    throw new Error(
      `Refusing to read cloud host "${hostname}". This project moved to self-hosted. ` +
        `Pass --allow-cloud to override (only if you really mean it).`
    );
  }
  return hostname;
}

let targetHost;
try {
  targetHost = assertNotCloud(url, allowCloud);
} catch (e) {
  console.error(`❌ ${e.message}`);
  process.exit(1);
}

if (!key) {
  console.error("❌ Error: SUPABASE_SERVICE_ROLE_KEY is missing in .env.local");
  process.exit(1);
}

const supabaseLibrary = createClient(url, key, { db: { schema: "library" } });
const supabasePublic = createClient(url, key, { db: { schema: "public" } });

// ── Rows directory resolution (mirrors scripts/seed-library-from-owner.mjs) ──
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
      rowsPath,
      dateKey: dateMatch ? dateMatch[1] : "0000-00-00",
      mtime: fs.statSync(rowsPath).mtimeMs,
    });
  }

  if (candidates.length === 0) {
    throw new Error(`No owner package found under ${ROOT} (nzamy-developer-test-*/evidence/full/rows).`);
  }

  candidates.sort((a, b) => (a.dateKey !== b.dateKey ? (a.dateKey < b.dateKey ? 1 : -1) : b.mtime - a.mtime));
  return candidates[0].rowsPath;
}

let rowsDir = null;
let rowsDirError = null;
try {
  rowsDir = resolveRowsDir(rowsArg);
} catch (e) {
  rowsDirError = e.message;
}

async function countNonBlankLines(filePath) {
  const rl = readline.createInterface({ input: fs.createReadStream(filePath), crlfDelay: Infinity });
  let n = 0;
  for await (const line of rl) {
    if (line.trim()) n++;
  }
  return n;
}

async function listAllCoverObjects() {
  const objects = [];
  const pageSize = 1000;
  let offset = 0;
  // Paginate beyond the 1000-object list() ceiling.
  while (true) {
    const { data, error } = await supabasePublic.storage.from("blog-covers").list("images", {
      limit: pageSize,
      offset,
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const obj of data) {
      if (obj.id === null) continue; // pseudo-directory entry
      if (obj.name === ".emptyFolderPlaceholder") continue;
      objects.push(obj);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return objects;
}

const LIBRARY_TABLES = [
  "laws",
  "chapters",
  "articles",
  "article_amendments",
  "article_regulations",
  "decrees_circulars",
  "decree_pages",
  "judicial_collections",
  "principles",
  "principle_paragraphs",
  "feqh_books",
  "feqh_chapters",
  "feqh_sections",
  "feqh_blocks",
];

const REFERENCE_TABLES = {
  subscription_plans: 18,
  credit_packages: 5,
  platform_settings: 6,
  blog_sections: 31,
  jurisdictions: 9,
  deadline_rules: 5,
  court_holidays: 4,
  admin_pricing_catalog: 27,
};

async function main() {
  let hasFailure = false;

  console.log("═".repeat(70));
  console.log("  🏛️  NZAMY LIVE DATABASE & STORAGE STATUS");
  console.log(`  Target: ${url} (${targetHost})`);
  console.log(`  Rows dir: ${rowsDir ?? `NOT FOUND (${rowsDirError})`}`);
  console.log("═".repeat(70));

  console.log("\n📚 [1] LEGAL LIBRARY (library schema) — live count vs owner package JSONL:");
  for (const t of LIBRARY_TABLES) {
    const { count, error } = await supabaseLibrary.from(t).select("*", { count: "exact", head: true });
    const liveCount = error ? null : count;

    let sourceCount = null;
    let note = "";
    if (!rowsDir) {
      note = `SKIP (rows dir not found)`;
    } else {
      const filePath = path.join(rowsDir, `${t}.jsonl`);
      if (!fs.existsSync(filePath)) {
        note = "SKIP (source file not found)";
      } else {
        sourceCount = await countNonBlankLines(filePath);
      }
    }

    let status;
    if (error) {
      status = `ERROR: ${error.message}`;
      hasFailure = true;
    } else if (sourceCount === null) {
      status = note;
    } else if (liveCount === sourceCount) {
      status = "OK";
    } else {
      status = `MISMATCH (live=${liveCount} source=${sourceCount})`;
      hasFailure = true;
    }

    console.log(`  ${t.padEnd(25)}: live=${String(liveCount ?? "?").padStart(7)}  ${status}`);
  }

  console.log("\n📰 [2] BLOG (public schema):");
  const { count: articlesCount, error: articlesErr } = await supabasePublic
    .from("articles")
    .select("*", { count: "exact", head: true });
  if (articlesErr) {
    console.log(`  ${"blog_articles".padEnd(25)}: ERROR: ${articlesErr.message}`);
    hasFailure = true;
  } else {
    console.log(`  ${"blog_articles".padEnd(25)}: ${articlesCount?.toLocaleString()}`);
  }

  let coverCount = null;
  try {
    const covers = await listAllCoverObjects();
    coverCount = covers.length;
    console.log(`  ${"blog_covers (storage)".padEnd(25)}: ${coverCount.toLocaleString()}`);
  } catch (e) {
    console.log(`  ${"blog_covers (storage)".padEnd(25)}: ERROR: ${e.message}`);
    hasFailure = true;
  }

  if (!articlesErr && coverCount !== null) {
    if (coverCount === articlesCount) {
      console.log(`  ${"covers vs articles".padEnd(25)}: OK (${coverCount} = ${articlesCount})`);
    } else {
      console.log(`  ${"covers vs articles".padEnd(25)}: MISMATCH (covers=${coverCount} articles=${articlesCount})`);
      hasFailure = true;
    }
  }

  console.log("\n📋 [3] REFERENCE TABLES (public schema) — live count vs expected minimum:");
  for (const [t, min] of Object.entries(REFERENCE_TABLES)) {
    const { count, error } = await supabasePublic.from(t).select("*", { count: "exact", head: true });
    let status;
    if (error) {
      status = `ERROR: ${error.message}`;
      hasFailure = true;
    } else if (count >= min) {
      status = "OK";
    } else {
      status = `BELOW_MIN (count=${count} min=${min})`;
      hasFailure = true;
    }
    console.log(`  ${t.padEnd(25)}: min=${String(min).padStart(3)}  ${status}`);
  }

  console.log("\n" + "═".repeat(70));
  console.log(hasFailure ? "  ⚠️  ONE OR MORE CHECKS FAILED — see MISMATCH/ERROR/BELOW_MIN above." : "  ✅ ALL CHECKS OK");
  console.log("═".repeat(70));

  process.exit(hasFailure ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal check-counts error:", err.message);
  process.exit(1);
});
