/**
 * caseAnalysis.test.ts — wave 4 through the run pipeline: L9 المحاكي الشامل and
 * L10 محلل قوة الموقف. Both are 250-point jobs whose files are optional: no
 * fileIds skips the file step, any list is checked in full before the charge.
 * Their outputs carry words, never a number (owner ١٩٣), and the cited
 * articles are replaced by the library's verdict on the callback.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/caseAnalysis.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { callbackWith, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { FilesCheck } from "./aiFiles.ts";
import { AI_TOOLS, WAVE4_FILES, WAVE4_PRICE } from "./tools.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LAWYER: RunActor = { userId: "u-1", userType: "lawyer", practiceKind: "advocate", displayName: null };
const SUMMARY = "فُصل الموظف بعد سبع سنوات دون إنذار ودون صرف مستحقاته";

const war = { role: "plaintiff", area: "عمالي", case_summary: SUMMARY, targets: ["opponent", "court"] };
const strength = { role: "defendant", case_summary: SUMMARY };

function db(tool: string) {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: { [tool]: { mode: "live" } } } };
    if (q.op === "rpc" && q.table === "ai_start_run") {
      const p = q.payload as Record<string, unknown>;
      return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: p.p_price }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    return {};
  });
}

function deps(files: FilesCheck, calls: Array<Record<string, unknown>>, seen: unknown[]): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      calls.push(call as unknown as Record<string, unknown>);
      return { kind: "accepted" };
    },
    resolveFiles: async (...args) => {
      seen.push(args);
      return files;
    },
  };
}

test("the registry entries: 250-point jobs, files optional, only wargaming blocked for a consultant", () => {
  for (const id of ["wargaming", "analyze-strength"]) {
    const t = AI_TOOLS[id];
    assert.equal(t.class, "job");
    assert.equal(t.n8nPath, `nzamy-ai/${id}`);
    assert.deepEqual(t.files, WAVE4_FILES);
    assert.equal(t.files!.optional, true);
    assert.equal(t.price({}, { pages: 30 }), WAVE4_PRICE);
    assert.equal(WAVE4_PRICE, 250);
    assert.equal(t.defaultMode, "off");
  }
  assert.equal(AI_TOOLS.wargaming.consultantBlocked, true);
  assert.equal(AI_TOOLS["analyze-strength"].consultantBlocked, false);
});

test("no files, or an empty list: the file step is skipped, the run is charged 250 and sent with no files", async () => {
  for (const [tool, input] of [["wargaming", war], ["analyze-strength", strength]] as const) {
    for (const fileIds of [undefined, []]) {
      const { client, log } = db(tool);
      const calls: Array<Record<string, unknown>> = [];
      const seen: unknown[] = [];
      const r = await startRunWith(client as never, deps({ ok: true, files: [], pages: 0 }, calls, seen), LAWYER, {
        tool, input, fileIds, idempotencyKey: "key-abcdef01",
      });
      assert.equal(r.status, 202, `${tool} ${JSON.stringify(fileIds)}`);
      assert.equal(seen.length, 0, "resolveFiles is not called");
      const p = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
      assert.equal(p.p_price, 250);
      assert.deepEqual(p.p_file_ids, []);
      assert.deepEqual((calls[0].body as Record<string, unknown>).files, []);
    }
  }
});

test("a list of files is checked in full before the charge: a bad file refuses the run and charges nothing", async () => {
  const { client, log } = db("analyze-strength");
  const calls: Array<Record<string, unknown>> = [];
  const seen: unknown[] = [];
  const r = await startRunWith(
    client as never,
    deps({ ok: false, error: "نوع ملف غير مدعوم", code: "file_type" }, calls, seen),
    LAWYER,
    { tool: "analyze-strength", input: strength, fileIds: [F1], idempotencyKey: "key-abcdef01" },
  );
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "file_type");
  assert.deepEqual(seen[0], ["u-1", [F1], WAVE4_FILES]);
  assert.ok(!log.some((q) => q.table === "ai_start_run"));
  assert.equal(calls.length, 0);
});

test("a consultant may not run the wargaming simulation (Art. 18) but may analyse a position", async () => {
  const consultant = { ...LAWYER, practiceKind: "consultant" as const };
  const a = await startRunWith(db("wargaming").client as never, deps({ ok: true, files: [], pages: 0 }, [], []), consultant, {
    tool: "wargaming", input: war, idempotencyKey: "key-abcdef01",
  });
  assert.equal(a.status, 403);
  const b = await startRunWith(db("analyze-strength").client as never, deps({ ok: true, files: [], pages: 0 }, [], []), consultant, {
    tool: "analyze-strength", input: strength, idempotencyKey: "key-abcdef01",
  });
  assert.equal(b.status, 202);
});

test("wargaming input: role, area, a 20+ character summary, known targets; critique needs the memo", () => {
  const v = AI_TOOLS.wargaming.validateInput;
  assert.equal(v({ ...war, role: "judge" }).ok, false);
  assert.equal(v({ ...war, area: "" }).ok, false);
  assert.equal(v({ ...war, case_summary: "قصير" }).ok, false);
  assert.equal(v({ ...war, targets: ["win"] }).ok, false);
  assert.equal(v({ ...war, targets: ["critique"] }).ok, false);
  const pasted = v({ ...war, targets: ["critique", "x"], memo_text: " نص المذكرة " });
  assert.deepEqual(pasted.ok && pasted.input, {
    role: "plaintiff", area: "عمالي", case_summary: SUMMARY, targets: ["critique"], memo_text: "نص المذكرة", memo_in_files: false,
  });
  const inFiles = v({ ...war, targets: ["critique"], memo_in_files: true });
  assert.equal(inFiles.ok && inFiles.input.memo_in_files, true);
  // A memo left behind after critique was deselected is not sent.
  const dropped = v({ ...war, memo_text: "نص قديم", memo_in_files: true });
  assert.deepEqual(dropped.ok && [dropped.input.memo_text, dropped.input.memo_in_files], [null, false]);
});

test("wargaming output: points only for the targets asked, no probability field, the plea script only for «plea»", () => {
  const out = AI_TOOLS.wargaming.validateOutput(
    {
      summary: "الخصم سيركز على الإنذار",
      points: [
        { source: "opponent", severity: "high", title: "الدفع بالإنذار", detail: "سيقول الخصم إنه أنذر", counter: "اطلب الدليل", probability: 70 },
        { source: "plea", severity: "low", title: "لم يُطلب", detail: "x" },
        { source: "court", severity: "extreme", title: "الإثبات", detail: "ستطلب المحكمة العقد" },
      ],
      plea_script: "أصحاب الفضيلة…",
      cited: [{ law: "نظام العمل", article: 80, as_written: "المادة ٨٠" }],
    },
    { targets: ["opponent", "court"] },
  ) as Record<string, any>;
  assert.deepEqual(out.points.map((p: Record<string, unknown>) => [p.source, p.severity]), [["opponent", "high"], ["court", "medium"]]);
  assert.ok(!("probability" in out.points[0]));
  assert.equal(out.plea_script, "");
  assert.equal(out.cited.length, 1);
  assert.equal(AI_TOOLS.wargaming.validateOutput({ summary: "x", points: [] }, { targets: ["opponent"] }), null);
});

test("analyze-strength output: a level in words, no score; unknown levels fall back; no summary is refused", () => {
  const v = AI_TOOLS["analyze-strength"].validateOutput;
  const out = v(
    {
      grounds: { level: "strong", score: 68, summary: "أسانيد متماسكة", strengths: ["عقد موثق"], weaknesses: [], recommendations: ["شاهد"] },
      opponent: [{ kind: "attack", move: "الدفع بالتقادم", counter: "العلم تأخر" }],
      risks: [{ risk: "عدم الاختصاص", level: "certain", likelihood: 60, mitigation: "دفع مقابل" }],
      devil: [{ label: "الثغرة", text: "الشاهد متردد", severity: "critical" }],
    },
    {},
  ) as Record<string, any>;
  assert.equal(out.grounds.level, "strong");
  assert.ok(!("score" in out.grounds));
  assert.deepEqual(out.risks[0], { risk: "عدم الاختصاص", level: "medium", mitigation: "دفع مقابل" });
  assert.deepEqual(out.cited, []);
  assert.equal(v({ grounds: { level: "strong" } }, {}), null);
  assert.equal(v({}, {}), null);
});

test("the callback stores the library's citation_check in place of the model's cited list", async () => {
  const stored: Array<Record<string, unknown>> = [];
  const { client } = fakeDb((q: FakeQuery) => {
    if (q.table === "ai_runs" && q.op === "select") {
      return { data: { id: RUN, tool: "analyze-strength", status: "running", class: "job", source_ids: {}, input: strength } };
    }
    if (q.table === "platform_settings") return { data: { value: { "analyze-strength": { mode: "live" } } } };
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
          : { select: () => ({ in: () => ({ in: async () => ({ data: [{ id: "labor__art-80", number: 80, status: "active", law_slug: "labor" }], error: null }) }) }) },
    }),
  });
  const r = await callbackWith(admin as never, {
    run_id: RUN,
    status: "succeeded",
    output: {
      grounds: { level: "medium", summary: "متوسطة", strengths: [], weaknesses: [], recommendations: [] },
      cited: [{ law: "نظام العمل", article: 80, as_written: "المادة (80)" }],
    },
    citations: [],
  });
  assert.deepEqual(r.body, { ok: true, final: "succeeded" });
  const out = stored[0].output as Record<string, unknown>;
  assert.equal(out.cited, undefined);
  assert.deepEqual((out.citation_check as Array<{ status: string }>).map((c) => c.status), ["ok"]);
});
