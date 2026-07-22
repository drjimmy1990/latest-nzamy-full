#!/usr/bin/env node
/**
 * library-reseed.mjs — one-command library refresh: (clear) → parse → seed → verify.
 * ─────────────────────────────────────────────────────────────────────────────
 * Replaces the previously mis-wired `library:reseed` npm script, whose chained
 * `library-parse.mjs` received NO --input (npm appends passthrough args only to
 * the LAST command in an && chain, i.e. verify) and therefore aborted immediately
 * with "Missing required --input". This orchestrator forwards --input to parse.
 *
 * USAGE  (from project root)
 *   npm run library:reseed -- --input ./content/library
 *   npm run library:reseed -- --input ./content/library --type laws
 *   npm run library:reseed:wipe -- --input ./content/library                (adds a LIVE clear first)
 *   npm run library:reseed:wipe -- --input ./content/library --force-prod    (allow wipe on a prod URL)
 *
 * Required:
 *   --input <path>   Path to the library content root.
 * Optional:
 *   --type <laws|decrees|precedents|feqh>   Limit the whole run to one type.
 *   --wipe            Run `library:clear --live` BEFORE parsing (DESTRUCTIVE).
 *   --force-prod      Forwarded to clear when --wipe targets a non-local URL.
 *
 * NOTE: without --wipe this is safe/idempotent — laws/precedents/feqh UPSERT by
 * deterministic id, and decrees now use a deterministic UUID (seed-library.ts),
 * so re-running does not duplicate rows.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getArg(name) {
  const flag = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!flag) return null;
  if (flag.includes("=")) return flag.split("=").slice(1).join("=");
  const next = process.argv[process.argv.indexOf(flag) + 1];
  return next && !next.startsWith("--") ? next : true;
}

const INPUT = getArg("input");
const TYPE = getArg("type");
const WIPE = process.argv.includes("--wipe");
const FORCE_PROD = process.argv.includes("--force-prod");

if (!INPUT || INPUT === true) {
  console.error("\n✗ Missing required --input <path> (library content root).");
  console.error("  Example: npm run library:reseed -- --input ./content/library");
  process.exit(1);
}

const typeArg = TYPE && TYPE !== true ? ` --type ${TYPE}` : "";
const script = (name) => `node "${path.join(__dirname, name)}"`;

const steps = [];
if (WIPE) {
  steps.push({
    name: "clear (LIVE)",
    cmd: `${script("library-clear.mjs")} --live${FORCE_PROD ? " --force-prod" : ""}${typeArg}`,
  });
}
steps.push({ name: "parse", cmd: `${script("library-parse.mjs")} --input "${INPUT}"${typeArg}` });
steps.push({ name: "seed", cmd: `${script("library-seed.mjs")}${typeArg}` });
steps.push({ name: "verify", cmd: script("library-verify.mjs") });

console.log(`\n${"═".repeat(60)}`);
console.log(`  Library Reseed  ${WIPE ? "(with LIVE wipe — DESTRUCTIVE)" : "(idempotent — no wipe)"}`);
console.log(`${"═".repeat(60)}`);
console.log(`  Input: ${INPUT}${typeArg ? `   Type:${typeArg}` : ""}`);
console.log(`  Steps: ${steps.map((s) => s.name).join(" → ")}`);

for (const step of steps) {
  console.log(`\n── ${step.name.toUpperCase()} ──`);
  console.log(`  ${step.cmd}`);
  try {
    execSync(step.cmd, { stdio: "inherit" });
  } catch (e) {
    console.error(`\n✗ Reseed aborted at "${step.name}" (exit ${e.status ?? 1}).`);
    process.exit(e.status ?? 1);
  }
}

console.log(`\n✔ Reseed complete: ${steps.map((s) => s.name).join(" → ")}`);
