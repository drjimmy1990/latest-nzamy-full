#!/usr/bin/env node
/**
 * library-verify.mjs — post-deployment verification for the Legal Library.
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin wrapper around scripts/verify-library.ts. Runs all verification
 * checks: Supabase connection, row counts, API health, search, and FTS.
 *
 * USAGE  (from project root)
 *   npm run library:verify
 *   node library-toolkit/library-verify.mjs
 *
 * ENV (loaded by verify-library.ts)
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   BASE_URL (optional, defaults to http://localhost:3000)
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const verifyScript = path.join(ROOT, "scripts", "verify-library.ts");
const cmd = `npx tsx "${verifyScript}"`;

console.log(`\n${"═".repeat(60)}`);
console.log("  Library Verify");
console.log(`${"═".repeat(60)}`);
console.log(`  Script: ${verifyScript}`);
console.log(`${"─".repeat(60)}\n`);

try {
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
} catch (e) {
  console.error(`\n✗ Verification failed (exit code ${e.status})`);
  process.exit(e.status || 1);
}
