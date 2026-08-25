#!/usr/bin/env node
/**
 * blog-backup.mjs — dump / restore the `articles` table as JSON.
 * ─────────────────────────────────────────────────────────────────────────────
 * Safety net for `blog:clear`. Run the dump BEFORE any destructive reseed; the
 * restore re-upserts the exact rows (conflict on slug) if you need to roll back.
 *
 * USAGE  (from project root)
 *   node blog-toolkit/blog-backup.mjs                       # dump → blog-toolkit/_articles-backup-<stamp>.json
 *   node blog-toolkit/blog-backup.mjs --out path/to.json    # dump to a specific path
 *   node blog-toolkit/blog-backup.mjs --restore file.json   # re-upsert every row from a dump
 *   node blog-toolkit/blog-backup.mjs --restore file.json --dry
 *
 * ENV (process.env, else auto-loaded from .env.local / .env / .env.vps)
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY            # service-role — bypasses RLS
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");
const PAGE = 200;
const BATCH = 100;

function argValue(name) {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) return process.argv[i + 1];
  return null;
}

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

async function client() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\n✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked env + .env.local/.env/.env.vps).");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  return { url, supabase: createClient(url, key, { auth: { persistSession: false } }) };
}

async function dump() {
  const { url, supabase } = await client();
  console.log(`\nSource: ${url}`);
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("articles")
      .select("*")
      .order("slug", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) { console.error("✗ read failed:", error.message); process.exit(1); }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const stamp = rows.length ? new Date().toISOString().slice(0, 10).replace(/-/g, "") : "empty";
  const out = argValue("out") || path.join(__dirname, `_articles-backup-${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify({ source: url, rows: rows.length, articles: rows }, null, 2), "utf8");
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`✔ dumped ${rows.length} rows → ${path.relative(ROOT, out)} (${kb} KB)`);
}

async function restore(file) {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(abs)) { console.error(`✗ backup not found: ${abs}`); process.exit(1); }
  const parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  const articles = Array.isArray(parsed.articles) ? parsed.articles : [];
  console.log(`\nBackup: ${path.relative(ROOT, abs)} — ${articles.length} rows (taken from ${parsed.source ?? "unknown"})`);
  if (!articles.length) { console.log("Nothing to restore."); return; }
  if (DRY) { console.log("--dry: no database writes. Remove --dry to upsert."); return; }

  const { url, supabase } = await client();
  console.log(`Target: ${url}`);
  let done = 0;
  let failed = 0;
  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH);
    const { error } = await supabase.from("articles").upsert(batch, { onConflict: "slug" });
    if (error) { failed += batch.length; console.error(`  ✗ batch ${Math.floor(i / BATCH) + 1} failed: ${error.message}`); }
    else { done += batch.length; console.log(`  ✓ restored ${done}/${articles.length}`); }
  }
  console.log(`\nDone. Restored ${done}, failed ${failed}.`);
  if (failed) process.exit(1);
}

loadEnv();
const restoreFile = argValue("restore");
(restoreFile ? restore(restoreFile) : dump()).catch((e) => {
  console.error(e);
  process.exit(1);
});
