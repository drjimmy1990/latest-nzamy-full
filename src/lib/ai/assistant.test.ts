/**
 * assistant.test.ts — L4 المستشار الذكي through the run pipeline: a
 * conversation's first message pays 100 for up to five (D3), the earlier
 * turns are read back from ai_runs for this user only and sent as `history`,
 * a sixth message is refused, and a follow-up is searched with the question
 * before it.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/assistant.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { AI_COPY, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { Retrieved } from "./retrieval.ts";
import { AI_TOOLS, ASSISTANT_CONVERSATION_PRICE, LIB_QUERIES_PATH } from "./tools.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const CONV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const LAWYER: RunActor = { userId: "u-1", userType: "lawyer", practiceKind: "advocate", displayName: null };
const ON = { assistant: { mode: "live" } };

const turn = (q: string, a: string, status = "succeeded") => ({ input: { context: "general", message: q }, output: { reply: a }, status });

function db(prior: unknown[] = []) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: ON } };
    if (q.table === "ai_runs" && q.op === "select") return { data: prior };
    if (q.op === "rpc" && q.table === "ai_start_run") {
      const price = (q.payload as Record<string, unknown>).p_price as number;
      return { data: [{ run_id: RUN, created: true, status: "running", charged: price > 0, charged_points: price }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    if (q.table === "ai_runs" && q.op === "update") return { data: [{ id: RUN }] };
    return {};
  });
}

const FOUND: Retrieved = {
  sources: [{ sid: "S1", kind: "article", title: "نظام العمل — الثمانون", text: "…" }],
  map: { S1: { kind: "article", id: "labor__art-80", title: "نظام العمل — الثمانون", url: "/laws/labor#labor__art-80" } },
};

type Call = { path: string; body: Record<string, unknown> };
function deps(calls: Call[] = []): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      calls.push(call as Call);
      return call.path === LIB_QUERIES_PATH
        ? { kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: ["فسخ عقد العمل"] } } }
        : { kind: "result", result: { run_id: RUN, status: "succeeded", output: { reply: "يجوز في الحالات… [S1]" }, citations: ["S1"] } };
    },
    libraryAccess: async () => null,
    retrieve: async () => FOUND,
  };
}

const body = (over: Record<string, unknown> = {}) => ({
  tool: "assistant",
  input: { context: "case", message: "هل يجوز فصل العامل لغيابه؟" },
  idempotencyKey: "key-abcdef01",
  ...over,
});
const startPayload = (log: FakeQuery[]) => log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;

test("the registry entry: lawyers and firms, a conversation of five, 100 on the first message only", () => {
  const t = AI_TOOLS.assistant;
  assert.deepEqual(t.roles, ["lawyer", "firm"]);
  assert.equal(t.conversation?.maxMessages, 5);
  assert.equal(t.price({}, { pages: null, turn: 0 }), ASSISTANT_CONVERSATION_PRICE);
  assert.equal(t.price({}, { pages: null, turn: 3 }), 0);
  assert.deepEqual(t.validateInput({ message: "سؤال" }), { ok: true, input: { context: "general", message: "سؤال" } });
  assert.equal(t.validateInput({ context: "other", message: "سؤال" }).ok, false);
});

test("a new conversation: an id is made, 100 is charged, no history is sent, the id comes back", async () => {
  const { client, log } = db();
  const calls: Call[] = [];
  const r = await startRunWith(client as never, deps(calls), LAWYER, body());
  assert.equal(r.status, 200);
  const cid = r.body.conversationId as string;
  assert.match(cid, /^[0-9a-f-]{36}$/);
  assert.equal(startPayload(log).p_price, 100);
  assert.equal(startPayload(log).p_conversation, cid);
  assert.ok(!log.some((q) => q.table === "ai_runs" && q.op === "select"), "nothing to read for a new conversation");
  assert.deepEqual(calls[1].body.history, []);
});

test("a follow-up: free, the earlier turns read for this user only and sent in order", async () => {
  const { client, log } = db([turn("س١", "ج١"), turn("س٢", "ج٢", "running"), turn("س٣", "ج٣")]);
  const calls: Call[] = [];
  const r = await startRunWith(client as never, deps(calls), LAWYER, body({ conversationId: CONV.toUpperCase(), input: { message: "وما مدته؟" } }));
  assert.equal(r.status, 200);
  assert.equal(r.body.conversationId, CONV);
  assert.equal(startPayload(log).p_price, 0, "the conversation's first message paid for it");

  const read = log.find((q) => q.table === "ai_runs" && q.op === "select")!;
  assert.deepEqual(read.filters.slice(0, 3), [["eq", "user_id", "u-1"], ["eq", "tool", "assistant"], ["eq", "conversation_id", CONV]]);
  // The running turn has no answer yet, so it is not history.
  assert.deepEqual(calls[1].body.history, [
    { role: "user", text: "س١" }, { role: "assistant", text: "ج١" },
    { role: "user", text: "س٣" }, { role: "assistant", text: "ج٣" },
  ]);
  // The follow-up is searched together with the question before it.
  assert.deepEqual((calls[0].body.input as Record<string, unknown>).text, "س٣\nوما مدته؟");
});

test("the sixth message is refused before anything is charged", async () => {
  const { client, log } = db(Array.from({ length: 5 }, (_, i) => turn(`س${i}`, `ج${i}`)));
  const calls: Call[] = [];
  const r = await startRunWith(client as never, deps(calls), LAWYER, body({ conversationId: CONV }));
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "conversation_full");
  assert.equal(r.body.error, AI_COPY.conversationFull);
  assert.ok(!log.some((q) => q.table === "ai_start_run"));
  assert.equal(calls.length, 0);
});

test("a conversation id that is not a UUID is refused; a read failure is not a free new conversation", async () => {
  const bad = await startRunWith(db().client as never, deps(), LAWYER, body({ conversationId: "../x" }));
  assert.equal(bad.status, 422);
  assert.equal(bad.body.code, "invalid_conversation");

  const { client, log } = fakeDb((q) => {
    if (q.table === "platform_settings") return { data: { value: ON } };
    if (q.table === "ai_runs" && q.op === "select") return { error: { code: "XX000", message: "down" } };
    return {};
  });
  const r = await startRunWith(client as never, deps(), LAWYER, body({ conversationId: CONV }));
  assert.equal(r.status, 503);
  assert.ok(!log.some((q) => q.table === "ai_start_run"));
});
