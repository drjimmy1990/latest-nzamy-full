/**
 * progressRead.test.ts — reading a run's progress (S2 E5): by id through the
 * session's RLS client, by idempotency key through the service client, and in
 * both only the viewer's own run and only the id, kind and label of its events.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/progressRead.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fakeDb, has, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { parseAfter, parseProgressKey, readProgressById, readProgressByKey } from "./progressRead.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const EVENTS = [
  { id: 3, kind: "query", label: "أجر العامل" },
  { id: 4, kind: "law", label: "نظام العمل — المادة ٧٧" },
];

function db(run: unknown, events: { data?: unknown; error?: { code: string; message: string } } = { data: EVENTS }) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "ai_runs") return { data: run };
    if (q.table === "progress_events") return events;
    return {};
  });
}
const query = (log: FakeQuery[], table: string) => log.find((q) => q.table === table)!;

test("parseAfter: a non-negative safe integer, else 0", () => {
  assert.equal(parseAfter("12"), 12);
  assert.equal(parseAfter("0"), 0);
  assert.equal(parseAfter("-1"), 0);
  assert.equal(parseAfter("abc"), 0);
  assert.equal(parseAfter("1.5"), 0);
  assert.equal(parseAfter(""), 0);
  assert.equal(parseAfter(null), 0);
  assert.equal(parseAfter("9007199254740993"), 0);
});

test("parseProgressKey: the same shape as an idempotency key", () => {
  assert.equal(parseProgressKey("short"), null);
  assert.equal(parseProgressKey(null), null);
  assert.equal(parseProgressKey("abcDEF12_-"), "abcDEF12_-");
  assert.equal(parseProgressKey("x".repeat(100)), "x".repeat(100));
  assert.equal(parseProgressKey("x".repeat(101)), null);
  assert.equal(parseProgressKey("abc def 12"), null);
  assert.equal(parseProgressKey("abcdefgh,user_id.eq.x"), null);
});

test("by id: the run is read as the viewer's own, and events are read past the cursor in order", async () => {
  const { client, log } = db({ id: RUN, status: "running", progress_step: "drafting" });
  const r = await readProgressById(client, "u-1", RUN, 2);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { status: "running", step: "drafting", events: EVENTS, final: false });
  const run = query(log, "ai_runs");
  assert.equal(run.columns, "id, status, progress_step");
  assert.ok(has(run, "eq", "id", RUN));
  assert.ok(has(run, "eq", "user_id", "u-1"));
  const ev = query(log, "progress_events");
  assert.equal(ev.columns, "id, kind, label");
  assert.ok(has(ev, "eq", "run_id", RUN));
  assert.ok(has(ev, "gt", "id", 2));
});

test("by id: the session read never filters on user_id, a column a session may not read (RLS holds it)", async () => {
  const { client, log } = db({ id: RUN, status: "running", progress_step: null });
  await readProgressById(client, "u-1", RUN, 0);
  assert.equal(has(query(log, "progress_events"), "eq", "user_id"), false);
});

test("by id: someone else's run or no run is a 404 and reads no events", async () => {
  const { client, log } = db(null);
  const r = await readProgressById(client, "u-1", RUN, 0);
  assert.equal(r.status, 404);
  assert.equal(log.some((q) => q.table === "progress_events"), false);
});

test("by id: a run that left `running` is final, whatever it ended as", async () => {
  for (const status of ["succeeded", "failed", "review"]) {
    const { client } = db({ id: RUN, status, progress_step: null }, { data: [] });
    const r = await readProgressById(client, "u-1", RUN, 0);
    assert.deepEqual(r.body, { status, step: null, events: [], final: true }, status);
  }
});

test("by id: a run read failure is a 503, never a 404 that would end the poll", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const { client } = fakeDb(() => ({ error: { code: "XX000", message: "down" } }));
    assert.equal((await readProgressById(client, "u-1", RUN, 0)).status, 503);
  } finally {
    console.error = original;
  }
});

test("a missing table (before 20261103_31) and a failed events read both give no events, and the run's status still comes back", async () => {
  const original = console.error;
  const lines: unknown[][] = [];
  console.error = (...a: unknown[]) => void lines.push(a);
  try {
    for (const code of ["42P01", "PGRST205", "XX000"]) {
      const { client } = db({ id: RUN, status: "failed", progress_step: null }, { error: { code, message: "SECRET" } });
      const r = await readProgressById(client, "u-1", RUN, 0);
      assert.deepEqual(r, { status: 200, body: { status: "failed", step: null, events: [], final: true } }, code);
    }
  } finally {
    console.error = original;
  }
  assert.equal(lines.length, 1, "only the real failure is logged");
  assert.ok(!JSON.stringify(lines).includes("SECRET"));
});

test("a read never hands back a column it did not ask for", async () => {
  const { client } = db(
    { id: RUN, status: "running", progress_step: null },
    { data: [{ id: 1, kind: "law", label: "x", user_id: "other", run_id: RUN, created_at: "t" }] },
  );
  const r = await readProgressById(client, "u-1", RUN, 0);
  assert.deepEqual(r.body.events, [{ id: 1, kind: "law", label: "x" }]);
});

test("by key: both queries are the session user's, so another user's key finds nothing", async () => {
  const { client, log } = db({ id: RUN, status: "running", progress_step: "reading" });
  const r = await readProgressByKey(client, "u-1", "key-abcdef01", 4);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { runId: RUN, status: "running", step: "reading", events: EVENTS, final: false });
  const run = query(log, "ai_runs");
  assert.ok(has(run, "eq", "user_id", "u-1"));
  assert.ok(has(run, "eq", "idempotency_key", "key-abcdef01"));
  assert.equal(run.columns, "id, status, progress_step");
  const ev = query(log, "progress_events");
  assert.ok(has(ev, "eq", "run_id", RUN));
  assert.ok(has(ev, "eq", "user_id", "u-1"));
  assert.ok(has(ev, "gt", "id", 4));
});

test("by key: no such run yet is not a 404, because the POST may not have created it", async () => {
  const { client, log } = db(null);
  const r = await readProgressByKey(client, "u-1", "key-abcdef01", 0);
  assert.deepEqual(r, { status: 200, body: { runId: null, status: null, events: [] } });
  assert.equal(log.some((q) => q.table === "progress_events"), false);
});

function routeSource(...segs: string[]): string {
  const p = join(process.cwd(), "src", "app", "api", "v1", "ai", "runs", ...segs, "route.ts");
  assert.ok(existsSync(p), p);
  return readFileSync(p, "utf8");
}

test("the by-id route reads through the session's RLS client, never the service client", () => {
  const src = routeSource("[id]", "events");
  assert.doesNotMatch(src, /createServiceClient/);
  assert.match(src, /requireApiUser\(/);
  assert.match(src, /readProgressById\(supabase, auth\.user\.id, id, /);
  assert.match(src, /private, no-store/);
  assert.match(src, /force-dynamic/);
  assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/);
});

test("the by-key route signs the user in first and takes the user from the session, never the request", () => {
  const src = routeSource("progress");
  const signedIn = src.indexOf("requireApiUser(");
  const service = src.indexOf("createServiceClient()");
  assert.ok(signedIn > 0 && service > signedIn, "no service client before the session check");
  assert.match(src, /readProgressByKey\(admin, auth\.user\.id, key, /);
  assert.doesNotMatch(src, /searchParams\.get\("user/);
  assert.match(src, /private, no-store/);
  assert.match(src, /force-dynamic/);
  assert.doesNotMatch(src, /export async function (POST|PUT|PATCH|DELETE)/);
});
