/**
 * aiRunClient.test.ts — the machine behind useAiRun: what the waiting screen is
 * told, and that nothing keeps polling once it is over. Timers and fetch are
 * injected, so a pending timer is something this file can count.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/aiRunClient.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createAiRunClient, IDLE_RUN, type AiRunState } from "./aiRunClient.ts";
import { RUN_ERROR_AR, RUN_STILL_RUNNING_AR, RUN_SESSION_LOST_AR } from "./runErrors.ts";
import { FOUNDER_CREDIT_REFUNDED_FAILURE } from "../membership/founderPlan.ts";

const RUN_ID = "0b6d0c4e-1111-4222-8333-444455556666";
const KEY = "key-0123456789";
const PROGRESS = `/api/v1/ai/runs/progress?key=${KEY}`;
const EVENTS = `/api/v1/ai/runs/${RUN_ID}/events`;
const ONE = `/api/v1/ai/runs/${RUN_ID}`;

type Reply = Response | Promise<Response>;
type Handler = (url: string, init?: RequestInit) => Reply;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Rejected from the start, and marked handled so a queued one cannot fail the test by itself. */
const offline = (): Promise<Response> => {
  const p = Promise.reject<Response>(new Error("offline"));
  p.catch(() => {});
  return p;
};

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r));
};

function harness(handler: Handler) {
  let clock = 1_000_000;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void; ms: number }>();
  const calls: { url: string; method: string }[] = [];
  const states: AiRunState[] = [];
  const delays: number[] = [];
  const client = createAiRunClient({
    onChange: (s) => states.push(s),
    fetch: ((input: string, init?: RequestInit) => {
      calls.push({ url: input, method: init?.method ?? "GET" });
      return Promise.resolve(handler(input, init));
    }) as unknown as typeof fetch,
    setTimeout: ((fn: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { at: clock + ms, fn, ms });
      delays.push(ms);
      return id;
    }) as never,
    clearTimeout: ((id: number) => {
      timers.delete(id);
    }) as never,
    now: () => clock,
    newKey: () => KEY,
  });
  return {
    client,
    calls,
    states,
    delays,
    pending: () => timers.size,
    last: () => states[states.length - 1] ?? IDLE_RUN,
    /** Moves the clock, running every timer that falls due, in order. */
    advance: async (ms: number) => {
      const end = clock + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        clock = due[1].at;
        due[1].fn();
        await settle();
      }
      clock = end;
    },
  };
}

const started = { runId: RUN_ID, chargedPoints: 250 };
const ev = (id: number, kind = "note", label = `e${id}`) => ({ id, kind, label });
const running = (events: unknown[] = [], step: string | null = null) => json({ status: "running", step, events, final: false });
const finalEvents = (status: string, events: unknown[] = []) => json({ status, step: null, events, final: true });

/** A job that was accepted with a 202; `poll` answers everything after it. */
function acceptedJob(poll: Handler, post: Reply = json(started, 202)) {
  return harness((url, init) => (init?.method === "POST" ? post : poll(url, init)));
}

function assertOver(h: ReturnType<typeof harness>) {
  assert.equal(h.pending(), 0, "no timer may outlive the run");
}

// ── Fast tool: the POST carries the answer; the key poll shows progress ─────

test("a fast tool: progress by key every 1500 ms, the cursor advances, the answer ends it with no timer left", async () => {
  const post = deferred<Response>();
  const seen: string[] = [];
  const h = harness((url, init) => {
    if (init?.method === "POST") return post.promise;
    seen.push(url);
    return json({ runId: RUN_ID, status: "running", step: null, events: seen.length === 1 ? [ev(1, "query", "مدة"), ev(2, "law", "المادة ٥")] : [], final: false });
  });
  const run = h.client.start("quick-answer", { q: "x" });
  await settle();
  assert.equal(h.last().phase, "starting");
  assert.equal(typeof h.last().startedAt, "number");
  assert.deepEqual(h.last().events, []);
  assert.equal(h.pending(), 1);
  assert.equal(h.delays[0], 1500);

  await h.advance(1500);
  assert.deepEqual(h.last().events.map((e) => e.id), [1, 2]);
  await h.advance(1500);
  assert.deepEqual(seen, [`${PROGRESS}&after=0`, `${PROGRESS}&after=2`]);
  assert.equal(h.last().phase, "starting", "a poll never ends a run the POST is still answering");

  post.resolve(json({ runId: RUN_ID, chargedPoints: 5, output: { answer: "ج" }, citations: [] }));
  await run;
  assert.equal(h.last().phase, "done");
  assert.deepEqual(h.last().output, { answer: "ج" });
  assertOver(h);
  const before = h.calls.length;
  await h.advance(60_000);
  assert.equal(h.calls.length, before, "no poll after the answer");
});

test("a poll still in flight when the answer lands changes nothing and schedules nothing", async () => {
  const post = deferred<Response>();
  const poll = deferred<Response>();
  const h = harness((_url, init) => (init?.method === "POST" ? post.promise : poll.promise));
  const run = h.client.start("quick-answer", {});
  await settle();
  await h.advance(1500);
  post.resolve(json({ output: { answer: "ج" } }));
  await run;
  const count = h.states.length;
  poll.resolve(json({ runId: RUN_ID, status: "running", events: [ev(9)], final: false }));
  await settle();
  assert.equal(h.states.length, count);
  assert.deepEqual(h.last().events, []);
  assertOver(h);
});

test("the key poll's failures and 429s leave the screen alone: the POST is the real answer", async () => {
  const post = deferred<Response>();
  const replies: Reply[] = [
    json({ error: "طلبات كثيرة — حاول بعد قليل." }, 429, { "Retry-After": "7" }),
    json({ error: "x" }, 503),
    offline(),
    json({ runId: RUN_ID, status: "running", events: [ev(1)], final: false }),
  ];
  const h = harness((_url, init) => (init?.method === "POST" ? post.promise : replies.shift()!));
  const run = h.client.start("quick-answer", {});
  await settle();
  await h.advance(1500);
  assert.equal(h.last().phase, "starting");
  assert.equal(h.last().error, null);
  assert.equal(h.delays[h.delays.length - 1], 7000, "a 429's Retry-After is honoured");
  await h.advance(7000);
  await h.advance(1500);
  assert.equal(h.last().phase, "starting");
  assert.equal(h.last().stale, false);
  await h.advance(1500);
  assert.deepEqual(h.last().events.map((e) => e.id), [1]);
  post.resolve(json({ error: "تعذّر" }, 502));
  await run;
  assert.equal(h.last().phase, "error");
  assert.equal(h.last().error, "تعذّر");
  assertOver(h);
});

test("the key poll stops once the run is final, while the POST is still answering", async () => {
  const post = deferred<Response>();
  const h = harness((_url, init) =>
    init?.method === "POST" ? post.promise : json({ runId: RUN_ID, status: "succeeded", events: [ev(3)], final: true }),
  );
  const run = h.client.start("quick-answer", {});
  await settle();
  await h.advance(1500);
  assert.equal(h.pending(), 0);
  post.resolve(json({ output: { answer: "ج" } }));
  await run;
  assert.equal(h.last().phase, "done");
  assertOver(h);
});

// ── Job: a 202, then the run's events ───────────────────────────────────────

test("a 202 carries the progress already seen, and the job poll continues from it every 3000 ms", async () => {
  const post = deferred<Response>();
  const urls: string[] = [];
  const h = harness((url, init) => {
    if (init?.method === "POST") return post.promise;
    urls.push(url);
    if (url.startsWith("/api/v1/ai/runs/progress")) return json({ runId: RUN_ID, status: "running", events: [ev(4, "file", "a.pdf")], final: false });
    return running([ev(5, "query", "س")], "reading");
  });
  const run = h.client.start("wargaming", {});
  await settle();
  const startedAt = h.last().startedAt;
  await h.advance(1500);
  post.resolve(json(started, 202));
  await run;
  assert.equal(h.last().phase, "running");
  assert.equal(h.last().runId, RUN_ID);
  assert.equal(h.last().chargedPoints, 250);
  assert.equal(h.last().startedAt, startedAt, "the clock keeps counting from the press");
  assert.deepEqual(h.last().events.map((e) => e.id), [4]);
  assert.equal(h.pending(), 1, "only the job poll");
  assert.equal(h.delays[h.delays.length - 1], 3000);

  await h.advance(3000);
  assert.equal(urls[urls.length - 1], `${EVENTS}?after=4`);
  assert.deepEqual(h.last().events.map((e) => e.id), [4, 5]);
  assert.equal(h.last().step, "reading");
  h.client.stop();
});

test("final succeeded: one read of the run for its output, then nothing", async () => {
  const urls: string[] = [];
  const h = acceptedJob((url) => {
    urls.push(url);
    if (url === ONE) return json({ run: { status: "succeeded", output: { a: 1 }, citations: [{ id: "S1" }], charged_points: 200 } });
    return finalEvents("succeeded", [ev(1, "verify", "تحقق")]);
  });
  await h.client.start("wargaming", {});
  await h.advance(3000);
  assert.deepEqual(urls, [`${EVENTS}?after=0`, ONE]);
  assert.equal(h.last().phase, "done");
  assert.deepEqual(h.last().output, { a: 1 });
  assert.deepEqual(h.last().citations, [{ id: "S1" }]);
  assert.equal(h.last().chargedPoints, 200);
  assert.deepEqual(h.last().events.map((e) => e.id), [1]);
  assertOver(h);
  await h.advance(60_000);
  assert.equal(urls.length, 2);
});

test("final failed and refunded: the specific sentence with its refund wording", async () => {
  const h = acceptedJob((url) =>
    url === ONE
      ? json({ run: { status: "failed", error_code: "no_sources", refunded_at: "2026-11-05T00:00:00Z" } })
      : finalEvents("failed"),
  );
  await h.client.start("legal-opinion-consult", {});
  await h.advance(3000);
  assert.equal(h.last().phase, "error");
  assert.equal(h.last().code, "no_sources");
  assert.equal(h.last().error, RUN_ERROR_AR.no_sources);
  assert.match(h.last().error!, /أُعيدت نقاطك/);
  assertOver(h);
});

test("final failed with no refund: no refund is claimed, whatever the code", async () => {
  for (const code of ["no_sources", "timeout", "model_error"]) {
    const h = acceptedJob((url) => (url === ONE ? json({ run: { status: "failed", error_code: code, refunded_at: null } }) : finalEvents("failed")));
    await h.client.start("wargaming", {});
    await h.advance(3000);
    assert.equal(h.last().error, "تعذّر إكمال الطلب", code);
    assert.doesNotMatch(h.last().error!, /أُعيد/, code);
    assertOver(h);
  }
});

test("final failed on a credit run: the credit came back, never «أُعيدت نقاطك» (R20)", async () => {
  const h = acceptedJob(
    (url) => (url === ONE ? json({ run: { status: "failed", error_code: "no_sources", refunded_at: null } }) : finalEvents("failed")),
    json({ runId: RUN_ID, chargedPoints: 0, creditUsed: true }, 202),
  );
  await h.client.start("wargaming", {}, { useCredit: true });
  await h.advance(3000);
  assert.equal(h.last().error, FOUNDER_CREDIT_REFUNDED_FAILURE);
  assertOver(h);
});

test("a legacy review run: the review phase, no output, and polling ends (R30)", async () => {
  const h = acceptedJob((url) => (url === ONE ? json({ run: { status: "review", output: null } }) : finalEvents("review")));
  await h.client.start("wargaming", {});
  await h.advance(3000);
  assert.equal(h.last().phase, "review");
  assert.equal(h.last().output, null);
  assert.equal(h.last().error, null);
  assertOver(h);
});

test("zero events all the way: the screen stays running with an empty list, then finishes", async () => {
  let polls = 0;
  const h = acceptedJob((url) => {
    if (url === ONE) return json({ run: { status: "succeeded", output: { a: 1 } } });
    return ++polls < 3 ? running() : finalEvents("succeeded");
  });
  await h.client.start("wargaming", {});
  await h.advance(6000);
  assert.equal(h.last().phase, "running");
  assert.deepEqual(h.last().events, []);
  assert.equal(h.last().step, null);
  assert.equal(h.last().stale, false);
  assert.equal(h.last().error, null);
  await h.advance(3000);
  assert.equal(h.last().phase, "done");
  assertOver(h);
});

// ── Honest while the poll is failing ────────────────────────────────────────

test("a failed poll (network, 503, or no JSON) keeps the run going, says so quietly, and recovers", async () => {
  const replies: Reply[] = [offline(), json({ error: "x" }, 503), new Response("<html>", { status: 502 }), running([ev(1)])];
  const h = acceptedJob(() => replies.shift()!);
  await h.client.start("wargaming", {});
  for (let i = 0; i < 3; i++) {
    await h.advance(3000);
    assert.equal(h.last().phase, "running", `failure ${i}`);
    assert.equal(h.last().error, null);
    assert.equal(h.last().stale, true);
    assert.equal(h.pending(), 1, "it keeps polling");
  }
  await h.advance(3000);
  assert.equal(h.last().stale, false);
  assert.deepEqual(h.last().events.map((e) => e.id), [1]);
  h.client.stop();
  assertOver(h);
});

test("a 429 on the job poll is not an error state: same phase, no message, waits as told", async () => {
  const replies: Reply[] = [json({ error: "طلبات كثيرة — حاول بعد قليل." }, 429, { "Retry-After": "20" }), running([ev(1)])];
  const h = acceptedJob(() => replies.shift()!);
  await h.client.start("wargaming", {});
  await h.advance(3000);
  assert.equal(h.last().phase, "running");
  assert.equal(h.last().error, null);
  assert.equal(h.last().stale, false, "a 429 shows nothing at all");
  assert.equal(h.pending(), 1);
  assert.equal(h.delays[h.delays.length - 1], 20_000);
  await h.advance(20_000);
  assert.deepEqual(h.last().events.map((e) => e.id), [1]);
  h.client.stop();
});

test("a Retry-After that is huge or nonsense never freezes the poll", async () => {
  for (const [header, expected] of [["99999", 30_000], ["soon", 3000]] as const) {
    const replies: Reply[] = [json({ error: "x" }, 429, { "Retry-After": header })];
    const h = acceptedJob(() => replies.shift() ?? running());
    await h.client.start("wargaming", {});
    await h.advance(3000);
    assert.equal(h.delays[h.delays.length - 1], expected, header);
    h.client.stop();
  }
});

test("a failed read of the finished run is retried: never «حاول مرة أخرى» after a charge", async () => {
  const reads: Reply[] = [offline(), json({ error: "x" }, 503), json({ error: "x" }, 429), json({ run: { status: "succeeded", output: { a: 1 } } })];
  const urls: string[] = [];
  const h = acceptedJob((url) => {
    urls.push(url);
    return url === ONE ? reads.shift()! : finalEvents("succeeded");
  });
  await h.client.start("wargaming", {});
  await h.advance(3000);
  assert.equal(h.last().phase, "running");
  assert.equal(h.last().error, null);
  await h.advance(3000);
  await h.advance(3000);
  assert.equal(h.last().phase, "running");
  await h.advance(3000);
  assert.equal(h.last().phase, "done");
  assert.equal(urls.filter((u) => u === `${EVENTS}?after=0`).length, 1, "the events are not read again");
  assertOver(h);
});

test("a run the read says is still running goes back to following it", async () => {
  const reads: Reply[] = [json({ run: { status: "running" } }), json({ run: { status: "succeeded", output: { a: 1 } } })];
  const h = acceptedJob((url) => (url === ONE ? reads.shift()! : finalEvents("succeeded")));
  await h.client.start("wargaming", {});
  await h.advance(3000);
  assert.equal(h.last().phase, "running");
  await h.advance(3000);
  await h.advance(3000);
  assert.equal(h.last().phase, "done");
  assertOver(h);
});

// ── Giving up, and what it points to ────────────────────────────────────────

test("twenty minutes without a final state: it stops, and says where the run can be followed", async () => {
  const h = acceptedJob(() => running());
  await h.client.start("wargaming", {});
  await h.advance(19 * 60 * 1000);
  assert.equal(h.last().phase, "running");
  await h.advance(2 * 60 * 1000);
  assert.equal(h.last().phase, "error");
  assert.equal(h.last().code, "still_running");
  assert.equal(h.last().error, RUN_STILL_RUNNING_AR);
  assert.equal(h.last().runId, RUN_ID, "the screen needs it for the link");
  assertOver(h);
  const before = h.calls.length;
  await h.advance(10 * 60 * 1000);
  assert.equal(h.calls.length, before);
});

test("twenty minutes of failed polls ends the same way, not as a failed run", async () => {
  const h = acceptedJob(() => json({ error: "x" }, 503));
  await h.client.start("wargaming", {});
  await h.advance(21 * 60 * 1000);
  assert.equal(h.last().code, "still_running");
  assert.equal(h.last().error, RUN_STILL_RUNNING_AR);
  assertOver(h);
});

test("the give-up copy names the run page and promises no alert, no refund, no result", () => {
  assert.match(RUN_STILL_RUNNING_AR, /صفحة الطلب/);
  for (const copy of [RUN_STILL_RUNNING_AR, RUN_SESSION_LOST_AR]) {
    assert.doesNotMatch(copy, /تنبيه|إشعار|سنخبرك|سنُعلمك|بريد|أُعيد|استرد/, copy);
  }
});

test("a signed-out or refused poll stops and points to the run page", async () => {
  for (const status of [401, 403]) {
    const h = acceptedJob(() => json({ error: "سجّل الدخول لعرض الطلب" }, status));
    await h.client.start("wargaming", {});
    await h.advance(3000);
    assert.equal(h.last().phase, "error", String(status));
    assert.equal(h.last().code, "still_running");
    assert.equal(h.last().error, RUN_SESSION_LOST_AR);
    assertOver(h);
  }
});

// ── Someone else's run ──────────────────────────────────────────────────────

test("a run the route will not show (404): no events reach the screen, and polling ends", async () => {
  const h = acceptedJob(() => json({ error: "غير موجود" }, 404));
  await h.client.start("wargaming", {});
  await h.advance(3000);
  assert.equal(h.last().phase, "error");
  assert.equal(h.last().code, "not_found");
  assert.deepEqual(h.last().events, []);
  assert.equal(h.last().output, null);
  assertOver(h);
});

test("the screen paths name only the run and the key: no user id reaches a request, the session decides", async () => {
  const urls: string[] = [];
  const post = deferred<Response>();
  const h = harness((url, init) => {
    if (init?.method === "POST") return post.promise;
    urls.push(url);
    return url.startsWith("/api/v1/ai/runs/progress") ? json({ runId: null, status: null, events: [] }) : running();
  });
  const run = h.client.start("wargaming", {});
  await settle();
  await h.advance(1500);
  post.resolve(json(started, 202));
  await run;
  await h.advance(3000);
  h.client.stop();
  assert.deepEqual(urls, [`${PROGRESS}&after=0`, `${EVENTS}?after=0`]);
});

test("the read routes the client calls still look inside the session user's own rows", () => {
  const read = readFileSync(join(process.cwd(), "src", "lib", "ai", "progressRead.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(read, /\.eq\("id", runId\)\n\s*\.eq\("user_id", userId\)/);
  assert.match(read, /\.eq\("user_id", userId\)\n\s*\.eq\("idempotency_key", key\)/);
  const route = readFileSync(join(process.cwd(), "src", "app", "api", "v1", "ai", "runs", "progress", "route.ts"), "utf8");
  assert.match(route, /readProgressByKey\(admin, auth\.user\.id, key, after\)/);
  const events = readFileSync(join(process.cwd(), "src", "app", "api", "v1", "ai", "runs", "[id]", "events", "route.ts"), "utf8");
  assert.match(events, /readProgressById\(supabase, auth\.user\.id, id, after\)/);
});

// ── A POST cut at the gateway ───────────────────────────────────────────────

test("a POST cut at the gateway with a run already seen: it follows the run, and never says «حاول مرة أخرى»", async () => {
  const post = deferred<Response>();
  const h = harness((url, init) => {
    if (init?.method === "POST") return post.promise;
    if (url.startsWith("/api/v1/ai/runs/progress")) return json({ runId: RUN_ID, status: "running", events: [ev(1, "query", "س")], final: false });
    if (url === ONE) return json({ run: { status: "succeeded", output: { answer: "ج" }, charged_points: 5 } });
    return finalEvents("succeeded");
  });
  const run = h.client.start("quick-answer", {});
  await settle();
  await h.advance(1500);
  post.resolve(new Response("<html>504</html>", { status: 504 }));
  await run;
  assert.equal(h.last().phase, "running");
  assert.equal(h.last().runId, RUN_ID);
  assert.equal(h.last().error, null);
  await h.advance(3000);
  assert.equal(h.last().phase, "done");
  assert.deepEqual(h.last().output, { answer: "ج" });
  assertOver(h);
});

test("a POST lost with no run seen: the old honest failure, with nothing left running", async () => {
  const h = harness((url, init) => (init?.method === "POST" ? offline() : json({ runId: null, status: null, events: [] })));
  await h.client.start("quick-answer", {});
  assert.equal(h.last().phase, "error");
  assert.match(h.last().error!, /تعذّر الاتصال بالخادم/);
  assertOver(h);
});

test("the server's own refusal stays as written; a credit run's says the credit came back", async () => {
  const h = harness(() => json({ error: "تعذّر إكمال الطلب، وأُعيدت نقاطك", code: "model_error", runId: RUN_ID }, 502));
  await h.client.start("wargaming", {}, { useCredit: true });
  assert.equal(h.last().phase, "error");
  assert.equal(h.last().code, "model_error");
  assert.equal(h.last().error, FOUNDER_CREDIT_REFUNDED_FAILURE);
  assertOver(h);
});

test("a run start refused by the proxy (429 before any charge) is a normal error with nothing left running", async () => {
  const h = harness(() => json({ error: "طلبات كثيرة — حاول بعد قليل." }, 429, { "Retry-After": "30" }));
  await h.client.start("contract-review", {});
  assert.equal(h.last().phase, "error");
  assert.equal(h.last().error, "طلبات كثيرة — حاول بعد قليل.");
  assert.equal(h.last().chargedPoints, 0);
  assertOver(h);
});

test("the POST sends the key the poll looks for", async () => {
  let body: Record<string, unknown> = {};
  const h = harness((_url, init) => {
    body = JSON.parse(String(init?.body));
    return json({ output: {} });
  });
  await h.client.start("quick-answer", { q: "x" }, { fileIds: ["f1"] });
  assert.deepEqual(body, { tool: "quick-answer", input: { q: "x" }, fileIds: ["f1"], idempotencyKey: KEY });
});

// ── Unmount and reset ───────────────────────────────────────────────────────

test("stop (unmount) with a poll scheduled: the timer goes, nothing more is fetched", async () => {
  const h = acceptedJob(() => running());
  await h.client.start("wargaming", {});
  assert.equal(h.pending(), 1);
  h.client.stop();
  assertOver(h);
  const before = h.calls.length;
  await h.advance(60_000);
  assert.equal(h.calls.length, before);
});

test("stop (unmount) with a poll in flight: its reply writes nothing and schedules nothing", async () => {
  const poll = deferred<Response>();
  const h = acceptedJob(() => poll.promise);
  await h.client.start("wargaming", {});
  await h.advance(3000);
  h.client.stop();
  const count = h.states.length;
  poll.resolve(running([ev(1)]));
  await settle();
  assert.equal(h.states.length, count);
  assertOver(h);
});

test("stop (unmount) with the POST in flight: the late answer writes nothing and starts no poll", async () => {
  const post = deferred<Response>();
  const h = harness((_url, init) => (init?.method === "POST" ? post.promise : running()));
  const run = h.client.start("wargaming", {});
  await settle();
  h.client.stop();
  assertOver(h);
  const count = h.states.length;
  post.resolve(json(started, 202));
  await run;
  assert.equal(h.states.length, count);
  assertOver(h);
});

test("stop (unmount) while the finished run is being read: nothing is written or scheduled", async () => {
  const read = deferred<Response>();
  const h = acceptedJob((url) => (url === ONE ? read.promise : finalEvents("succeeded")));
  await h.client.start("wargaming", {});
  await h.advance(3000);
  h.client.stop();
  const count = h.states.length;
  read.resolve(json({ run: { status: "succeeded", output: { a: 1 } } }));
  await settle();
  assert.equal(h.states.length, count);
  assertOver(h);
});

test("a client stopped by React's double effect can start again", async () => {
  const h = harness(() => json({ output: { a: 1 } }));
  h.client.stop();
  await h.client.start("quick-answer", {});
  assert.equal(h.last().phase, "done");
});

test("reset: back to idle at once, no timer, and a late reply cannot bring the run back", async () => {
  const poll = deferred<Response>();
  const h = acceptedJob(() => poll.promise);
  await h.client.start("wargaming", {});
  await h.advance(3000);
  h.client.reset();
  assert.deepEqual(h.last(), IDLE_RUN);
  poll.resolve(finalEvents("failed"));
  await settle();
  assert.deepEqual(h.last(), IDLE_RUN);
  assertOver(h);
});

test("a second start: the first run's late replies never write into the new one", async () => {
  const firstPost = deferred<Response>();
  const posts: Reply[] = [firstPost.promise, json({ output: { n: 2 } })];
  const h = harness((_url, init) => (init?.method === "POST" ? posts.shift()! : json({ runId: null, status: null, events: [] })));
  const first = h.client.start("quick-answer", {});
  await settle();
  await h.client.start("quick-answer", {});
  assert.deepEqual(h.last().output, { n: 2 });
  firstPost.resolve(json({ output: { n: 1 } }));
  await first;
  assert.deepEqual(h.last().output, { n: 2 });
  assertOver(h);
});

test("the hook is a thin wrapper: unmount stops the client, and no interval runs anywhere", () => {
  const hook = readFileSync(join(process.cwd(), "src", "hooks", "useAiRun.ts"), "utf8");
  assert.match(hook, /return \(\) => client\.stop\(\);|return \(\) => \{\s*client\.stop\(\);/);
  assert.match(hook, /createAiRunClient\(/);
  assert.doesNotMatch(hook, /setTimeout|setInterval/);
  const machine = readFileSync(join(process.cwd(), "src", "lib", "ai", "aiRunClient.ts"), "utf8");
  assert.doesNotMatch(machine, /setInterval/);
});
