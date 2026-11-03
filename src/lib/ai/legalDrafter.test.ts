/**
 * legalDrafter.test.ts — wave 5 L14 الصائغ القانوني through the run pipeline:
 * one work in two runs of one conversation. The analysis (facts → issues,
 * defences, requests) is charged the kind's price; the draft that follows it,
 * of the same kind and only once the analysis succeeded, is free; a failed
 * draft is tried again without a second charge. Pleadings are refused to a
 * consultant (Art. 18). Plus the kinds and their prices.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/legalDrafter.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { AI_COPY, callbackWith, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { Retrieved } from "./retrieval.ts";
import { AI_TOOLS, DRAFT_COPY, DRAFT_FACTS_MAX, LIB_QUERIES_PATH } from "./tools.ts";
import { DRAFT_KINDS, DRAFT_KIND_IDS, draftKindFromMemo, draftKindPrice } from "./draftKinds.ts";
import { MEMO_SUB_TYPES_COMMITTEES, MEMO_SUB_TYPES_REGULAR } from "../../components/draft/draftConstants.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const CONV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const LAWYER: RunActor = { userId: "u-1", userType: "lawyer", practiceKind: "advocate", displayName: null };
const CONSULTANT: RunActor = { ...LAWYER, practiceKind: "consultant" };
const tool = AI_TOOLS["legal-drafter"];

const FACTS = "عمل الموكل لدى الشركة خمس سنوات ثم فُصل دون إنذار ولم تُصرف مستحقاته.";
const issuesInput = (over: Record<string, unknown> = {}) => ({
  phase: "issues", kind: "claim", client_role: "plaintiff", branch: "عمالي", facts: FACTS, ...over,
});
const draftInput = (over: Record<string, unknown> = {}) => ({
  phase: "draft", kind: "claim", client_role: "plaintiff", branch: "عمالي", facts: FACTS,
  issues: [{ title: "مشروعية الفصل", detail: "فُصل دون إنذار" }],
  defenses: [{ title: "الفصل دون سبب مشروع", basis: "[S1]" }],
  requests: ["إلزام المدعى عليها بمكافأة نهاية الخدمة"],
  ...over,
});

const analysis = {
  facts_summary: "عمل المدعي خمس سنوات ثم فُصل.",
  issues: [{ title: "مشروعية الفصل", detail: "دون إنذار" }],
  defenses: [{ title: "الفصل دون سبب مشروع", basis: "المادة ٧٧ [S1]", issue: 1 }],
  requests: ["مكافأة نهاية الخدمة"],
  missing: ["عقد العمل"],
  cited: [{ law: "نظام العمل", article: 77, as_written: "المادة ٧٧" }],
};
const pleading = {
  title: "لائحة دعوى عمالية",
  sections: [{ heading: "الوقائع", body: "عمل المدعي… [S1]" }, { heading: "الأسانيد", body: "تنص المادة ٧٧… [S1]" }],
  requests: ["إلزام المدعى عليها بمكافأة نهاية الخدمة"],
  cited: [{ law: "نظام العمل", article: 77, as_written: "المادة ٧٧" }],
};

const FOUND: Retrieved = {
  sources: [{ sid: "S1", kind: "article", title: "نظام العمل — السابعة والسبعون", text: "…" }],
  map: { S1: { kind: "article", id: "labor__art-77", title: "نظام العمل — السابعة والسبعون", url: "/laws/labor#labor__art-77" } },
};

const row = (input: Record<string, unknown>, status = "succeeded", output: unknown = analysis) => ({ input, output, status });

function db(prior: unknown[] = []) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: { "legal-drafter": { mode: "live" } } } };
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

type Call = { path: string; body: Record<string, unknown> };
function deps(calls: Call[] = [], files: number = 0): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      calls.push(call as Call);
      return call.path === LIB_QUERIES_PATH
        ? { kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: ["فصل العامل دون سبب مشروع"] } } }
        : { kind: "accepted" };
    },
    libraryAccess: async () => null,
    retrieve: async () => FOUND,
    resolveFiles: async () => ({
      ok: true,
      files: Array.from({ length: files }, (_, n) => ({ id: String(n + 1), name: `f${n}.pdf`, mime: "application/pdf", url: `https://x/${n}` })),
      pages: files,
    }) as never,
  };
}

const body = (input: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  tool: "legal-drafter", input, idempotencyKey: "key-abcdef01", ...over,
});
const startPayload = (log: FakeQuery[]) => log.find((q) => q.table === "ai_start_run")?.payload as Record<string, unknown> | undefined;

// ── kinds ────────────────────────────────────────────────────────────────────

test("kinds: 500 for a claim and the first-instance memos, 1,000 an appeal, 1,500 cassation and a petition", () => {
  assert.deepEqual(DRAFT_KIND_IDS, ["claim", "reply", "rejoinder", "supplementary", "closing", "appeal", "cassation", "petition"]);
  for (const k of ["claim", "reply", "rejoinder", "supplementary", "closing"]) assert.equal(draftKindPrice(k), 500, k);
  assert.equal(draftKindPrice("appeal"), 1000);
  assert.equal(draftKindPrice("cassation"), 1500);
  assert.equal(draftKindPrice("petition"), 1500);
  assert.equal(draftKindPrice("notary"), 0);
});

test("every pleading sub-type of the wizard maps to a kind; the specialist modes map to none", () => {
  for (const lists of [MEMO_SUB_TYPES_REGULAR, MEMO_SUB_TYPES_COMMITTEES]) {
    for (const main of ["case", "reply", "appeal"]) {
      for (const sub of lists[main] ?? []) assert.ok(draftKindFromMemo(main, sub), `${main} / ${sub}`);
    }
    for (const main of ["arbitration", "notary", "report", "minutes"]) {
      for (const sub of lists[main] ?? []) assert.equal(draftKindFromMemo(main, sub), null, `${main} / ${sub}`);
    }
  }
  assert.ok(MEMO_SUB_TYPES_REGULAR.reply.some((s) => s.includes("تعقيب")), "«تعقيب» is offered (plan: there was no rejoinder option)");
  assert.equal(draftKindFromMemo("reply", "مذكرة تعقيب"), "rejoinder");
  assert.equal(draftKindFromMemo("appeal", "نقض (المحكمة العليا)"), "cassation");
  assert.equal(draftKindFromMemo("appeal", "التماس إعادة النظر"), "petition");
  assert.equal(draftKindFromMemo("appeal", "استئناف القرار أمام اللجنة العليا"), "appeal");
  assert.equal(draftKindFromMemo("case", ""), null, "no sub-type chosen yet");
});

// ── the registry entry ───────────────────────────────────────────────────────

test("the registry entry: a job for lawyers and firms, off by default, consultants refused, files optional, the library behind it", () => {
  assert.equal(tool.class, "job");
  assert.equal(tool.n8nPath, "nzamy-ai/legal-drafter");
  assert.deepEqual(tool.roles, ["lawyer", "firm"]);
  assert.equal(tool.consultantBlocked, true);
  assert.equal(tool.defaultMode, "off");
  assert.equal(tool.files?.optional, true);
  assert.equal(tool.retrieval?.from, "search_text");
  assert.equal(tool.conversation?.maxMessages, 2);
  assert.equal(tool.price({ kind: "cassation" }, { pages: null, turn: 0 }), 1500);
  assert.equal(tool.price({ kind: "cassation" }, { pages: null, turn: 1 }), 0, "the draft is paid by its analysis");
});

test("analysis input: kind, role and branch required; facts 30+ unless they are in the files; too long refused, never cut", () => {
  const v = tool.validateInput;
  assert.equal(v(issuesInput({ kind: "notary" })).ok, false);
  assert.deepEqual(v(issuesInput({ client_role: "" })), { ok: false, error: DRAFT_COPY.role });
  assert.deepEqual(v(issuesInput({ branch: " " })), { ok: false, error: DRAFT_COPY.branch });
  assert.deepEqual(v(issuesInput({ facts: "قصير" })), { ok: false, error: DRAFT_COPY.facts });
  assert.deepEqual(v(issuesInput({ facts: "x".repeat(DRAFT_FACTS_MAX + 1) })), { ok: false, error: DRAFT_COPY.factsLong });
  const inFiles = v(issuesInput({ facts: "", facts_in_files: true, judgment: { reasons: "لعدم ثبوت العلاقة" } }));
  assert.ok(inFiles.ok);
  assert.equal(inFiles.ok && inFiles.input.search_text, "لعدم ثبوت العلاقة", "searched from the judgment when there are no facts");
  const ok = v(issuesInput({ notes: "  ", judgment: { court: "", number: "" }, requests: ["مكافأة", " "] }));
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.equal(ok.input.search_text, FACTS);
    assert.equal(ok.input.notes, undefined, "a blank field is left out");
    assert.equal(ok.input.judgment, null);
    assert.deepEqual(ok.input.requests, ["مكافأة"]);
  }
  assert.equal(v(issuesInput({ judgment: { text: "x".repeat(8001) } })).ok, false);
});

test("draft input: the confirmed facts, at least one issue and one defence, searched by their titles", () => {
  const v = tool.validateInput;
  assert.deepEqual(v(draftInput({ issues: [] })), { ok: false, error: DRAFT_COPY.issues });
  assert.deepEqual(v(draftInput({ defenses: [] })), { ok: false, error: DRAFT_COPY.defenses });
  assert.equal(v(draftInput({ defenses: [{ title: "" }] })).ok, false);
  assert.equal(v(draftInput({ facts: "" })).ok, false, "the draft is written from typed, confirmed facts");
  const ok = v(draftInput());
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.input.search_text, "مشروعية الفصل\nالفصل دون سبب مشروع");
});

test("output: the analysis and the draft by the run's phase; one bad row refuses the whole result", () => {
  const out = tool.validateOutput;
  const a = out(analysis, { phase: "issues" }) as Record<string, any>;
  assert.equal(a.phase, "issues");
  assert.equal(a.defenses[0].issue, 1);
  assert.equal(a.cited.length, 1);
  assert.equal(out({ ...analysis, issues: [] }, { phase: "issues" }), null);
  assert.equal(out({ ...analysis, defenses: [{ title: "" }] }, { phase: "issues" }), null);
  const d = out(pleading, { phase: "draft" }) as Record<string, any>;
  assert.equal(d.phase, "draft");
  assert.equal(d.sections.length, 2);
  assert.equal(out({ ...pleading, sections: [pleading.sections[0]] }, { phase: "draft" }), null, "one section is not a pleading");
  assert.equal(out({ ...pleading, sections: [...pleading.sections, { heading: "x", body: "" }] }, { phase: "draft" }), null);
});

// ── through the pipeline ─────────────────────────────────────────────────────

test("the analysis: a new conversation, charged the kind's price, the library searched, n8n told it is phase «issues»", async () => {
  const { client, log } = db();
  const calls: Call[] = [];
  const r = await startRunWith(client as never, deps(calls), LAWYER, body(issuesInput({ kind: "appeal" })));
  assert.equal(r.status, 202);
  assert.equal(startPayload(log)?.p_price, 1000);
  assert.match(String(r.body.conversationId), /^[0-9a-f-]{36}$/);
  assert.equal((calls[0].body.input as Record<string, unknown>).text, FACTS);
  const pkg = calls[1].body;
  assert.equal(calls[1].path, "nzamy-ai/legal-drafter");
  assert.equal((pkg.input as Record<string, unknown>).phase, "issues");
  assert.equal((pkg.sources as unknown[]).length, 1);
});

test("the draft after a succeeded analysis: free, searched with the facts before it", async () => {
  const { client, log } = db([row(issuesInput({ search_text: FACTS }))]);
  const calls: Call[] = [];
  const r = await startRunWith(client as never, deps(calls), LAWYER, body(draftInput(), { conversationId: CONV }));
  assert.equal(r.status, 202);
  assert.equal(startPayload(log)?.p_price, 0);
  assert.equal((calls[0].body.input as Record<string, unknown>).text, `${FACTS}\nمشروعية الفصل\nالفصل دون سبب مشروع`);
});

test("out of order: a draft first, a draft before the analysis is done, or of another kind — refused, nothing charged", async () => {
  for (const [prior, input, error] of [
    [[], draftInput(), DRAFT_COPY.firstStep],
    [[row(issuesInput(), "running", null)], draftInput(), DRAFT_COPY.waitAnalysis],
    [[row(issuesInput())], draftInput({ kind: "cassation" }), DRAFT_COPY.kindChanged],
    [[row(issuesInput())], issuesInput(), DRAFT_COPY.kindChanged],
  ] as const) {
    const { client, log } = db([...prior]);
    const r = await startRunWith(client as never, deps(), LAWYER, body(input, prior.length ? { conversationId: CONV } : {}));
    assert.equal(r.status, 409, error);
    assert.equal(r.body.code, "turn_refused");
    assert.equal(r.body.error, error);
    assert.equal(startPayload(log), undefined, "nothing charged");
  }
});

test("a failed draft is tried again free; once a draft succeeded the work is complete", async () => {
  // The failed draft is not a turn (runCore reads running/review/succeeded only).
  const again = db([row(issuesInput())]);
  const r = await startRunWith(again.client as never, deps(), LAWYER, body(draftInput(), { conversationId: CONV }));
  assert.equal(r.status, 202);
  assert.equal(startPayload(again.log)?.p_price, 0);

  const done = db([row(issuesInput()), row(draftInput(), "succeeded", pleading)]);
  const full = await startRunWith(done.client as never, deps(), LAWYER, body(draftInput(), { conversationId: CONV }));
  assert.equal(full.status, 409);
  assert.equal(full.body.code, "conversation_full");
  assert.equal(full.body.error, AI_COPY.conversationFull);
});

test("facts said to be in the files: refused without files, before the charge; accepted with them", async () => {
  const input = issuesInput({ facts: "", facts_in_files: true });
  const none = db();
  const r = await startRunWith(none.client as never, deps([], 0), LAWYER, body(input));
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "files_required");
  assert.equal(startPayload(none.log), undefined);

  const some = db();
  const calls: Call[] = [];
  const ok = await startRunWith(some.client as never, deps(calls, 2), LAWYER, body(input, { fileIds: ["1", "2"] }));
  assert.equal(ok.status, 202);
  assert.equal((calls[1].body.files as unknown[]).length, 2);
});

test("a consultant is refused pleadings (Art. 18), before anything is read or charged", async () => {
  const { client, log } = db();
  const r = await startRunWith(client as never, deps(), CONSULTANT, body(issuesInput()));
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "consultant_blocked");
  assert.equal(log.length, 0);
});

test("the callback: the [S…] markers kept as citations, the articles replaced by the library's verdict", async () => {
  const stored: Array<Record<string, unknown>> = [];
  const { client } = fakeDb((q: FakeQuery) => {
    if (q.table === "ai_runs" && q.op === "select") {
      return { data: { id: RUN, tool: "legal-drafter", status: "running", class: "job", source_ids: FOUND.map, input: draftInput() } };
    }
    if (q.table === "platform_settings") return { data: { value: { "legal-drafter": { mode: "live" } } } };
    if (q.table === "ai_runs" && q.op === "update") {
      stored.push(q.payload as Record<string, unknown>);
      return { data: [{ id: RUN }] };
    }
    return {};
  });
  const admin = Object.assign(client, {
    schema: () => ({
      from: (table: string) =>
        table === "laws"
          ? { select: () => ({ ilike: () => ({ limit: async () => ({ data: [{ slug: "labor", title: "نظام العمل", status: "active" }], error: null }) }) }) }
          : { select: () => ({ in: () => ({ in: async () => ({ data: [{ id: "labor__art-77", number: 77, status: "active", law_slug: "labor" }], error: null }) }) }) },
    }),
  });
  const r = await callbackWith(admin as never, { run_id: RUN, status: "succeeded", output: pleading, citations: ["S1", "S9"] });
  assert.deepEqual(r.body, { ok: true, final: "succeeded" });
  const done = stored.find((u) => u.output) as Record<string, unknown>;
  const out = done.output as Record<string, unknown>;
  assert.equal(out.cited, undefined);
  assert.deepEqual((out.citation_check as Array<{ article: number; status: string }>).map((c) => [c.article, c.status]), [[77, "ok"]]);
  assert.deepEqual((done.citations as Array<{ id: string }>).map((c) => c.id), ["labor__art-77"], "an unknown marker is dropped");
});
