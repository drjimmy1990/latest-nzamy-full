/**
 * n8nLegalDrafterV2.test.ts — the staging workflow «legal-drafter-v2»
 * (n8n/ai/legalDrafterV2.mjs). Its Code nodes run here the way n8n runs them,
 * with a fake `$`, and a FAKE MODEL answers each stage; the loop
 * Next stage → model → Absorb → Next stage is driven by hand. No real model,
 * no network, nothing on n8n.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/n8nLegalDrafterV2.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AI_WORKFLOWS, CREDENTIALS, MODEL } from "../../../n8n/ai/workflows.mjs";
import {
  ABSORB_CODE, CODE, NAJIZ_MAX_CHARS, TEMP_PROMPTS, V2_NAME, V2_PATH, V2_STAGES, toLegalDrafterV2Workflow,
} from "../../../n8n/ai/legalDrafterV2.mjs";
import { AI_TOOLS } from "./tools.ts";
import { DRAFT_KINDS } from "./draftKinds.ts";

type Item = { json: Record<string, any>; binary?: Record<string, unknown> };
type Node = Record<string, any>;
type Reply = (stage: string, content: string) => string | null;

const RUN_ID = "11111111-2222-4333-8444-555555555555";
const SOURCES = [
  { sid: "S1", kind: "law", title: "نظام المرافعات الشرعية", text: "تُرفع الدعوى إلى المحكمة بصحيفة تودع لدى المحكمة المختصة." },
  { sid: "S2", kind: "law", title: "نظام الإثبات", text: "على المدعي أن يثبت ما يدعيه." },
];
const pkg = (input: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  v: 1, run_id: RUN_ID, tool: "legal-drafter", class: "job", model_tier: "deep",
  actor: { role: "lawyer", practice_kind: "advocate", display_name: null },
  input, sources: SOURCES, history: [], files: [], respond: { mode: "callback", callback_url: "https://example.invalid/cb" }, ...extra,
});
const DRAFT_INPUT = {
  phase: "draft", kind: "appeal", client_role: "plaintiff", facts: "وقائع [S1] مؤكدة",
  issues: [{ title: "الاختصاص", detail: "تفصيل" }], defenses: [{ title: "دفع", basis: "سند [S2]", issue: 1 }], requests: ["إلغاء الحكم"],
};
const MEMO = {
  title: "لائحة اعتراض", requests: ["إلغاء الحكم"], cited: [{ law: "نظام المرافعات الشرعية", article: 1, as_written: "x" }],
  sections: [{ heading: "الوقائع", body: "نص الوقائع [S1]" }, { heading: "الأسانيد", body: "نص الأسانيد [S2]" }],
};

const wf = toLegalDrafterV2Workflow() as { name: string; nodes: Node[]; connections: Record<string, any>; settings: Record<string, unknown> };
const codeOf = (name: string) => wf.nodes.find((n) => n.name === name)!.parameters.jsCode as string;

/** Drives the loop. `reply(stage, content)` is the fake model; null = the model fails. */
function run(body: Record<string, any>, reply: Reply, first: Record<string, any> = { body }, binary?: Record<string, unknown>) {
  let lastNext: Item | null = null;
  const log: { stage: string; content: string; model: string; step: string; done: any }[] = [];
  const $ = (name: string) => {
    if (name === "Webhook") return { first: () => ({ json: { body } }) };
    if (name === "Next stage") return { last: () => lastNext! };
    throw new Error("unexpected node " + name);
  };
  let item: Item = { json: first, ...(binary ? { binary } : {}) };
  for (let guard = 0; guard < 12; guard++) {
    const next = new Function("$", "$json", "$input", codeOf("Next stage"))($, item.json, { first: () => item, all: () => [item] }) as Item[];
    const n = next[0];
    if (n.json.status) return { final: n.json, log, next: n };
    lastNext = n;
    log.push({ stage: n.json.stage, content: n.json.content, model: n.json.model, step: n.json.step, done: n.json.done });
    const text = reply(n.json.stage, n.json.content);
    const absorbIn = text === null ? { error: "Service unavailable" } : { output: text };
    if (text === null) return { final: runCode(CODE.modelError, body, absorbIn, $)[0].json, log, next: n };
    item = runCode(ABSORB_CODE, body, absorbIn, $)[0];
    if (item.json.status) return { final: item.json, log, next: n };
  }
  throw new Error("loop did not end");
}
function runCode(code: string, body: Record<string, any>, json: Record<string, unknown>, $?: any): Item[] {
  const dollar = $ ?? ((name: string) => ({ first: () => ({ json: { body } }) }));
  return new Function("$", "$json", "$input", code)(dollar, json, { all: () => [{ json }], first: () => ({ json }) }) as Item[];
}

const j = (o: unknown) => JSON.stringify(o);
const good: Reply = (stage) => {
  if (stage === "write") return j(MEMO);
  if (stage === "extraction") return j({ items: [{ sid: "S1", law: "المرافعات", article: 1, verbatim: "تودع لدى المحكمة المختصة", supports: "الوقائع" }], gaps: ["g"], conflicts: [] });
  if (stage === "adversary") return j({ verdict: "ضعيف", findings: [{ severity: "high", where: "الأسانيد", issue: "ثغرة", suggestion: "عالجها" }] });
  if (stage === "refine") return j({ ...MEMO, title: "لائحة منقحة", changes: [{ where: "الأسانيد", what: "أصلحت" }] });
  return j({ text: "نص ناجز مختصر" });
};

test("the workflow is a staging copy: own name and path, inactive, wired into one loop, no secrets", () => {
  assert.equal(wf.name, V2_NAME);
  assert.match(wf.name, /\(staging\)$/);
  const hook = wf.nodes.find((n) => n.name === "Webhook")!;
  assert.equal(hook.parameters.path, V2_PATH);
  assert.equal(V2_PATH, "nzamy-ai/legal-drafter-v2");
  assert.equal(hook.parameters.authentication, "headerAuth");
  assert.equal(hook.parameters.responseMode, "responseNode");
  assert.notEqual(V2_PATH, AI_TOOLS["legal-drafter"].n8nPath, "L14 keeps its own path");
  assert.ok(!AI_WORKFLOWS.some((d: { path: string }) => d.path === V2_PATH), "not in the registry-mirroring list");
  const ids = AI_WORKFLOWS.map((d: { webhookId: string }) => d.webhookId);
  assert.ok(!ids.includes(hook.webhookId), "its webhook id is its own");
  assert.equal((wf as Record<string, unknown>).active, undefined, "imported inactive");
  const names = new Set(wf.nodes.map((n) => n.name));
  assert.equal(names.size, wf.nodes.length);
  for (const [from, c] of Object.entries(wf.connections)) {
    assert.ok(names.has(from), from);
    for (const outs of Object.values(c as Record<string, any[][]>)) for (const o of outs) for (const l of o) assert.ok(names.has(l.node), `${from} → ${l.node}`);
  }
  assert.deepEqual(wf.connections.Absorb.main[0].map((l: { node: string }) => l.node), ["Next stage"], "the loop closes on Next stage");
  assert.deepEqual(wf.connections["Final?"].main[0].map((l: { node: string }) => l.node), ["Callback"]);
  assert.deepEqual(wf.connections.Model.ai_languageModel[0][0], { node: "Write", type: "ai_languageModel", index: 0 });
  const write = wf.nodes.find((n) => n.name === "Write")!;
  assert.equal(write.onError, "continueErrorOutput");
  assert.equal(wf.connections.Write.main.length, 2);
  for (const n of wf.nodes) for (const c of Object.values(n.credentials ?? {}) as { id: string }[]) {
    assert.ok([CREDENTIALS.inbound.id, CREDENTIALS.callback.id, CREDENTIALS.gemini.id].includes(c.id), n.name);
  }
  const model = wf.nodes.find((n) => n.name === "Model")!;
  assert.equal(model.type, MODEL.type);
  const text = readFileSync(new URL("../../../n8n/ai/legal-drafter-v2.json", import.meta.url), "utf8");
  assert.deepEqual(JSON.parse(text), JSON.parse(JSON.stringify(wf)), "the exported file is current (run scripts/n8n-ai-export.mjs)");
  assert.ok(!/(sk-|AIza|eyJ|Bearer |api[_-]?key["']?\s*:)/i.test(text), "no key or token in the export");
  assert.ok(!text.includes("N8N_API_KEY"));
});

test("the system message has no braces, and a TEMP stand-in exists for every post-draft stage", () => {
  const out = run(pkg(DRAFT_INPUT), good);
  assert.ok(!/[{}]/.test(out.next.json.system));
  assert.deepEqual(Object.keys(TEMP_PROMPTS).sort(), [...V2_STAGES].sort());
});

test("issues and section phases: one stage, the L14 prompt and the output untouched", () => {
  const issues = { phase: "issues", kind: "claim", facts: "وقائع", requests: ["طلب"] };
  const out = run(pkg(issues), () => j({ facts_summary: "ملخص", issues: [], defenses: [], requests: [], missing: [], cited: [] }));
  assert.equal(out.log.length, 1);
  assert.match(out.log[0].content, /المرحلة الأولى: لا تكتب المذكرة بعد/);
  assert.equal(out.final.status, "succeeded");
  assert.equal(out.final.output.facts_summary, "ملخص");
  assert.equal(out.final.output.lawyer_notes, undefined);
  const sec = { phase: "section", kind: "claim", section_index: 0, instruction: "اختصر", section: { heading: "ع", body: "ن" } };
  const s = run(pkg(sec), () => j({ heading: "ع", body: "جديد [S1]", cited: [] }));
  assert.equal(s.log.length, 1);
  assert.match(s.log[0].content, /مرحلة تعديل قسم/);
  assert.deepEqual(s.final.citations, ["S1"]);
});

test("draft: write → extraction → adversary → refine → najiz, same memo shape plus a separate lawyer_notes", () => {
  const body = pkg(DRAFT_INPUT, { prompts: { draft: "نص برومبت النوع للاستئناف", extraction: "نص الاستخراج", adversary: "نص الفاحص", refine: "نص المنقح", najiz: "نص ناجز" } });
  const out = run(body, good);
  assert.deepEqual(out.log.map((l) => l.stage), ["write", "extraction", "adversary", "refine", "najiz"]);
  assert.deepEqual(out.log.map((l) => l.step), ["drafting", "drafting", "reviewing", "reviewing", "reviewing"]);
  const [w, e, a, r, n] = out.log.map((l) => l.content);
  assert.ok(w.startsWith("نص برومبت النوع للاستئناف"));
  assert.match(w, /الشكل: \{"title":""/, "the app's shape is still demanded");
  assert.ok(e.startsWith("نص الاستخراج") && a.startsWith("نص الفاحص") && r.startsWith("نص المنقح") && n.startsWith("نص ناجز"));
  assert.match(a, /<memo>/);
  assert.match(a, /الأسانيد/);
  assert.match(r, /ملاحظات الفاحص العدائي/);
  assert.match(r, /تقرير الاستخراج/);
  assert.match(n, /<memo_text>/);
  const f = out.final;
  assert.equal(f.status, "succeeded");
  assert.equal(f.output.title, "لائحة منقحة", "the refined memo is the memo");
  assert.deepEqual(Object.keys(f.output).filter((k) => ["title", "sections", "requests", "cited"].includes(k)), ["title", "sections", "requests", "cited"]);
  assert.deepEqual(f.output.requests, MEMO.requests);
  assert.equal(f.output.changes, undefined, "the refiner's change list is a note, not memo text");
  assert.equal(f.output.lawyer_notes.adversary.findings[0].severity, "high");
  assert.equal(f.output.lawyer_notes.extraction.items[0].verified, true);
  assert.equal(f.output.lawyer_notes.refine.changes.length, 1);
  assert.equal(f.output.lawyer_notes.refine.requests_changed, false);
  assert.deepEqual(f.output.lawyer_notes.engine.prompts, { write: "body", extraction: "body", adversary: "body", refine: "body", najiz: "body" });
  assert.equal(f.output.najiz.text, "نص ناجز مختصر");
  assert.deepEqual(f.citations, ["S1", "S2"]);
  assert.equal(f.usage.model, "models/gemini-3.1-flash-lite");
  assert.ok(!j(f).includes("نص الفاحص"), "no prompt text in the result");
  // The app's current validator for a draft keeps the memo and ignores the extras.
  const checked = AI_TOOLS["legal-drafter"].validateOutput!(f.output, { phase: "draft", kind: "appeal" });
  assert.ok(checked && (checked as Record<string, unknown>).title === "لائحة منقحة");
});

test("without the owner's texts the TEMP stand-ins run and the result says so", () => {
  const out = run(pkg(DRAFT_INPUT), good);
  assert.deepEqual(out.final.output.lawyer_notes.engine.prompts, { write: "built-in", extraction: "temp", adversary: "temp", refine: "temp", najiz: "temp" });
  assert.ok(out.log[1].content.startsWith(TEMP_PROMPTS.extraction));
  assert.match(out.log[0].content, /المرحلة الثانية: اكتب نص لائحة اعتراض بالاستئناف/, "the L14 wording when no type prompt came");
});

test("input.stages narrows the post-draft stages; a non-draft phase never runs them", () => {
  const out = run(pkg({ ...DRAFT_INPUT, stages: ["adversary", "bogus"] }), good);
  assert.deepEqual(out.log.map((l) => l.stage), ["write", "adversary"]);
  assert.equal(out.final.output.title, "لائحة اعتراض", "no refine, so the draft stands");
  assert.equal(out.final.output.najiz, undefined);
});

test("the adversary is read-only: its reply never reaches the memo", () => {
  const sneaky: Reply = (s, c) => (s === "adversary" ? j({ verdict: "x", findings: [], title: "عنوان مخترق", sections: [{ heading: "h", body: "b" }, { heading: "h2", body: "b2" }] }) : good(s, c));
  const out = run(pkg({ ...DRAFT_INPUT, stages: ["adversary"] }), sneaky);
  assert.equal(out.final.output.title, MEMO.title);
  assert.deepEqual(out.final.output.sections, MEMO.sections);
});

test("extraction keeps only sources that were sent and marks a quote that is not in its source", () => {
  const rep: Reply = (s, c) => (s === "extraction"
    ? j({ items: [
      { sid: "S9", law: "ليس مرسلاً", article: 1, verbatim: "عبارة", supports: "" },
      { sid: "S2", law: "الإثبات", article: 1, verbatim: "عبارة مخترعة لا وجود لها", supports: "" },
      { sid: "S2", law: "الإثبات", article: 1, verbatim: "على المدعي  أن يثبت ما يدعيه", supports: "" },
    ], gaps: [], conflicts: [] })
    : good(s, c));
  const x = run(pkg({ ...DRAFT_INPUT, stages: ["extraction"] }), rep).final.output.lawyer_notes.extraction;
  assert.equal(x.dropped, 1);
  assert.deepEqual(x.items.map((i: { verified: boolean }) => i.verified), [false, true]);
});

test("a failing stage fails the run (full refund) naming the stage; on_stage_error=skip lets a later stage be skipped, never the write", () => {
  const bad: Reply = (s, c) => (s === "adversary" ? "ليس JSON" : good(s, c));
  const strict = run(pkg(DRAFT_INPUT), bad).final;
  assert.equal(strict.status, "failed");
  assert.equal(strict.error.code, "schema_invalid");
  assert.match(strict.error.message, /^adversary:/);
  const soft = run(pkg({ ...DRAFT_INPUT, on_stage_error: "skip" }), bad).final;
  assert.equal(soft.status, "succeeded");
  assert.equal(soft.output.lawyer_notes.adversary, null);
  assert.deepEqual(soft.output.lawyer_notes.skipped.map((x: { stage: string }) => x.stage), ["adversary"]);
  const noWrite = run(pkg({ ...DRAFT_INPUT, on_stage_error: "skip" }), (s, c) => (s === "write" ? "ليس JSON" : good(s, c))).final;
  assert.equal(noWrite.status, "failed");
  const notMemo = run(pkg(DRAFT_INPUT), (s, c) => (s === "write" ? j({ title: "t", sections: [] , requests: [] }) : good(s, c))).final;
  assert.equal(notMemo.status, "failed", "a draft that is not a memo stops before the paid stages");
});

test("a model failure answers the app with a failed body", () => {
  const out = run(pkg(DRAFT_INPUT), (s, c) => (s === "refine" ? null : good(s, c)));
  assert.equal(out.final.status, "failed");
  assert.equal(out.final.error.code, "model_error");
});

test("a refined memo that is not a memo keeps the draft when skipping; najiz markers and the 9,000 limit are reported", () => {
  const rep: Reply = (s, c) => {
    if (s === "refine") return j({ title: "", sections: [], requests: [] });
    if (s === "najiz") return j({ text: "x".repeat(NAJIZ_MAX_CHARS + 1) });
    return good(s, c);
  };
  const out = run(pkg({ ...DRAFT_INPUT, on_stage_error: "skip" }), rep).final;
  assert.equal(out.output.title, MEMO.title);
  assert.equal(out.output.lawyer_notes.refine, null);
  assert.equal(out.output.najiz.over_limit, true);
  const withMark = { ...MEMO, sections: [{ heading: "ع", body: "[يحتاج تحقق] مبلغ" }, MEMO.sections[1]] };
  const kept = run(pkg({ ...DRAFT_INPUT, stages: ["najiz"] }), (s, c) => (s === "write" ? j(withMark) : s === "najiz" ? j({ text: "مختصر" }) : good(s, c))).final;
  assert.equal(kept.output.najiz.markers_kept, false);
});

test("a result that repeats a stage prompt is refused", () => {
  const prompt = "برومبت المالك السري ".repeat(8);
  const out = run(pkg(DRAFT_INPUT, { prompts: { refine: prompt } }), (s, c) => (s === "refine" ? j({ ...MEMO, sections: [{ heading: "ع", body: prompt }, MEMO.sections[1]] }) : good(s, c))).final;
  assert.equal(out.status, "failed");
  assert.equal(out.error.code, "prompt_leak");
});

test("body.models picks one stage's model; anything that is not a model id is ignored", () => {
  const out = run(pkg(DRAFT_INPUT, { models: { refine: "gemini-3.5-pro", najiz: "x; drop table", write: "models/gemini-3.1-flash-lite" } }), good);
  assert.deepEqual(out.log.map((l) => l.model), [
    "models/gemini-3.1-flash-lite", "models/gemini-3.1-flash-lite", "models/gemini-3.1-flash-lite", "models/gemini-3.5-pro", "models/gemini-3.1-flash-lite",
  ]);
  assert.equal(out.final.usage.model, "models/gemini-3.1-flash-lite,models/gemini-3.5-pro");
});

test("models.draft is accepted as the write stage's model (ai_prompts calls that stage draft)", () => {
  const out = run(pkg(DRAFT_INPUT, { models: { draft: "gemini-3.5-pro" } }), good);
  assert.equal(out.log[0].model, "models/gemini-3.5-pro");
  assert.equal(out.log[1].model, "models/gemini-3.1-flash-lite");
});

test("files: Prepare passes binaries on, and only the first write stage reads them with Gemini", () => {
  const body = pkg(DRAFT_INPUT, { files: [{ url: "https://example.invalid/a.pdf", name: "a.pdf", mime: "application/pdf" }] });
  const prep = runCode(CODE.prepare, body, { binary: undefined }, undefined);
  assert.equal(prep[0].json.ready, false, "no binary downloaded: download_failed");
  assert.equal(prep[0].json.result.error.code, "download_failed");
  const $ = (n: string) => ({ first: () => ({ json: { body } }) });
  const ok = new Function("$", "$json", "$input", CODE.prepare)($, {}, { all: () => [{ json: {}, binary: { data: { id: 1 } } }] }) as Item[];
  assert.equal(ok[0].json.ready, true);
  const out = run(body, good, ok[0].json, ok[0].binary);
  assert.equal(out.log[0].stage, "write");
  assert.equal(out.log.length, 5);
  // The first Next stage item asked for Gemini's document read; the later ones did not.
  const w = new Function("$", "$json", "$input", codeOf("Next stage"))(
    (n: string) => (n === "Webhook" ? { first: () => ({ json: { body } }) } : { last: () => ({}) }), ok[0].json, { first: () => ok[0] },
  ) as Item[];
  assert.equal(w[0].json.read, true);
  assert.equal(w[0].json.fields, "file0");
  assert.ok(w[0].binary);
  assert.match(w[0].json.prompt, /المرحلة الثانية/);
});

test("the Read? / Write split and the progress steps use only the app's three step names", () => {
  const p = wf.nodes.find((n) => n.name === "Progress · stage")!;
  assert.match(p.parameters.jsonBody, /step: \$json\.step/);
  assert.equal(p.onError, "continueRegularOutput");
  const out = run(pkg(DRAFT_INPUT), good);
  for (const l of out.log) assert.ok(["reading", "drafting", "reviewing"].includes(l.step));
});

test("prices the app charges for the pleadings (draftKinds.ts), for the staging doc to quote", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(DRAFT_KINDS).map(([k, v]) => [k, v.price])),
    { claim: 500, reply: 500, rejoinder: 500, supplementary: 500, closing: 500, appeal: 800, cassation: 1500, petition: 1500 },
  );
});

test("each finished stage's output rides the next progress call; the Progress node sends it as stage_done", () => {
  const r = run(pkg(DRAFT_INPUT), good);
  assert.equal(r.log[0].done, null);
  assert.deepEqual(r.log.slice(1).map((l) => l.done.stage), ["write", "extraction", "adversary", "refine"]);
  assert.equal(r.log[1].done.output.title, MEMO.title);
  assert.equal(r.log[2].done.output.items[0].sid, "S1");
  assert.equal(r.log[4].done.output.memo.title, "لائحة منقحة");
  const progress = wf.nodes.find((n) => n.name === "Progress · stage")!;
  assert.ok(progress.parameters.jsonBody.includes("stage_done: $json.done"));
});

test("deadline guard: with too little time left the later stages are skipped as «deadline» and the run closes with what was done", () => {
  const body = pkg(DRAFT_INPUT, { deadline_at: new Date(Date.now() + 60_000).toISOString() });
  const r = run(body, good);
  assert.deepEqual(r.log.map((l) => l.stage), ["write"]);
  assert.equal(r.final.status, "succeeded");
  assert.deepEqual(r.final.output.lawyer_notes.skipped.map((x: any) => [x.stage, x.reason]), V2_STAGES.map((s) => [s, "deadline"]));
  assert.equal(r.final.output.title, MEMO.title);
});

test("deadline guard: plenty of time (or no deadline) changes nothing", () => {
  const far = run(pkg(DRAFT_INPUT, { deadline_at: new Date(Date.now() + 3_600_000).toISOString() }), good);
  assert.equal(far.log.length, 5);
  assert.equal(far.final.output.lawyer_notes.skipped.length, 0);
});
