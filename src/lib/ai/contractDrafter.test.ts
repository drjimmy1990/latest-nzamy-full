/**
 * contractDrafter.test.ts — wave 5 L11 محترف العقود المختصر through the run
 * pipeline: a 500-point job with no files, the six contract types of the page,
 * labelled fields, a sectioned draft back, and the articles it relies on
 * replaced by the library's verdict on the callback. Plus the page's helpers.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/contractDrafter.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { callbackWith, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import { AI_TOOLS, CONTRACT_DRAFT_PRICE, CONTRACT_FIELD_MAX, CONTRACT_TYPES } from "./tools.ts";
import { asContractDraft, contractDraftFields, contractDraftText } from "../../app/ai/contract-drafter/_components/contractDraft.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const LAWYER: RunActor = { userId: "u-1", userType: "lawyer", practiceKind: "advocate", displayName: null };
const INDIVIDUAL: RunActor = { userId: "u-2", userType: "individual", practiceKind: "advocate", displayName: null };

const input = {
  type: "rent",
  fields: [
    { label: "اسم المؤجر", value: "محمد" },
    { label: "اسم المستأجر", value: "خالد" },
    { label: "وصف العقار", value: "شقة في الرياض" },
  ],
};

const draft = {
  title: "عقد إيجار شقة سكنية",
  preamble: "إنه في يوم [....] تم الاتفاق بين:",
  sections: [
    { heading: "البند الأول: التمهيد", body: "يعد التمهيد جزءاً لا يتجزأ من العقد." },
    { heading: "البند الثاني: محل العقد", body: "شقة في الرياض." },
  ],
  cited: [{ law: "نظام المعاملات المدنية", article: 1, as_written: "المادة الأولى" }],
};

function db() {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: { "contract-drafter": { mode: "live" } } } };
    if (q.op === "rpc" && q.table === "ai_start_run") {
      const p = q.payload as Record<string, unknown>;
      return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: p.p_price }] };
    }
    return {};
  });
}

function deps(calls: Array<Record<string, unknown>>): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call) => {
      calls.push(call as unknown as Record<string, unknown>);
      return { kind: "accepted" };
    },
  };
}

test("the registry entry: a 500-point job, off by default, no files, lawyers and individuals alike", () => {
  const t = AI_TOOLS["contract-drafter"];
  assert.equal(t.class, "job");
  assert.equal(t.n8nPath, "nzamy-ai/contract-drafter");
  assert.equal(t.price({}, { pages: 0 }), CONTRACT_DRAFT_PRICE);
  assert.equal(CONTRACT_DRAFT_PRICE, 500);
  assert.equal(t.defaultMode, "off");
  assert.equal(t.files, undefined);
  assert.equal(t.consultantBlocked, false);
  for (const role of ["lawyer", "firm", "individual", "corporate", "micro"]) assert.ok(t.roles.includes(role as never), role);
  assert.deepEqual([...CONTRACT_TYPES], ["rent", "service", "employment", "partnership", "sale", "other"]);
});

test("input: a known type and at least two filled fields; blanks left out; too long or too many is refused, never cut", () => {
  const v = AI_TOOLS["contract-drafter"].validateInput;
  assert.equal(v({ ...input, type: "loan" }).ok, false);
  assert.equal(v({ type: "rent" }).ok, false);
  assert.equal(v({ type: "rent", fields: [{ label: "اسم المؤجر", value: "محمد" }] }).ok, false);
  const r = v({ type: "rent", fields: [...input.fields, { label: "ملاحظات", value: "   " }, "x", { label: "بلا قيمة" }] });
  assert.deepEqual(r.ok && r.input, input);
  assert.equal(v({ type: "rent", fields: [...input.fields, { label: "", value: "y" }] }).ok, false, "a value with no label");
  const long = v({ type: "rent", fields: [...input.fields, { label: "ملاحظات إضافية", value: "ب".repeat(CONTRACT_FIELD_MAX + 1) }] });
  assert.equal(long.ok, false);
  assert.match(!long.ok ? long.error : "", /«ملاحظات إضافية» أطول من/);
  const edge = v({ type: "rent", fields: [...input.fields, { label: "ملاحظات", value: "ب".repeat(CONTRACT_FIELD_MAX) }] });
  assert.equal(edge.ok, true);
  const many = Array.from({ length: 16 }, (_, i) => ({ label: `حقل ${i}`, value: "قيمة" }));
  assert.equal(v({ type: "other", fields: many }).ok, false);
});

test("output: a title and two sections at least; cited kept for the enricher", () => {
  const v = AI_TOOLS["contract-drafter"].validateOutput;
  const out = v(draft, input) as Record<string, any>;
  assert.equal(out.title, draft.title);
  assert.equal(out.sections.length, 2);
  assert.equal(out.cited.length, 1);
  assert.equal(v({ ...draft, sections: [draft.sections[0]] }, input), null);
  assert.equal(v({ ...draft, title: "" }, input), null);
  assert.equal(v({ ...draft, sections: [{ heading: "x" }, { body: "y" }] }, input), null);
  assert.deepEqual((v({ title: "t", sections: draft.sections }, input) as Record<string, any>).cited, []);
  // All or nothing: one bad or over-long clause refuses (and refunds) the whole draft.
  const long = { heading: "البند الثالث: الالتزامات", body: "ب".repeat(12001) };
  assert.equal(v({ ...draft, sections: [...draft.sections, long] }, input), null);
  assert.equal(v({ ...draft, sections: [...draft.sections, { heading: "البند الثالث", body: "" }] }, input), null);
  assert.equal(v({ ...draft, preamble: "ت".repeat(4001) }, input), null);
  assert.equal((v({ ...draft, sections: [...draft.sections, { ...long, body: "ب".repeat(12000) }] }, input) as Record<string, any>).sections.length, 3);
});

test("a lawyer and an individual both start the job: charged 500, sent to n8n with no files", async () => {
  for (const actor of [LAWYER, INDIVIDUAL]) {
    const { client, log } = db();
    const calls: Array<Record<string, unknown>> = [];
    const r = await startRunWith(client as never, deps(calls), actor, { tool: "contract-drafter", input, idempotencyKey: "key-abcdef01" });
    assert.equal(r.status, 202, actor.userType);
    const p = log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>;
    assert.equal(p.p_price, 500);
    assert.equal(calls[0].path, "nzamy-ai/contract-drafter");
    assert.deepEqual((calls[0].body as Record<string, unknown>).files, []);
  }
});

test("the callback stores the library's citation_check in place of the model's cited list", async () => {
  const stored: Array<Record<string, unknown>> = [];
  const { client } = fakeDb((q: FakeQuery) => {
    if (q.table === "ai_runs" && q.op === "select") {
      return { data: { id: RUN, tool: "contract-drafter", status: "running", class: "job", source_ids: {}, input } };
    }
    if (q.table === "platform_settings") return { data: { value: { "contract-drafter": { mode: "live" } } } };
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
          ? { select: () => ({ ilike: () => ({ limit: async () => ({ data: [{ slug: "civil", title: "نظام المعاملات المدنية", status: "active" }], error: null }) }) }) }
          : { select: () => ({ in: () => ({ in: async () => ({ data: [{ id: "civil__art-1", number: 1, status: "active", law_slug: "civil" }], error: null }) }) }) },
    }),
  });
  const r = await callbackWith(admin as never, { run_id: RUN, status: "succeeded", output: draft, citations: [] });
  assert.equal(r.status, 200);
  const out = stored.find((s) => s.output)!.output as Record<string, any>;
  assert.ok(!("cited" in out));
  assert.equal(out.citation_check[0].status, "ok");
  assert.equal(out.citation_check[0].article, 1);
});

test("page helpers: filled fields under their Arabic labels; the draft read back and joined into one text", () => {
  const fields = [
    { id: "landlord", labelAr: "اسم المؤجر", labelEn: "Landlord", type: "text" as const },
    { id: "tenant", labelAr: "اسم المستأجر", labelEn: "Tenant", type: "text" as const },
    { id: "notes", labelAr: "ملاحظات", labelEn: "Notes", type: "textarea" as const },
  ];
  assert.deepEqual(contractDraftFields(fields, { landlord: " محمد ", tenant: "خالد", notes: "  " }), [
    { label: "اسم المؤجر", value: "محمد" },
    { label: "اسم المستأجر", value: "خالد" },
  ]);
  const d = asContractDraft({ ...draft, cited: undefined, citation_check: [{ cited: "المادة الأولى", law: "x", article: 1, status: "ok" }] })!;
  assert.equal(d.citation_check.length, 1);
  assert.equal(
    contractDraftText(d),
    "عقد إيجار شقة سكنية\n\nإنه في يوم [....] تم الاتفاق بين:\n\nالبند الأول: التمهيد\nيعد التمهيد جزءاً لا يتجزأ من العقد.\n\nالبند الثاني: محل العقد\nشقة في الرياض.",
  );
  assert.equal(asContractDraft(null), null);
  assert.equal(asContractDraft({ title: "t", sections: [] }), null);
});
