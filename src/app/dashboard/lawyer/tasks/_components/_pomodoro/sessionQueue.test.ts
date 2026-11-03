import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  enqueueSession, entriesToSend, markAttempt, markFailed, markSynced, isPermanentFailure,
  parseStoredQueue, mergeSessionLog, queueStorageKey, activeTimerStorageKey,
} from "./sessionQueue.ts";
import type { PomodoroSession } from "./types.ts";

function session(id: string, startedAt = "2026-10-29T09:00:00.000Z"): PomodoroSession {
  return { id, mode: "focus", startedAt, endedAt: startedAt, taskId: null, completed: true, durationMin: 25, noises: [] };
}

test("CODE-F09: a period is queued once per session id", () => {
  let q = enqueueSession([], session("a"), 1);
  q = enqueueSession(q, session("a"), 2);
  assert.equal(q.length, 1);
  assert.equal(q[0].state, "pending");
});

test("CODE-F09: an entry leaves the outbox only when the server confirmed it", () => {
  let q = enqueueSession([], session("a"), 1);
  q = markAttempt(q, "a", 2);
  q = markFailed(q, "a", "network", false, 3);
  assert.equal(q[0].state, "failed");
  assert.equal(q[0].attempts, 1);
  assert.equal(entriesToSend(q, { manual: false }).length, 1); // a network failure is retried
  q = markSynced(q, "a");
  assert.equal(q.length, 0);
});

test("CODE-F09: a validation refusal is not retried automatically, only by hand", () => {
  let q = enqueueSession([], session("a"), 1);
  q = markFailed(q, "a", "400", isPermanentFailure(400), 2);
  assert.equal(entriesToSend(q, { manual: false }).length, 0);
  assert.equal(entriesToSend(q, { manual: true }).length, 1);
  assert.equal(isPermanentFailure(null), false); // offline
  assert.equal(isPermanentFailure(500), false);
  assert.equal(isPermanentFailure(401), false); // signed out — retry once signed back in
  assert.equal(isPermanentFailure(429), false);
});

test("CODE-F09: storage keys are scoped by user id", () => {
  assert.notEqual(queueStorageKey("u1"), queueStorageKey("u2"));
  assert.notEqual(activeTimerStorageKey("u1"), activeTimerStorageKey("u2"));
  assert.match(queueStorageKey("u1"), /u1$/);
});

test("a stored outbox survives a round trip; malformed entries are dropped", () => {
  const q = enqueueSession([], { ...session("a"), taskId: "t-1", taskTitle: "عنوان" }, 1);
  const back = parseStoredQueue(JSON.parse(JSON.stringify([...q, { junk: true }, null])));
  assert.equal(back.length, 1);
  assert.equal(back[0].session.taskId, "t-1");
  assert.equal(parseStoredQueue("nope").length, 0);
});

test("the log shows each period once: queued ones with their state, server rows as they are", () => {
  const server = [session("a", "2026-10-29T08:00:00.000Z"), session("a", "2026-10-29T08:00:00.000Z")];
  let q = enqueueSession([], session("a", "2026-10-29T08:00:00.000Z"), 1); // already on the server
  q = enqueueSession(q, session("b", "2026-10-29T10:00:00.000Z"), 2);
  q = markFailed(q, "b", "x", false, 3);
  const log = mergeSessionLog(server, q);
  assert.deepEqual(log.map(s => s.id), ["b", "a"]);
  assert.equal(log[0].syncState, "failed");
  assert.equal(log[1].syncState, undefined);
});

// Wiring — the panel no longer records a key before the request succeeds.
const PANEL = readFileSync(new URL("../PomodoroPanel.tsx", import.meta.url), "utf8");
const MAPPING = readFileSync(new URL("./sessionMapping.ts", import.meta.url), "utf8");

test("CODE-F09 wiring: no pre-success sync key; the log is merged from the server and the outbox", () => {
  assert.equal(PANEL.includes("syncedKeys"), false);
  assert.match(PANEL, /mergeSessionLog\(/);
  assert.equal(/taskId:\s*null,/.test(MAPPING), false, "sessions link by task id, not title only");
});
