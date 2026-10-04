import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDrySeedJsonlExporter, pathIsWithin, seedLibrary } from "./seed-library.ts";
import { sha256File, writeParseReport, bindParseReportToOutput } from "./parsers/lib/report.ts";

const projectRoot = path.resolve(__dirname, "..");

function runCli(args: string[]) {
  // A .bin/tsx shim is not a CreateProcess executable on Windows. Invoke
  // the pinned local CLI with Node itself and never fall back to network npx.
  const localTsx = path.join(projectRoot, "node_modules", "tsx", "dist", "cli.mjs");
  assert.ok(fs.existsSync(localTsx), "run npm ci before seed CLI guard tests");
  const result = spawnSync(process.execPath, [localTsx, "scripts/seed-library.ts", ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.ifError(result.error);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(output, /LIVE INSERT|Loaded environment|Confirmed live target/);
  return { status: result.status, output };
}

test("seed CLI help is inert", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.output, /Usage:/);
});

test("seed CLI rejects implicit mode and directory", () => {
  const result = runCli([]);
  assert.equal(result.status, 2);
  assert.match(result.output, /Select exactly one mode/);
});

test("seed CLI rejects unknown flags before seeding", () => {
  const result = runCli(["--wat"]);
  assert.equal(result.status, 2);
  assert.match(result.output, /Unknown argument/);
});

test("seed CLI rejects unconfirmed live mode before credential loading", () => {
  const result = runCli(["--dir", "output", "--apply-live"]);
  assert.equal(result.status, 2);
  assert.match(result.output, /Live mode requires --approved-manifest/);
});

test("seed CLI refuses the JSONL audit export with --apply-live", () => {
  const result = runCli([
    "--dir", "output",
    "--apply-live",
    "--confirm-host", "example.invalid",
    "--confirm-schema", "library",
    "--approved-manifest", "/missing/approved-manifest.json",
    "--dry-seed-jsonl-dir", "/tmp/nzamy-jsonl-should-not-be-created",
  ]);
  assert.equal(result.status, 2);
  assert.match(result.output, /dry-run only/);
});

function syntheticLiveFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-live-preflight-"));
  const parsed = path.join(root, "parsed");
  fs.mkdirSync(parsed);
  const approved = path.join(root, "approved-manifest.json");
  const operational = path.join(projectRoot, "scripts", "parsers", "schema_manifest.json");
  fs.copyFileSync(operational, approved);
  const output = path.join(parsed, "laws.json");
  fs.writeFileSync(output, '{"laws":[]}\n', "utf8");
  const reportPath = path.join(parsed, "parse-report-laws.json");
  const report = {
    type: "laws",
    counts: { rejectedEnumValues: 0, failed: 0 },
    rejectedEnumValues: [] as string[],
    manifest: {
      version: JSON.parse(fs.readFileSync(approved, "utf8")).manifest_version,
      sha256: sha256File(approved),
    },
    output_sha256: sha256File(output),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report), "utf8");
  const args = [
    "--dir", parsed, "--type", "laws", "--apply-live", "--preflight-only",
    "--approved-manifest", approved, "--confirm-host", "example.invalid", "--confirm-schema", "library",
  ];
  return { approved, output, reportPath, report, args };
}

function setSyntheticLawStatus(fixture: ReturnType<typeof syntheticLiveFixture>, law: Record<string, unknown>) {
  fs.writeFileSync(fixture.output, JSON.stringify({ laws: [{ corpus_scope: "public_corpus", ...law }] }), "utf8");
  fixture.report.output_sha256 = sha256File(fixture.output);
  fs.writeFileSync(fixture.reportPath, JSON.stringify(fixture.report), "utf8");
}

test("synthetic live preflight passes offline without loading credentials or touching DB", () => {
  const fixture = syntheticLiveFixture();
  const result = runCli(fixture.args);
  assert.equal(result.status, 0);
  assert.match(result.output, /No credentials loaded and no DB call made/);
  assert.doesNotMatch(result.output, /Seed Summary/);
});

test("live preflight accepts a parent-law status declared in the approved enum", () => {
  const fixture = syntheticLiveFixture();
  setSyntheticLawStatus(fixture, { law_status: "active" });
  const result = runCli(fixture.args);
  assert.equal(result.status, 0);
  assert.match(result.output, /No credentials loaded and no DB call made/);
});

test("live preflight preserves an undeclared parent-law status without calling it active", () => {
  const fixture = syntheticLiveFixture();
  setSyntheticLawStatus(fixture, { law_status: "status_undeclared" });
  const result = runCli(fixture.args);
  assert.equal(result.status, 0);
  assert.match(result.output, /No credentials loaded and no DB call made/);
});

test("live preflight rejects archival file states as DB law rows", () => {
  for (const law_status of ["superseded_duplicate", "merged_into_parent"]) {
    const fixture = syntheticLiveFixture();
    setSyntheticLawStatus(fixture, { law_status });
    const result = runCli(fixture.args);
    assert.equal(result.status, 2);
    assert.match(result.output, /out-of-contract law_status/);
  }
});

test("db_law_status matches the migration CHECK, not the source/registry status enum", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "scripts/parsers/schema_manifest.json"), "utf8"));
  const sql = fs.readFileSync(path.join(projectRoot, "supabase/migrations/20260911_library_laws_enactment_gazette_schema.sql"), "utf8");
  const check = sql.match(/ADD CONSTRAINT chk_laws_status_lifecycle[\s\S]*?CHECK \(status IN \(([\s\S]*?)\)\);/);
  assert.ok(check, "the named library.laws status constraint must remain present");
  const dbValues = [...check[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(manifest.enums.db_law_status, dbValues);
  assert.equal(manifest.enums.db_law_status.includes("status_undeclared"), true);
  assert.equal(manifest.enums.status.includes("status_undeclared"), false);
  assert.equal(manifest.enums.db_law_status.includes("merged_into_parent"), false);
});

test("live preflight rejects a missing parent-law status even with a matching report hash", () => {
  const fixture = syntheticLiveFixture();
  setSyntheticLawStatus(fixture, { slug: "synthetic" });
  const result = runCli(fixture.args);
  assert.equal(result.status, 2);
  assert.match(result.output, /out-of-contract law_status/);
});

test("live --clean is refused before credentials and DB even with --allow-clean and valid synthetic provenance", () => {
  const fixture = syntheticLiveFixture();
  const args = fixture.args.filter((arg) => arg !== "--preflight-only");
  const result = runCli([...args, "--clean", "--allow-clean"]);
  assert.equal(result.status, 2);
  assert.match(result.output, /Live --clean\/--allow-clean is disabled/);
  assert.doesNotMatch(result.output, /schema_manifest.json v|preflight passed|Seed Summary/);
});

test("direct seeder API also refuses live clean before credentials and DB", async () => {
  await assert.rejects(
    seedLibrary({ dir: "/nonexistent/parsed-output", dryRun: false, clean: true }),
    /Live --clean is disabled/,
  );
});

test("direct seeder API refuses ordinary live writes without provenance before credentials or DB", async () => {
  await assert.rejects(
    seedLibrary({ dir: "/nonexistent/parsed-output", dryRun: false, clean: false }),
    /requires an approved manifest and confirmed host\/schema/,
  );
});

test("real report writer binds the exact contract and JSON bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-report-provenance-"));
  const output = path.join(root, "laws.json");
  fs.writeFileSync(output, '{"laws":[]}\n', "utf8");
  const reportPath = writeParseReport(root, {
    type: "laws", generated_at: "synthetic", input: root, counts: { failed: 0 },
  });
  assert.ok(reportPath);
  bindParseReportToOutput(root, "laws", output);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.manifest.sha256, sha256File(path.join(projectRoot, "scripts/parsers/schema_manifest.json")));
  assert.equal(report.output_sha256, sha256File(output));
  assert.deepEqual(report.rejectedEnumValues, []);
  assert.equal(report.counts.rejectedEnumValues, 0);
});

test("live preflight refuses a drifted operational manifest", () => {
  const fixture = syntheticLiveFixture();
  const contract = JSON.parse(fs.readFileSync(fixture.approved, "utf8"));
  contract.manifest_version = "1.12";
  fs.writeFileSync(fixture.approved, JSON.stringify(contract), "utf8");
  const result = runCli(fixture.args);
  assert.equal(result.status, 2);
  assert.match(result.output, /operational schema_manifest drifted/);
});

test("live preflight refuses even one reported rejected enum value", () => {
  const fixture = syntheticLiveFixture();
  fixture.report.rejectedEnumValues.push("example.md :: type=unknown");
  fixture.report.counts.rejectedEnumValues = 1;
  fs.writeFileSync(fixture.reportPath, JSON.stringify(fixture.report), "utf8");
  const result = runCli(fixture.args);
  assert.equal(result.status, 2);
  assert.match(result.output, /contains 1 rejected enum value/);
});

test("live preflight refuses a forged zero counter against a nonempty rejection list", () => {
  const fixture = syntheticLiveFixture();
  fixture.report.rejectedEnumValues.push("example.md :: status=unknown");
  fs.writeFileSync(fixture.reportPath, JSON.stringify(fixture.report), "utf8");
  const result = runCli(fixture.args);
  assert.equal(result.status, 2);
  assert.match(result.output, /absent\/inconsistent rejectedEnumValues count/);
});

test("live preflight refuses an absent parser report", () => {
  const fixture = syntheticLiveFixture();
  fs.renameSync(fixture.reportPath, `${fixture.reportPath}.withheld`);
  const result = runCli(fixture.args);
  assert.equal(result.status, 2);
  assert.match(result.output, /parse-report-laws.json is missing/);
});

test("live preflight refuses JSON changed after parsing", () => {
  const fixture = syntheticLiveFixture();
  fs.writeFileSync(fixture.output, '{"laws":[{"slug":"tampered"}]}\n', "utf8");
  const result = runCli(fixture.args);
  assert.equal(result.status, 2);
  assert.match(result.output, /changed after its parser report/);
});

test("dry-run remains available for diagnosis and cannot carry live contract flags", () => {
  const fixture = syntheticLiveFixture();
  const result = runCli(["--dir", path.dirname(fixture.output), "--dry-run", "--approved-manifest", fixture.approved]);
  assert.equal(result.status, 2);
  assert.match(result.output, /Live confirmation flags cannot accompany --dry-run/);
});

test("dry JSONL exporter requires a fresh external directory and never appends", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-dry-seed-"));
  const outputDir = path.join(parent, "rows");
  const exporter = createDrySeedJsonlExporter(outputDir, projectRoot);

  exporter.write("laws", [{ slug: "sample", title: "نموذج" }]);
  assert.equal(
    fs.readFileSync(path.join(outputDir, "laws.jsonl"), "utf8"),
    '{"slug":"sample","title":"نموذج"}\n',
  );
  assert.deepEqual(exporter.rowCounts, { laws: 1 });
  assert.throws(() => exporter.write("laws", []), /EEXIST/);
  assert.throws(
    () => createDrySeedJsonlExporter(outputDir, projectRoot),
    /Refusing to reuse existing/,
  );
});

test("dry JSONL exporter rejects relative and package-contained paths", () => {
  assert.throws(
    () => createDrySeedJsonlExporter("relative-output", projectRoot),
    /absolute path/,
  );
  assert.throws(
    () => createDrySeedJsonlExporter(path.join(projectRoot, "new-dry-seed-output"), projectRoot),
    /inside the developer package/,
  );
  const bundleRoot = path.dirname(projectRoot);
  if (fs.existsSync(path.join(bundleRoot, "MANIFEST.json"))) {
    for (const output of [
      path.join(bundleRoot, "never-create-rows"),
      path.join(bundleRoot, "corpus", "never-create-rows"),
    ]) {
      assert.throws(() => createDrySeedJsonlExporter(output, projectRoot), /inside the developer package/);
      assert.equal(fs.existsSync(output), false);
    }
  }
});

test("Windows path containment allows a genuinely external volume", () => {
  assert.equal(pathIsWithin("D:\\audit\\rows", "C:\\pack", path.win32), false);
  assert.equal(pathIsWithin("C:\\pack\\corpus\\rows", "C:\\pack", path.win32), true);
  assert.equal(pathIsWithin("C:\\pack", "C:\\pack", path.win32), true);
});
