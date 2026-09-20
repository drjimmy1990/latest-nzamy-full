/** A rejected legal classification must not become seedable laws.json. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws } from "./parse-laws.ts";

const webRoot = path.resolve(__dirname, "../..");
const parser = path.join(webRoot, "scripts/parsers/parse-laws.ts");
const tsx = path.join(webRoot, "node_modules/tsx/dist/cli.mjs");

function writeFixture(type: string, status = "active") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-law-enum-gate-"));
  const source = path.join(dir, "fixture.md");
  const output = path.join(dir, "parsed");
  fs.writeFileSync(source, `---
id: TEST-LAW-ENUM-GATE
title: اختبار بوابة النوع
type: ${type}
status: ${status}
section_code: "00"
schema_version: "4.0"
---
<!-- ARTICLE_START {"number": "1", "number_text": "المادة الأولى"} -->
متن اصطناعي للاختبار فقط.
<!-- ARTICLE_END -->
`, "utf8");
  return { source, output };
}

function runFixture(type: string, status = "active") {
  const { source, output } = writeFixture(type, status);
  const result = spawnSync(process.execPath, [tsx, parser, "--input", source, "--output", output], {
    cwd: webRoot,
    encoding: "utf8",
    shell: false,
  });
  return { result, output };
}

test("unknown source type fails with a complete report and no seedable laws.json", () => {
  const { result, output } = runFixture("royal_order");
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(output, "laws.json")), false);
  const report = JSON.parse(fs.readFileSync(path.join(output, "parse-report-laws.json"), "utf8"));
  assert.equal(report.counts.rejectedEnumValues, 1);
  assert.equal(report.rejectedEnumValues.length, 1);
});

test("missing or null source type cannot silently become a seedable law", () => {
  for (const type of ["", "null", "~"]) {
    const { result, output } = runFixture(type);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(fs.existsSync(path.join(output, "laws.json")), false);
    const report = JSON.parse(fs.readFileSync(path.join(output, "parse-report-laws.json"), "utf8"));
    assert.equal(report.counts.rejectedEnumValues, 1);
    assert.match(report.rejectedEnumValues[0], /:: type="\(missing\)"$/);
  }
});

test("accepted source type still writes a bound laws.json", () => {
  const { result, output } = runFixture("نظام");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(output, "laws.json")), true);
  const report = JSON.parse(fs.readFileSync(path.join(output, "parse-report-laws.json"), "utf8"));
  assert.match(report.output_sha256, /^[0-9a-f]{64}$/);
});

test("explicit out-of-contract parent status cannot be seeded through CLI", () => {
  for (const status of ["status_undeclared", "invented_status"]) {
    const { result, output } = runFixture("نظام", status);
    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.equal(fs.existsSync(path.join(output, "laws.json")), false);
    const report = JSON.parse(fs.readFileSync(path.join(output, "parse-report-laws.json"), "utf8"));
    assert.equal(report.counts.rejectedEnumValues, 1);
  }
});

test("source-valid archival status cannot cross the narrower DB status boundary", () => {
  const { result, output } = runFixture("نظام", "merged_into_parent");
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.equal(fs.existsSync(path.join(output, "laws.json")), false);
  const report = JSON.parse(fs.readFileSync(path.join(output, "parse-report-laws.json"), "utf8"));
  assert.equal(report.counts.rejectedEnumValues, 1);
  assert.match(report.rejectedEnumValues[0], /:: db_law_status="merged_into_parent"$/);
});

test("direct parser throws on rejection and a later independent call starts clean", () => {
  const rejected = writeFixture("royal_order");
  const accepted = writeFixture("نظام");
  try {
    assert.throws(() => parseLaws(rejected.source), /Law parse rejected/);
    assert.equal(parseLaws(accepted.source, accepted.output).laws.length, 1);
    const report = JSON.parse(fs.readFileSync(path.join(accepted.output, "parse-report-laws.json"), "utf8"));
    assert.equal(report.counts.rejectedEnumValues, 0);
    assert.equal(report.schemaVersionCounts["4.0"], 1);
  } finally {
    // The rejected fixture deliberately sets process.exitCode for a CLI caller.
    process.exitCode = 0;
  }
});
