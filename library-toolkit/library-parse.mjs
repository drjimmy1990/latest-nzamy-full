#!/usr/bin/env node
/**
 * library-parse.mjs — parse raw .md content into JSON for seeding.
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates the four TypeScript parsers under scripts/parsers/.
 * Each parser reads raw .md files from the library content root and writes
 * JSON to library-toolkit/output/.
 *
 * USAGE  (from project root)
 *   npm run library:parse -- --input ./content/library
 *   npm run library:parse -- --input ./content/library --type laws
 *   node library-toolkit/library-parse.mjs --input ./content/library --type decrees
 *
 * Required:
 *   --input <path>    Path to the library content root directory
 *
 * Optional:
 *   --type <type>     Parse only one type: laws | decrees | precedents | feqh
 *
 * ENV  None required — parsers handle their own env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(__dirname, "output");

// ── Parse CLI args ─────────────────────────────────────────────────────────
function getArg(name) {
  const flag = process.argv.find((a) => a.startsWith(`--${name}`));
  if (!flag) return null;
  if (flag.includes("=")) return flag.split("=").slice(1).join("=");
  const idx = process.argv.indexOf(flag);
  return process.argv[idx + 1] || null;
}

const INPUT = getArg("input");
const TYPE = getArg("type");

if (!INPUT) {
  console.error("\n✗ Missing required --input <path> (path to library content root).");
  console.error("  Example: npm run library:parse -- --input ./content/library");
  process.exit(1);
}

const VALID_TYPES = ["laws", "decrees", "precedents", "feqh"];
if (TYPE && !VALID_TYPES.includes(TYPE)) {
  console.error(`\n✗ Invalid --type "${TYPE}". Valid: ${VALID_TYPES.join(", ")}`);
  process.exit(1);
}

// ── Arabic subdir name → parser type mapping ───────────────────────────────
const ARABIC_DIRS = {
  laws: "أنظمة ولوائح",
  decrees: "أوامر وتعاميم",
  precedents: "مبادئ وسوابق قضائية",
  feqh: "فقه ومراجع",
};

// The 4 Arabic category folders may sit directly under --input OR nested under
// "نماذج هيكل الأقسام الرئيسية/" (the 2026-07-15 layout). Resolve to the
// category folder if found at either level; else fall back to inputRoot so the
// recursive parser still runs (rather than silently mixing categories).
const NESTED_TIER = "نماذج هيكل الأقسام الرئيسية";
function resolveCategoryRoot(inputRoot, type) {
  const direct = path.join(inputRoot, ARABIC_DIRS[type]);
  if (fs.existsSync(direct)) return direct;
  const nested = path.join(inputRoot, NESTED_TIER, ARABIC_DIRS[type]);
  if (fs.existsSync(nested)) return nested;
  return inputRoot;
}

function main() {
  const inputRoot = path.resolve(ROOT, INPUT);
  if (!fs.existsSync(inputRoot)) {
    console.error(`\n✗ Input directory not found: ${inputRoot}`);
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const types = TYPE ? [TYPE] : VALID_TYPES;

  console.log(`\n${"═".repeat(60)}`);
  console.log("  Library Parse");
  console.log(`${"═".repeat(60)}`);
  console.log(`  Input:  ${inputRoot}`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Types:  ${types.join(", ")}`);

  let success = 0;
  let failed = 0;

  for (const type of types) {
    console.log(`\n── ${type.toUpperCase()} ──`);

    // Resolve the category folder (direct child or nested under the
    // "نماذج هيكل الأقسام الرئيسية/" tier) so --input test/library-last works.
    const parserInput = resolveCategoryRoot(inputRoot, type);
    console.log(`  Input path: ${parserInput}`);

    const parserScript = path.join(ROOT, "scripts", "parsers", `parse-${type}.ts`);
    if (!fs.existsSync(parserScript)) {
      console.error(`  ✗ Parser not found: ${parserScript}`);
      failed++;
      continue;
    }

    const cmd = `npx tsx "${parserScript}" --input "${parserInput}" --output "${OUTPUT_DIR}"`;
    console.log(`  Running: ${cmd}`);

    try {
      execSync(cmd, { cwd: ROOT, stdio: "inherit" });
      console.log(`  ✔ ${type} parsed successfully`);
      success++;
    } catch (e) {
      console.error(`  ✗ ${type} parser failed (exit code ${e.status})`);
      failed++;
    }
  }

  // Report output files
  console.log(`\n── Output Files ──`);
  if (fs.existsSync(OUTPUT_DIR)) {
    const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith(".json"));
    if (files.length === 0) {
      console.log("  (no JSON files found)");
    } else {
      for (const file of files) {
        const stat = fs.statSync(path.join(OUTPUT_DIR, file));
        const kb = (stat.size / 1024).toFixed(1);
        console.log(`  ${file.padEnd(40)} ${kb.padStart(8)} KB`);
      }
    }
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`✔ Done: ${success} succeeded, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
