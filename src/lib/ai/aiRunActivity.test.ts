/**
 * aiRunActivity.test.ts — the AI stream of the activity log (S2 D1): only the
 * viewer's own runs, only columns a session may read, and a row that carries
 * nothing beyond what the log shows.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/aiRunActivity.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeDb, has } from "../payments/fakeDb.test-helper.ts";
import { AI_RUN_ACTIVITY_COLUMNS, aiRunActivityItem, readAiRunActivity } from "./aiRunActivity.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const ROW = {
  id: RUN,
  tool: "brief-check",
  status: "succeeded",
  charged_points: 200,
  refunded_at: null,
  created_at: "2026-11-05T10:00:00.000Z",
};

test("the stream asks for the viewer's own rows, newest first, past the cursor", async () => {
  const { client, log } = fakeDb(() => ({ data: [ROW] }));
  const got = await readAiRunActivity(client, "u-1", "2026-11-05T11:00:00.000Z", 30);
  assert.equal(log.length, 1);
  assert.equal(log[0].table, "ai_runs");
  assert.ok(has(log[0], "eq", "user_id", "u-1"), "own rows only");
  assert.ok(has(log[0], "lt", "created_at", "2026-11-05T11:00:00.000Z"), "the cursor applies");
  assert.deepEqual(got, { rows: [ROW], degraded: false });
});

test("no cursor reads the first page", async () => {
  const { client, log } = fakeDb(() => ({ data: [] }));
  await readAiRunActivity(client, "u-1", null, 30);
  assert.equal(log[0].filters.some(([k]) => k === "lt"), false);
});

test("every column it reads is one the owner policy's grant gives a session, and none holds a text", async () => {
  const { client, log } = fakeDb(() => ({ data: [] }));
  await readAiRunActivity(client, "u-1", null, 30);
  assert.equal(log[0].columns, AI_RUN_ACTIVITY_COLUMNS);
  const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "20261027_10_ai_runs.sql"), "utf8");
  const grant = /grant select \(([^)]*)\)\s+on public\.ai_runs to authenticated/.exec(migration);
  assert.ok(grant, "the grant is where this test expects it");
  const granted = new Set(grant![1].split(",").map((c) => c.trim()));
  const read = AI_RUN_ACTIVITY_COLUMNS.split(",").map((c) => c.trim());
  for (const c of read) assert.ok(granted.has(c), `${c} is granted to a session`);
  for (const c of ["input", "output", "citations", "error_message", "idempotency_key", "source_ids", "usage", "file_ids"]) {
    assert.ok(!read.includes(c), `${c} stays out of the log`);
  }
});

test("a missing table is an empty stream, not a degraded feed; any other error degrades it", async () => {
  for (const code of ["42P01", "PGRST205"]) {
    const { client } = fakeDb(() => ({ error: { code, message: "missing" } }));
    assert.deepEqual(await readAiRunActivity(client, "u-1", null, 30), { rows: [], degraded: false }, code);
  }
  const original = console.error;
  console.error = () => {};
  try {
    const { client } = fakeDb(() => ({ error: { code: "XX000", message: "down" } }));
    assert.deepEqual(await readAiRunActivity(client, "u-1", null, 30), { rows: [], degraded: true });
  } finally {
    console.error = original;
  }
});

test("a row opens /ai/runs/<id>, belongs to no order, and carries only the log's fields", () => {
  const item = aiRunActivityItem({ ...ROW, input: { q: "SECRET" }, output: { a: "SECRET" } } as never);
  assert.deepEqual(item, {
    id: `ai:${RUN}`,
    badge: "ai",
    title: "«مراجعة وتدقيق مذكرة»",
    description: "اكتملت — خُصم ٢٠٠ نقطة",
    requestId: null,
    requestHref: `/ai/runs/${RUN}`,
    requestTitle: null,
    serviceTitleAr: null,
    createdAt: ROW.created_at,
  });
  assert.ok(!JSON.stringify(item).includes("SECRET"));
});

test("a refunded failure reads as refunded", () => {
  const item = aiRunActivityItem({ ...ROW, status: "failed", refunded_at: "2026-11-05T10:01:00.000Z" });
  assert.equal(item.description, "تعذّرت وأُعيدت النقاط");
});

test("the route reads the stream through the session's client (RLS) and folds it into degraded and nextCursor", () => {
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "v1", "lawyer", "activity", "route.ts"), "utf8");
  assert.doesNotMatch(route, /createServiceClient/, "never the service client");
  assert.match(route, /readAiRunActivity\(supabase, uid, before, PAGE_SIZE\)/);
  assert.match(route, /const degraded = [^;]*aiRes\.degraded/);
  assert.match(route, /aiRes\.rows\.length === PAGE_SIZE/);
});

test("the activity page keeps AI rows out of the order cards and drops the stale claim", () => {
  const page = readFileSync(join(process.cwd(), "src", "app", "dashboard", "lawyer", "activity", "page.tsx"), "utf8");
  assert.match(page, /if \(act\.type === "ai"\) return false;/);
  assert.doesNotMatch(page, /AI tool usage\s*\r?\n?\/?\/?\s*isn't recorded/);
});
