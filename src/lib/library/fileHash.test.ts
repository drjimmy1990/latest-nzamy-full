/**
 * N2.7 — the rows-diff report names the exact bytes it judged (SHA-256 of
 * each input JSONL). The diff script itself reads the live database and is
 * never run from here; its wiring is pinned from source.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashRowFiles, sha256OfFile } from "./fileHash.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const DIFF = fs.readFileSync(path.join(here, "../../../scripts/library-rows-diff.mjs"), "utf8").replace(/\r\n/g, "\n");

test("sha256OfFile: the raw bytes, CRLF and multi-byte text included, streamed", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nz-hash-"));
  try {
    const body = Buffer.from('{"slug":"نظام-١"}\r\n{"slug":"b"}\n', "utf8");
    const file = path.join(dir, "laws.jsonl");
    fs.writeFileSync(file, body);
    const got = await sha256OfFile(file);
    assert.equal(got.sha256, createHash("sha256").update(body).digest("hex"));
    assert.equal(got.bytes, body.length);
    // A large file arrives in several chunks: the same digest.
    const big = Buffer.alloc(3 * 1024 * 1024 + 7, 0x61);
    fs.writeFileSync(path.join(dir, "articles.jsonl"), big);
    const all = await hashRowFiles(dir, ["laws", "articles", "chapters"], fs.existsSync, path.join);
    assert.deepEqual(Object.keys(all).sort(), ["articles.jsonl", "laws.jsonl"]);
    assert.equal(all["articles.jsonl"].sha256, createHash("sha256").update(big).digest("hex"));
    assert.equal(all["articles.jsonl"].bytes, big.length);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("sha256OfFile: a missing file rejects (never a hash of nothing)", async () => {
  await assert.rejects(sha256OfFile(path.join(os.tmpdir(), "nz-hash-missing-" + Date.now(), "x.jsonl")));
});

test("library-rows-diff.mjs writes the input hashes into rows-diff-report.json", () => {
  assert.match(DIFF, /await import\("\.\.\/src\/lib\/library\/fileHash\.ts"\)/);
  assert.match(DIFF, /inputs: \{\s*rows: await hashRowFiles\(rowsDir, tableNames, fs\.existsSync, path\.join\),\s*old: oldDir \? await hashRowFiles\(oldDir, tableNames, fs\.existsSync, path\.join\) : null,/);
  assert.match(DIFF, /hash_algorithm: "sha256"/);
});
