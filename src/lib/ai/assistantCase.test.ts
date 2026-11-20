/**
 * assistantCase.test.ts — T17a (batch l11): the advanced assistant's «قضية
 * محددة» loads the lawyer's OWN case (checked server-side, before any charge),
 * and «إرسال مع السياق» hands a result to the assistant or the drafter.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/assistantCase.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { AI_COPY, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { Retrieved } from "./retrieval.ts";
import { AI_TOOLS, LIB_QUERIES_PATH } from "./tools.ts";
import { buildAssistantCase, CASE_FACTS_MAX, loadAssistantCase, ownCaseFilter, type CaseReader } from "./assistantCase.ts";
import { assistantPrefill, consumeAssistantHandoff, writeAssistantHandoff, ASSISTANT_HANDOFF_MAX_CHARS } from "./assistantHandoff.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const RUN = "11111111-2222-4333-8444-555555555555";
const USER = "99999999-8888-4777-8666-555555555555";
const CASE = "cccccccc-dddd-4eee-8fff-000000000001";
const LAWYER: RunActor = { userId: USER, userType: "lawyer", practiceKind: "advocate", displayName: null };

// ── input ────────────────────────────────────────────────────────────────────

test("assistant input: a case id only with «قضية محددة», a UUID or a «REQ-…» reference, kept as is; none → today's input", () => {
  const v = AI_TOOLS.assistant.validateInput;
  assert.deepEqual(v({ context: "case", message: "سؤال", case_id: CASE }), { ok: true, input: { context: "case", message: "سؤال", case_id: CASE } });
  assert.deepEqual(v({ context: "case", message: "سؤال", case_id: "REQ-MTJFH6ZF-B5OQ" }), { ok: true, input: { context: "case", message: "سؤال", case_id: "REQ-MTJFH6ZF-B5OQ" } });
  assert.equal(v({ context: "case", message: "سؤال", case_id: "a,b" }).ok, false);
  assert.equal(v({ context: "case", message: "سؤال", case_id: "x".repeat(65) }).ok, false);
  assert.deepEqual(v({ context: "case", message: "سؤال" }), { ok: true, input: { context: "case", message: "سؤال" } });
  assert.deepEqual(v({ context: "case", message: "سؤال", case_id: "" }), { ok: true, input: { context: "case", message: "سؤال" } });
  assert.equal(v({ context: "general", message: "سؤال", case_id: CASE }).ok, false);
  assert.equal(v({ context: "case", message: "سؤال", case_id: "1; drop" }).ok, false);
  assert.equal(v({ context: "case", message: "سؤال", case_id: 7 }).ok, false);
  assert.equal(AI_TOOLS.assistant.caseFrom, "case_id");
});

// ── the summary ──────────────────────────────────────────────────────────────

test("buildAssistantCase: title, type, status and stage in Arabic, facts capped, document names only", () => {
  const c = buildAssistantCase(
    { title: "مطالبة عمالية", type: "business_case", status: "in_progress", description: "و".repeat(CASE_FACTS_MAX + 50), client_phone: "0500000000" },
    [{ degree: "first_instance", position: 1 }, { degree: "appeal", outcome: "pending", position: 2 }],
    [{ file_name: "عقد العمل.pdf" }, { file_name: "  " }, { name: "إنذار.pdf" }],
  );
  assert.equal(c.title, "مطالبة عمالية");
  assert.equal(c.type, "قضية");
  assert.equal(c.status, "قيد العمل");
  assert.equal(c.stage, "الدرجة: استئناف — قيد النظر");
  assert.equal(c.facts.length, CASE_FACTS_MAX + 1);
  assert.deepEqual(c.documents, ["عقد العمل.pdf", "إنذار.pdf"]);
  assert.ok(!JSON.stringify(c).includes("0500000000"), "nothing but the summary fields");
  const bare = buildAssistantCase({}, [], []);
  assert.deepEqual(bare, { title: "قضية بلا عنوان", type: null, status: null, stage: null, facts: "", documents: [] });
});

test("ownCaseFilter: assigned to him or opened by him; a non-UUID never reaches the filter", () => {
  assert.equal(ownCaseFilter(USER), `assigned_to.eq.${USER},requester_user_id.eq.${USER}`);
  assert.throws(() => ownCaseFilter("x,assigned_to.neq.0"));
});

/** A fake RLS client: records the case query's filters; the row is returned only when `own` says so. */
function reader(opts: { own: boolean; caseError?: boolean; extrasFail?: boolean }, seen: string[] = []): CaseReader {
  const result = (table: string) => {
    if (table === "service_requests") {
      if (opts.caseError) return { data: null, error: { code: "57014" } };
      return { data: opts.own ? { id: CASE, title: "قضية", type: "business_case", status: "pending", description: "وقائع" } : null, error: null };
    }
    if (opts.extrasFail) return { data: null, error: { code: "42501" } };
    return { data: table === "case_stages" ? [{ degree: "first_instance", position: 1 }] : [{ file_name: "مذكرة.pdf" }], error: null };
  };
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string, val: string) {
              seen.push(`${table}.${col}=${val}`);
              const done = Promise.resolve(result(table));
              return {
                or(filter: string) { seen.push(`${table}.or(${filter})`); return { maybeSingle: () => done }; },
                is() { return { order: () => ({ limit: () => done }) }; },
                order: () => done,
              };
            },
          };
        },
      };
    },
  };
}

test("loadAssistantCase: own rows only, on the caller's client; not his → null; a read failure throws", async () => {
  const seen: string[] = [];
  const mine = await loadAssistantCase(reader({ own: true }, seen), USER, CASE);
  assert.equal(mine?.title, "قضية");
  assert.equal(mine?.stage, "الدرجة: ابتدائي");
  assert.deepEqual(mine?.documents, ["مذكرة.pdf"]);
  assert.ok(seen.includes(`service_requests.or(${ownCaseFilter(USER)})`), "the own-rows filter is always applied");
  assert.equal(await loadAssistantCase(reader({ own: false }), USER, CASE), null);
  assert.equal(await loadAssistantCase(reader({ own: true }), USER, "bad id,or"), null);
  assert.equal((await loadAssistantCase(reader({ own: true }), USER, "REQ-MTJFH6ZF-B5OQ"))?.title, "قضية");
  await assert.rejects(loadAssistantCase(reader({ own: true, caseError: true }), USER, CASE));
  // Stages and documents are extras: their failure leaves them out, never the case.
  const partial = await loadAssistantCase(reader({ own: true, extrasFail: true }), USER, CASE);
  assert.deepEqual([partial?.stage, partial?.documents], [null, []]);
});

// ── through the run pipeline ────────────────────────────────────────────────

function db() {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: { assistant: { mode: "live" } } } };
    if (q.table === "ai_runs" && q.op === "select") return { data: [] };
    if (q.op === "rpc" && q.table === "ai_start_run") return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: 30 }] };
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
function deps(loadCase: StartRunDeps["loadCase"], calls: Call[] = []): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      calls.push(call as Call);
      return call.path === LIB_QUERIES_PATH
        ? { kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: ["فسخ عقد العمل"] } } }
        : { kind: "result", result: { run_id: RUN, status: "succeeded", output: { reply: "يجوز [S1]" }, citations: ["S1"] } };
    },
    libraryAccess: async () => null,
    retrieve: async () => FOUND,
    ...(loadCase ? { loadCase } : {}),
  };
}
const caseBody = (input: Record<string, unknown> = { context: "case", message: "ما موقفنا؟", case_id: CASE }) => ({ tool: "assistant", input, idempotencyKey: "key-case0001" });

test("run: the caller's own case goes to n8n as `case`; the input keeps only its id", async () => {
  const { client, log } = db();
  const calls: Call[] = [];
  const asked: string[] = [];
  const summary = { title: "قضية", type: "قضية", status: null, stage: null, facts: "وقائع", documents: [] };
  const r = await startRunWith(client as never, deps(async (u, c) => { asked.push(`${u}:${c}`); return summary; }, calls), LAWYER, caseBody());
  assert.equal(r.status, 200);
  assert.deepEqual(asked, [`${USER}:${CASE}`]);
  const pkg = calls.find((c) => c.path === AI_TOOLS.assistant.n8nPath)!.body;
  assert.deepEqual(pkg.case, summary);
  const start = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
  assert.deepEqual(start.p_input, { context: "case", message: "ما موقفنا؟", case_id: CASE });
});

test("run: not his case → 404 before the charge; a read failure → 503 before the charge; no case → `case: null`", async () => {
  for (const [loader, status, code] of [
    [async () => null, 404, "case_not_found"],
    [async () => { throw new Error("db"); }, 503, "unavailable"],
  ] as const) {
    const { client, log } = db();
    const r = await startRunWith(client as never, deps(loader), LAWYER, caseBody());
    assert.equal(r.status, status);
    assert.equal(r.body.code, code);
    assert.ok(!log.some((q) => q.table === "ai_start_run"), "nothing charged");
  }
  assert.equal(AI_COPY.caseNotFound.includes("قضاياك"), true);
  const { client } = db();
  const calls: Call[] = [];
  const r = await startRunWith(client as never, deps(async () => { throw new Error("must not be asked"); }, calls), LAWYER, caseBody({ context: "case", message: "سؤال" }));
  assert.equal(r.status, 200);
  assert.equal(calls.find((c) => c.path === AI_TOOLS.assistant.n8nPath)!.body.case, null);
});

// ── «إرسال مع السياق» ────────────────────────────────────────────────────────

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

test("assistant handoff: one-shot, 30 minutes, capped; the box is prefilled, nothing sent", () => {
  const s = store();
  assert.equal(writeAssistantHandoff(s, "  ", "x"), false);
  assert.equal(writeAssistantHandoff(null, "نص", "x"), false);
  assert.ok(writeAssistantHandoff(s, "ن".repeat(ASSISTANT_HANDOFF_MAX_CHARS + 10), "عصارة المرفقات", 1000));
  const h = consumeAssistantHandoff(s, 2000);
  assert.equal(h?.text.length, ASSISTANT_HANDOFF_MAX_CHARS);
  assert.equal(h?.truncated, true);
  assert.equal(consumeAssistantHandoff(s, 2000), null, "read once");
  writeAssistantHandoff(s, "نص", "x", 0);
  assert.equal(consumeAssistantHandoff(s, 31 * 60 * 1000), null, "expired");
  assert.equal(s.m.size, 0, "an expired value is not left behind");
  assert.match(assistantPrefill({ text: "الوقائع", sourceLabel: "عصارة المرفقات", truncated: false }), /^السياق \(من عصارة المرفقات\):\nالوقائع\n\nسؤالي: $/);
});

test("wiring: the picker lists own cases, the page sends case_id with «قضية محددة» only, the analyze result offers «إرسال مع السياق»", () => {
  const route = read("src/app/api/v1/ai/assistant-cases/route.ts");
  assert.match(route, /\.or\(ownCaseFilter\(user\.id\)\)/);
  assert.doesNotMatch(route, /description/, "the list never carries the facts");
  assert.doesNotMatch(route, /createServiceClient/);
  const runs = read("src/app/api/v1/ai/runs/route.ts");
  assert.match(runs, /loadCase: async \(userId, caseId\) =>\n\s+\(await loadAssistantCase\(supabase as unknown as CaseReader/);
  const client = read("src/app/ai/assistant/_assistant-client.ts");
  assert.match(client, /input\.context === "case" && input\.caseId \? \{ case_id: input\.caseId \}/);
  const page = read("src/app/ai/assistant/page.tsx");
  assert.match(page, /caseId: context === "case" \? caseId \|\| null : null/);
  assert.match(page, /consumeAssistantHandoff\(sessionStorageOrNull\(\)\)/);
  const brief = read("src/components/ai/caseBrief/CaseBriefStudio.tsx");
  assert.match(brief, /<SendWithContextMenu/);
  const menu = read("src/components/ai/SendWithContextMenu.tsx");
  assert.match(menu, /writeAssistantHandoff/);
  assert.match(menu, /writeTranscriptHandoff/);
});
