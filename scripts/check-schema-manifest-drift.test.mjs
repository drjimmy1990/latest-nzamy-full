import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(scriptDir, "check-schema-manifest-drift.mjs");
const operational = path.join(scriptDir, "parsers", "schema_manifest.json");

function run(...args) {
  return spawnSync(process.execPath, [script, ...args, "--json"], {
    encoding: "utf8",
    env: { ...process.env, NZAMY_VAULT_ROOT: "" },
  });
}

test("separate byte-identical governing copy passes", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-drift-pass-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const canonical = path.join(dir, "schema_manifest.json");
  fs.copyFileSync(operational, canonical);
  const result = run("--canonical", canonical);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).drifted, false);
});

test("one-byte drift fails closed", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-drift-fail-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const canonical = path.join(dir, "schema_manifest.json");
  fs.copyFileSync(operational, canonical);
  fs.appendFileSync(canonical, "\n");
  const result = run("--canonical", canonical);
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).drifted, true);
});

test("missing governing copy fails closed", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-drift-missing-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const result = run("--canonical", path.join(dir, "absent.json"));
  assert.equal(result.status, 1, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.drifted, true);
  assert.equal(output.results[1].exists, false);
});

test("self-comparison cannot masquerade as alignment", () => {
  const result = run("--canonical", operational);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /self-comparison/);
});

test("an explicitly supplied SEO copy participates in the gate", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "schema-drift-seo-"));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const canonical = path.join(dir, "schema_manifest.json");
  const seo = path.join(dir, "seo_manifest.json");
  fs.copyFileSync(operational, canonical);
  fs.copyFileSync(operational, seo);
  fs.appendFileSync(seo, "\n");
  const result = run("--canonical", canonical, "--seo-copy", seo);
  assert.equal(result.status, 1, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.results.length, 3);
  assert.equal(output.drifted, true);
});
