/**
 * quickAnswer.test.ts — a wave-2 library tool through the run pipeline
 * (runCore.startRunWith): the library gate before the charge, the searches
 * and the texts after it, a refund when nothing matches or the answer cites
 * nothing, and the citations kept only when they name a text the app sent.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/quickAnswer.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { AI_COPY, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { N8nOutcome } from "./n8nClient.ts";
import type { Retrieved } from "./retrieval.ts";
import { AI_TOOLS, LIB_QUERIES_PATH } from "./tools.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const LAWYER: RunActor = { userId: "u-1", userType: "lawyer", practiceKind: "advocate", displayName: null };
const ON = { "quick-answer": { mode: "live" } };
const QUESTION = "ما مكافأة نهاية الخدمة للعامل المستقيل؟";

function db() {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: ON } };
    if (q.op === "rpc" && q.table === "ai_start_run") {
      return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: 20 }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    if (q.table === "ai_runs" && q.op === "update") return { data: [{ id: RUN }] };
    return {};
  });
}

const FOUND: Retrieved = {
  sources: [
    { sid: "S1", kind: "article", title: "نظام العمل — المادة الخامسة والثمانون", text: "إذا كان انتهاء علاقة العمل بسبب استقالة العامل…" },
    { sid: "S2", kind: "principle", title: "مبدأ رقم 35", text: "مبدأ" },
  ],
  map: {
    S1: { kind: "article", id: "labor__art-85", title: "نظام العمل — المادة الخامسة والثمانون", url: "/laws/labor#labor__art-85" },
    S2: { kind: "principle", id: "p-35", title: "مبدأ رقم 35", url: "/precedents/c#p-35" },
  },
};

const queriesReply = (queries: unknown = ["مكافأة نهاية الخدمة", "استقالة العامل"]): N8nOutcome => ({
  kind: "result",
  result: { run_id: RUN, status: "succeeded", output: { queries } },
});
const answerReply = (citations: unknown[] = ["S1", "S9"]): N8nOutcome => ({
  kind: "result",
  result: { run_id: RUN, status: "succeeded", output: { answer: "يستحق ثلث المكافأة [S1]" }, citations, usage: { model: "gemini" } },
});

type Call = { path: string; timeoutMs: number; body: Record<string, unknown> };

function deps(o: {
  access?: StartRunDeps["libraryAccess"] | null;
  queries?: N8nOutcome;
  answer?: N8nOutcome;
  found?: Retrieved;
  calls?: Call[];
  searched?: string[][];
  clock?: () => number;
} = {}): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      o.calls?.push(call as Call);
      return call.path === LIB_QUERIES_PATH ? (o.queries ?? queriesReply()) : (o.answer ?? answerReply());
    },
    libraryAccess: o.access === null ? undefined : (o.access ?? (async () => null)),
    retrieve: async (queries) => {
      o.searched?.push(queries);
      return o.found ?? FOUND;
    },
    clock: o.clock,
  };
}

const body = (over: Record<string, unknown> = {}) => ({ tool: "quick-answer", input: { question: QUESTION }, idempotencyKey: "key-abcdef01", ...over });
const rpcs = (log: FakeQuery[]) => log.filter((q) => q.op === "rpc").map((q) => q.table);

test("the registry entry: lawyers and firms, 20 points, off until an admin opens it, library-backed", () => {
  const t = AI_TOOLS["quick-answer"];
  assert.deepEqual(t.roles, ["lawyer", "firm"]);
  assert.equal(t.price({}, { pages: null }), 20);
  assert.equal(t.defaultMode, "off");
  assert.deepEqual(t.retrieval, { from: "question", laws: 8, principles: 4 });
  assert.equal(t.validateInput({ question: "قصير" }).ok, false);
  assert.equal(t.validateInput({ question: "س".repeat(1001) }).ok, false);
  assert.deepEqual(t.validateInput({ question: `  ${QUESTION}  ` }), { ok: true, input: { question: QUESTION } });
  assert.equal(t.validateOutput({ answer: "  " }, {}), null);
});

test("the library gate refuses before anything is charged or sent", async () => {
  const { client, log } = db();
  const calls: Call[] = [];
  const r = await startRunWith(
    client as never,
    deps({ calls, access: async () => ({ status: 403, body: { error: "يتطلب Pro", code: "library_tier" } }) }),
    LAWYER,
    body(),
  );
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "library_tier");
  assert.deepEqual(rpcs(log), []);
  assert.equal(calls.length, 0);
});

test("a library tool with no gate wired is not ready rather than open", async () => {
  const { client, log } = db();
  const r = await startRunWith(client as never, deps({ access: null }), LAWYER, body());
  assert.equal(r.status, 503);
  assert.deepEqual(rpcs(log), []);
});

test("charged, then searched, then answered: the texts go in the package and the citations resolve", async () => {
  const { client, log } = db();
  const calls: Call[] = [];
  const searched: string[][] = [];
  const r = await startRunWith(client as never, deps({ calls, searched }), LAWYER, body());
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.output, { answer: "يستحق ثلث المكافأة [S1]" });
  // S9 was never sent, so it is not a citation.
  assert.deepEqual(r.body.citations, [{ sid: "S1", ...FOUND.map.S1 }]);
  assert.equal(r.body.chargedPoints, 20);

  assert.deepEqual(calls.map((c) => c.path), [LIB_QUERIES_PATH, "nzamy-ai/quick-answer"]);
  assert.deepEqual(calls[0].body.input, { text: QUESTION });
  assert.deepEqual(searched, [["مكافأة نهاية الخدمة", "استقالة العامل"]]);
  assert.deepEqual(calls[1].body.sources, FOUND.sources);

  const order = log.map((q) => `${q.op}:${q.table}`);
  assert.ok(order.indexOf("rpc:ai_start_run") < order.indexOf("update:ai_runs"), "charged before the sources are stored");
  const stored = log.find((q) => q.table === "ai_runs" && q.op === "update")!;
  assert.deepEqual((stored.payload as Record<string, unknown>).source_ids, FOUND.map);
  assert.ok(!rpcs(log).includes("ai_fail_run"));
});

test("no searches from the writer refunds the run", async () => {
  for (const queries of [queriesReply([]), queriesReply(["أ"]), { kind: "failed", code: "timeout", detail: "slow" } as N8nOutcome]) {
    const { client, log } = db();
    const calls: Call[] = [];
    const r = await startRunWith(client as never, deps({ queries, calls }), LAWYER, body());
    assert.equal(r.status, 502);
    assert.ok(rpcs(log).includes("ai_fail_run"));
    assert.equal(calls.length, 1, "the answer is never asked for");
  }
});

test("nothing in the library matched: refunded, and the user is told so instead of a guess", async () => {
  const { client, log } = db();
  const calls: Call[] = [];
  const r = await startRunWith(client as never, deps({ calls, found: { sources: [], map: {} } }), LAWYER, body());
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "no_sources");
  assert.equal(r.body.error, AI_COPY.noSources);
  assert.equal((log.find((q) => q.table === "ai_fail_run")!.payload as Record<string, unknown>).p_code, "no_sources");
  assert.equal(calls.length, 1);
});

test("an answer that cites none of the texts is refunded as ungrounded", async () => {
  for (const citations of [[], ["S7"]]) {
    const { client, log } = db();
    const r = await startRunWith(client as never, deps({ answer: answerReply(citations) }), LAWYER, body());
    assert.equal(r.status, 422);
    assert.equal(r.body.code, "ungrounded");
    assert.equal((log.find((q) => q.table === "ai_fail_run")!.payload as Record<string, unknown>).p_code, "ungrounded");
  }
});

test("the answer's wait is what the searches left of the fast budget, never under 15 s", async () => {
  const run = async (spentMs: number) => {
    let t = 0;
    const calls: Call[] = [];
    const clock = () => t;
    const d = deps({ calls, clock });
    const n8n = d.n8n;
    d.n8n = async (call) => {
      const out = await n8n(call);
      if (call.path === LIB_QUERIES_PATH) t += spentMs;
      return out;
    };
    const { client } = db();
    await startRunWith(client as never, d, LAWYER, body());
    return calls[1].timeoutMs;
  };
  assert.equal(await run(4_000), 46_000);
  assert.equal(await run(45_000), 15_000);
});
