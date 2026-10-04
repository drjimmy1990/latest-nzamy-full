#!/usr/bin/env node
/**
 * scripts/library-rows-diff.mjs — what would a library load change? (READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * Compares the KEYS of a folder of library JSONL rows (the 14 tables that
 * scripts/seed-library-from-owner.mjs loads) with what is loaded today:
 *   - default: the LIVE database (GET requests on the key column only; needs
 *     SUPABASE_SERVICE_ROLE_KEY in .env.local, the same key the loader uses);
 *   - --old <dir>: an older rows folder instead (offline, no network).
 *
 * For every table it reports rows that would be ADDED, rows UPDATED in place,
 * and rows LEFT BEHIND — loaded rows whose key is not in the new files. The
 * loader only upserts, so a left-behind row stays visible next to its new
 * copy (renamed or moved file, renumbered article, changed article status,
 * a name in another Unicode form). Those need the team before the load.
 *
 *   node scripts/library-rows-diff.mjs --rows <dir>
 *   node scripts/library-rows-diff.mjs --rows <dir> --old <older rows dir>
 *   … --table laws | --out <report.json> | --help
 *
 * Exit: 0 = clean or adds-only (safe to load) · 3 = needs the team ·
 *       2 = bad options · 1 = error. Never writes to any database.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  if (String(warning).includes("Module type of file")) return;
  return emitWarning.call(process, warning, ...rest);
};
const { LIBRARY_ROW_TABLES, diffKeys, diffVerdict, rowKey } = await import("../src/lib/library/rowsDiff.ts");

// See seed-library-from-owner.mjs: a synchronous exit right after the .ts
// imports aborts Node on Windows; exit a moment later instead.
function quit(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 50);
  return new Promise(() => {});
}

const USAGE = `
library-rows-diff — what would a library load change? (read-only)

  node scripts/library-rows-diff.mjs --rows <dir>                 compare with the LIVE database
  node scripts/library-rows-diff.mjs --rows <dir> --old <dir>     compare with an older rows folder
  --table <name>   one table only      --out <file>   where to write the JSON report
  --help           this text

Exit 0 = clean / adds-only (safe to load) · 3 = needs the team · 2 = bad options · 1 = error.
`.trim();

// ── Options (strict: unknown option or stray value = error) ─────────────────
const VALUE = new Set(["--rows", "--old", "--table", "--out"]);
const opts = {};
let help = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--help" || a === "-h") { help = true; continue; }
  if (VALUE.has(a)) {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("-") || opts[a] !== undefined) {
      console.error(`❌ ${a} needs one value.\n\n${USAGE}`);
      await quit(2);
    }
    opts[a] = v;
    i++;
    continue;
  }
  console.error(`❌ Unexpected "${a}".${a.startsWith("-") ? "" : " (npm run swallows options — call node scripts/… directly.)"}\n\n${USAGE}`);
  await quit(2);
}
if (help) { console.log(USAGE); await quit(0); }
if (!opts["--rows"]) { console.error(`❌ --rows <dir> is required.\n\n${USAGE}`); await quit(2); }

const tables = opts["--table"]
  ? LIBRARY_ROW_TABLES.filter((t) => t.name === opts["--table"])
  : LIBRARY_ROW_TABLES;
if (tables.length === 0) { console.error(`❌ Unknown table "${opts["--table"]}".`); await quit(2); }

const rowsDir = path.resolve(process.cwd(), opts["--rows"]);
const oldDir = opts["--old"] ? path.resolve(process.cwd(), opts["--old"]) : null;
for (const d of [rowsDir, oldDir].filter(Boolean)) {
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) { console.error(`❌ Folder not found: ${d}`); await quit(1); }
}

// ── Live mode: .env.local (repo root), read-only key reads ──────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let base = null;
let key = null;
if (!oldDir) {
  const envPath = path.join(ROOT, ".env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const m = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  base = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!base || !key) {
    console.error("❌ Live mode needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (or use --old <dir>).");
    await quit(1);
  }
}

async function fileKeys(dir, table, pk) {
  const file = path.join(dir, `${table}.jsonl`);
  if (!fs.existsSync(file)) return null;
  const keys = new Set();
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  let lineNo = 0;
  for await (const line of rl) {
    lineNo++;
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch { throw new Error(`${table}.jsonl line ${lineNo}: not valid JSON`); }
    const k = rowKey(row, pk);
    if (k !== null) keys.add(k);
  }
  return keys;
}

/** Every key of a live table, 1,000 at a time, by key order (keyset paging). */
async function liveKeys(table, pk) {
  const keys = new Set();
  let last = null;
  for (;;) {
    let url = `${base}/rest/v1/${table}?select=${pk}&order=${pk}.asc&limit=1000`;
    // Unquoted: PostgREST takes the whole rest of `gt.` as the value, and
    // double quotes are compared literally (they restarted the paging).
    if (last !== null) url += `&${pk}=gt.${encodeURIComponent(last)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Profile": "library" },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const page = await res.json();
    const before = keys.size;
    for (const r of page) { const k = rowKey(r, pk); if (k !== null) keys.add(k); }
    if (page.length > 0 && keys.size === before) throw new Error(`${table}: paging made no progress — stopped.`);
    if (page.length < 1000) break;
    last = String(page[page.length - 1][pk]);
  }
  return keys;
}

// ── Run ─────────────────────────────────────────────────────────────────────
console.log("═".repeat(78));
console.log("  library-rows-diff (read-only)");
console.log(`  New rows : ${rowsDir}`);
console.log(`  Compared : ${oldDir ? oldDir : `LIVE ${base}`}`);
console.log("═".repeat(78));

const diffs = [];
const missing = [];
try {
  for (const t of tables) {
    const incoming = await fileKeys(rowsDir, t.name, t.pk);
    if (incoming === null) { missing.push(t.name); console.log(`  ${t.name.padEnd(22)} (no ${t.name}.jsonl — skipped)`); continue; }
    const loaded = oldDir ? (await fileKeys(oldDir, t.name, t.pk)) ?? new Set() : await liveKeys(t.name, t.pk);
    const d = diffKeys(t.name, incoming, loaded);
    diffs.push(d);
    const flag = d.leftBehind || d.unicodeTwins || d.resurrected.length ? "  ⚠️" : "";
    console.log(
      `  ${t.name.padEnd(22)} new ${String(d.incoming).padStart(7)}  loaded ${String(d.loaded).padStart(7)}  ` +
        `+added ${String(d.added).padStart(6)}  =updated ${String(d.updated).padStart(7)}  ` +
        `left-behind ${String(d.leftBehind).padStart(6)}${d.unicodeTwins ? `  unicode-twins ${d.unicodeTwins}` : ""}${flag}`,
    );
    // Top-level documents: name what is new / left behind so it can be read.
    if (["laws", "decrees_circulars", "judicial_collections", "feqh_books"].includes(t.name)) {
      for (const k of d.resurrected) console.log(`      ↺ deleted on purpose, would come back: ${k}`);
      for (const k of d.sampleAdded.filter((x) => !d.resurrected.includes(x)).slice(0, 5)) console.log(`      + ${k}`);
      for (const k of d.sampleLeftBehind.slice(0, 5)) console.log(`      − ${k}`);
    }
  }
} catch (e) {
  console.error(`\n❌ ${e.message}`);
  await quit(1);
}

const verdict = diffVerdict(diffs);
const report = {
  generated_at: new Date().toISOString(),
  rows_dir: rowsDir,
  compared_with: oldDir ?? `live:${base}`,
  verdict,
  missing_files: missing,
  tables: diffs,
};
const outFile = opts["--out"] ? path.resolve(process.cwd(), opts["--out"]) : path.join(rowsDir, "rows-diff-report.json");
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log("═".repeat(78));
if (verdict === "needs-team") {
  console.log("  ⚠️  NEEDS THE TEAM — يحتاج الفريق قبل التحميل");
  console.log("  Some loaded rows are not in the new files (renamed / moved / renumbered / deleted,");
  console.log("  or a name in another Unicode form), or the load would bring back rows the team deleted");
  console.log("  on purpose (↺). Loading would leave old rows live beside the new ones.");
  console.log("  Do NOT load. Send this report to the team.");
} else if (verdict === "adds-only") {
  console.log("  ✅ ADDS AND UPDATES ONLY — آمن للتحميل");
} else {
  console.log("  ✅ CLEAN — nothing new, nothing left behind — لا تغيير في الهوية");
}
if (missing.length) console.log(`  Note: no file for ${missing.join(", ")} — the loader would skip those tables.`);
console.log(`  Report: ${outFile}`);
console.log("═".repeat(78));
await quit(verdict === "needs-team" ? 3 : 0);
