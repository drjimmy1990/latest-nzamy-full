#!/usr/bin/env node
/**
 * library-status.mjs — show row counts for all library tables.
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads counts from every library-schema table and displays them grouped
 * by domain. No arguments needed — read-only.
 *
 * USAGE  (from project root)
 *   npm run library:status
 *   node library-toolkit/library-status.mjs
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

// ── All library tables grouped by domain ───────────────────────────────────
const TABLE_GROUPS = {
  "Laws (أنظمة ولوائح)": ["laws", "chapters", "articles", "article_amendments"],
  "Decrees (أوامر وتعاميم)": ["decrees_circulars", "decree_pages"],
  "Precedents (مبادئ وسوابق قضائية)": ["judicial_collections", "principles", "principle_paragraphs"],
  "Feqh (فقه ومراجع)": ["feqh_books", "feqh_chapters", "feqh_sections", "feqh_blocks"],
  "User Data": ["smart_folders", "smart_folder_items", "issue_reports", "invitations"],
};

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

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("\n✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (checked env + .env.local/.env/.env.vps).");
    console.error("  Pass them explicitly: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node library-toolkit/library-status.mjs");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\n${"═".repeat(60)}`);
  console.log("  Library Status — Row Counts");
  console.log(`${"═".repeat(60)}`);

  let grandTotal = 0;

  for (const [group, tables] of Object.entries(TABLE_GROUPS)) {
    console.log(`\n── ${group} ──`);
    let groupTotal = 0;

    for (const table of tables) {
      const { count, error } = await supabase
        .schema("library")
        .from(table)
        .select("*", { count: "exact", head: true });

      if (error) {
        console.log(`  ${table.padEnd(28)} ✗ ${error.message}`);
        continue;
      }

      const n = count ?? 0;
      console.log(`  ${table.padEnd(28)} ${String(n).padStart(8)}`);
      groupTotal += n;
    }

    console.log(`  ${"".padEnd(28, "─")} ${"".padStart(8, "─")}`);
    console.log(`  ${"subtotal".padEnd(28)} ${String(groupTotal).padStart(8)}`);
    grandTotal += groupTotal;
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  GRAND TOTAL${" ".repeat(15)} ${String(grandTotal).padStart(8)}`);
  console.log(`${"═".repeat(60)}\n`);
}

loadEnv();
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
