/** Run every script test fixture with the bundled 1436 source. No DB I/O. */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.dirname(here);
const packageRoot = path.dirname(webRoot);
if (fs.existsSync(path.join(packageRoot, "MANIFEST.json"))) {
  const historical = ["baseline-laws.json", "wide-laws.json", "current-laws.json", "baseline-decrees.json", "baseline-precedents.json"];
  const missing = historical.filter((name) => !fs.existsSync(path.join(packageRoot, "evidence", "historical-parse", name)));
  if (missing.length) {
    console.error(`Developer bundle is missing pinned historical parser evidence: ${missing.join(", ")}`);
    process.exit(2);
  }
}
const bundled1436 = path.join(
  webRoot, "..", "corpus", "01_المكتبة_القانونية", "مبادئ وسوابق قضائية",
  "97 - السوابق القضائية", "2- ديوان المظالم", "مجموعة_1436",
  "مبادئ-ديوان-المظالم-1436هـ-تجاري-ج1_ديوان_المظالم.md",
);
const source1436 = process.env.PRECEDENTS_1436_SOURCE || bundled1436;
if (!fs.existsSync(source1436) || !fs.statSync(source1436).isFile()) {
  console.error("PRECEDENTS_1436_SOURCE must point to the read-only 1436 commercial volume 1 Markdown (present under corpus/ in the developer ZIP).");
  process.exit(2);
}

function testsUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? testsUnder(full) : entry.isFile() && entry.name.endsWith(".test.ts") ? [full] : [];
  });
}

const files = testsUnder(here).sort();
if (files.length === 0) {
  console.error("No scripts/**/*.test.ts files found; refusing a vacuous pass.");
  process.exit(2);
}
console.log(`Running ${files.length} script test files with local tsx and the read-only 1436 fixture.`);
const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...files], {
  cwd: webRoot,
  env: { ...process.env, PRECEDENTS_1436_SOURCE: source1436 },
  stdio: "inherit",
  shell: false,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(2);
}
process.exit(result.status ?? 1);
