// ق-03 step 1 (v2) — resume export with KEYSET pagination (no deep OFFSET →
// no statement timeout) + per-request retry. Skips tables already exported OK.
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

// table -> [orderCol, pageSize]
const TABLES = [
  ["laws", "slug", 1000],
  ["chapters", "id", 1000],
  ["articles", "id", 500],
  ["article_amendments", "id", 1000],
  ["decrees_circulars", "id", 500],
  ["decree_pages", "id", 500],
  ["judicial_collections", "id", 1000],
  ["principles", "id", 300],
  ["principle_paragraphs", "id", 500],
  ["feqh_books", "id", 1000],
  ["feqh_chapters", "id", 1000],
  ["feqh_sections", "id", 1000],
  ["feqh_blocks", "id", 400],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(table, orderCol, after, size) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    let q = lib.from(table).select("*").order(orderCol, { ascending: true }).limit(size);
    if (after !== null) q = q.gt(orderCol, after);
    const { data, error } = await q;
    if (!error) return data;
    console.log(`  ! ${table} after=${String(after).slice(0, 24)} attempt ${attempt}: ${error.message}`);
    await sleep(1500 * attempt);
    // shrink page on repeated timeout
    if (attempt >= 2) size = Math.max(50, Math.floor(size / 2));
  }
  throw new Error(`${table}: page failed after 4 attempts (after=${after})`);
}

const manifestPath = path.join(OUT_DIR, "MANIFEST.json");
const manifest = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
  : { exported_at_note: "pre-q03 full export", tables: {} };

// v1 crashed before writing its manifest; rebuild entries from files it DID write.
for (const [table] of TABLES) {
  const file = path.join(OUT_DIR, `${table}.json`);
  if (!manifest.tables[table] && fs.existsSync(file)) {
    const body = fs.readFileSync(file, "utf-8");
    const rows = JSON.parse(body);
    manifest.tables[table] = {
      rows: rows.length,
      bytes: body.length,
      sha256: crypto.createHash("sha256").update(body).digest("hex"),
      note: "reconstructed from v1 file",
    };
    console.log(`↺ ${table}: manifest rebuilt from existing file (${rows.length} rows)`);
  }
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

for (const [table, orderCol, pageSize] of TABLES) {
  const file = path.join(OUT_DIR, `${table}.json`);
  const prev = manifest.tables[table];
  if (prev && prev.rows != null && fs.existsSync(file)) {
    console.log(`↷ ${table}: already exported (${prev.rows} rows) — skip`);
    continue;
  }
  const { count, error: cntErr } = await lib.from(table).select("*", { count: "exact", head: true });
  if (cntErr) throw new Error(`${table}: count failed: ${cntErr.message}`);

  const rows = [];
  let after = null;
  while (true) {
    const page = await fetchPage(table, orderCol, after, pageSize);
    if (page.length === 0) break;
    rows.push(...page);
    after = page[page.length - 1][orderCol];
    if (rows.length % 10000 < pageSize) console.log(`  … ${table}: ${rows.length}/${count}`);
    if (page.length < 50) break; // safety: smaller than min page ⇒ done
  }
  if (rows.length !== count) {
    throw new Error(`${table}: exported ${rows.length} != counted ${count} — ABORT`);
  }
  const body = JSON.stringify(rows);
  fs.writeFileSync(file, body, "utf-8");
  const sha = crypto.createHash("sha256").update(body).digest("hex");
  manifest.tables[table] = { rows: rows.length, bytes: body.length, sha256: sha };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`✓ ${table}: ${rows.length} rows, ${(body.length / 1048576).toFixed(1)} MB`);
}

console.log(`\nDONE → ${OUT_DIR}`);
