#!/usr/bin/env node
/**
 * library-markup-scan.mjs — counts the raw markup left in the library's texts
 * (owner file 03 L9 (ب), batch l12), document by document.
 *
 * READ-ONLY. It has no write path at all: it reads files, or sends GET
 * requests, and writes only its own two output files.
 *
 * Usage:
 *   node scripts/library-markup-scan.mjs --dir <folder of .md files> [--out <dir>]
 *   node scripts/library-markup-scan.mjs --live --confirm-host <host> [--out <dir>] [--max <rows per table>]
 *
 *   --dir           every .md file under the folder (recursively), one row per file.
 *   --live          the live tables, read with GET only:
 *                     library.laws.preamble, library.articles.text,
 *                     library.decrees_circulars.preamble,
 *                     library.decree_pages.content, library.principles.text.
 *                   The URL and key come from the environment ONLY
 *                   (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
 *                   no .env file is read. --confirm-host must equal the
 *                   URL's host, so the target is always named by hand.
 *   --out           output folder (default: ./output/markup-scan).
 *   --max           stop each table after this many rows (default: all).
 *
 * Output: <out>/markup-scan.tsv (one row per document: source, id, the
 * counts, score) and <out>/markup-scan-worst50.tsv, plus a summary on the
 * console. Ids only — never any text.
 *
 * Counted per document (src/lib/library/markupScan.ts): `<details`,
 * `<summary`, `###`, `**` pairs, `| --- |` rows, lines starting with `>`,
 * a lone numeric first line, a repeated heading, the same article number
 * with two different texts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  if (String(warning).includes("Module type of file")) return;
  return emitWarning.call(process, warning, ...rest);
};
const { scanMarkup, scanTsv, worstRows, scanSummary } = await import("../src/lib/library/markupScan.ts");

const USAGE = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(2, 34).map((l) => l.replace(/^ \*\s?/, "")).join("\n");

function fail(message, code = 2) {
  console.error(`❌ ${message}`);
  process.exit(code);
}

// ── strict arguments ─────────────────────────────────────────────────────────
const VALUE_OPTS = new Set(["dir", "out", "confirm-host", "max"]);
const FLAG_OPTS = new Set(["live", "help"]);
const args = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") { args.help = true; continue; }
    if (!a.startsWith("--")) fail(`unexpected value: ${a}\n\n${USAGE}`);
    const k = a.slice(2);
    if (FLAG_OPTS.has(k)) { args[k] = true; continue; }
    if (!VALUE_OPTS.has(k)) fail(`unknown option --${k}\n\n${USAGE}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) fail(`--${k} needs a value`);
    args[k] = v;
  }
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
if (!!args.dir === !!args.live) fail(`give exactly one of --dir or --live\n\n${USAGE}`);
const max = args.max === undefined ? Infinity : Number(args.max);
if (!(max > 0)) fail("--max must be a positive number");
const outDir = path.resolve(args.out ?? path.join("output", "markup-scan"));

// ── folder mode ──────────────────────────────────────────────────────────────
function* mdFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* mdFiles(full);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) yield full;
  }
}

function scanDir(dir) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`not a folder: ${root}`);
  const rows = [];
  for (const file of mdFiles(root)) {
    rows.push({ source: "file", id: path.relative(root, file).split(path.sep).join("/"), counts: scanMarkup(fs.readFileSync(file, "utf8")) });
  }
  return rows;
}

// ── live mode (GET only) ─────────────────────────────────────────────────────
const LIVE_TABLES = [
  { table: "laws", id: "slug", column: "preamble" },
  { table: "articles", id: "id", column: "text" },
  { table: "decrees_circulars", id: "id", column: "preamble" },
  { table: "decree_pages", id: "id", column: "content" },
  { table: "principles", id: "id", column: "text" },
];
const PAGE = 500;

async function getPage(base, key, t, from) {
  const url = `${base}/rest/v1/${t.table}?select=${t.id},${t.column}&order=${t.id}.asc`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Accept-Profile": "library",
      Range: `${from}-${from + PAGE - 1}`,
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok && res.status !== 206) throw new Error(`${t.table}: HTTP ${res.status}`);
  return res.json();
}

async function scanLive() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!rawUrl || !key) fail("set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment (no .env file is read)");
  let host;
  try { host = new URL(rawUrl).host; } catch { fail("NEXT_PUBLIC_SUPABASE_URL is not a URL"); }
  if (!args["confirm-host"]) fail(`--live needs --confirm-host ${host}`);
  if (args["confirm-host"] !== host) fail(`--confirm-host ${args["confirm-host"]} does not match the URL's host`);
  const base = rawUrl.replace(/\/+$/, "");
  const rows = [];
  for (const t of LIVE_TABLES) {
    let read = 0;
    for (let from = 0; read < max; from += PAGE) {
      const page = await getPage(base, key, t, from);
      if (!Array.isArray(page) || page.length === 0) break;
      for (const r of page) {
        if (read >= max) break;
        read++;
        rows.push({ source: `${t.table}.${t.column}`, id: String(r[t.id] ?? ""), counts: scanMarkup(r[t.column]) });
      }
      if (page.length < PAGE) break;
    }
    console.log(`${t.table}.${t.column}: ${read} rows`);
  }
  return rows;
}

const rows = args.live ? await scanLive() : scanDir(args.dir);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "markup-scan.tsv"), scanTsv(rows), "utf8");
fs.writeFileSync(path.join(outDir, "markup-scan-worst50.tsv"), scanTsv(worstRows(rows, 50)), "utf8");
console.log(scanSummary(rows));
console.log(`written: ${path.join(outDir, "markup-scan.tsv")} and markup-scan-worst50.tsv`);
