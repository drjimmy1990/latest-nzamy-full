#!/usr/bin/env node
/**
 * Safe offline replacement for the historic parse → LIVE clear/seed → verify
 * command. This test pack must never infer permission to alter a database.
 *
 * Usage:
 *   npm run library:reseed -- --input <corpus> --output <fresh-external-dir>
 *   npm run library:reseed -- --input <corpus> --output <fresh-external-dir> --type laws
 *
 * The `library:reseed:wipe` npm alias intentionally fails before any child
 * process is started. For actual staging deployment, use a separate reviewed
 * migration/seed plan with backup and explicit target verification.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertFreshExternalOutput, protectedPackageRoot } from "./safe-output-path.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const args = process.argv.slice(2);
const allowedTypes = new Set(["laws", "decrees", "precedents", "feqh"]);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(2);
}

// Inspect forbidden flags before parsing anything else. In particular,
// npm's historic alias supplies --wipe even when --input is missing.
if (args.some((arg) => ["--wipe", "--force-prod", "--apply-live", "--clean", "--allow-clean"].includes(arg))) {
  fail("إعادة البذر الحية/المسح محظوران في حزمة التيست؛ لم يُشغّل أي أمر فرعي أو قاعدة.");
}

const options = new Map();
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (!["--input", "--output", "--type"].includes(arg) || options.has(arg)) fail(`وسيط غير صالح أو مكرر: ${arg}`);
  const value = args[++i];
  if (!value || value.startsWith("--")) fail(`قيمة مفقودة لـ ${arg}`);
  options.set(arg, value);
}

if (!options.has("--input") || !options.has("--output")) {
  fail("يلزم --input <مجلد المكتبة> و--output <مجلد خرج جديد خارج المستودع>.");
}
const input = path.resolve(options.get("--input"));
const outputRaw = options.get("--output");
if (!path.isAbsolute(outputRaw)) fail("--output must be an absolute path outside the developer package.");
const output = path.resolve(outputRaw);
const type = options.get("--type");
if (type && !allowedTypes.has(type)) fail(`نوع غير صالح: ${type}`);
if (!fs.existsSync(input) || !fs.statSync(input).isDirectory()) fail(`مجلد المدخل غير موجود: ${input}`);
try { assertFreshExternalOutput(output, [protectedPackageRoot(repo), input]); }
catch (error) { fail(error.message); }

function run(label, command, commandArgs) {
  console.log(`\n── ${label} ──`);
  const result = spawnSync(command, commandArgs, { cwd: repo, stdio: "inherit", shell: false });
  if (result.error) fail(`${label}: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("Library test pipeline: parse → dry seed. No DB/API verification and no LIVE writes.");
run("parse", process.execPath, [path.join(here, "library-parse.mjs"), "--input", input, "--output", output, ...(type ? ["--type", type] : [])]);

const tsx = path.join(repo, "node_modules", "tsx", "dist", "cli.mjs");
if (!fs.existsSync(tsx)) fail("tsx المحلي غير موجود؛ شغّل npm ci من web أولاً.");
run("dry seed", process.execPath, [tsx, path.join(repo, "scripts", "seed-library.ts"), "--dir", output, "--dry-run", ...(type ? ["--type", type] : [])]);
console.log("✔ انتهى التحليل والبذر الجاف فقط. لم تُختبر قاعدة أو واجهة حية.");
