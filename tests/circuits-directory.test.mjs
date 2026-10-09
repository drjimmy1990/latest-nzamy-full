/**
 * tests/circuits-directory.test.mjs
 * ─────────────────────────────────────────────────────────────
 * Automated validation test for Ministry of Justice Circuits Directory
 * ─────────────────────────────────────────────────────────────
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const dataPath = path.resolve(projectRoot, "src/data/circuits-directory.json");

test("Circuits Directory Data Integrity Test", async (t) => {
  await t.test("File exists and contains valid JSON", () => {
    assert.ok(fs.existsSync(dataPath), "circuits-directory.json must exist");
    const content = fs.readFileSync(dataPath, "utf8");
    const data = JSON.parse(content);
    assert.ok(data.metadata, "Metadata object exists");
    assert.ok(Array.isArray(data.circuits), "Circuits array exists");
  });

  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  await t.test("Exact total count matches official MOJ archive (2,192 circuits)", () => {
    assert.strictEqual(data.circuits.length, 2192, "Must contain exactly 2,192 judicial circuit entries");
    assert.strictEqual(data.metadata.totalCount, 2192, "Metadata totalCount must match 2,192");
  });

  await t.test("All entries have non-empty required fields", () => {
    for (const item of data.circuits) {
      assert.ok(item.id && typeof item.id === "string", `Item ${item.id} must have id`);
      assert.ok(item.name && typeof item.name === "string" && item.name.length > 2, `Item ${item.id} must have valid name`);
      assert.ok(item.email && typeof item.email === "string" && item.email.includes("@"), `Item ${item.id} must have valid email`);
      assert.ok(item.region && typeof item.region === "string", `Item ${item.id} must have valid region`);
      assert.ok(item.category && typeof item.category === "string", `Item ${item.id} must have valid category`);
    }
  });

  await t.test("Exactly 36 entries are flagged for manual verification", () => {
    const unverified = data.circuits.filter(c => c.needsVerification);
    assert.strictEqual(unverified.length, 36, "Must flag exactly 36 entries with known PDF bidi typos");
    for (const item of unverified) {
      assert.ok(item.suggestedEmail, `Unverified item ${item.name} must have a suggestedEmail`);
      assert.ok(item.verificationStatus, `Unverified item ${item.name} must have a verificationStatus`);
    }
  });

  await t.test("Filtering and search capabilities", () => {
    // Search Riyadh
    const riyadhCircuits = data.circuits.filter(c => c.region.includes("الرياض") || c.city.includes("الرياض"));
    assert.ok(riyadhCircuits.length > 100, "Riyadh must have over 100 entries");

    // Search Appeals
    const appealCircuits = data.circuits.filter(c => c.category === "استئناف" || c.name.includes("استئناف"));
    assert.ok(appealCircuits.length > 20, "Appeals courts must have multiple entries across the Kingdom");

    // Search Execution
    const executionCircuits = data.circuits.filter(c => c.category === "محكمة تنفيذ" || c.name.includes("تنفيذ"));
    assert.ok(executionCircuits.length > 50, "Execution courts must have multiple entries across the Kingdom");

    // Search General Courts
    const generalCircuits = data.circuits.filter(c => c.category === "محكمة عامة" || c.name.includes("عامة"));
    assert.ok(generalCircuits.length > 500, "General courts must have over 500 entries");

    // Search Commercial
    const commercial = data.circuits.filter(c => c.category === "محكمة تجارية" || c.name.includes("تجارية"));
    assert.ok(commercial.length >= 1, "Commercial court must be present");
  });
});
