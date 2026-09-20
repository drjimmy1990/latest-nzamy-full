import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertLiveSeedPreflight, findUnresolvedLawTypeReviews } from "./seed-library.live-preflight.ts";
import { seedLaws } from "./seed-library.ts";

const marked = {
  laws: [{ slug: "type-review-fixture", corpus_scope: "public_corpus", law_status: "active", metadata: {
    type: "royal_order",
    type_raw: "royal_order",
    type_review_reason: "private type review evidence",
  } }],
};

test("finds only nonblank type-review markers without returning their reasons", () => {
  assert.deepEqual(findUnresolvedLawTypeReviews(marked), ["laws[0]"]);
  assert.deepEqual(findUnresolvedLawTypeReviews({ laws: [
    { metadata: { type_review_reason: "   " } },
    { metadata: { review_reason: "other content review" } },
  ] }), []);
});

test("direct live law seeding refuses unresolved types before deletion or insertion", async () => {
  let writes = 0;
  const client = {
    async delete() { writes++; return { error: null }; },
    async upsert() { writes++; return { data: [], error: null }; },
  };
  await assert.rejects(
    seedLaws(client as never, marked, false, [], true),
    /1 law type-review marker\(s\) remain unresolved; no live law seed: laws\[0\]/,
  );
  assert.equal(writes, 0);
});

test("bound live preflight refuses a type marker even when enum report is green", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-type-review-gate-"));
  const parsedDir = path.join(scratch, "parsed");
  fs.mkdirSync(parsedDir);
  const approvedManifestPath = path.join(scratch, "approved-manifest.json");
  fs.copyFileSync(path.join(projectRoot, "scripts/parsers/schema_manifest.json"), approvedManifestPath);
  const sha = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const outputFile = path.join(parsedDir, "laws.json");
  fs.writeFileSync(outputFile, JSON.stringify(marked));
  const reportPath = path.join(parsedDir, "parse-report-laws.json");
  const report = {
    type: "laws",
    counts: { rejectedEnumValues: 0, failed: 0 },
    rejectedEnumValues: [],
    manifest: {
      version: JSON.parse(fs.readFileSync(approvedManifestPath, "utf8")).manifest_version,
      sha256: sha(approvedManifestPath),
    },
    output_sha256: sha(outputFile),
  };
  fs.writeFileSync(reportPath, JSON.stringify(report));
  assert.throws(
    () => assertLiveSeedPreflight({ dir: parsedDir, approvedManifestPath, types: ["laws"], projectRoot }),
    /laws\.json has 1 unresolved type-review marker\(s\); first: laws\[0\]/,
  );
  const accepted = { laws: [{ ...marked.laws[0], metadata: { type: "نظام" } }] };
  fs.writeFileSync(outputFile, JSON.stringify(accepted));
  fs.writeFileSync(reportPath, JSON.stringify({ ...report, output_sha256: sha(outputFile) }));
  assert.doesNotThrow(
    () => assertLiveSeedPreflight({ dir: parsedDir, approvedManifestPath, types: ["laws"], projectRoot }),
  );
});
