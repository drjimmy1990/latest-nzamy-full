#!/usr/bin/env node
/**
 * library-clear.mjs — wipe all library tables (Legal Library) before reseeding.
 * ─────────────────────────────────────────────────────────────────────────────
 * Service-role DELETE (bypasses RLS). Clears tables in FK-safe order
 * (children before parents) so foreign-key constraints are never violated.
 *
 * USAGE  (from project root)
 *   npm run library:clear -- --dry              # report row counts, no deletes
 *   npm run library:clear                       # live DELETE all library tables
 *   npm run library:clear -- --type laws        # clear only the laws group
 *   npm run library:clear -- --type user        # clear only user-facing tables
 *   node library-toolkit/library-clear.mjs --dry
 *
 * Supported --type values: laws | decrees | precedents | feqh | user
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

// ── Parse --type flag ──────────────────────────────────────────────────────
const typeArg = process.argv.find((a) => a.startsWith("--type"));
let TYPE = null;
if (typeArg) {
  const idx = process.argv.indexOf(typeArg);
  TYPE = typeArg.includes("=")
    ? typeArg.split("=")[1]
    : process.argv[idx + 1] || null;
}
const VALID_TYPES = ["laws", "decrees", "precedents", "feqh", "user"];
if (TYPE && !VALID_TYPES.includes(TYPE)) {
  console.error(`\n✗ Invalid --type "${TYPE}". Valid: ${VALID_TYPES.join(", ")}`);
  process.exit(1);
}

// ── FK-safe deletion order (children first) per group ──────────────────────
const TABLE_GROUPS = {
  laws: ["article_amendments", "articles", "chapters", "laws"],
  decrees: ["decree_pages", "decrees_circulars"],
  precedents: ["principle_paragraphs", "principles", "judicial_collections"],
  feqh: ["feqh_blocks", "feqh_sections", "feqh_chapters", "feqh_books"],
  user: ["smart_folder_items", "smart_folders", "issue_reports", "invitations"],
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
    console.error("  Pass them explicitly: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node library-toolkit/library-clear.mjs");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Determine which groups to clear
  const groups = TYPE ? { [TYPE]: TABLE_GROUPS[TYPE] } : TABLE_GROUPS;

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Library Clear ${DRY ? "(DRY RUN)" : "(LIVE)"}`);
  console.log(`${"═".repeat(60)}`);

  let totalDeleted = 0;

  for (const [group, tables] of Object.entries(groups)) {
    console.log(`\n── ${group.toUpperCase()} ──`);

    for (const table of tables) {
      // Count rows
      const { count, error: countErr } = await supabase
        .schema("library")
        .from(table)
        .select("*", { count: "exact", head: true });

      if (countErr) {
        console.error(`  ✗ count(${table}) failed: ${countErr.message}`);
        continue;
      }

      const n = count ?? 0;
      console.log(`  ${table}: ${n} rows`);

      if (DRY || n === 0) continue;

      // Delete all rows — Supabase requires a filter for delete
      const { error } = await supabase
        .schema("library")
        .from(table)
        .delete()
        .gte("created_at", "1970-01-01");

      if (error) {
        console.error(`  ✗ delete(${table}) failed: ${error.message}`);
        continue;
      }
      console.log(`  ✔ deleted ${n} rows from ${table}`);
      totalDeleted += n;
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  if (DRY) {
    console.log("--dry: no database writes. Remove --dry to delete.");
  } else {
    console.log(`✔ Total deleted: ${totalDeleted} rows`);
  }
}

loadEnv();
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
