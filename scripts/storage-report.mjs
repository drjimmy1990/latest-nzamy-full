#!/usr/bin/env node
/**
 * storage-report.mjs — READ-ONLY. Measures what is actually using Supabase
 * Storage, per bucket, before anyone deletes anything.
 *
 * Writes nothing. Deletes nothing. Lists objects and sums their sizes.
 *
 *   node scripts/storage-report.mjs
 *   node scripts/storage-report.mjs --top 20     # also show the 20 largest objects
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const topArg = process.argv.indexOf("--top");
const TOP = topArg !== -1 ? Number(process.argv[topArg + 1] || 10) : 0;

for (const f of [".env.local", ".env", ".env.vps"]) {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, f), "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch { /* absent */ }
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(url, key, { auth: { persistSession: false } });

const human = (b) => b >= 1073741824 ? (b/1073741824).toFixed(2)+" GB"
                  : b >= 1048576   ? (b/1048576).toFixed(1)+" MB"
                  : b >= 1024      ? (b/1024).toFixed(0)+" KB" : b+" B";

// Recursively walk a bucket prefix; Storage list() is per-folder and paginated.
async function walk(bucket, prefix = "", out = []) {
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) { console.error(`  ! ${bucket}/${prefix}: ${error.message}`); return out; }
    if (!data || data.length === 0) break;
    for (const e of data) {
      const full = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) await walk(bucket, full, out);          // folder
      else out.push({ path: full, size: e.metadata?.size ?? 0, at: e.created_at });
    }
    if (data.length < 100) break;
  }
  return out;
}

const { data: buckets, error } = await sb.storage.listBuckets();
if (error) { console.error("listBuckets failed:", error.message); process.exit(1); }

console.log(`\nSupabase Storage report — ${new URL(url).host}\n`);
let grand = 0;
const all = [];
for (const b of buckets) {
  const objs = await walk(b.id);
  const total = objs.reduce((s, o) => s + o.size, 0);
  grand += total;
  all.push({ bucket: b.id, objs, total });
  console.log(`  ${b.id.padEnd(16)} ${String(objs.length).padStart(6)} objects   ${human(total).padStart(10)}   ${b.public ? "public" : "private"}`);
}
console.log(`  ${"".padEnd(16)} ${"".padStart(6)}            ${"─".repeat(10)}`);
console.log(`  ${"TOTAL".padEnd(16)} ${String(all.reduce((s,a)=>s+a.objs.length,0)).padStart(6)} objects   ${human(grand).padStart(10)}\n`);

if (TOP) {
  console.log(`Largest ${TOP} objects:`);
  for (const o of all.flatMap(a => a.objs.map(o => ({...o, bucket: a.bucket})))
                     .sort((x,y) => y.size - x.size).slice(0, TOP)) {
    console.log(`  ${human(o.size).padStart(10)}  ${o.bucket}/${o.path}`);
  }
  console.log();
}
