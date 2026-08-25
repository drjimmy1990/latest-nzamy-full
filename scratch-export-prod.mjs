// ق-03 step 1 — FULL read-only export of production library.* tables to local
// JSON backups (the ONLY rollback path: no matching seed inputs exist in git).
// Paginated 1000 rows/request, ordered by PK for stability; writes one JSON
// per table + a manifest with row counts and SHA256 of every file.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import crypto from "crypto";

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

const OUT_DIR = "D:/Data/Data/antigravity ai/GIT NZAMY/prod_backups/2026-08-24_pre_q03";
fs.mkdirSync(OUT_DIR, { recursive: true });

// table -> order column (stable pagination key)
const TABLES = [
  ["laws", "slug"],
  ["chapters", "id"],
  ["articles", "id"],
  ["article_amendments", "id"],
  // article_regulations table does not exist yet in prod — skipped by probe below
  ["decrees_circulars", "id"],
  ["decree_pages", "id"],
  ["judicial_collections", "id"],
  ["principles", "id"],
  ["principle_paragraphs", "id"],
  ["feqh_books", "id"],
  ["feqh_chapters", "id"],
  ["feqh_sections", "id"],
  ["feqh_blocks", "id"],
];

const PAGE = 1000;
const manifest = { exported_at_note: "pre-q03 full export", tables: {} };

for (const [table, orderCol] of TABLES) {
  const { count, error: cntErr } = await lib.from(table).select("*", { count: "exact", head: true });
  if (cntErr) {
    console.log(`✗ ${table}: count failed: ${cntErr.message} — SKIPPING (must investigate before wipe!)`);
    manifest.tables[table] = { error: cntErr.message };
    continue;
  }
  const rows = [];
  for (let from = 0; from < count; from += PAGE) {
    const { data, error } = await lib
      .from(table)
      .select("*")
      .order(orderCol, { ascending: true })
      .range(from, Math.min(from + PAGE - 1, count - 1));
    if (error) throw new Error(`${table} page ${from}: ${error.message}`);
    rows.push(...data);
    if (rows.length % 20000 < PAGE) console.log(`  … ${table}: ${rows.length}/${count}`);
  }
  if (rows.length !== count) {
    throw new Error(`${table}: exported ${rows.length} != counted ${count} — ABORT (unstable pagination?)`);
  }
  const file = path.join(OUT_DIR, `${table}.json`);
  const body = JSON.stringify(rows);
  fs.writeFileSync(file, body, "utf-8");
  const sha = crypto.createHash("sha256").update(body).digest("hex");
  manifest.tables[table] = { rows: rows.length, bytes: body.length, sha256: sha };
  console.log(`✓ ${table}: ${rows.length} rows, ${(body.length / 1048576).toFixed(1)} MB, sha256=${sha.slice(0, 16)}…`);
}

fs.writeFileSync(path.join(OUT_DIR, "MANIFEST.json"), JSON.stringify(manifest, null, 2), "utf-8");
console.log(`\nDONE → ${OUT_DIR}`);
const bad = Object.entries(manifest.tables).filter(([, v]) => v.error);
if (bad.length) {
  console.log(`⚠️ tables with errors (investigate before any wipe): ${bad.map(([k]) => k).join(", ")}`);
  process.exitCode = 2;
}
