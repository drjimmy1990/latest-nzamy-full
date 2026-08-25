// ق-03 rollback tool — restore ONE domain from the pre-q03 backup export.
// Usage:
//   node scratch-restore-domain.mjs <laws|decrees|precedents|feqh> [--execute]
// Default is DRY RUN: loads backup files, validates row counts vs MANIFEST,
// prints the exact wipe+insert plan. --execute performs it (clean then batched
// inserts, same split-retry pattern as seed-library.ts).
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const DOMAIN_TABLES = {
  // wipe order: children first (FK-safe). insert order = reverse.
  laws: ["article_amendments", "article_regulations", "articles", "chapters", "laws"],
  decrees: ["decree_pages", "decrees_circulars"],
  precedents: ["principle_paragraphs", "principles", "judicial_collections"],
  feqh: ["feqh_blocks", "feqh_sections", "feqh_chapters", "feqh_books"],
};

const domain = process.argv[2];
const execute = process.argv.includes("--execute");
if (!DOMAIN_TABLES[domain]) {
  console.error("Usage: node scratch-restore-domain.mjs <laws|decrees|precedents|feqh> [--execute]");
  process.exit(1);
}

const BACKUP_DIR = "D:/Data/Data/antigravity ai/GIT NZAMY/prod_backups/2026-08-24_pre_q03";
const manifest = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, "MANIFEST.json"), "utf-8"));

const envRaw = fs.readFileSync(new URL("./.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const lib = supa.schema("library");

const wipeOrder = DOMAIN_TABLES[domain];
const insertOrder = [...wipeOrder].reverse();

// 1. Load + validate every backup file BEFORE touching anything.
const loaded = {};
for (const t of insertOrder) {
  const file = path.join(BACKUP_DIR, `${t}.json`);
  if (!fs.existsSync(file)) {
    if (t === "article_regulations") {
      console.log(`ℹ ${t}: no backup (table did not exist pre-q03) — will only be wiped, nothing restored.`);
      loaded[t] = [];
      continue;
    }
    throw new Error(`${t}: backup file missing — cannot restore this domain.`);
  }
  const body = fs.readFileSync(file, "utf-8");
  const sha = crypto.createHash("sha256").update(body).digest("hex");
  const rows = JSON.parse(body);
  const man = manifest.tables[t];
  if (!man || man.rows !== rows.length || man.sha256 !== sha) {
    throw new Error(`${t}: backup integrity mismatch (manifest ${man?.rows}/${man?.sha256?.slice(0, 12)} vs file ${rows.length}/${sha.slice(0, 12)})`);
  }
  loaded[t] = rows;
  console.log(`✓ validated ${t}: ${rows.length} rows (sha256 matches manifest)`);
}

console.log(`\nPlan: wipe [${wipeOrder.join(" → ")}] then insert [${insertOrder.map((t) => `${t}(${loaded[t].length})`).join(" → ")}]`);
if (!execute) {
  console.log("DRY RUN ONLY — pass --execute to perform the restore.");
  process.exit(0);
}

// 2. Wipe (children first). PostgREST needs a filter; "<pk> not null" matches all.
const PK = { laws: "slug" };
for (const t of wipeOrder) {
  const pk = PK[t] || "id";
  const { error } = await lib.from(t).delete().not(pk, "is", null);
  if (error && !/does not exist|schema cache/.test(error.message)) {
    throw new Error(`wipe ${t}: ${error.message}`);
  }
  console.log(`🧹 wiped ${t}${error ? " (table absent — ok)" : ""}`);
}

// 3. Insert (parents first) with split-retry to single row.
async function insertSlice(t, slice) {
  if (slice.length === 0) return 0;
  const { error } = await lib.from(t).upsert(slice, { onConflict: t === "laws" ? "slug" : "id" });
  if (!error) return 0;
  if (slice.length > 1) {
    const mid = Math.floor(slice.length / 2);
    return (await insertSlice(t, slice.slice(0, mid))) + (await insertSlice(t, slice.slice(mid)));
  }
  console.error(`  ✗ ${t} row failed: ${error.message}`);
  return 1;
}

for (const t of insertOrder) {
  const rows = loaded[t];
  let failed = 0;
  for (let i = 0; i < rows.length; i += 100) {
    failed += await insertSlice(t, rows.slice(i, i + 100));
    if (i % 5000 === 0) process.stdout.write(`  → ${t}: ${Math.min(i + 100, rows.length)}/${rows.length}\r`);
  }
  const { count } = await lib.from(t).select("*", { count: "exact", head: true });
  console.log(`✓ restored ${t}: target ${rows.length}, in DB now ${count}, failed rows ${failed}`);
  if (count !== rows.length || failed > 0) {
    console.error(`🔴 ${t}: restore verification FAILED — investigate before proceeding.`);
    process.exitCode = 2;
  }
}
console.log("Restore finished.");
