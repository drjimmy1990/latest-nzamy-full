/**
 * sectionEdits.test.ts — owner ٤١٠ «عدّل هذا القسم» in «الصائغ القانوني»
 * (batch 2026-11-08 B3): the free/paid rule (5 free per memo, 2 per section,
 * then 10 points), the counts read from the conversation's own runs (a failed
 * edit is not read, so it gives its free edit back), the turn order, the input
 * and output of the «section» phase, and the wiring through startRunWith:
 * ai_start_section_edit with the caps, never a founder credit, a stale
 * expectedPrice refused uncharged, the 30-edit ceiling, and the SQL's refusals.
 * The race itself is proved in Docker (supabase/tests/rls/drafter_section_edits_1108.test.sql).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/sectionEdits.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { settleRunWith, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { Retrieved } from "./retrieval.ts";
import { AI_TOOLS, LIB_QUERIES_PATH } from "./tools.ts";
import {
  NO_SECTION_EDITS,
  SECTION_EDIT_COPY,
  SECTION_EDIT_MAX_PER_MEMO,
  asSectionEditCounts,
  countSectionEdits,
  sectionEditAllowanceText,
  sectionEditPrice,
  sectionEditQuote,
  withSectionEdit,
  type SectionEditCounts,
} from "./sectionEdits.ts";
import { creditKindForRun } from "../membership/founderPlan.ts";
import { asEditedSection, sectionEditInput, withEditedSections } from "../../components/draft/legalDraft.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const CONV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const LAWYER: RunActor = { userId: "u-1", userType: "lawyer", practiceKind: "advocate", displayName: null };
const tool = AI_TOOLS["legal-drafter"];

const FACTS = "عمل الموكل لدى الشركة خمس سنوات ثم فُصل دون إنذار ولم تُصرف مستحقاته.";
const issues = { phase: "issues", kind: "claim", client_role: "plaintiff", facts: FACTS, search_text: FACTS };
const draft = {
  phase: "draft", kind: "claim", client_role: "plaintiff", facts: FACTS,
  issues: [{ title: "مشروعية الفصل", detail: "" }], defenses: [{ title: "الفصل دون سبب مشروع", basis: "" }], requests: [],
};
const pleading = {
  phase: "draft", title: "لائحة دعوى عمالية",
  sections: [
    { heading: "البيانات", body: "المدعي: [....]" },
    { heading: "الوقائع", body: "عمل المدعي… [S1]" },
    { heading: "الأسانيد", body: "تنص المادة ٧٧… [S1][S2]" },
  ],
  requests: [], cited: [],
};
const section = (index: number, over: Record<string, unknown> = {}) => ({
  phase: "section", kind: "claim", client_role: "plaintiff", facts: FACTS,
  section_index: index, instruction: "اختصر هذا القسم",
  section: { heading: pleading.sections[index]?.heading ?? "قسم", body: pleading.sections[index]?.body ?? "نص" },
  title: pleading.title, outline: pleading.sections.map((s) => s.heading),
  ...over,
});
/** A section-edit run as runCore reads it back. */
const editRow = (index: number, price: number, status = "succeeded") => ({
  input: { phase: "section", kind: "claim", section_index: index },
  output: { phase: "section", section_index: index, heading: "h", body: "b" },
  status,
  price_points: price,
});
const memo = (...edits: Array<ReturnType<typeof editRow>>) => [
  { input: issues, output: { phase: "issues" }, status: "succeeded", price_points: 200 },
  { input: draft, output: pleading, status: "succeeded", price_points: 0 },
  ...edits,
];

// ── the rule ─────────────────────────────────────────────────────────────────

test("the 5th memo edit is free, the 6th is 10 points", () => {
  // Four free edits on four sections: the 5th (a fresh section) is free.
  let c: SectionEditCounts = NO_SECTION_EDITS;
  for (const i of [0, 1, 2, 3]) c = withSectionEdit(c, i, sectionEditPrice(c, i));
  assert.equal(c.freeMemo, 4);
  assert.equal(sectionEditPrice(c, 4), 0, "5th edit of the memo is free");
  c = withSectionEdit(c, 4, 0);
  assert.equal(sectionEditPrice(c, 5), 10, "6th edit is paid, even on an untouched section");
  assert.deepEqual(sectionEditQuote(c, 5), { free: false, price: 10, memoFreeLeft: 0, sectionFreeLeft: 0, limitReached: false });
});

test("the 3rd edit of the same section is 10 points even when the memo has used fewer than 5", () => {
  let c: SectionEditCounts = NO_SECTION_EDITS;
  c = withSectionEdit(c, 2, sectionEditPrice(c, 2));
  c = withSectionEdit(c, 2, sectionEditPrice(c, 2));
  assert.equal(c.freeMemo, 2);
  assert.equal(sectionEditPrice(c, 2), 10);
  assert.equal(sectionEditPrice(c, 0), 0, "another section is still free");
  // A paid edit does not use a free one: the memo still has 3.
  c = withSectionEdit(c, 2, 10);
  assert.deepEqual(sectionEditQuote(c, 1), { free: true, price: 0, memoFreeLeft: 3, sectionFreeLeft: 2, limitReached: false });
});

test("no hard stop per section: a section can be edited again and again at 10 points", () => {
  let c: SectionEditCounts = NO_SECTION_EDITS;
  for (let n = 0; n < 8; n++) c = withSectionEdit(c, 0, sectionEditPrice(c, 0));
  assert.equal(c.total, 8);
  assert.equal(c.freeMemo, 2);
  assert.equal(sectionEditQuote(c, 0).limitReached, false);
  assert.equal(sectionEditPrice(c, 0), 10);
});

test("the technical ceiling: 30 edits per memo", () => {
  const c: SectionEditCounts = { total: SECTION_EDIT_MAX_PER_MEMO, freeMemo: 5, freeBySection: {} };
  assert.equal(sectionEditQuote(c, 0).limitReached, true);
  assert.equal(SECTION_EDIT_MAX_PER_MEMO, 30);
});

test("unknown counts or a bad index are paid, never free", () => {
  assert.equal(sectionEditPrice(undefined, 0), 10);
  assert.equal(sectionEditPrice(null, 0), 10);
  assert.equal(sectionEditPrice(NO_SECTION_EDITS, -1), 10);
  assert.equal(sectionEditPrice(NO_SECTION_EDITS, "1"), 10);
  assert.equal(tool.price(section(0), { pages: null, turn: 5 }), 10, "price() without priorSectionEdits");
  assert.equal(tool.price(section(0), { pages: null, turn: 5, priorSectionEdits: NO_SECTION_EDITS }), 0);
});

test("counts: from the memo's section runs only; a paid run is not a free one; an unknown price counts as free (dearer, never cheaper)", () => {
  const c = countSectionEdits([
    ...memo(editRow(0, 0), editRow(0, 0), editRow(0, 10), editRow(1, 0, "running")),
    { input: { phase: "section", section_index: 2 }, output: null, status: "succeeded" },
    { input: { phase: "section", section_index: 3 }, output: null, status: "failed", price_points: 0 },
  ]);
  assert.deepEqual(c, { total: 5, freeMemo: 4, freeBySection: { 0: 2, 1: 1, 2: 1 } });
});

test("the allowance line and the counts the server sends back", () => {
  const c = withSectionEdit(withSectionEdit(NO_SECTION_EDITS, 0, 0), 1, 0);
  assert.equal(sectionEditAllowanceText(sectionEditQuote(c, 0)), "تعديلات مجانية متبقية: ٣ من ٥ — هذا القسم: ١ من ٢");
  assert.deepEqual(asSectionEditCounts(JSON.parse(JSON.stringify(c))), c);
  assert.equal(asSectionEditCounts({ total: "1" }), null);
});

// ── the founder plan ─────────────────────────────────────────────────────────

test("a section edit is not a founder drafting work: creditKindForRun gives none at any later turn", () => {
  for (const turn of [2, 3, 10]) assert.equal(creditKindForRun("legal-drafter", section(0), turn), null);
});

// ── input, output, turns ─────────────────────────────────────────────────────

test("section input: from the browser only the index and a bounded instruction; the section, had_citations and the frame it sends are dropped", () => {
  const v = tool.validateInput;
  assert.deepEqual(v(section(0, { instruction: " " })), { ok: false, error: SECTION_EDIT_COPY.instruction });
  assert.deepEqual(v(section(0, { instruction: "x".repeat(1001) })), { ok: false, error: SECTION_EDIT_COPY.instruction });
  assert.deepEqual(v(section(30)), { ok: false, error: SECTION_EDIT_COPY.badSection });
  assert.deepEqual(v(section(0, { section_index: "0" })), { ok: false, error: SECTION_EDIT_COPY.badSection });
  // Whatever the browser says about the section is not even read.
  const ok = v(section(2, { section: { heading: "", body: "[S1]" }, had_citations: false, title: "مزوّر", facts: "وقائع أخرى" }));
  assert.ok(ok.ok);
  if (ok.ok) {
    assert.deepEqual(ok.input, { phase: "section", kind: "claim", section_index: 2, instruction: "اختصر هذا القسم", search_text: "اختصر هذا القسم" });
    assert.equal(tool.citationsOptional!(ok.input), false, "until the stored section is read, it counts as cited");
  }
});

test("section from the stored draft: the stored text wins over the browser's, markers stripped and remembered, the frame is the draft run's", () => {
  const from = tool.fromPrior!;
  const browser = tool.validateInput(section(2, { section: { heading: "الأسانيد", body: "نص من المتصفح بلا مصادر" }, had_citations: false }));
  assert.ok(browser.ok);
  if (!browser.ok) return;
  const r = from(browser.input, memo());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.deepEqual(r.input.section, { heading: "الأسانيد", body: "تنص المادة ٧٧…" });
  assert.equal(r.input.had_citations, true, "a browser-sent false is ignored");
  assert.equal(tool.citationsOptional!(r.input), false);
  assert.equal(r.input.search_text, "الأسانيد\nاختصر هذا القسم\nتنص المادة ٧٧…");
  assert.equal(r.input.section_index, 2);
  assert.equal(r.input.title, pleading.title);
  assert.deepEqual(r.input.outline, ["البيانات", "الوقائع", "الأسانيد"]);
  assert.equal(r.input.facts, FACTS);
  assert.deepEqual(r.input.issues, draft.issues);
  assert.equal(r.input.phase, "section");
  // A section that cited nothing.
  const plain = tool.validateInput(section(0, { had_citations: true }));
  assert.ok(plain.ok);
  const p0 = plain.ok ? from(plain.input, memo()) : null;
  assert.ok(p0?.ok && p0.input.had_citations === false && tool.citationsOptional!(p0.input) === true);
  // Not a section run: untouched.
  assert.deepEqual(from(draft, memo()), { ok: true, input: draft });
});

test("section from the stored draft: the newest succeeded edit of that section is the one edited; failed edits and other sections do not count", () => {
  const from = tool.fromPrior!;
  const edit = (index: number, body: string, status = "succeeded", heading = "الأسانيد المعدلة") => ({
    input: { phase: "section", kind: "claim", section_index: index },
    output: { phase: "section", section_index: index, heading, body },
    status, price_points: 0,
  });
  const v = tool.validateInput(section(2));
  assert.ok(v.ok);
  if (!v.ok) return;
  const once = from(v.input, memo(edit(2, "صيغة أولى [S3]"), edit(2, "صيغة ثانية بلا سند"), edit(1, "الوقائع الجديدة [S1]", "succeeded", "الوقائع المعدلة"), edit(2, "صيغة فاشلة [S1]", "running")));
  assert.ok(once.ok);
  if (!once.ok) return;
  assert.deepEqual(once.input.section, { heading: "الأسانيد المعدلة", body: "صيغة ثانية بلا سند" });
  assert.equal(once.input.had_citations, false, "the newest version cited nothing");
  assert.deepEqual(once.input.outline, ["البيانات", "الوقائع المعدلة", "الأسانيد المعدلة"], "the outline follows the edits");
  const latest = from(v.input, memo(edit(2, "بلا سند"), edit(2, "صيغة أحدث [S2]")));
  assert.ok(latest.ok && latest.input.had_citations === true && (latest.input.section as { body: string }).body === "صيغة أحدث");
  // No succeeded draft, or the section is not in it: refused, uncharged (runCore answers 409).
  assert.deepEqual(from(v.input, memo().slice(0, 1)), { ok: false, error: SECTION_EDIT_COPY.needDraft });
  const v3 = tool.validateInput(section(3));
  assert.ok(v3.ok);
  if (v3.ok) assert.deepEqual(from(v3.input, memo()), { ok: false, error: SECTION_EDIT_COPY.badSection });
});

test("section output: one {heading, body}, the index from the input; anything else refused", () => {
  const out = tool.validateOutput;
  const input = { phase: "section", section_index: 1 };
  assert.deepEqual(out({ heading: "الوقائع", body: "نص [S1]", cited: [] }, input), {
    phase: "section", section_index: 1, heading: "الوقائع", body: "نص [S1]", cited: [],
  });
  assert.equal(out({ heading: "", body: "x" }, input), null);
  assert.equal(out({ heading: "h", body: "x".repeat(12001) }, input), null);
  assert.equal(out({ sections: pleading.sections }, input), null, "a whole memo is not a section");
});

test("section turns: after a succeeded draft only, of a section that exists, up to 30 edits; a 2nd draft refused", () => {
  const turn = tool.checkTurn!;
  assert.equal(turn(section(0), 0, []), "ابدأ بتحليل الوقائع أولاً");
  assert.equal(turn(section(0), 1, memo().slice(0, 1)), SECTION_EDIT_COPY.needDraft);
  const running = [memo()[0], { ...memo()[1], status: "running", output: null }];
  assert.equal(turn(section(0), 2, running), SECTION_EDIT_COPY.waitDraft);
  assert.equal(turn(section(3), 2, memo()), SECTION_EDIT_COPY.badSection, "the memo has 3 sections");
  assert.equal(turn(section(0, { kind: "appeal" }), 2, memo()), "نوع المذكرة يختلف عن التحليل — ابدأ صياغة جديدة");
  assert.equal(turn(draft, 2, memo()), SECTION_EDIT_COPY.draftDone);
  assert.equal(turn(section(2), 2, memo()), null);
  const thirty = memo(...Array.from({ length: 30 }, () => editRow(0, 10)));
  assert.equal(turn(section(0), 32, thirty), SECTION_EDIT_COPY.limit);
});

// ── through the pipeline ─────────────────────────────────────────────────────

const FOUND: Retrieved = {
  sources: [{ sid: "S1", kind: "article", title: "نظام العمل — السابعة والسبعون", text: "…" }],
  map: { S1: { kind: "article", id: "labor__art-77", title: "نظام العمل — السابعة والسبعون", url: "/laws/labor#labor__art-77" } },
};

function db(prior: unknown[], startError: { code?: string; message: string } | null = null) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: { "legal-drafter": { mode: "live" } } } };
    if (q.table === "ai_runs" && q.op === "select") return { data: prior };
    if (q.op === "rpc" && (q.table === "ai_start_section_edit" || q.table === "ai_start_run" || q.table === "ai_start_run_with_credit")) {
      if (startError) return { error: startError };
      const price = (q.payload as Record<string, unknown>).p_price as number;
      return { data: [{ run_id: RUN, created: true, status: "running", charged: price > 0, charged_points: price }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    if (q.table === "ai_runs" && q.op === "update") return { data: [{ id: RUN }] };
    return {};
  });
}

function deps(): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) =>
      call.path === LIB_QUERIES_PATH
        ? { kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: ["فصل العامل"] } } }
        : { kind: "accepted" },
    libraryAccess: async () => null,
    retrieve: async () => FOUND,
    resolveFiles: async () => ({ ok: true, files: [], pages: 0 }) as never,
  };
}

const body = (input: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  tool: "legal-drafter", input, idempotencyKey: "key-section-01", conversationId: CONV, ...over,
});
const rpc = (log: FakeQuery[]) => log.find((q) => q.op === "rpc" && q.table.startsWith("ai_start"));

test("pipeline: a free edit goes to ai_start_section_edit at 0 with the caps; the read includes price_points", async () => {
  const { client, log } = db(memo(editRow(0, 0)));
  const r = await startRunWith(client as never, deps(), LAWYER, body(section(1), { expectedPrice: 0 }));
  assert.equal(r.status, 202);
  const start = rpc(log)!;
  assert.equal(start.table, "ai_start_section_edit");
  const p = start.payload as Record<string, unknown>;
  assert.equal(p.p_price, 0);
  assert.equal(p.p_section_index, 1);
  assert.equal(p.p_conversation, CONV);
  assert.deepEqual([p.p_free_per_memo, p.p_free_per_section, p.p_paid_price, p.p_max_per_memo], [5, 2, 10, 30]);
  assert.equal(p.p_credit_kind, undefined);
  const read = log.find((q) => q.table === "ai_runs" && q.op === "select")!;
  assert.match(String(read.columns), /price_points/);
});

test("pipeline: the 6th memo edit and the 3rd edit of a section are charged 10", async () => {
  const five = memo(editRow(0, 0), editRow(0, 0), editRow(1, 0), editRow(1, 0), editRow(2, 0));
  const a = db(five);
  assert.equal((await startRunWith(a.client as never, deps(), LAWYER, body(section(2), { expectedPrice: 10 }))).status, 202);
  assert.equal((rpc(a.log)!.payload as Record<string, unknown>).p_price, 10);

  const two = memo(editRow(0, 0), editRow(0, 0));
  const b = db(two);
  assert.equal((await startRunWith(b.client as never, deps(), LAWYER, body(section(0), { expectedPrice: 10 }))).status, 202);
  assert.equal((rpc(b.log)!.payload as Record<string, unknown>).p_price, 10);

  // A failed (refunded) edit is not read back: its free edit is available again.
  const c = db(memo(editRow(0, 0)));
  await startRunWith(c.client as never, deps(), LAWYER, body(section(0), { expectedPrice: 0 }));
  assert.equal((rpc(c.log)!.payload as Record<string, unknown>).p_price, 0);
});

test("pipeline: a section edit never spends a founder credit, even when the browser asks", async () => {
  const { client, log } = db(memo());
  const r = await startRunWith(client as never, deps(), LAWYER, body(section(0), { useCredit: true, expectedPrice: 0 }));
  assert.equal(r.status, 202);
  assert.equal(rpc(log)!.table, "ai_start_section_edit");
  assert.equal((rpc(log)!.payload as Record<string, unknown>).p_credit_kind, undefined);
  assert.equal(r.body.creditUsed, false);
});

test("pipeline: a price other than the one shown is refused, uncharged, with the counts to show again", async () => {
  const { client, log } = db(memo(editRow(0, 0), editRow(0, 0)));
  const r = await startRunWith(client as never, deps(), LAWYER, body(section(0), { expectedPrice: 0 }));
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "price_changed");
  assert.equal(r.body.price, 10);
  assert.deepEqual((r.body.details as Record<string, unknown>).sectionEdits, { total: 2, freeMemo: 2, freeBySection: { 0: 2 } });
  assert.equal(rpc(log), undefined, "nothing started");
});

test("pipeline: the SQL's refusals — a race lost, the ceiling, no draft — and a missing function refuses uncharged", async () => {
  for (const [message, code, error] of [
    ["section_price_changed", "price_changed", SECTION_EDIT_COPY.priceChanged],
    ["section_edit_limit", "turn_refused", SECTION_EDIT_COPY.limit],
    ["section_no_draft", "turn_refused", SECTION_EDIT_COPY.waitDraft],
  ] as const) {
    const { client } = db(memo(), { code: "P0001", message });
    const r = await startRunWith(client as never, deps(), LAWYER, body(section(0), { expectedPrice: 0 }));
    assert.equal(r.status, 409, message);
    assert.equal(r.body.code, code);
    assert.equal(r.body.error, error);
  }
  for (const code of ["42883", "PGRST202"]) {
    const { client, log } = db(memo(), { code, message: "function public.ai_start_section_edit does not exist" });
    const r = await startRunWith(client as never, deps(), LAWYER, body(section(0), { expectedPrice: 0 }));
    assert.equal(r.status, 503, code);
    assert.equal(r.body.error, SECTION_EDIT_COPY.unavailable);
    assert.equal(log.filter((q) => q.op === "rpc" && q.table === "ai_start_run").length, 0, "never an unlocked fallback");
  }
});

test("pipeline: the 31st edit is refused by the turn check, before anything is charged", async () => {
  const { client, log } = db(memo(...Array.from({ length: 30 }, () => editRow(1, 10))));
  const r = await startRunWith(client as never, deps(), LAWYER, body(section(0), { expectedPrice: 10 }));
  assert.equal(r.status, 409);
  assert.equal(r.body.error, SECTION_EDIT_COPY.limit);
  assert.equal(rpc(log), undefined);
});

test("pipeline: a section that cited nothing is edited even when the library finds nothing; one that cited is refunded (no_sources)", async () => {
  const run = async (input: Record<string, unknown>, writer: string[]) => {
    const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
    const d: StartRunDeps = {
      ...deps(),
      n8n: async (call) => {
        calls.push(call as never);
        return call.path === LIB_QUERIES_PATH
          ? { kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: writer } } }
          : { kind: "accepted" };
      },
      retrieve: async () => ({ sources: [], map: {} }),
    };
    const { client, log } = db(memo());
    const r = await startRunWith(client as never, d, LAWYER, body(input, { expectedPrice: 0 }));
    return { r, calls, log };
  };
  // «البيانات» had no [S…]: no searches, or searches that find nothing — it still goes to n8n, with no sources.
  for (const writer of [[], ["بيانات الأطراف"]]) {
    const plain = await run(section(0), writer);
    assert.equal(plain.r.status, 202, `writer ${JSON.stringify(writer)}`);
    const pkg = plain.calls.find((c) => c.path === "nzamy-ai/legal-drafter");
    assert.ok(pkg, "dispatched to n8n");
    assert.deepEqual(pkg!.body.sources, []);
    assert.equal(plain.log.some((q) => q.op === "rpc" && q.table === "ai_fail_run"), false);
  }
  // «الأسانيد» cited: with nothing found it is refunded as before.
  const cited = await run(section(2), ["فصل العامل"]);
  assert.equal(cited.r.status, 422);
  assert.equal(cited.r.body.code, "no_sources");
  assert.ok(cited.log.some((q) => q.op === "rpc" && q.table === "ai_fail_run"));
});

test("pipeline: the stored section, not the browser's, is sent to n8n and stored; a browser-sent false on a cited section still fails no_sources", async () => {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const d: StartRunDeps = { ...deps(), n8n: async (call) => { calls.push(call as never); return deps().n8n(call); } };
  const { client, log } = db(memo());
  const forged = section(1, { section: { heading: "الوقائع", body: "نص مزوّر من المتصفح" }, had_citations: false, title: "عنوان آخر" });
  const r = await startRunWith(client as never, d, LAWYER, body(forged, { expectedPrice: 0 }));
  assert.equal(r.status, 202);
  const sent = calls.find((c) => c.path === "nzamy-ai/legal-drafter")!.body.input as Record<string, unknown>;
  assert.deepEqual(sent.section, { heading: "الوقائع", body: "عمل المدعي…" });
  assert.equal(sent.had_citations, true);
  assert.equal(sent.title, pleading.title);
  const stored = (rpc(log)!.payload as Record<string, unknown>).p_input as Record<string, unknown>;
  assert.deepEqual(stored.section, sent.section, "the run row keeps the server's copy");
  assert.equal(JSON.stringify(calls).includes("مزوّر"), false);

  // The cited «الأسانيد», with the browser claiming it cited nothing and the library finding nothing.
  const none: StartRunDeps = { ...deps(), retrieve: async () => ({ sources: [], map: {} }) };
  const second = db(memo());
  const refused = await startRunWith(second.client as never, none, LAWYER,
    body(section(2, { had_citations: false, section: { heading: "الأسانيد", body: "بلا مصادر" } }), { expectedPrice: 0 }));
  assert.equal(refused.status, 422);
  assert.equal(refused.body.code, "no_sources");
});

test("pipeline: an edit of a section the stored draft does not have is refused before the charge", async () => {
  const { client, log } = db(memo());
  const r = await startRunWith(client as never, deps(), LAWYER, body(section(3), { expectedPrice: 0 }));
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "turn_refused");
  assert.equal(rpc(log), undefined);
});

test("settle: an edit of a section that cited nothing may cite nothing; one that cited must cite (else failed, refunded)", async () => {
  const settle = async (input: Record<string, unknown>) => {
    const { client, log } = fakeDb((q: FakeQuery) => {
      if (q.table === "ai_runs" && q.op === "update") return { data: [{ id: RUN }] };
      if (q.op === "rpc") return { data: true };
      return {};
    });
    // The drafter's enricher reads the library; with nothing cited it reads nothing.
    const admin = Object.assign(client, { schema: () => ({ from: () => ({ select: () => ({ ilike: () => ({ limit: async () => ({ data: [], error: null }) }), in: () => ({ in: async () => ({ data: [], error: null }) }) }) }) }) });
    const out = await settleRunWith(admin as never, { spec: tool, runId: RUN, sources: FOUND.map as never, input },
      { run_id: RUN, status: "succeeded", output: { heading: "البيانات", body: "المدعي: فلان", cited: [] }, citations: [] });
    return { out, log };
  };
  // The input as runCore stores it: validated, then rebuilt from the stored draft.
  const stored = (input: Record<string, unknown>) => {
    const v = tool.validateInput(input);
    assert.ok(v.ok);
    const r = v.ok ? tool.fromPrior!(v.input, memo()) : null;
    assert.ok(r?.ok);
    return r && r.ok ? r.input : {};
  };
  assert.equal((await settle(stored(section(0)))).out.kind, "succeeded");
  assert.deepEqual((await settle(stored(section(2)))).out, { kind: "failed", code: "ungrounded" });
  // A browser that says the cited section cited nothing is still citation-checked.
  const lying = stored(section(2, { had_citations: false, section: { heading: "الأسانيد", body: "بلا مصادر" } }));
  assert.deepEqual((await settle(lying)).out, { kind: "failed", code: "ungrounded" });
  // And an input never rebuilt (no had_citations at all) is held to the stricter rule.
  const raw = tool.validateInput(section(0));
  assert.ok(raw.ok);
  if (raw.ok) assert.deepEqual((await settle(raw.input)).out, { kind: "failed", code: "ungrounded" });
});

// ── the screen ───────────────────────────────────────────────────────────────

test("screen helpers: the edit's input carries the draft's frame and the section; the edit replaces only its section", () => {
  const draftSent = { ...draft, phase: "draft" };
  const input = sectionEditInput(draftSent, { title: pleading.title, sections: pleading.sections }, 1, "  أضف التاريخ ");
  assert.equal(input.phase, "section");
  assert.equal(input.instruction, "أضف التاريخ");
  assert.deepEqual(input.section, pleading.sections[1]);
  assert.deepEqual(input.outline, ["البيانات", "الوقائع", "الأسانيد"]);
  assert.ok(tool.validateInput(input).ok, "what the screen sends passes the server's check");

  const edit = asEditedSection({ phase: "section", section_index: 1, heading: "الوقائع", body: "جديد", citation_check: [{ article: 1 }] });
  assert.ok(edit);
  const p = withEditedSections({ title: "t", sections: pleading.sections, requests: [], citation_check: [] }, { 1: edit! });
  assert.deepEqual(p.sections.map((s) => s.body), ["المدعي: [....]", "جديد", "تنص المادة ٧٧… [S1][S2]"]);
  assert.equal(p.citation_check.length, 1);
  assert.equal(asEditedSection({ phase: "draft" }), null);
});

test("source contract: the draft screen offers «عدّل هذا القسم», shows the allowance and the price, sends expectedPrice, never useCredit", () => {
  const src = readFileSync("src/components/draft/steps/StepAiDraft.tsx", "utf8");
  assert.match(src, /عدّل هذا القسم/);
  assert.match(src, /sectionEditAllowanceText\(quote\)/);
  assert.match(src, /sectionEditPriceText\(quote\)/);
  assert.match(src, /expectedPrice: quote\.price/);
  const editStart = src.slice(src.indexOf("function startEdit"), src.indexOf("function startEdit") + 700);
  assert.doesNotMatch(editStart, /useCredit/);
  // Dark mode: globals.css turns gray-50/100/200 into dark surfaces, so such text would vanish.
  assert.doesNotMatch(src, /text-gray-(50|100|200)\b/);
});

test("source contract: the n8n prompt has the «section» phase, one section only, the citation rules kept", () => {
  const mjs = readFileSync("n8n/ai/workflows.mjs", "utf8");
  const prompt = mjs.slice(mjs.indexOf("const LEGAL_DRAFTER_PROMPT"), mjs.indexOf("const DRAFTER_PARSE"));
  assert.match(prompt, /i\.phase === 'section'/);
  assert.match(prompt, /أعد كتابة هذا القسم وحده/);
  assert.match(prompt, /"heading":"","body":""/);
  assert.match(prompt, /ولا تضع معرّفاً لم يُرسل إليك/, "the citation rules apply to every phase");
  const json = readFileSync("n8n/ai/legal-drafter.json", "utf8");
  assert.match(json, /i\.phase === 'section'/, "the exported workflow is regenerated");
});
