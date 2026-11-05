/**
 * aiSweep.test.ts — the AI runs' clean-up cron (20261027_10, 20261103_31): the
 * daily retention task also prunes progress events, and a function that is not
 * there yet is skipped, never a 500.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/aiSweep.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { runAiSweep } from "./aiSweep.ts";

const rpcs = (log: FakeQuery[]) => log.map((q) => q.table);

test("the default task sweeps, and never prunes", async () => {
  const { client, log } = fakeDb(() => ({ data: 2 }));
  const r = await runAiSweep(client, false);
  assert.deepEqual(rpcs(log), ["ai_sweep_runs"]);
  assert.deepEqual(r, { status: 200, body: { ok: true, task: "sweep", count: 2 } });
});

test("retention also prunes progress events", async () => {
  const { client, log } = fakeDb((q) => ({ data: q.table === "ai_runs_retention" ? 3 : 7 }));
  const r = await runAiSweep(client, true);
  assert.deepEqual(rpcs(log), ["ai_runs_retention", "progress_events_prune"]);
  assert.deepEqual(r, { status: 200, body: { ok: true, task: "retention", count: 3, pruned: 7 } });
});

test("a prune function not there yet (before 20261103_31) is skipped, never a 500", async () => {
  for (const code of ["42883", "PGRST202"]) {
    const { client } = fakeDb((q) => (q.table === "progress_events_prune" ? { error: { code, message: "missing" } } : { data: 3 }));
    const r = await runAiSweep(client, true);
    assert.deepEqual(r, { status: 200, body: { ok: true, task: "retention", count: 3, pruned: 0 } }, code);
  }
});

test("a retention function not there yet stops as schema_missing and prunes nothing", async () => {
  const { client, log } = fakeDb(() => ({ error: { code: "PGRST202", message: "missing" } }));
  const r = await runAiSweep(client, true);
  assert.deepEqual(rpcs(log), ["ai_runs_retention"]);
  assert.deepEqual(r, { status: 200, body: { ok: true, skipped: "schema_missing" } });
});

test("a real failure of either function is a 500 the scheduler sees", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    {
      const { client } = fakeDb(() => ({ error: { code: "XX000", message: "down" } }));
      const r = await runAiSweep(client, false);
      assert.equal(r.status, 500);
      assert.equal(r.body.error, "ai_sweep_runs failed");
    }
    {
      const { client } = fakeDb((q) => (q.table === "progress_events_prune" ? { error: { code: "XX000", message: "down" } } : { data: 1 }));
      const r = await runAiSweep(client, true);
      assert.equal(r.status, 500);
      assert.equal(r.body.error, "progress_events_prune failed");
    }
  } finally {
    console.error = original;
  }
});
