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

// ─── Owner corrections (Q4: standard Latin digits; unconfirmed stays unverified) ──
//
// The 52 rows of the owner's visual-verification table
// (emails_affected_52.csv, 2026-10-12): 31 bidi-reversed addresses carrying an
// Arabic-Indic digit, 5 with a stray space, and 16 with an Arabic-Indic digit
// only — the 16 were badged «رسمي معتمد» while copy and mailto produced an
// address no mail server accepts. Pinned here so the data cannot drift back
// (scripts/parsers/parse-circuits-directory.mjs does not read this table, so a
// re-run of the parser would restore the old values and fail this test).
const OWNER_CORRECTIONS = [
  ["moj-cir-0230", "GEN-SAM-COURT2@moj.gov.sa"],
  ["moj-cir-0236", "GEN-SHG-COURT2@moj.gov.sa"],
  ["moj-cir-0366", "ktabh1D@moj.gov.sa"],
  ["moj-cir-0368", "KIT1-HAS@moj.gov.sa"],
  ["moj-cir-0369", "KIT1-KHO@moj.gov.sa"],
  ["moj-cir-0370", "KIT2-BGA@moj.gov.sa"],
  ["moj-cir-0371", "KIT2-DAM@moj.gov.sa"],
  ["moj-cir-0372", "KIT2-HAS@moj.gov.sa"],
  ["moj-cir-0373", "KIT2-KHO@moj.gov.sa"],
  ["moj-cir-0409", "ktabh1R@moj.gov.sa"],
  ["moj-cir-0410", "ktabh1Rj@moj.gov.sa"],
  ["moj-cir-0411", "KIT1-RYD@moj.gov.sa"],
  ["moj-cir-0412", "KIT2E-RYD@moj.gov.sa"],
  ["moj-cir-0413", "KIT2-HAIR@moj.gov.sa"],
  ["moj-cir-0414", "KIT2S-RYD@moj.gov.sa"],
  ["moj-cir-0441", "KIT2-KHJ@moj.gov.sa"],
  ["moj-cir-0442", "KIT2N-RYD@moj.gov.sa"],
  ["moj-cir-0445", "KIT1-BUR@moj.gov.sa"],
  ["moj-cir-0446", "KIT2-BUR@moj.gov.sa"],
  ["moj-cir-0460", "KIT1E-MAD@moj.gov.sa"],
  ["moj-cir-0461", "KIT1W-MAD@moj.gov.sa"],
  ["moj-cir-0462", "KIT2E-MAD@moj.gov.sa"],
  ["moj-cir-0463", "KIT2W-MAD@moj.gov.sa"],
  ["moj-cir-0464", "KIT2-YEN@moj.gov.sa"],
  ["moj-cir-0475", "KIT1-TAB@moj.gov.sa"],
  ["moj-cir-0482", "KIT2-TAB@moj.gov.sa"],
  ["moj-cir-0483", "KIT1-Jaz@moj.gov.sa"],
  ["moj-cir-0484", "KIT2-Jaz@moj.gov.sa"],
  ["moj-cir-0498", "KIT1-Hal@moj.gov.sa"],
  ["moj-cir-0499", "KIT2-Hal@moj.gov.sa"],
  ["moj-cir-0509", "KIT2-TTH@moj.gov.sa"],
  ["moj-cir-0511", "KIT1-ABH@moj.gov.sa"],
  ["moj-cir-0512", "KIT1-BIS@moj.gov.sa"],
  ["moj-cir-0513", "KIT2-ABH@moj.gov.sa"],
  ["moj-cir-0514", "KIT2-BIS@moj.gov.sa"],
  ["moj-cir-0534", "ktabh1M@moj.gov.sa"],
  ["moj-cir-0535", "ktabh1J@moj.gov.sa"],
  ["moj-cir-0536", "KIT1-GON@moj.gov.sa"],
  ["moj-cir-0537", "KIT1-JMO@moj.gov.sa"],
  ["moj-cir-0538", "KIT1-RNH@moj.gov.sa"],
  ["moj-cir-0539", "KIT1-TAF@moj.gov.sa"],
  ["moj-cir-0540", "KIT2E-MECK@moj.gov.sa"],
  ["moj-cir-0541", "KIT2N-JED@moj.gov.sa"],
  ["moj-cir-0542", "KIT2S-JED@moj.gov.sa"],
  ["moj-cir-0543", "KIT2-Taif@moj.gov.sa"],
  ["moj-cir-0554", "KIT2W-MECK@moj.gov.sa"],
  ["moj-cir-0555", "KIT1-NAJ@moj.gov.sa"],
  ["moj-cir-0827", "GEN-ARD-JON-ID1@moj.gov.sa"],
  ["moj-cir-0828", "GEN-ARD-SHI-ID1@moj.gov.sa"],
  ["moj-cir-1622", "GEN-GIL-JC2@moj.gov.sa"],
  ["moj-cir-1716", "GEN-GIL-JC3@moj.gov.sa"],
  ["moj-cir-2079", "GEN-JMS-PC@moj.gov.sa"],
];

const ARABIC_INDIC_DIGIT = /[٠-٩۰-۹]/;
const MOJ_ADDRESS = /^[A-Za-z0-9._-]+@moj.gov.sa$/i;

test("Circuits Directory email addresses are sendable", async (t) => {
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const byId = new Map(data.circuits.map((c) => [c.id, c]));

  await t.test("every owner correction is applied to the address copy and mailto use", () => {
    assert.strictEqual(OWNER_CORRECTIONS.length, 52);
    for (const [id, corrected] of OWNER_CORRECTIONS) {
      const row = byId.get(id);
      assert.ok(row, `${id} must exist`);
      assert.strictEqual(row.email, corrected, `${id} email`);
      if (row.needsVerification) {
        assert.strictEqual(row.suggestedEmail, corrected, `${id} suggestedEmail`);
      }
    }
  });

  await t.test("no address carries an Arabic-Indic digit", () => {
    for (const c of data.circuits) {
      assert.ok(!ARABIC_INDIC_DIGIT.test(c.email), `${c.id} email: ${c.email}`);
      assert.ok(!ARABIC_INDIC_DIGIT.test(c.suggestedEmail ?? ""), `${c.id} suggestedEmail: ${c.suggestedEmail}`);
    }
  });

  await t.test("no row shown as verified has an Arabic-Indic digit or a malformed address", () => {
    for (const c of data.circuits.filter((row) => !row.needsVerification)) {
      assert.ok(!ARABIC_INDIC_DIGIT.test(c.email), `verified ${c.id}: ${c.email}`);
      assert.match(c.email, MOJ_ADDRESS, `verified ${c.id}`);
    }
  });

  await t.test("every address has the standard @moj.gov.sa shape", () => {
    for (const c of data.circuits) assert.match(c.email, MOJ_ADDRESS, c.id);
  });

  await t.test("the 36 rows flagged before his table stay unverified until he confirms them", () => {
    // Q4: anything unconfirmed keeps its «يتطلب تحققاً» label. The pinned rows
    // below are one of each defect kind.
    assert.strictEqual(byId.get("moj-cir-0368").needsVerification, true); // bidi + digit (KIT1-HAS)
    assert.strictEqual(byId.get("moj-cir-0230").needsVerification, true); // bidi + digit (GEN-SAM-COURT2)
    assert.strictEqual(byId.get("moj-cir-0827").needsVerification, true); // stray space (GEN-ARD-JON-ID1)
    assert.strictEqual(byId.get("moj-cir-0366").needsVerification, false); // digit only (ktabh1D)
    assert.strictEqual(byId.get("moj-cir-0366").email, "ktabh1D@moj.gov.sa");
  });

  await t.test("the source value shown in the notice is the whole printed address", () => {
    // The parser cut the five stray-space rows at the space ("GEN-ARD").
    for (const c of data.circuits) assert.ok(c.rawEmail.includes("@"), `${c.id} rawEmail: ${c.rawEmail}`);
    assert.strictEqual(byId.get("moj-cir-0827").rawEmail, "GEN-ARD JON-ID1@moj.gov.sa");
  });

  await t.test("metadata counts match the rows", () => {
    const flagged = data.circuits.filter((c) => c.needsVerification).length;
    assert.strictEqual(data.metadata.needsVerificationCount, flagged);
    assert.strictEqual(data.metadata.verifiedCount, data.circuits.length - flagged);
  });
});
