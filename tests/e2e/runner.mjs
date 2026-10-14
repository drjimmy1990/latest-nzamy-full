#!/usr/bin/env node
/**
 * tests/e2e/runner.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Master E2E Test Suite Runner for the Nzamy Legal Platform.
 *
 * Executes the 4-Tier Automated Test Suite:
 *   - Tier 1: Category-Partition (Feature Coverage)
 *   - Tier 2: Boundary Value Analysis (Corner & Boundary Cases)
 *   - Tier 3: Pairwise Combinations (Cross-Feature Integrations)
 *   - Tier 4: Real-World Scenarios (End-to-End Persona Journeys)
 *
 * Outputs formatted summary breakdown and exits with 0 on success, 1 on failure.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const SUITES = [
  {
    tier: "Tier 1",
    name: "Feature Coverage (Category-Partition)",
    file: "tests/e2e/tier1-feature-coverage.test.mjs",
    domains: "11 Domains (Auth, Onboarding, Lawyer, Client, AI Intake, Library, Directory, Blog, Chat, Notif, Profile)",
  },
  {
    tier: "Tier 2",
    name: "Boundary & Corner Cases (Boundary Value Analysis)",
    file: "tests/e2e/tier2-boundary-corner.test.mjs",
    domains: "Phone Normalization, Role Refusals, AI Lengths, Bearer Auth, 48h Revision Window",
  },
  {
    tier: "Tier 3",
    name: "Cross-Feature Combinations (Pairwise Integrations)",
    file: "tests/e2e/tier3-pairwise-combinations.test.mjs",
    domains: "Onboarding->Profile, AI Intake->Request, Delivery->Revision->Lockout, Lawyer Practice, Search->Reader->AI",
  },
  {
    tier: "Tier 4",
    name: "Real-World Scenarios (Persona Journeys)",
    file: "tests/e2e/tier4-real-world-scenarios.test.mjs",
    domains: "Corporate Contract Review, Litigator Hearings Diary, Consultation Booking, Wargaming Simulation, Domain Exclusivity",
  },
];

console.log("=".repeat(80));
console.log("  NZAMY PLATFORM — 4-TIER E2E TEST RUNNER");
console.log("  Target: https://nezamy.sa & https://auth.nezamy.sa");
console.log("  Timestamp: " + new Date().toISOString());
console.log("=".repeat(80) + "\n");

let grandTotalTests = 0;
let grandTotalPass = 0;
let grandTotalFail = 0;
let grandTotalSuites = 0;
const results = [];
const overallStartTime = Date.now();

for (const suite of SUITES) {
  const filePath = path.join(REPO_ROOT, suite.file);
  process.stdout.write(`▶ Running ${suite.tier}: ${suite.name} ... `);

  const startTime = Date.now();
  const run = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--import",
      "tsx",
      "--test",
      "--test-reporter=tap",
      filePath,
    ],
    {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" },
    }
  );

  const durationMs = Date.now() - startTime;
  const stdout = run.stdout || "";
  const stderr = run.stderr || "";

  // Parse TAP output lines
  let testsCount = 0;
  let passCount = 0;
  let failCount = 0;
  let subSuitesCount = 0;

  const lines = stdout.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("# tests ")) {
      testsCount = parseInt(line.replace("# tests ", "").trim(), 10) || 0;
    } else if (line.startsWith("# pass ")) {
      passCount = parseInt(line.replace("# pass ", "").trim(), 10) || 0;
    } else if (line.startsWith("# fail ")) {
      failCount = parseInt(line.replace("# fail ", "").trim(), 10) || 0;
    } else if (line.startsWith("# suites ")) {
      subSuitesCount = parseInt(line.replace("# suites ", "").trim(), 10) || 0;
    }
  }

  // Fallback parsing if summary line missing
  if (testsCount === 0) {
    const okLines = lines.filter((l) => /^\s*ok\s+\d+/.test(l));
    const notOkLines = lines.filter((l) => /^\s*not ok\s+\d+/.test(l));
    passCount = okLines.length;
    failCount = notOkLines.length;
    testsCount = passCount + failCount;
  }

  const success = run.status === 0 && failCount === 0;

  if (success) {
    console.log(`PASS (${passCount}/${testsCount} passed in ${durationMs}ms)`);
  } else {
    console.log(`FAIL (${failCount} failures in ${durationMs}ms)`);
    if (stderr.trim()) console.error(stderr);
  }

  grandTotalTests += testsCount;
  grandTotalPass += passCount;
  grandTotalFail += failCount;
  grandTotalSuites += subSuitesCount;

  results.push({
    tier: suite.tier,
    name: suite.name,
    domains: suite.domains,
    total: testsCount,
    passed: passCount,
    failed: failCount,
    durationMs,
    status: success ? "PASS" : "FAIL",
  });
}

const totalDurationMs = Date.now() - overallStartTime;

console.log("\n" + "=".repeat(80));
console.log("  E2E TEST EXECUTION SUMMARY REPORT");
console.log("=".repeat(80));

console.log(
  "\n| Tier   | Suite Name                                      | Tests | Passed | Failed | Status | Time    |"
);
console.log(
  "|:-------|:------------------------------------------------|------:|-------:|-------:|:------:|--------:|"
);

for (const r of results) {
  const tierCol = r.tier.padEnd(6);
  const nameCol = r.name.slice(0, 47).padEnd(47);
  const testsCol = String(r.total).padStart(5);
  const passCol = String(r.passed).padStart(6);
  const failCol = String(r.failed).padStart(6);
  const statusCol = r.status.padEnd(6);
  const timeCol = `${r.durationMs}ms`.padStart(7);
  console.log(
    `| ${tierCol} | ${nameCol} | ${testsCol} | ${passCol} | ${failCol} | ${statusCol} | ${timeCol} |`
  );
}

console.log(
  "|:-------|:------------------------------------------------|------:|-------:|-------:|:------:|--------:|"
);
console.log(
  `| TOTAL  | All 4 Tiers Combined                            | ${String(
    grandTotalTests
  ).padStart(5)} | ${String(grandTotalPass).padStart(6)} | ${String(
    grandTotalFail
  ).padStart(6)} | ${grandTotalFail === 0 ? "PASS  " : "FAIL  "} | ${`${totalDurationMs}ms`.padStart(
    7
  )} |`
);

console.log("\n" + "=".repeat(80));

if (grandTotalFail === 0) {
  console.log(
    `✅ ALL ${grandTotalTests} E2E ACCEPTANCE TESTS PASSED ACCROSS 4 TIERS (100% PASS RATE).`
  );
  console.log("=".repeat(80) + "\n");
  process.exit(0);
} else {
  console.error(
    `❌ TEST SUITE FAILED: ${grandTotalFail} tests failed out of ${grandTotalTests}.`
  );
  console.log("=".repeat(80) + "\n");
  process.exit(1);
}
