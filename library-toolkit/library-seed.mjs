#!/usr/bin/env node
/**
 * library-seed.mjs — disabled legacy shortcut in the developer test pack.
 * ─────────────────────────────────────────────────────────────────────────────
 * The old wrapper concatenated arbitrary passthrough arguments into a shell
 * command and assumed an implicit parsed-output directory. It is not a safe
 * route to database writes. Use scripts/seed-library.ts directly with the
 * explicit flags and offline preflight documented in README.md.
 */
console.error(
  "library:seed is disabled in this developer test pack. " +
  "For inspection, run the documented direct seeder with --dir <external parsed output> --dry-run. " +
  "No child process, shell command, credentials or database call was started.",
);
process.exit(2);
