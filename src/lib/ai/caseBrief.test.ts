/**
 * caseBrief.test.ts — L7 عصارة المرفقات / الموجز القضائي through the run
 * pipeline: a job tool with files. The files are checked before the charge,
 * the page total picks the tier (30 / 150), the signed files go in the
 * package, n8n answers 202, and the callback's BriefResult is rebuilt field
 * by field.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/caseBrief.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { FilesCheck } from "./aiFiles.ts";
import { AI_TOOLS, CASE_BRIEF_FILES } from "./tools.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const F1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LAWYER: RunActor = { userId: "u-1", userType: "lawyer", practiceKind: "advocate", displayName: null };

function db() {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: { "case-brief": { mode: "live" } } } };
    if (q.op === "rpc" && q.table === "ai_start_run") {
      const p = q.payload as Record<string, unknown>;
      return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: p.p_price }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    return {};
  });
}

const file = (pages: number) => ({
  id: F1, name: "صحيفة.pdf", mime: "application/pdf", bytes: 1000, pages,
  url: "https://auth.example/storage/v1/object/sign/documents/u-1/x.pdf?token=t", url_expires_at: "2026-10-28T10:15:00.000Z",
});

function deps(files: FilesCheck, calls: Array<Record<string, unknown>> = [], seen: unknown[] = []): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      calls.push(call as unknown as Record<string, unknown>);
      return { kind: "accepted" };
    },
    resolveFiles: async (userId, fileIds, rules) => {
      seen.push([userId, fileIds, rules]);
      return files;
    },
  };
}

const body = (over: Record<string, unknown> = {}) => ({
  tool: "case-brief",
  input: { role_note: "وكيل المدعي في دعوى عمالية", want_requests: true },
  fileIds: [F1],
  idempotencyKey: "key-abcdef01",
  ...over,
});

test("the registry entry: a job for lawyers and firms, 30 up to 5 pages and 150 above, files required", () => {
  const t = AI_TOOLS["case-brief"];
  assert.equal(t.class, "job");
  assert.deepEqual(t.roles, ["lawyer", "firm"]);
  assert.deepEqual(t.files, CASE_BRIEF_FILES);
  assert.equal(t.price({}, { pages: 5 }), 30);
  assert.equal(t.price({}, { pages: 6 }), 150);
  assert.equal(t.validateInput({ role_note: "س" }).ok, false);
  assert.deepEqual(t.validateInput({ role_note: "وكيل المدعى عليه" }), { ok: true, input: { role_note: "وكيل المدعى عليه", want_requests: true } });
});

test("a refused file stops the run before anything is charged or sent", async () => {
  const { client, log } = db();
  const calls: Array<Record<string, unknown>> = [];
  const r = await startRunWith(client as never, deps({ ok: false, error: "عدد الصفحات أكثر من ٣٠", code: "too_many_pages" }, calls), LAWYER, body());
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "too_many_pages");
  assert.ok(!log.some((q) => q.table === "ai_start_run"));
  assert.equal(calls.length, 0);
});

test("the pages set the tier; the run records the files and pages; the package carries the signed files; 202", async () => {
  for (const [pages, price] of [[3, 30], [12, 150]] as const) {
    const { client, log } = db();
    const calls: Array<Record<string, unknown>> = [];
    const seen: unknown[] = [];
    const r = await startRunWith(client as never, deps({ ok: true, files: [file(pages)], pages }, calls, seen), LAWYER, body());
    assert.equal(r.status, 202);
    assert.equal(r.body.chargedPoints, price);
    const p = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
    assert.equal(p.p_price, price);
    assert.equal(p.p_pages, pages);
    assert.deepEqual(p.p_file_ids, [F1]);
    assert.deepEqual(seen[0], ["u-1", [F1], CASE_BRIEF_FILES]);
    const pkg = calls[0].body as Record<string, unknown>;
    assert.equal(calls[0].mode, "async");
    assert.deepEqual((pkg.files as Array<Record<string, unknown>>).map((f) => [f.id, f.pages, typeof f.url]), [[F1, pages, "string"]]);
    assert.deepEqual(pkg.respond, { mode: "async", callback_url: "https://app.test/api/v1/ai/callback" });
  }
});

test("a tool without files still refuses fileIds", async () => {
  const { client } = fakeDb((q) => (q.table === "platform_settings" ? { data: { value: { "echo-fast": { mode: "live" } } } } : {}));
  const r = await startRunWith(client as never, deps({ ok: true, files: [], pages: 0 }), LAWYER, { tool: "echo-fast", input: { text: "x" }, fileIds: [F1], idempotencyKey: "key-abcdef01" });
  assert.equal(r.body.code, "files_not_accepted");
});

test("the BriefResult is rebuilt: bounded strings, fixed levels, no extra field, no link", () => {
  const out = AI_TOOLS["case-brief"].validateOutput(
    {
      caseCard: { type: "عمالية", parties: "خالد ضد شركة النور", court: "", extra: "x" },
      story: "التحق المدعي بالعمل…",
      highlights: [{ kind: "warning", text: "لا إثبات للعمل الإضافي" }, { kind: "boom", text: "مستوى غريب" }, { text: "" }],
      assessment: "very strong",
      assessmentReason: "سبب",
      options: [{ label: "تقديم سجلات الدوام", requires: "كشوف الحضور", tool: { href: "javascript:alert(1)", label: "x" } }],
      questions: ["هل وُجّه إنذار؟", 7],
      clientRequests: [{ request: "كشف الحساب", reason: "إثبات الأجر", priority: "urgent", type: "financial" }],
      sneaky: "<script>",
    },
    {},
  ) as Record<string, any>;
  assert.equal(out.caseCard.court, "غير مذكور");
  assert.equal(out.caseCard.extra, undefined);
  assert.deepEqual(out.highlights.map((h: { kind: string }) => h.kind), ["warning", "info"]);
  assert.equal(out.assessment, "medium");
  assert.deepEqual(out.options, [{ label: "تقديم سجلات الدوام", requires: "كشوف الحضور" }]);
  assert.deepEqual(out.questions, ["هل وُجّه إنذار؟"]);
  assert.deepEqual(out.clientRequests, [{ request: "كشف الحساب", reason: "إثبات الأجر", priority: "normal", type: "financial" }]);
  assert.equal(out.sneaky, undefined);
  assert.equal(AI_TOOLS["case-brief"].validateOutput({ caseCard: {}, story: "" }, {}), null, "no story, no brief");
});
