#!/usr/bin/env node
/**
 * library-baseline.mjs — capture a rich, comparable snapshot of the library.
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only. Records row counts PLUS the data-quality metrics the finalization
 * program must drive to zero, so "before" and "after" are measured the same way
 * rather than re-derived by hand each time.
 *
 * Re-run this at every phase gate and after cutover; diff two snapshots to fill
 * the before/after table in LIBRARY_PIPELINE_FIX_STATUS.md.
 *
 * USAGE  (from project root)
 *   npm run library:baseline                      # writes baseline-<today>.json
 *   npm run library:baseline -- --out my.json     # explicit destination
 *   npm run library:baseline -- --print           # stdout only, no file
 *
 * ENV (process.env, else auto-loaded from .env.local / .env / .env.vps)
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LIBRARY_SCHEMA  — target schema, default "library" (set to library_next
 *                     to gate the shadow build before cutover)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Env loader (no dotenv dependency) ──────────────────────────────────────
function loadEnv() {
  for (const f of [".env.local", ".env", ".env.vps"]) {
    try {
      const txt = fs.readFileSync(path.join(ROOT, f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        if (!(m[1] in process.env)) process.env[m[1]] = v;
      }
    } catch {
      /* file not present */
    }
  }
}

function getArg(name) {
  const a = process.argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return null;
  if (a.includes("=")) return a.split("=").slice(1).join("=");
  return process.argv[process.argv.indexOf(a) + 1] || null;
}

const SCHEMA = process.env.LIBRARY_SCHEMA || "library";
const PRINT_ONLY = process.argv.includes("--print");

// Every table in the library schema, grouped as the status tool groups them.
const TABLES = [
  "laws", "chapters", "articles", "article_amendments",
  "decrees_circulars", "decree_pages",
  "judicial_collections", "principles", "principle_paragraphs",
  "feqh_books", "feqh_chapters", "feqh_sections", "feqh_blocks",
  "smart_folders", "smart_folder_items", "issue_reports", "invitations",
];

// The 4 user tables must survive the cutover untouched — tracked separately so a
// diff makes an accidental wipe impossible to miss.
const USER_TABLES = ["smart_folders", "smart_folder_items", "issue_reports", "invitations"];

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\n✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked env + .env.local/.env/.env.vps).");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const lib = () => supabase.schema(SCHEMA);

  // Returns a number, or an {error} marker — never throws, so one missing table
  // (expected while library_next is still being built) cannot abort the snapshot.
  async function count(table, apply) {
    let q = lib().from(table).select("*", { count: "exact", head: true });
    if (apply) q = apply(q);
    const { count: c, error } = await q;
    return error ? { error: error.message } : (c ?? 0);
  }

  const snap = {
    capturedAt: new Date().toISOString(),
    schema: SCHEMA,
    supabaseUrl: url,
    rowCounts: {},
    userDataRowCounts: {},
    grandTotal: 0,
    metrics: {},
  };

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Library Baseline — schema "${SCHEMA}"`);
  console.log(`${"═".repeat(64)}\n`);

  for (const t of TABLES) {
    const n = await count(t);
    snap.rowCounts[t] = n;
    if (USER_TABLES.includes(t)) snap.userDataRowCounts[t] = n;
    if (typeof n === "number") snap.grandTotal += n;
    console.log(`  ${t.padEnd(28)} ${String(typeof n === "number" ? n : "ERR").padStart(9)}`);
  }
  console.log(`  ${"".padEnd(28, "─")} ${"".padStart(9, "─")}`);
  console.log(`  ${"GRAND TOTAL".padEnd(28)} ${String(snap.grandTotal).padStart(9)}\n`);

  // ── Data-quality metrics: every one of these must reach the stated target ──
  const m = snap.metrics;

  // Decree instrument types. Today the CHECK constraint allows only 3 values, so
  // every other real instrument (أمر سامي, قرار وزاري …) is coerced into one of
  // them. After the taxonomy fix these three should no longer hold everything.
  m.decreeTypes = {};
  for (const ty of ["royal", "cabinet", "circular"]) {
    m.decreeTypes[ty] = await count("decrees_circulars", (q) => q.eq("type", ty));
  }

  // Markup contamination — historical/repealed text leaking into live article text.
  m.articlesWithDetailsMarkup = await count("articles", (q) => q.like("text", "%<details%"));
  m.articlesWithHtmlComment = await count("articles", (q) => q.like("text", "%<!--%"));

  // Identity damage from Number() coercion of non-numeric article markers.
  m.articlesNumberZero = await count("articles", (q) => q.eq("number", "0"));
  m.articlesIdNaN = await count("articles", (q) => q.like("id", "%__art-NaN%"));

  // Historical text actually recovered (0 today — the whole point of the laws fix).
  m.amendmentsWithFullText = await count("article_amendments", (q) => q.not("full_text", "is", null));

  // section_code is emptied by a quote-strip-then-coerce bug; kills the category filter.
  m.lawsWithEmptySectionCode = await count("laws", (q) => q.eq("section_code", ""));

  // Precedent attribution: track never populated, court falsely hardcoded.
  m.collectionsTrackEmpty = await count("judicial_collections", (q) => q.eq("track", ""));
  m.collectionsCommercialCourt = await count("judicial_collections", (q) => q.eq("court", "المحكمة التجارية"));

  // feqh_blocks.order_index is ~all 0, so `order_index >= freeLimit` never fires
  // and every paid feqh book is effectively unlocked.
  m.feqhBlocksOrderZero = await count("feqh_blocks", (q) => q.eq("order_index", 0));

  console.log("── Data-quality metrics ──");
  for (const [k, v] of Object.entries(m)) {
    if (v && typeof v === "object" && !("error" in v)) {
      for (const [k2, v2] of Object.entries(v)) {
        console.log(`  ${`${k}.${k2}`.padEnd(38)} ${String(typeof v2 === "number" ? v2 : "ERR").padStart(9)}`);
      }
    } else {
      console.log(`  ${k.padEnd(38)} ${String(typeof v === "number" ? v : "ERR").padStart(9)}`);
    }
  }

  if (!PRINT_ONLY) {
    const stamp = snap.capturedAt.slice(0, 10);
    const dest = path.resolve(ROOT, getArg("out") || path.join("library-toolkit", `baseline-${stamp}.json`));
    fs.writeFileSync(dest, JSON.stringify(snap, null, 2) + "\n", "utf8");
    console.log(`\n✔ Wrote ${path.relative(ROOT, dest)}`);
  }
  console.log("");
}

loadEnv();
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
