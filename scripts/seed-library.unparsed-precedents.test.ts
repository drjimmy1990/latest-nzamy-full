import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertLiveSeedPreflight, findUnseededPrecedentDetails } from "./seed-library.live-preflight.ts";
import { seedPrecedents } from "./seed-library.ts";

const fixture = {
  collections: [{
    id: "judicial-fixture",
    principles: [
      { number: 1, text: "classified text", unparsed_details: "" },
      { number: 2, text: "", unparsed_details: "private fold" },
    ],
  }],
  court_precedents: [{ slug: "standalone", unparsed_details: "private standalone fold" }],
};

test("locates only nonempty unseeded judicial folds without returning their text", () => {
  assert.deepEqual(findUnseededPrecedentDetails(fixture), [
    "collections[0].principles[1]",
    "court_precedents[0]",
  ]);
  assert.deepEqual(findUnseededPrecedentDetails({ collections: [{ principles: [{ unparsed_details: "  " }] }] }), []);
});

test("live precedent seed refuses a missing private contract before deletion or insertion", async () => {
  let writes = 0;
  const client = {
    async delete() { writes++; return { error: null }; },
    async upsert() { writes++; return { data: [], error: null }; },
  };
  await assert.rejects(
    seedPrecedents(client as never, fixture, false, [], true),
    /private precedent storage contract unavailable before public writes/,
  );
  assert.equal(writes, 0);
});

test("live precedent seed probes the private contract first and stores every private row by RPC", async () => {
  const events: string[] = [];
  const client = {
    async delete() { events.push("delete"); return { error: null }; },
    async upsert(table: string, rows: Record<string, unknown>[]) {
      events.push(`upsert:${table}`);
      return { data: rows, error: null };
    },
    async rpc(name: string, params?: Record<string, unknown>) {
      events.push(`rpc:${name}`);
      if (name === "private_precedent_storage_contract") {
        return {
          data: { version: "20260919_v1", max_batch: 100, hash: "sha256", read_rpc: false },
          error: null,
        };
      }
      const rows = (params?.p_rows || []) as unknown[];
      return { data: rows.length, error: null };
    },
  };
  const errors: string[] = [];
  const stats = await seedPrecedents(client as never, fixture, false, errors, false);
  assert.deepEqual(errors, []);
  assert.equal(events[0], "rpc:private_precedent_storage_contract");
  assert.equal(events.at(-1), "rpc:store_private_precedent_details");
  assert.ok(events.indexOf("rpc:store_private_precedent_details") > events.indexOf("upsert:principles"));
  assert.equal(stats.find((row) => row.table === "private_precedent_details")?.inserted, 2);
});

test("dry precedent seed emits the exact private RPC projection without a blocker", async () => {
  const errors: string[] = [];
  const rowsByName = new Map<string, Record<string, unknown>[]>();
  const exporter = {
    outputDir: "memory-only",
    rowCounts: {} as Record<string, number>,
    write(table: string, rows: Record<string, unknown>[]) {
      rowsByName.set(table, rows);
      this.rowCounts[table] = rows.length;
    },
  };
  const client = {
    async delete() { throw new Error("dry run attempted deletion"); },
    async upsert() { throw new Error("dry run attempted insertion"); },
  };
  await seedPrecedents(client as never, fixture, true, errors, false, exporter);
  assert.deepEqual(errors, []);
  const privateRows = rowsByName.get("private_precedent_details") || [];
  assert.equal(privateRows.length, 2);
  assert.deepEqual(privateRows.map((row) => row.source_locator), [
    "collections[0].principles[1]", "court_precedents[0]",
  ]);
  assert.deepEqual(privateRows.map((row) => row.body), ["private fold", "private standalone fold"]);
  for (const row of privateRows) {
    assert.equal(row.review_state, "unverified");
    assert.equal(row.body_sha256, crypto.createHash("sha256").update(String(row.body), "utf8").digest("hex"));
    assert.ok((rowsByName.get("principles") || []).some((principle) => principle.id === row.principle_id));
  }
  assert.ok((rowsByName.get("principles") || []).every((row) => !JSON.stringify(row).includes("private fold")));
});

test("bound offline preflight accepts private-bound judicial text for the later DB RPC probe", () => {
  const projectRoot = path.resolve(__dirname, "..");
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-precedent-fold-gate-"));
  const parsedDir = path.join(scratch, "parsed");
  fs.mkdirSync(parsedDir);
  const approvedManifestPath = path.join(scratch, "approved-manifest.json");
  fs.copyFileSync(path.join(projectRoot, "scripts/parsers/schema_manifest.json"), approvedManifestPath);
  const sha = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const outputFile = path.join(parsedDir, "precedents.json");
  fs.writeFileSync(outputFile, JSON.stringify(fixture));
  fs.writeFileSync(path.join(parsedDir, "parse-report-precedents.json"), JSON.stringify({
    type: "precedents",
    counts: { rejectedEnumValues: 0, failed: 0 },
    rejectedEnumValues: [],
    manifest: {
      version: JSON.parse(fs.readFileSync(approvedManifestPath, "utf8")).manifest_version,
      sha256: sha(approvedManifestPath),
    },
    output_sha256: sha(outputFile),
  }));
  assert.doesNotThrow(
    () => assertLiveSeedPreflight({ dir: parsedDir, approvedManifestPath, types: ["precedents"], projectRoot }),
  );
});
