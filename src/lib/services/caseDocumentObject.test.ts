import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { storageObjectHeldByCaseDocument, type AttachmentsReader } from "./caseDocumentObject.ts";

function fakeClient(result: { data: unknown; error: { message: string; code?: string } | null }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder = {
    select(cols: string) { calls.push(["select", cols]); return builder; },
    eq(col: string, v: unknown) { calls.push(["eq", col, v]); return builder; },
    not(col: string, op: string, v: unknown) { calls.push(["not", col, op, v]); return builder; },
    limit(n: number) { calls.push(["limit", n]); return Promise.resolve(result); },
  };
  const client: AttachmentsReader = {
    from(table: string) { calls.push(["from", table]); return builder; },
  };
  return { client, calls };
}

test("a path a case document points at is held: its bytes must stay", async () => {
  const { client, calls } = fakeClient({ data: [{ id: 7 }], error: null });
  assert.equal(await storageObjectHeldByCaseDocument(client, "u1/case.pdf"), true);
  assert.deepEqual(calls, [
    ["from", "attachments"],
    ["select", "id"],
    ["eq", "storage_path", "u1/case.pdf"],
    ["not", "request_id", "is", null],
    ["limit", 1],
  ]);
});

test("a path only vault rows use is free to remove", async () => {
  const { client } = fakeClient({ data: [], error: null });
  assert.equal(await storageObjectHeldByCaseDocument(client, "u1/vault.pdf"), false);
});

test("an unreadable answer keeps the bytes (fail safe)", async () => {
  const { client } = fakeClient({ data: null, error: { message: "boom", code: "XX000" } });
  assert.equal(await storageObjectHeldByCaseDocument(client, "u1/x.pdf"), true);
});

test("every service-role removal of a documents object checks it first", () => {
  const read = (p: string) => readFileSync(join(import.meta.dirname, "../../app/api/v1", p), "utf8");
  for (const p of ["documents/[id]/route.ts", "cron/deadlines/route.ts", "lawyer/contracts/[id]/versions/[vid]/route.ts"]) {
    const src = read(p);
    const guard = src.indexOf("storageObjectHeldByCaseDocument(");
    const remove = src.indexOf('.storage.from("documents").remove(');
    assert.ok(guard > 0, `${p}: no case-document check`);
    assert.ok(remove > guard, `${p}: the check must come before the removal`);
  }
});
