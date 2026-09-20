#!/usr/bin/env node
/**
 * library-parse.mjs — parse raw .md content into JSON for seeding.
 * ─────────────────────────────────────────────────────────────────────────────
 * Orchestrates the four TypeScript parsers under scripts/parsers/.
 * Each parser reads raw .md files from the library content root and writes
 * JSON to a fresh, explicit output directory outside the repo and input.
 *
 * USAGE  (from project root)
 *   npm run library:parse -- --input ./content/library --output /safe/new-dir
 *   npm run library:parse -- --input ./content/library --output /safe/new-dir --type laws
 *
 * Required:
 *   --input <path>    Path to the library content root directory
 *   --output <path>   Fresh output directory outside the repo and input
 *
 * Optional:
 *   --type <type>     Parse only one type: laws | decrees | precedents | feqh
 *
 * ENV  None required — parsers handle their own env.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertFreshExternalOutput, protectedPackageRoot } from "./safe-output-path.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Parse CLI args ─────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const options = new Map();
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (!["--input", "--output", "--type"].includes(flag) || options.has(flag)) {
    console.error(`✗ Unknown or duplicate argument: ${flag}`);
    process.exit(2);
  }
  const value = args[++i];
  if (!value || value.startsWith("--")) {
    console.error(`✗ Missing value for ${flag}`);
    process.exit(2);
  }
  options.set(flag, value);
}
const INPUT = options.get("--input");
const OUTPUT_RAW = options.get("--output");
const OUTPUT_DIR = OUTPUT_RAW ? path.resolve(OUTPUT_RAW) : null;
const TYPE = options.get("--type");

if (!INPUT || !OUTPUT_DIR) {
  console.error("\n✗ Required: --input <library-root> --output <fresh-dir-outside-repo>.");
  process.exit(2);
}
if (!path.isAbsolute(OUTPUT_RAW)) {
  console.error("\n✗ --output must be an absolute path outside the developer package.");
  process.exit(2);
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
// "نماذج هيكل الأقسام الرئيسية/". A single-category input may itself be the
// category root; if another category is present, refuse the fallback to avoid
// silently mixing types.
const NESTED_TIER = "نماذج هيكل الأقسام الرئيسية";
function resolveCategoryRoot(inputRoot, type) {
  const direct = path.join(inputRoot, ARABIC_DIRS[type]);
  if (fs.existsSync(direct)) return direct;
  const nested = path.join(inputRoot, NESTED_TIER, ARABIC_DIRS[type]);
  if (fs.existsSync(nested)) return nested;
  const otherTypes = Object.entries(ARABIC_DIRS).filter(([t]) => t !== type)
    .filter(([, dir]) => fs.existsSync(path.join(inputRoot, dir)) || fs.existsSync(path.join(inputRoot, NESTED_TIER, dir)));
  if (otherTypes.length > 0) {
    throw new Error(`Category ${type} missing while other categories exist; refusing mixed-type fallback.`);
  }
  return inputRoot;
}

function main() {
  const inputRoot = path.resolve(ROOT, INPUT);
  if (!fs.existsSync(inputRoot) || !fs.statSync(inputRoot).isDirectory()) {
    console.error(`\n✗ Input directory not found: ${inputRoot}`);
    process.exit(1);
  }
  try { assertFreshExternalOutput(OUTPUT_DIR, [protectedPackageRoot(ROOT), inputRoot]); }
  catch (error) {
    console.error(`\n✗ ${error.message}`);
    process.exit(2);
  }

  const tsx = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  if (!fs.existsSync(tsx)) {
    console.error("\n✗ Local tsx missing; run npm ci first.");
    process.exit(2);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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
    let parserInput;
    try { parserInput = resolveCategoryRoot(inputRoot, type); }
    catch (error) { console.error(`  ✗ ${error.message}`); failed++; continue; }
    console.log(`  Input path: ${parserInput}`);

    const parserScript = path.join(ROOT, "scripts", "parsers", `parse-${type}.ts`);
    if (!fs.existsSync(parserScript)) {
      console.error(`  ✗ Parser not found: ${parserScript}`);
      failed++;
      continue;
    }

    const commandArgs = [parserScript, "--input", parserInput, "--output", OUTPUT_DIR];
    console.log(`  Running local tsx: ${parserScript}`);

    try {
      const result = spawnSync(process.execPath, [tsx, ...commandArgs], { cwd: ROOT, stdio: "inherit", shell: false });
      if (result.error || result.status !== 0) throw result.error || new Error(`exit ${result.status}`);
      console.log(`  ✔ ${type} parsed successfully`);
      success++;
    } catch (e) {
      console.error(`  ✗ ${type} parser failed (${e.message})`);
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
