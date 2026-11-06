/**
 * briefCheck.test.ts — L8 مراجعة وتدقيق مذكرة through the run pipeline: one memo,
 * 200 points, consultants blocked (Art. 18), and on the job's callback the
 * model's `cited` list is replaced by the library's verdict before the result
 * is stored.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/briefCheck.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { callbackWith, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import { AI_TOOLS, BRIEF_CHECK_FILES } from "./tools.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LAWYER: RunActor = { userId: "u-1", userType: "lawyer", practiceKind: "advocate", displayName: null };
const ON = { "brief-check": { mode: "live" } };

const input = { client_capacity: "مدعى عليه", court: "المحكمة العمالية", case_type: null, notes: null };

test("the registry entry: one memo, 200 points, consultants blocked", () => {
  const t = AI_TOOLS["brief-check"];
  assert.equal(t.class, "job");
  assert.equal(t.consultantBlocked, true);
  assert.deepEqual(t.files, BRIEF_CHECK_FILES);
  assert.equal(t.files!.max, 1);
  assert.equal(t.price({}, { pages: 12 }), 200);
  assert.equal(t.validateInput({}).ok, false);
  assert.deepEqual(t.validateInput({ client_capacity: "مدعى عليه", court: " المحكمة العمالية ", notes: "" }), { ok: true, input });
});

test("B4: a pasted memo is optional, 200..60,000 characters after trim, refused rather than cut", () => {
  const v = AI_TOOLS["brief-check"].validateInput;
  const base = { client_capacity: "مدعى عليه" };
  const short = v({ ...base, memo_text: "x".repeat(199) });
  assert.deepEqual(short, { ok: false, error: "النص الملصق قصير — الصق المذكرة كاملة (٢٠٠ حرف على الأقل)" });
  const trimmedShort = v({ ...base, memo_text: `  ${"x".repeat(199)}  ` });
  assert.equal(trimmedShort.ok, false);
  const fits = v({ ...base, memo_text: "x".repeat(200) });
  assert.ok(fits.ok);
  assert.equal((fits.input.memo_text as string).length, 200);
  assert.equal(v({ ...base, memo_text: "x".repeat(60_000) }).ok, true);
  assert.deepEqual(v({ ...base, memo_text: "x".repeat(60_001) }), { ok: false, error: "النص الملصق أطول من ٦٠٬٠٠٠ حرف — ارفعه ملفاً" });
  for (const absent of [undefined, null, "", "   ", 7, {}]) {
    const r = v({ ...base, memo_text: absent });
    assert.ok(r.ok);
    assert.equal("memo_text" in r.input, false, "no paste, no key: the package and stored input stay as they were");
  }
});

test("B4: the registry entry — the memo is a file or a paste, and either satisfies the rule", () => {
  const t = AI_TOOLS["brief-check"];
  assert.equal(t.files!.optional, true);
  assert.equal(t.filesRequired!({ memo_text: "نص" }), false);
  assert.equal(t.filesRequired!({}), true);
  assert.deepEqual(t.pasteAsFile, { field: "memo_text", name: "نص المذكرة (ملصق).txt", maxChars: 60_000 });
});

test("a consultant is refused before the files are read", async () => {
  const { client, log } = fakeDb((q) => (q.table === "platform_settings" ? { data: { value: ON } } : {}));
  let read = false;
  const deps: StartRunDeps = {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async () => ({ kind: "accepted" }),
    resolveFiles: async () => ((read = true), { ok: true, files: [], pages: 0 }),
  };
  const r = await startRunWith(client as never, deps, { ...LAWYER, practiceKind: "consultant" }, { tool: "brief-check", input, fileIds: [F1], idempotencyKey: "key-abcdef01" });
  assert.equal(r.status, 403);
  assert.equal(read, false);
  assert.ok(!log.some((q) => q.table === "ai_start_run"));
});

test("the callback's result is stored with the library's citation_check, never the model's cited list", async () => {
  const stored: Array<Record<string, unknown>> = [];
  const { client } = fakeDb((q: FakeQuery) => {
    if (q.table === "ai_runs" && q.op === "select") {
      return { data: { id: RUN, tool: "brief-check", status: "running", class: "job", source_ids: {}, input } };
    }
    if (q.table === "platform_settings") return { data: { value: ON } };
    if (q.table === "ai_runs" && q.op === "update") {
      stored.push(q.payload as Record<string, unknown>);
      return { data: [{ id: RUN }] };
    }
    return {};
  });
  // The library schema the enricher reads.
  const admin = Object.assign(client, {
    schema: () => ({
      from: (table: string) =>
        table === "laws"
          ? { select: () => ({ ilike: () => ({ limit: async () => ({ data: [{ slug: "labor", title: "نظام العمل", status: "active" }], error: null }) }) }) }
          : { select: () => ({ in: () => ({ in: async () => ({ data: [{ id: "labor__art-80", number: 80, status: "active", law_slug: "labor" }], error: null }) }) }) },
    }),
  });

  const r = await callbackWith(admin as never, {
    run_id: RUN,
    status: "succeeded",
    output: {
      summary: "المذكرة تحتاج إلى سند للدفع الثاني",
      findings: [{ severity: "high", location: "الدفع الثاني", issue: "لا سند نظامي", fix: "أضف المادة (80)" }],
      cited: [{ law: "نظام العمل", article: 80, as_written: "المادة (80)" }, { law: "نظام العمل", article: 999 }],
    },
    citations: [],
  });
  assert.deepEqual(r.body, { ok: true, final: "succeeded" });
  const out = stored[0].output as Record<string, unknown>;
  assert.equal(out.cited, undefined);
  assert.deepEqual((out.citation_check as Array<{ article: number; status: string }>).map((c) => [c.article, c.status]), [[80, "ok"], [999, "not_found"]]);
  assert.equal((out.findings as unknown[]).length, 1);
});
