/**
 * CODE-F24 — the case board's autosave controller. A fake clock and a
 * scripted `send` stand in for timers and the network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  GraphAutosave,
  GraphSaveError,
  RETRY_DELAYS_MS,
  canonicalJson,
  kindForStatus,
  type AutosaveStatus,
} from "./caseGraphAutosave.ts";

type Outcome = "ok" | "net" | "conflict" | "fatal";

function harness(outcomes: Outcome[] = []) {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextId = 1;
  const sent: string[] = [];
  const statuses: AutosaveStatus[] = [];
  let draft: string | null = null;
  const queue = [...outcomes];
  const ctl = new GraphAutosave<string>({
    send: async (p) => {
      sent.push(p);
      const o = queue.shift() ?? "ok";
      if (o === "net") throw new TypeError("Failed to fetch");
      if (o === "conflict") throw new GraphSaveError("changed", "conflict");
      if (o === "fatal") throw new GraphSaveError("demo", "fatal");
    },
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearTimer: (h) => { timers.delete(h as number); },
    onStatus: (s) => { statuses.push(s); },
    draft: { write: (p) => { draft = p; }, clear: () => { draft = null; } },
  });
  /** Fire every armed timer once (the debounce / the next retry). */
  const tick = async () => {
    const due = [...timers.entries()];
    timers.clear();
    for (const [, t] of due) t.fn();
    await new Promise((r) => setImmediate(r));
  };
  return { ctl, sent, statuses, timers, tick, draft: () => draft };
}

test("a change is debounced, sent once, and clean only after the server confirms it", async () => {
  const h = harness(["ok"]);
  h.ctl.change("a");
  h.ctl.change("b");
  assert.equal(h.sent.length, 0, "nothing before the debounce");
  assert.equal(h.ctl.dirty, true);
  await h.tick();
  assert.deepEqual(h.sent, ["b"]);
  assert.equal(h.ctl.dirty, false);
  assert.equal(h.draft(), null, "draft cleared once confirmed");
  assert.equal(h.statuses.at(-1), "saved");
});

test("a failed save keeps the change, keeps the draft, and retries on its own with a backoff", async () => {
  const h = harness(["net", "net", "ok"]);
  h.ctl.change("x");
  await h.tick();
  assert.equal(h.ctl.dirty, true, "the failure did not forget the change");
  assert.equal(h.draft(), "x");
  assert.equal(h.statuses.at(-1), "retrying");
  assert.equal([...h.timers.values()][0].ms, RETRY_DELAYS_MS[0]);
  await h.tick();
  assert.equal([...h.timers.values()][0].ms, RETRY_DELAYS_MS[1], "backs off");
  await h.tick();
  assert.deepEqual(h.sent, ["x", "x", "x"]);
  assert.equal(h.ctl.dirty, false);
  assert.equal(h.draft(), null);
});

test("an older confirmation never clears a newer change", async () => {
  let release!: () => void;
  const statuses: AutosaveStatus[] = [];
  const sent: string[] = [];
  const timers: Array<() => void> = [];
  const ctl = new GraphAutosave<string>({
    send: (p) => { sent.push(p); return sent.length === 1 ? new Promise<void>((r) => { release = r; }) : Promise.resolve(); },
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => {},
    onStatus: (s) => statuses.push(s),
  });
  ctl.change("v1");
  timers.shift()!();                 // debounce fires → v1 in flight
  ctl.change("v2");                  // newer change while v1 is in flight
  timers.shift()!();                 // its debounce fires, but a send is running
  release();                         // v1 confirmed
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent, ["v1", "v2"], "v2 went out after v1's confirmation");
  assert.equal(ctl.dirty, false);
});

test("a conflict stops the loop; keep-mine resumes, load-saved discards", async () => {
  const h = harness(["conflict", "ok"]);
  h.ctl.change("mine");
  await h.tick();
  assert.equal(h.statuses.at(-1), "conflict");
  assert.equal(h.timers.size, 0, "no retry on a conflict");
  h.ctl.change("mine2");
  assert.equal(h.timers.size, 0, "still stopped — kept as a draft only");
  assert.equal(h.draft(), "mine2");
  h.ctl.resume();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(h.sent, ["mine", "mine2"]);
  assert.equal(h.ctl.dirty, false);

  const d = harness(["conflict"]);
  d.ctl.change("mine");
  await d.tick();
  d.ctl.discard();
  assert.equal(d.ctl.dirty, false);
  assert.equal(d.draft(), null);
});

test("a refusal (demo mode, no permission) does not loop", async () => {
  const h = harness(["fatal"]);
  h.ctl.change("x");
  await h.tick();
  assert.equal(h.statuses.at(-1), "error");
  assert.equal(h.timers.size, 0);
  assert.equal(h.sent.length, 1);
  assert.equal(h.ctl.stoppedBy, "fatal");
});

test("leaving the board sends what is unconfirmed — in the debounce or waiting to retry", async () => {
  const inDebounce = harness(["ok"]);
  inDebounce.ctl.change("late");
  await inDebounce.ctl.dispose();
  assert.deepEqual(inDebounce.sent, ["late"]);
  assert.equal(inDebounce.draft(), null);
  assert.equal(inDebounce.timers.size, 0);

  const afterFailure = harness(["net", "ok"]);
  afterFailure.ctl.change("failed-once");
  await afterFailure.tick();
  assert.equal(afterFailure.ctl.dirty, true);
  await afterFailure.ctl.dispose();
  assert.deepEqual(afterFailure.sent, ["failed-once", "failed-once"], "the old code dropped this one");
  assert.equal(afterFailure.timers.size, 0, "no retry timer outlives the board");

  const failsAgain = harness(["net", "net"]);
  failsAgain.ctl.change("offline");
  await failsAgain.tick();
  await failsAgain.ctl.dispose();
  assert.equal(failsAgain.draft(), "offline", "the draft keeps it for the next visit");
});

test("nothing is sent on leave after a conflict, and a clean board sends nothing", async () => {
  const h = harness(["conflict"]);
  h.ctl.change("x");
  await h.tick();
  await h.ctl.dispose();
  assert.equal(h.sent.length, 1);
  assert.equal(h.draft(), "x");

  const clean = harness();
  await clean.ctl.dispose();
  assert.equal(clean.sent.length, 0);
});

test("status → kind", () => {
  assert.equal(kindForStatus(409), "conflict");
  for (const s of [500, 502, 503, 429, 408]) assert.equal(kindForStatus(s), "retryable", String(s));
  for (const s of [400, 401, 403, 404]) assert.equal(kindForStatus(s), "fatal", String(s));
});

test("canonicalJson ignores key order (jsonb reorders keys)", () => {
  assert.equal(
    canonicalJson({ nodes: [{ id: "a", x: 1 }], viewport: { scale: 1, pan: { y: 2, x: 1 } } }),
    canonicalJson({ viewport: { pan: { x: 1, y: 2 }, scale: 1 }, nodes: [{ x: 1, id: "a" }] }),
  );
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]));
});
