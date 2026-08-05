#!/usr/bin/env node
/**
 * library-clear.mjs — wipe all library tables (Legal Library) before reseeding.
 * ─────────────────────────────────────────────────────────────────────────────
 * Service-role DELETE (bypasses RLS). Clears tables in FK-safe order
 * (children before parents) so foreign-key constraints are never violated.
 *
 * USAGE  (from project root)
 *   npm run library:clear                       # DRY RUN (default — reports counts, no deletes)
 *   npm run library:clear -- --live             # live DELETE (requires --force-prod on prod)
 *   npm run library:clear -- --live --force-prod  # live DELETE on production
 *   npm run library:clear -- --type laws        # clear only the laws group
 *   npm run library:clear -- --type user        # clear only user-facing tables
 *
 * Safety: dry by default. Live delete requires --live; against a production
 * Supabase URL it ALSO requires --force-prod (or ALLOW_PROD_CLEAR=1) + a yes/no
 * confirmation, so a bare `npm run library:clear` never wipes prod.
 *
 * The `user` group (bookmarks, smart folders, issue reports, invitation codes)
 * is NEVER cleared implicitly — it holds user-generated data that no reseed can
 * regenerate. It is only touched when `--type user` is passed explicitly.
 *
 * Supported --type values: laws | decrees | precedents | feqh | user
 *
 * ENV (process.env, else auto-loaded from .env.local / .env / .env.vps)
 *   SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY
 *   LIBRARY_SCHEMA  — target schema, default "library" (set to library_next to
 *                     operate on the shadow build instead of the live schema)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
// Safe by default: dry unless --live is passed.
const LIVE = process.argv.includes("--live");
const FORCE_PROD = process.argv.includes("--force-prod");
const DRY = !LIVE;
// Target schema. Defaults to the live schema; set LIBRARY_SCHEMA=library_next to
// operate on a shadow build without any risk to production data.
const SCHEMA = process.env.LIBRARY_SCHEMA || "library";

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

// Groups holding user-generated data that a reseed CANNOT regenerate. Excluded
// from a bare (no --type) run so `library:clear --live` can never destroy
// bookmarks or invitation codes as a side effect of refreshing content.
const USER_GROUPS = ["user"];

// Primary key per table, used to build the "match every row" DELETE filter.
// NOT every library table has an `id` column: library.laws is keyed by `slug`
// (see supabase/migrations/20260626_legal_library_schema.sql). Filtering on a
// non-existent column makes PostgREST return 42703, which previously left the
// laws row set intact while its children were already deleted. Mirrors the same
// mapping in scripts/seed-library.ts.
const PK_BY_TABLE = { laws: "slug" };
const pkFor = (table) => PK_BY_TABLE[table] || "id";

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

  // Determine which groups to clear. A bare run covers content groups ONLY —
  // user-generated data requires naming it explicitly via --type user.
  let groups;
  if (TYPE) {
    groups = { [TYPE]: TABLE_GROUPS[TYPE] };
  } else {
    groups = Object.fromEntries(
      Object.entries(TABLE_GROUPS).filter(([g]) => !USER_GROUPS.includes(g))
    );
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Library Clear ${DRY ? "(DRY RUN)" : "(LIVE)"}  ·  schema "${SCHEMA}"`);
  console.log(`${"═".repeat(60)}`);
  if (!TYPE) {
    console.log(`  Groups: ${Object.keys(groups).join(", ")}`);
    console.log(`  (user data preserved — pass --type user to clear it)`);
  }

  // ── Prod guard: live delete against a production URL requires --force-prod
  // (or ALLOW_PROD_CLEAR=1) + a typed yes confirmation.───────────────────────
  if (LIVE) {
    const looksLikeProd = !/localhost|127\.0\.0\.1|staging/i.test(url);
    if (looksLikeProd && !FORCE_PROD && process.env.ALLOW_PROD_CLEAR !== "1") {
      console.error("\n✗ Refusing to LIVE-delete a production database without --force-prod.");
      console.error("  Re-run with: npm run library:clear -- --live --force-prod");
      process.exit(1);
    }
    if (!process.stdout.isTTY) {
      console.error("\n✗ LIVE delete requires an interactive TTY for confirmation (pipe blocked).");
      process.exit(1);
    }
    process.stdout.write("\n⚠  This will DELETE all library rows. Type 'yes' to confirm: ");
    // .mjs is plain JS — no TypeScript generics (new Promise<string>(...) would be
    // parsed as a comparison and the executor would never be passed).
    const answer = await new Promise((resolve) => {
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (d) => { process.stdin.pause(); resolve(String(d).trim()); });
    });
    if (answer !== "yes") {
      console.log("Aborted — no rows deleted.");
      process.exit(0);
    }
  }

  let totalDeleted = 0;
  // Any table that could not be counted, could not be deleted, or still holds
  // rows after a delete. A non-empty list must fail the process: a clear that
  // half-succeeds leaves the library in a referentially broken state, and
  // reporting success there is what turned a bad run into a site outage before.
  const failures = [];

  for (const [group, tables] of Object.entries(groups)) {
    console.log(`\n── ${group.toUpperCase()} ──`);

    for (const table of tables) {
      // Count rows
      const { count, error: countErr } = await supabase
        .schema(SCHEMA)
        .from(table)
        .select("*", { count: "exact", head: true });

      if (countErr) {
        console.error(`  ✗ count(${table}) failed: ${countErr.message}`);
        failures.push(`${table}: count failed — ${countErr.message}`);
        continue;
      }

      const n = count ?? 0;
      console.log(`  ${table}: ${n} rows`);

      if (DRY || n === 0) continue;

      // Delete all rows. PostgREST requires a filter on DELETE, so we match
      // every row with "<pk> IS NOT NULL" — using each table's REAL primary key
      // (library.laws is keyed by `slug`, not `id`).
      const pk = pkFor(table);
      const { error } = await supabase
        .schema(SCHEMA)
        .from(table)
        .delete()
        .not(pk, "is", null);

      if (error) {
        console.error(`  ✗ delete(${table}) failed: ${error.message}`);
        failures.push(`${table}: delete failed — ${error.message}`);
        continue;
      }

      // Verify emptiness rather than trusting the absence of an error. This is
      // the backstop that catches a filter which silently matched nothing.
      const { count: remaining, error: verifyErr } = await supabase
        .schema(SCHEMA)
        .from(table)
        .select("*", { count: "exact", head: true });

      if (verifyErr) {
        console.error(`  ✗ verify(${table}) failed: ${verifyErr.message}`);
        failures.push(`${table}: post-delete verify failed — ${verifyErr.message}`);
        continue;
      }
      if ((remaining ?? 0) > 0) {
        console.error(`  ✗ ${table}: ${remaining} rows REMAIN after delete`);
        failures.push(`${table}: ${remaining} rows remain after delete`);
        continue;
      }

      console.log(`  ✔ deleted ${n} rows from ${table}`);
      totalDeleted += n;
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  if (DRY) {
    console.log("--dry: no database writes. Pass --live to delete (and --force-prod on prod).");
  } else {
    console.log(`✔ Total deleted: ${totalDeleted} rows`);
  }

  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} table(s) did not clear cleanly:`);
    for (const f of failures) console.error(`    - ${f}`);
    console.error("\n  The library is now in a PARTIALLY cleared state. Do NOT seed on top of it —");
    console.error("  resolve the errors above and re-run the clear until it exits 0.");
    process.exit(1);
  }
}

loadEnv();
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
