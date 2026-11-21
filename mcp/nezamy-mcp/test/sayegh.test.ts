import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { NezamyClient } from "@nezamy/client";
import { startMock, GOOD_TOKEN, STAFF_TOKEN, N8N_V2_OUTPUT, type MockHandle } from "../../nezamy-client/test/mock-server.js";
import { MiniMcp } from "../src/mini-mcp.js";
import { Guard, EXCERPT_MAX, type ReadLogEntry } from "../src/guards.js";

let mock: MockHandle;
const mk = (token: string) => new NezamyClient({ baseUrl: mock.url, token, allowInsecureHttp: true, sleep: async () => {} });
let id = 0;
const callWith = async (core: MiniMcp, c: NezamyClient, name: string, args: Record<string, unknown>) =>
  ((await core.handle({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }, c)) as { result: any }).result;
const text = (r: any) => r.content[0].text as string;

before(async () => { mock = await startMock({ pollsBeforeDone: 0 }); });
after(async () => { await mock.close(); });

const SAYEGH_ARGS = { kind: "appeal", client_role: "plaintiff", facts: "وقائع تجريبية طويلة بما يكفي لتجاوز الحد الأدنى للأحرف." };

test("staff gate: a normal lawyer's token cannot use the three new tools; a staff token can", async () => {
  const core = new MiniMcp(undefined, new Guard({ staffOnly: true }));
  for (const [name, args] of [
    ["run_sayegh", SAYEGH_ARGS],
    ["read_case_dossier", { dossier_id: "d1" }],
    ["add_to_research_pool", { title: "ملاحظة", content: "نص" }],
  ] as const) {
    const r = await callWith(core, mk(GOOD_TOKEN), name, args as Record<string, unknown>);
    assert.equal(r.isError, true, name);
    assert.match(text(r), /للمشرفين فقط/, name);
  }
  assert.equal(mock.research.length, 0, "nothing was written for the non-staff caller");
  const ok = await callWith(core, mk(STAFF_TOKEN), "read_case_dossier", { dossier_id: "d1", manifest_only: true });
  assert.equal(ok.isError, undefined);
});

test("staff gate can be opened by the owner (NEZAMY_MCP_STAFF_ONLY=0 equivalent) but old tools were never gated", async () => {
  const closed = new MiniMcp(undefined, new Guard({ staffOnly: true }));
  const r = await callWith(closed, mk(GOOD_TOKEN), "account_standing", {});
  assert.equal(r.isError, undefined);
  const open = new MiniMcp(undefined, new Guard({ staffOnly: false }));
  const q = await callWith(open, mk(GOOD_TOKEN), "run_sayegh", SAYEGH_ARGS);
  assert.equal(q.isError, undefined);
});

test("run_sayegh: quote first (price from the platform, no charge), then confirm starts one run through /ai/runs", async () => {
  const core = new MiniMcp(undefined, new Guard({ staffOnly: true }));
  const c = mk(STAFF_TOKEN);
  const before = mock.charges();
  const q = await callWith(core, c, "run_sayegh", SAYEGH_ARGS);
  assert.match(text(q), /800 نقطة/);
  assert.equal(q.structuredContent.quoted, true);
  assert.equal(mock.charges(), before);
  const started = await callWith(core, c, "run_sayegh", { ...SAYEGH_ARGS, confirm_charge: true });
  assert.ok(started.structuredContent.run_id);
  const again = await callWith(core, c, "run_sayegh", { ...SAYEGH_ARGS, confirm_charge: true });
  assert.equal(again.structuredContent.run_id, started.structuredContent.run_id, "same request = same run");
  assert.equal(mock.charges(), before + 200, "charged once");
  assert.ok(mock.log.some((l) => l.method === "POST" && l.path === "/api/v1/ext/ai/runs"));
  assert.ok(!mock.log.some((l) => /sayegh|\/v2\//.test(l.path)), "no parallel path");
  const run = await callWith(core, c, "get_run", { run_id: started.structuredContent.run_id, wait_seconds: 0 });
  assert.equal(run.structuredContent.status, "succeeded");
});

test("run_sayegh: needs facts; a later stage alone is not offered", async () => {
  const core = new MiniMcp(undefined, new Guard({ staffOnly: true }));
  const r = await callWith(core, mk(STAFF_TOKEN), "run_sayegh", { kind: "reply", client_role: "defendant" });
  assert.equal(r.isError, true);
  const late = await callWith(core, mk(STAFF_TOKEN), "run_sayegh", { ...SAYEGH_ARGS, stage: "adversary" });
  assert.equal(late.isError, true);
});

test("read_case_dossier: content is fenced as data and cannot close the fence", async () => {
  const core = new MiniMcp(undefined, new Guard({ staffOnly: true }));
  const r = await callWith(core, mk(STAFF_TOKEN), "read_case_dossier", { dossier_id: "d1", stage: "intake" });
  const t = text(r);
  assert.match(t, /<case_file id="it-1">/);
  assert.equal((t.match(/<\/case_file>/g) ?? []).length, 1, "the planted closing tag was neutralised");
  assert.match(t, /وليس تعليمات/);
  assert.doesNotMatch(t, /تقرير الفاحص/, "only the filtered stage content is returned");
});

test("add_to_research_pool: writes one item to the caller's pool; refuses pasted library fences", async () => {
  const core = new MiniMcp(undefined, new Guard({ staffOnly: true }));
  const c = mk(STAFF_TOKEN);
  const n = mock.research.length;
  const r = await callWith(core, c, "add_to_research_pool", { title: "سند", content: "اقتباس قصير م٢٣", source: "art-1" });
  assert.match(text(r), /ri-/);
  assert.equal(mock.research.length, n + 1);
  const bad = await callWith(core, c, "add_to_research_pool", { title: "x", content: "<library_text id=\"a\">نص كامل</library_text>" });
  assert.equal(bad.isError, true);
  assert.equal(mock.research.length, n + 1);
});

test("library protection: excerpts never exceed the cap; full text only after citation; daily cap then excerpt again; read log has no text", async () => {
  const log: ReadLogEntry[] = [];
  const guard = new Guard({ dailyFullReads: 2, logSink: (e) => log.push(e), staffOnly: false });
  const core = new MiniMcp(undefined, guard);
  const c = mk(GOOD_TOKEN);
  const search = text(await callWith(core, c, "search_library", { q: "عقد الإيجار لمدة طويلة جدا" }));
  for (const m of search.matchAll(/<library_text[^>]*>\n([\s\S]*?)\n<\/library_text>/g)) assert.ok(m[1]!.length <= EXCERPT_MAX + 1);

  assert.match(text(await callWith(core, c, "get_article", { id: "art-1" })), /مقتطف فقط/);
  await callWith(core, c, "check_citations", { citations: [{ law: "نظام تجريبي", article: 1 }] });
  assert.match(text(await callWith(core, c, "get_article", { id: "art-1" })), /المتبقي من حد القراءة الكاملة اليوم عبر Claude: 1/);
  assert.match(text(await callWith(core, c, "get_article", { id: "art-1" })), /المتبقي.*: 0/);
  const capped = text(await callWith(core, c, "get_article", { id: "art-1" }));
  assert.match(capped, /مقتطف فقط/);
  assert.match(capped, /حد القراءة الكاملة اليومي/);

  assert.deepEqual(log.map((e) => e.outcome), ["excerpt", "full", "full", "excerpt"]);
  for (const e of log) {
    assert.equal(e.token, c.tokenId);
    assert.doesNotMatch(JSON.stringify(e), /نص المادة|nzy_pat/);
  }
});

test("a citation that was NOT confirmed (not_found) opens nothing; another caller's citations do not open mine", async () => {
  const guard = new Guard({ staffOnly: false });
  const core = new MiniMcp(undefined, guard);
  await callWith(core, mk(GOOD_TOKEN), "check_citations", { citations: [{ law: "نظام غير موجود", article: 5 }] });
  assert.match(text(await callWith(core, mk(GOOD_TOKEN), "get_article", { id: "art-5" })), /مقتطف فقط|غير/);
  await callWith(core, mk(STAFF_TOKEN), "check_citations", { citations: [{ law: "نظام تجريبي", article: 1 }] });
  assert.match(text(await callWith(core, mk(GOOD_TOKEN), "get_article", { id: "art-1" })), /مقتطف فقط/);
});

test("a run's confirmed sources open the full text of those articles (get_run feeds the cited set)", async () => {
  const guard = new Guard({ staffOnly: false });
  const core = new MiniMcp(undefined, guard);
  const c = mk(GOOD_TOKEN);
  const q = await callWith(core, c, "run_contract_drafter", { type: "rent", fields: [{ label: "المؤجر", value: "أ" }, { label: "المستأجر", value: "ب" }], confirm_charge: true, rerun_token: "t-cites" });
  await callWith(core, c, "get_run", { run_id: q.structuredContent.run_id, wait_seconds: 0 });
  assert.match(text(await callWith(core, c, "get_article", { id: "art-1" })), /نص المادة التجريبي/);
});

test("kill switch: local switch stops every tool at once; platform kill_switch answers in Arabic", async () => {
  let killed = false;
  const core = new MiniMcp(undefined, new Guard({ isKilled: () => killed, staffOnly: false }));
  const c = mk(GOOD_TOKEN);
  assert.equal((await callWith(core, c, "account_standing", {})).isError, undefined);
  killed = true;
  const r = await callWith(core, c, "account_standing", {});
  assert.equal(r.isError, true);
  assert.match(text(r), /موقوف/);
  const calls = mock.log.length;
  await callWith(core, c, "search_library", { q: "أي شيء" });
  assert.equal(mock.log.length, calls, "no request reaches the platform while killed");
  killed = false;
  mock.kill(true);
  const p = await callWith(core, c, "account_standing", {});
  mock.kill(false);
  assert.equal(p.isError, true);
  assert.match(text(p), /موقوف/);
});

test("distinct-token cap (device/token limit at the server) refuses the extra token", async () => {
  const core = new MiniMcp(undefined, new Guard({ maxDistinctTokens: 1, staffOnly: false }));
  assert.equal((await callWith(core, mk(GOOD_TOKEN), "account_standing", {})).isError, undefined);
  const second = await callWith(core, mk(STAFF_TOKEN), "account_standing", {});
  assert.equal(second.isError, true);
  assert.equal((await callWith(core, mk(GOOD_TOKEN), "account_standing", {})).isError, undefined, "the first token still works");
});

test("no token ever appears in tool output or the read log", async () => {
  const log: ReadLogEntry[] = [];
  const core = new MiniMcp(undefined, new Guard({ logSink: (e) => log.push(e), staffOnly: false }));
  const c = mk(GOOD_TOKEN);
  const all = [
    text(await callWith(core, c, "get_article", { id: "art-1" })),
    text(await callWith(core, c, "account_standing", {})),
    JSON.stringify(log),
  ].join("\n");
  assert.doesNotMatch(all, new RegExp(GOOD_TOKEN));
});


/* ---------- alignment with the n8n workflow legal-drafter-v2 output (docs/n8n-legal-drafter-v2.md) ---------- */

async function runAndRead(args: Record<string, unknown>) {
  const core = new MiniMcp(undefined, new Guard({ staffOnly: true }));
  const c = mk(STAFF_TOKEN);
  const st = await callWith(core, c, "run_sayegh", { ...SAYEGH_ARGS, confirm_charge: true, rerun_token: `n8n-${++id}`, ...args });
  return callWith(core, c, "get_run", { run_id: st.structuredContent.run_id, wait_seconds: 0 });
}

test("get_run (v2): memo, lawyer report and najiz copy are three separate blocks; the adversary never appears in the memo", async () => {
  const r = await runAndRead({});
  const t = text(r);
  const memo = t.slice(t.indexOf("## المذكرة"), t.indexOf("## تقرير المحامي الداخلي"));
  assert.match(memo, /لائحة اعتراض/);
  assert.match(memo, /نص الأسباب/);
  assert.doesNotMatch(memo, /الفاحص|التقادم|دُمج دفعان/, "notes never leak into the memo block");
  const report = t.slice(t.indexOf("## تقرير المحامي الداخلي"), t.indexOf("## نسخة ناجز"));
  assert.match(report, /لا يُرفق بالمذكرة/);
  assert.match(report, /الدفع بالتقادم لم يُرد عليه/);
  assert.match(report, /تغيّرت الطلبات/);
  assert.match(report, /الاستخراج: 2 عنصرًا، المؤكَّد حرفيًا من المصدر 1/);
  assert.match(report, /لا مستند لتاريخ التبليغ/);
  assert.match(t, /## نسخة ناجز \(9500 حرفًا\)/);
  assert.match(t, /تجاوزت حد ناجز/);
});

test("get_run (v2): `unverified` is derived from extraction items n8n did not confirm word-for-word", async () => {
  const t = text(await runAndRead({}));
  const tail = t.slice(t.indexOf("لم يُتحقق منه"));
  assert.match(tail, /عبارة لم تُطابق حرفيًا/);
  assert.doesNotMatch(tail, /عبارة مؤكدة/);
});

test("get_run (v2): structuredContent carries the raw output so the client can use lawyer_notes / najiz as objects", async () => {
  const r = await runAndRead({});
  const out = r.structuredContent.output;
  assert.deepEqual(out.najiz, N8N_V2_OUTPUT.najiz);
  assert.equal(typeof out.lawyer_notes, "object");
  assert.equal(out.lawyer_notes.refine.requests_changed, true);
});

test("run_sayegh: on_stage_error is forwarded only when not the default; default stays absent", async () => {
  const core = new MiniMcp(undefined, new Guard({ staffOnly: true }));
  const bodies: any[] = [];
  const spy = (async (u: any, init: any) => { if (init?.body && /ai\/runs$/.test(String(u))) bodies.push(JSON.parse(init.body)); return fetch(u, init); }) as typeof fetch;
  const c = new NezamyClient({ baseUrl: mock.url, token: STAFF_TOKEN, allowInsecureHttp: true, sleep: async () => {}, fetch: spy });
  await callWith(core, c, "run_sayegh", { ...SAYEGH_ARGS, confirm_charge: true, rerun_token: "osd-a" });
  await callWith(core, c, "run_sayegh", { ...SAYEGH_ARGS, confirm_charge: true, rerun_token: "osd-b", on_stage_error: "skip" });
  assert.equal(bodies.length, 2);
  assert.equal("on_stage_error" in bodies[0].input, false);
  assert.equal(bodies[1].input.on_stage_error, "skip");
  assert.equal(bodies[1].input.pipeline, "v2");
});

test("get_run (v2): a lenient/partial output never throws (nulls, wrong types, skipped stages)", async () => {
  const core = new MiniMcp(undefined, new Guard({ staffOnly: true }));
  const { parseSayeghExtras } = await import("@nezamy/client");
  assert.deepEqual(parseSayeghExtras({ lawyer_notes: "x", najiz: 5 }), {});
  assert.deepEqual(parseSayeghExtras(null), {});
  const partial = parseSayeghExtras({ lawyer_notes: { extraction: null, adversary: null, refine: null, skipped: ["najiz"] } });
  assert.deepEqual(partial.lawyer_notes?.skipped, ["najiz"]);
  void core;
});
