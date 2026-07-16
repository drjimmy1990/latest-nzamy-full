#!/usr/bin/env node
/**
 * blog-clear.mjs — wipe the `articles` table (Blog CMS) before reseeding.
 * ─────────────────────────────────────────────────────────────────────────────
 * Service-role DELETE (bypasses the articles_admin_write RLS policy). Use this
 * to clear the blog (the 6 hand-seeded rows + any prior bulk seed) before
 * running `npm run blog:seed`.
 *
 * USAGE  (from project root)
 *   npm run blog:clear -- --dry            # report row count to delete, no writes
 *   npm run blog:clear                     # live DELETE from articles
 *   npm run blog:clear -- --keep a,b,c     # delete all except these slugs
 *   node blog-toolkit/blog-clear.mjs --dry # direct
 *
 * ENV (process.env, else auto-loaded from .env.local / .env / .env.vps)
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");

// optional --keep slug1,slug2
const keepArg = process.argv.find((a) => a.startsWith("--keep="));
const KEEP = keepArg ? keepArg.slice("--keep=".length).split(",").map((s) => s.trim()).filter(Boolean) : [];

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

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\n✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked env + .env.local/.env/.env.vps).");
    console.error("  Pass them explicitly: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/blog-clear.mjs");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Count first (also respects --keep so the dry number matches the live delete).
  let countQ = supabase.from("articles").select("*", { count: "exact", head: true });
  if (KEEP.length) countQ = countQ.not("slug", "in", `(${KEEP.map((s) => `"${s}"`).join(",")})`);
  const { count, error: countErr } = await countQ;
  if (countErr) {
    console.error("✗ count failed:", countErr.message);
    process.exit(1);
  }
  const n = count ?? 0;
  console.log(`\narticles rows to delete: ${n}${KEEP.length ? ` (keeping ${KEEP.length} slug${KEEP.length > 1 ? "s" : ""}: ${KEEP.join(", ")})` : ""}`);

  if (DRY) {
    console.log("--dry: no database writes. Remove --dry to delete.");
    return;
  }
  if (n === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // Supabase-js refuses a DELETE with no WHERE clause (safety guard). Add a
  // filter: `id IS NOT NULL` matches every row (id is the NOT-NULL primary key).
  let del = supabase.from("articles").delete();
  if (KEEP.length) del = del.not("slug", "in", `(${KEEP.map((s) => `"${s}"`).join(",")})`);
  else del = del.not("id", "is", null);
  const { error } = await del;
  if (error) {
    console.error("✗ delete failed:", error.message);
    process.exit(1);
  }
  console.log(`✔ deleted ${n} rows from articles.`);
}

loadEnv();
main().catch((e) => {
  console.error(e);
  process.exit(1);
});