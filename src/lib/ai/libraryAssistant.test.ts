/**
 * libraryAssistant.test.ts — L5 مساعد المكتبة through the run pipeline: open to
 * every account type (the tier rule is the gate), the open article passed to
 * the retrieval, and an open article enough to answer from when the search
 * writer finds nothing.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/libraryAssistant.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { N8nOutcome } from "./n8nClient.ts";
import type { Retrieved, RetrievalPin } from "./retrieval.ts";
import { AI_TOOLS, LIB_QUERIES_PATH } from "./tools.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const ON = { "library-assistant": { mode: "live" } };
const actor = (userType: string): RunActor => ({ userId: "u-1", userType, practiceKind: "advocate", displayName: null });

function db() {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: ON } };
    if (q.op === "rpc" && q.table === "ai_start_run") {
      return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: 5 }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    if (q.table === "ai_runs" && q.op === "update") return { data: [{ id: RUN }] };
    return {};
  });
}

const FOUND: Retrieved = {
  sources: [{ sid: "S1", kind: "article", title: "نظام العمل — الثمانون", text: "لا يجوز…", pinned: true }],
  map: { S1: { kind: "article", id: "labor__art-80", title: "نظام العمل — الثمانون", url: "/laws/labor#labor__art-80" } },
};

function deps(queries: N8nOutcome, pins: RetrievalPin[], calls: string[] = []): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      calls.push(call.path);
      return call.path === LIB_QUERIES_PATH
        ? queries
        : { kind: "result", result: { run_id: RUN, status: "succeeded", output: { reply: "شرح المادة [S1]" }, citations: ["S1"] } };
    },
    libraryAccess: async () => null,
    retrieve: async (_q, _l, pin) => {
      pins.push(pin);
      return FOUND;
    },
  };
}

const queries = (list: string[]): N8nOutcome => ({ kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: list } } });
const body = (input: Record<string, unknown>) => ({ tool: "library-assistant", input, idempotencyKey: "key-abcdef01" });

test("the registry entry: every account type, 5 points flat, off by default, the open article pinned", () => {
  const t = AI_TOOLS["library-assistant"];
  for (const role of ["individual", "lawyer", "firm", "corporate", "provider", "micro", "government", "ngo"]) assert.ok(t.roles.includes(role), role);
  assert.equal(t.price({}, { pages: null }), 5);
  assert.equal(t.defaultMode, "off");
  assert.equal(t.retrieval?.pinFrom, "article_id");
  assert.equal(t.retrieval?.scopeFrom, "law_slug");
  assert.deepEqual(t.validateInput({ message: "اشرح" }), { ok: true, input: { message: "اشرح", article_id: null, law_slug: null } });
  assert.deepEqual(t.validateInput({ message: "اشرح", article_id: "labor-law__art-80", law_slug: "labor-law" }), {
    ok: true,
    input: { message: "اشرح", article_id: "labor-law__art-80", law_slug: "labor-law" },
  });
  for (const bad of ["../etc", "a b", "x".repeat(201), 7]) {
    assert.equal(t.validateInput({ message: "اشرح", article_id: bad }).ok, false, String(bad));
    assert.equal(t.validateInput({ message: "اشرح", law_slug: bad }).ok, false, String(bad));
  }
  assert.equal(t.validateOutput({ reply: "" }, {}), null);
});

test("an individual on the library page gets an answer; the open article goes to the retrieval", async () => {
  const pins: RetrievalPin[] = [];
  const { client } = db();
  const r = await startRunWith(client as never, deps(queries(["فسخ عقد العمل"]), pins), actor("individual"), body({ message: "اشرح لي هذه المادة", article_id: "labor__art-80" }));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.output, { reply: "شرح المادة [S1]" });
  assert.deepEqual(pins, [{ question: "اشرح لي هذه المادة", articleId: "labor__art-80" }]);
});

test("the law page and the question go to the retrieval (owner's live test 29 Oct)", async () => {
  const pins: RetrievalPin[] = [];
  const { client } = db();
  const r = await startRunWith(client as never, deps(queries(["المستفيد"]), pins), actor("individual"), body({ message: "من هو المستفيد؟", law_slug: "social-security-law" }));
  assert.equal(r.status, 200);
  assert.deepEqual(pins, [{ question: "من هو المستفيد؟", lawSlug: "social-security-law" }]);
});

test("an article the question names is enough to answer from when the search writer finds nothing", async () => {
  for (const input of [{ message: "ما هي المادة الأولى من نظام العمل؟" }, { message: "ما هي المادة الأولى؟", law_slug: "labor-law" }]) {
    const { client, log } = db();
    const r = await startRunWith(client as never, deps(queries([]), []), actor("lawyer"), body(input));
    assert.equal(r.status, 200, input.message);
    assert.ok(!log.some((q) => q.table === "ai_fail_run"));
  }
  // «المادة الأولى» with no law and no law page names nothing.
  const { client, log } = db();
  const r = await startRunWith(client as never, deps(queries([]), []), actor("lawyer"), body({ message: "ما هي المادة الأولى؟" }));
  assert.equal(r.status, 502);
  assert.ok(log.some((q) => q.table === "ai_fail_run"));
});

test("with an open article, a search writer that finds nothing still leads to an answer", async () => {
  const pins: RetrievalPin[] = [];
  const calls: string[] = [];
  const { client, log } = db();
  const r = await startRunWith(client as never, deps({ kind: "failed", code: "timeout", detail: "slow" }, pins, calls), actor("lawyer"), body({ message: "اشرح", article_id: "labor__art-80" }));
  assert.equal(r.status, 200);
  assert.deepEqual(calls, [LIB_QUERIES_PATH, "nzamy-ai/library-assistant"]);
  assert.ok(!log.some((q) => q.table === "ai_fail_run"));
});

test("without an open article, no searches is still a refund", async () => {
  const { client, log } = db();
  const r = await startRunWith(client as never, deps(queries([]), []), actor("lawyer"), body({ message: "سؤال عام" }));
  assert.equal(r.status, 502);
  assert.ok(log.some((q) => q.table === "ai_fail_run"));
});
