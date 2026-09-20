/** Contract regression gates for ambiguities already adjudicated in v1.17. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DB_LAW_STATUS_ENUM, STATUS_ENUM, getManifest } from "./manifest.ts";

const manifestPath = path.join(__dirname, "schema_manifest.json");

test("source status and DB law status remain explicitly separate", () => {
  assert.equal(STATUS_ENUM().includes("merged_into_parent"), true);
  assert.equal(STATUS_ENUM().includes("superseded_duplicate"), true);
  assert.equal(DB_LAW_STATUS_ENUM().includes("status_undeclared"), true);
  assert.equal(DB_LAW_STATUS_ENUM().includes("merged_into_parent"), false);
  assert.equal(DB_LAW_STATUS_ENUM().includes("superseded_duplicate"), false);
});

test("ambiguous raw types cannot regain a blanket normalization", () => {
  const manifest = getManifest() as Record<string, unknown>;
  const map = manifest.type_normalization_map as Record<string, string>;
  for (const raw of ["law_draft", "royal_order", "نظام أساسي", "تعميم / قرار"]) {
    assert.equal(map[raw], undefined, `${raw} requires file-by-file adjudication`);
  }
  const bytes = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(bytes.manifest_version, "1.18");
});
