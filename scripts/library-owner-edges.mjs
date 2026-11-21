#!/usr/bin/env node
/**
 * scripts/library-owner-edges.mjs — the owner's principle → article links into
 * library_graph.owner_edges (owner file 19 Nov 2026 §2/§3; migration
 * 20261130_40; pure half: src/lib/library/ownerEdgesImport.ts, tested).
 *
 * Reads his graph export (graph_export_* / LEGAL_GRAPH_EDGES_CLEAN.json:
 * {meta, nodes, edges}; an edge array; or JSONL), checks his four fixes
 * (from.principle, to.doc = file id, to.regulation_ref, fractions flagged),
 * refuses unknown types, keeps his edge_id, and loads cites_article plus his
 * amendment / repeal / replacement links (l12, file 02 #43; the resolver maps
 * them, 20261202_30). Other known types are counted and skipped.
 *
 * DRY by default: reads, checks, prints the counts, writes nothing anywhere
 * (and does not read .env.local).
 *
 *   node scripts/library-owner-edges.mjs --file <export.json> [--inventory <الجرد.tsv>] [--out <dir>]
 *   node scripts/library-owner-edges.mjs --file <export.json> --apply --confirm-host auth.nezamy.sa \
 *        [--inventory <الجرد.tsv>] [--deleted <edge-ids.txt>]
 *
 *   --inventory  his الجرد.tsv (path → id): checks fix 2 (to.doc is the file's own id)
 *   --deleted    his deletion list: any 16-hex edge ids in the file (one per line is fine)
 *   --out        dry run: also write rows.jsonl + rejected.tsv there
 *   --allow-cloud  allow a *.supabase.co target (the old cloud project)
 *
 * --apply (same guard as seed-library-from-owner.mjs: --confirm-host must equal
 * the host of NEXT_PUBLIC_SUPABASE_URL in .env.local) refuses a file that fails
 * the fix gate (an export from before his fixes, unknown types, an edge_id that
 * names two links). It then: loads the rows (500 per call, upsert by edge_id),
 * retires the rows of any older export, records the deletion list, and runs the
 * resolver once (graph_rag_resolve_owner_edges) — the watchdog re-runs it after
 * every graph pass. Writes only library_graph.owner_edges (+ _deleted) through
 * service_role functions; the resolver alone touches library_graph.edges.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  if (String(warning).includes("Module type of file")) return;
  return emitWarning.call(process, warning, ...rest);
};
const { readOwnerGraph, buildOwnerEdgeRows, parseInventory, formatReport } = await import("../src/lib/library/ownerEdgesImport.ts");
const { liveWriteDecision } = await import("../src/lib/library/seedOwnerArgs.ts");
const { fetchWithTimeout } = await import("../src/lib/library/fetchWithTimeout.ts");

function quit(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 50);
  return new Promise(() => {});
}

const USAGE = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(2, 33).map((l) => l.replace(/^ \*\s?/, "")).join("\n");

// ── strict arguments ─────────────────────────────────────────────────────────
const VALUE_OPTS = new Set(["file", "inventory", "deleted", "out", "confirm-host"]);
const FLAG_OPTS = new Set(["apply", "allow-cloud", "help"]);
const args = {};
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") { args.help = true; continue; }
    if (!a.startsWith("--")) { console.error(`❌ unexpected value: ${a}\n\n${USAGE}`); await quit(2); }
    const k = a.slice(2);
    if (FLAG_OPTS.has(k)) { args[k] = true; continue; }
    if (!VALUE_OPTS.has(k)) { console.error(`❌ unknown option --${k}\n\n${USAGE}`); await quit(2); }
    const v = argv[++i];
    if (v === undefined || v.startsWith("--")) { console.error(`❌ --${k} needs a value`); await quit(2); }
    args[k] = v;
  }
}
if (args.help) {
  console.log(USAGE);
  await quit(0);
}
if (!args.file) {
  console.error(`❌ --file <his graph export> is required\n\n${USAGE}`);
  await quit(2);
}
if (args["confirm-host"] && !args.apply) {
  console.error("❌ --confirm-host without --apply: nothing would be written. Add --apply, or drop --confirm-host for a dry run.");
  await quit(2);
}

// ── read and check his file (both modes) ─────────────────────────────────────
const filePath = path.resolve(process.cwd(), args.file);
if (!fs.existsSync(filePath)) {
  console.error(`❌ not found: ${filePath}`);
  await quit(2);
}
const raw = fs.readFileSync(filePath);
const sha256 = createHash("sha256").update(raw).digest("hex");
let graph;
try {
  graph = readOwnerGraph(raw.toString("utf8"));
} catch (e) {
  console.error(`❌ ${filePath}: ${e.message}`);
  await quit(2);
}
let inventory = null;
if (args.inventory) {
  try {
    inventory = parseInventory(fs.readFileSync(path.resolve(process.cwd(), args.inventory), "utf8"));
  } catch (e) {
    console.error(`❌ --inventory: ${e.message}`);
    await quit(2);
  }
}
let deletedIds = [];
if (args.deleted) {
  const text = fs.readFileSync(path.resolve(process.cwd(), args.deleted), "utf8");
  deletedIds = [...new Set((text.toLowerCase().match(/\b[0-9a-f]{16}\b/g) ?? []))];
}

const { rows, rejected, report } = buildOwnerEdgeRows(graph, inventory);
console.log(`his file: ${filePath}`);
console.log(`format ${graph.format}, ${graph.nodes.length} nodes${graph.badLines ? `, ${graph.badLines} unreadable line(s) skipped` : ""}`);
console.log(formatReport(report, sha256, rows.length));
if (deletedIds.length) console.log(`deletion list: ${deletedIds.length} edge id(s)`);
if (rejected.length) {
  console.log("\nfirst rejected rows:");
  for (const r of rejected.slice(0, 15)) console.log(`  ${r.edge_id}\t${r.type}\t${r.reason}\t${r.detail}`);
}

if (!args.apply) {
  if (args.out) {
    const outDir = path.resolve(process.cwd(), args.out);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "rows.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
    fs.writeFileSync(
      path.join(outDir, "rejected.tsv"),
      ["edge_id\ttype\treason\tdetail", ...rejected.map((r) => `${r.edge_id}\t${r.type}\t${r.reason}\t${String(r.detail).replace(/[\t\r\n]/g, " ")}`)].join("\n") + "\n",
    );
    console.log(`\nDRY RUN: wrote ${path.join(outDir, "rows.jsonl")} and rejected.tsv — nothing written to any database.`);
  } else {
    console.log("\nDRY RUN: nothing written. Add --apply --confirm-host <host> to load.");
  }
  await quit(0);
}

// ── LIVE ─────────────────────────────────────────────────────────────────────
if (report.refusals.length) {
  console.error(`\n❌ --apply refused: the file fails the fix gate (above). Nothing was written.`);
  await quit(1);
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let targetHost;
try {
  targetHost = new URL(SUPABASE_URL).hostname;
} catch {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL is missing or invalid in .env.local");
  await quit(1);
}
if (!args["allow-cloud"] && (targetHost === "supabase.co" || targetHost.endsWith(".supabase.co"))) {
  console.error(`❌ Refusing cloud host "${targetHost}" (pass --allow-cloud only if you really mean it).`);
  await quit(1);
}
const decision = liveWriteDecision({ apply: true, confirmHost: args["confirm-host"] }, targetHost);
if (!decision.live) {
  console.error(`❌ ${decision.error ?? "not confirmed"}`);
  await quit(2);
}
if (!SERVICE_KEY) {
  console.error("❌ SUPABASE_SERVICE_ROLE_KEY is missing in .env.local (required for --apply)");
  await quit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  global: { fetch: fetchWithTimeout() },
});

console.log(`\nLIVE: loading ${rows.length} owner edges into ${targetHost} …`);
let stored = 0;
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  const { data, error } = await supabase.rpc("graph_rag_owner_edges_load", { p_rows: batch, p_source_sha256: sha256 });
  if (error || Number(data) !== batch.length) {
    console.error(`❌ batch at ${i}: ${error ? error.message : `stored ${data} of ${batch.length}`}. Stopped; older rows were NOT retired. Re-run the same command.`);
    await quit(1);
  }
  stored += batch.length;
}
console.log(`stored ${stored}`);
{
  const { data, error } = await supabase.rpc("graph_rag_owner_edges_retire", { p_source_sha256: sha256 });
  if (error) {
    console.error(`❌ retire: ${error.message}`);
    await quit(1);
  }
  console.log(`rows of older exports retired: ${data}`);
}
if (deletedIds.length) {
  const { data, error } = await supabase.rpc("graph_rag_owner_edges_mark_deleted", { p_edge_ids: deletedIds });
  if (error) {
    console.error(`❌ deletion list: ${error.message}`);
    await quit(1);
  }
  console.log(`deletion list: ${data} new id(s) recorded`);
}
{
  const { data, error } = await supabase.rpc("graph_rag_resolve_owner_edges");
  if (error) {
    console.error(`❌ resolve: ${error.message} (the rows are stored; the next graph pass resolves them)`);
    await quit(1);
  }
  console.log(`resolved: ${JSON.stringify(data)}`);
}
await quit(0);
