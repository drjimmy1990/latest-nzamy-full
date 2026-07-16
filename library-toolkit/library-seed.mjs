#!/usr/bin/env node
/**
 * library-seed.mjs — seed the library database from parsed JSON.
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrapper around scripts/seed-library.ts. Calls it with the default
 * output directory (library-toolkit/output/) and passes through any CLI args.
 *
 * USAGE  (from project root)
 *   npm run library:seed                           # seed all types
 *   npm run library:seed -- --dry-run               # preview only
 *   npm run library:seed -- --type laws             # seed only laws
 *   npm run library:seed -- --clean --type feqh     # clean + seed feqh
 *   node library-toolkit/library-seed.mjs --dry-run
 *
 * Passthrough args:
 *   --dry-run       Preview inserts without writing
 *   --clean         Delete existing rows before seeding
 *   --type <type>   Seed only one type: laws | decrees | precedents | feqh
 *
 * ENV (loaded by seed-library.ts)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(__dirname, "output");

// Collect all args after the script name (skip node + script path)
const passthrough = process.argv.slice(2).join(" ");

const seederScript = path.join(ROOT, "scripts", "seed-library.ts");
const cmd = `npx tsx "${seederScript}" --dir "${OUTPUT_DIR}" ${passthrough}`.trim();

console.log(`\n${"═".repeat(60)}`);
console.log("  Library Seed");
console.log(`${"═".repeat(60)}`);
console.log(`  Seeder: ${seederScript}`);
console.log(`  Dir:    ${OUTPUT_DIR}`);
console.log(`  Cmd:    ${cmd}`);
console.log(`${"─".repeat(60)}\n`);

try {
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
} catch (e) {
  console.error(`\n✗ Seeder failed (exit code ${e.status})`);
  process.exit(e.status || 1);
}
