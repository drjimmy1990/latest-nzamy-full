/** Read-only proof that the bundled parent-law correction changed status only. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const beforePath = path.join(packageRoot, "evidence/status-correction-before/laws.jsonl");
const afterPath = path.join(packageRoot, "evidence/full/rows/laws.jsonl");
const lines = (file) => fs.readFileSync(file, "utf8").trimEnd().split("\n");
const before = lines(beforePath);
const after = lines(afterPath);
assert.equal(before.length, after.length, "law row count changed");
let changed = 0;
for (let index = 0; index < before.length; index++) {
  const oldRow = JSON.parse(before[index]);
  const newRow = JSON.parse(after[index]);
  const oldStatus = oldRow.status;
  const newStatus = newRow.status;
  delete oldRow.status;
  delete newRow.status;
  assert.deepEqual(newRow, oldRow, `non-status fields changed at law row ${index + 1}`);
  if (oldStatus !== newStatus) {
    assert.equal(oldStatus, "active", `unexpected old status at law row ${index + 1}`);
    assert.equal(newStatus, "status_undeclared", `unexpected new status at law row ${index + 1}`);
    changed++;
  }
}
assert.equal(changed, 147, "status correction count changed");
console.log(`PASS: ${before.length} law rows; exactly ${changed} active → status_undeclared; all other fields unchanged.`);
