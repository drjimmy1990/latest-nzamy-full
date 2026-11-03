/**
 * libraryRunAccess.test.ts — the library half of POST /api/v1/ai/runs (Wave 1
 * task 2 review M1 / M2). Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/libraryRunAccess.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { libraryRunAccess, libraryRunCreated } from "./libraryRunAccess.ts";
import { quotaRefusal, type QuotaRow } from "../library/readQuota.ts";
import type { RouteReply } from "./runCore.ts";

const NOW = Date.parse("2026-11-03T09:00:00Z");
const row = (over: Partial<QuotaRow>): QuotaRow => ({
  status: "ok", usedToday: 0, dayLimit: 50, usedHour: 0, hourLimit: 20, refusedToday: 0,
  lockReference: null, lockedUntil: null, resetsAt: null, ...over,
});

function harness(opts: { gate?: RouteReply | null; lock?: QuotaRow | null } = {}) {
  const calls = { gate: 0, lock: 0 };
  const access = libraryRunAccess({
    gate: async () => {
      calls.gate++;
      return opts.gate ?? null;
    },
    lockRow: async () => {
      calls.lock++;
      return opts.lock === undefined ? row({}) : opts.lock;
    },
    now: () => NOW,
  });
  return { access, calls };
}

test("branch 1: the gate refuses → its own reply, and the lock is never read", async () => {
  const closed: RouteReply = { status: 403, body: { error: "المكتبة مغلقة", code: "library_closed" } };
  for (const tool of ["library-assistant", "quick-answer"]) {
    const { access, calls } = harness({ gate: closed, lock: row({ status: "locked" }) });
    assert.deepEqual(await access(tool), closed, tool);
    assert.deepEqual(calls, { gate: 1, lock: 0 }, tool);
  }
});

test("branch 2: another library tool (it quotes texts, it is not the library's own AI) → null, the lock never read", async () => {
  for (const tool of ["quick-answer", "assistant", "canvas-card", "legal-opinion-consult", "legal-drafter"]) {
    const { access, calls } = harness({ lock: row({ status: "locked", lockReference: "LCK-1" }) });
    assert.equal(await access(tool), null, tool);
    assert.deepEqual(calls, { gate: 1, lock: 0 }, tool);
  }
});

test("branch 3: the library's own AI reads the lock — the proxy's own reply when refused, null when allowed or no decision", async () => {
  const locked = row({ status: "locked", lockReference: "LCK-7" });
  const over = row({ status: "over_daily", resetsAt: "2026-11-04T00:00:00Z" });
  for (const [name, lock] of [["locked", locked], ["over_daily", over]] as const) {
    const { access, calls } = harness({ lock });
    const expected = quotaRefusal(lock, NOW)!;
    assert.deepEqual(await access("library-assistant"), { status: expected.status, body: { ...expected.body } }, name);
    assert.deepEqual(calls, { gate: 1, lock: 1 }, name);
  }
  assert.equal((await harness({ lock: locked }).access("library-assistant"))?.status, 423);
  for (const lock of [row({ status: "ok" }), row({ status: "exempt" }), null]) {
    const { access, calls } = harness({ lock });
    assert.equal(await access("library-assistant"), null, String(lock?.status ?? "no decision"));
    assert.deepEqual(calls, { gate: 1, lock: 1 });
  }
});

test("q362: a lock with an end reaches the library AI's 423 with its lockedUntil (from the server row)", async () => {
  const lock = row({ status: "locked", lockReference: "SEC-9", lockedUntil: "2026-11-04T09:00:00Z" });
  const reply = await harness({ lock }).access("library-assistant");
  assert.equal(reply?.status, 423);
  assert.equal((reply?.body as { lockedUntil?: string }).lockedUntil, "2026-11-04T09:00:00Z");
  assert.match(String((reply?.body as { error?: string }).error), /يُرفع الإيقاف تلقائياً/);
});

test("review M1: the activity tally counts a created run of the library's own AI only", () => {
  let counted = 0;
  const onCreated = libraryRunCreated(() => {
    counted++;
  });
  onCreated("library-assistant");
  assert.equal(counted, 1);
  for (const tool of ["quick-answer", "assistant", "legal-drafter", "echo-fast", ""]) onCreated(tool);
  assert.equal(counted, 1);
});
