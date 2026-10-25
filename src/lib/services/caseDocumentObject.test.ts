import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { storageObjectHeldByAnotherRow, storageObjectHeldByCaseDocument, type AttachmentsReader } from "./caseDocumentObject.ts";

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

// ── storageObjectHeldByAnotherRow (final review, item 1) ────────────────────

function fakeRows(rows: Record<string, Array<{ id: string | number; storage_path: string }>>, failOn?: string) {
  const calls: string[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        let path = "";
        let not: unknown = undefined;
        const run = () => {
          calls.push(`${table}:${path}:${String(not)}`);
          if (failOn === table) return Promise.resolve({ data: null, error: { message: "boom", code: "XX000" } });
          const hit = (rows[table] ?? []).filter((r) => r.storage_path === path && String(r.id) !== String(not));
          return Promise.resolve({ data: hit.slice(0, 1).map((r) => ({ id: r.id })), error: null });
        };
        const builder = {
          select() { return builder; },
          eq(_c: string, v: string) { path = v; return builder; },
          neq(_c: string, v: unknown) { not = v; return builder; },
          limit() { return run(); },
        };
        return builder;
      },
    },
  };
}

const MEMBER_FILE = "a0000000-0000-0000-0000-0000000000a1/contracts/c1/1-v.pdf";

test("a purged vault copy keeps its bytes while a live contract version names the same path (70 moved the copy to the owner)", async () => {
  const { client } = fakeRows({
    attachments: [{ id: 900, storage_path: MEMBER_FILE }],
    contract_versions: [{ id: "cv1", storage_path: MEMBER_FILE }],
  });
  assert.equal(await storageObjectHeldByAnotherRow(client, MEMBER_FILE, { table: "attachments", id: 900 }), true);
});

test("a deleted contract version keeps its bytes while a vault row names the same path", async () => {
  // The version row is already gone when the route asks.
  const { client } = fakeRows({ attachments: [{ id: 901, storage_path: MEMBER_FILE }], contract_versions: [] });
  assert.equal(await storageObjectHeldByAnotherRow(client, MEMBER_FILE, { table: "contract_versions", id: "cv1" }), true);
});

test("the row itself does not hold its own path; a path no other row names is free to remove", async () => {
  const { client, calls } = fakeRows({ attachments: [{ id: 900, storage_path: MEMBER_FILE }], contract_versions: [] });
  assert.equal(await storageObjectHeldByAnotherRow(client, MEMBER_FILE, { table: "attachments", id: 900 }), false);
  assert.deepEqual(calls, [`attachments:${MEMBER_FILE}:900`, `contract_versions:${MEMBER_FILE}:undefined`]);
});

test("an unreadable other-row answer keeps the bytes (fail safe)", async () => {
  const { client } = fakeRows({}, "contract_versions");
  assert.equal(await storageObjectHeldByAnotherRow(client, MEMBER_FILE, { table: "attachments", id: 1 }), true);
});

test("the three delete paths ask whether another row holds the path before removing it", () => {
  const read = (p: string) => readFileSync(join(import.meta.dirname, "../../app/api/v1", p), "utf8");
  for (const [p, self] of [
    ["documents/[id]/route.ts", '{ table: "attachments", id }'],
    ["cron/deadlines/route.ts", '{ table: "attachments", id: row.id }'],
    ["lawyer/contracts/[id]/versions/[vid]/route.ts", '{ table: "contract_versions", id: vid }'],
  ] as const) {
    const src = read(p);
    const at = src.indexOf(`storageObjectHeldByAnotherRow(`);
    assert.ok(at > 0, `${p}: no other-row check`);
    assert.ok(src.includes(self), `${p}: excludes the row itself as ${self}`);
    assert.ok(src.indexOf('.storage.from("documents").remove(') > at, `${p}: the check comes before the removal`);
  }
});
