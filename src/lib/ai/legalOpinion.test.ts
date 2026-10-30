/**
 * legalOpinion.test.ts — wave 5 L12 الرأي الفصل, the two types built first:
 *
 *   legal-opinion-consult  a 400-point job that answers from library texts
 *                          (the library gate before the charge, the searches
 *                          after it, refunded when the answer cites none);
 *   legal-opinion-letter   a 400-point job with no retrieval, signed by the
 *                          sender the user typed, its articles replaced by the
 *                          library's verdict on the callback.
 *
 * Plus the page's helpers (aiOpinion.ts).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/legalOpinion.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery } from "../payments/fakeDb.test-helper.ts";
import { callbackWith, startRunWith, type RunActor, type StartRunDeps } from "./runCore.ts";
import type { N8nOutcome } from "./n8nClient.ts";
import type { Retrieved } from "./retrieval.ts";
import { AI_TOOLS, LEGAL_OPINION_PRICE, LEGAL_OPINION_QUESTION_MAX, LETTER_SUBJECT_MAX, LIB_QUERIES_PATH } from "./tools.ts";
import {
  AI_OPINION_TOOL, aiOpinionErrorText, asConsultAnswer, asLetterDraft, consultAnswerText, consultRunInput, letterRunInput,
} from "../../app/ai/legal-opinion/_components/aiOpinion.ts";

const RUN = "11111111-2222-4333-8444-555555555555";
const INDIVIDUAL: RunActor = { userId: "u-2", userType: "individual", practiceKind: "advocate", displayName: "أ. سارة" };
const CONSULTANT: RunActor = { userId: "u-3", userType: "lawyer", practiceKind: "consultant", displayName: null };
const ON = { "legal-opinion-consult": { mode: "live" }, "legal-opinion-letter": { mode: "live" } };
const QUESTION = "استقلت من عملي بعد ست سنوات، فهل أستحق مكافأة نهاية الخدمة؟";

const FOUND: Retrieved = {
  sources: [{ sid: "S1", kind: "article", title: "نظام العمل — المادة الخامسة والثمانون", text: "إذا كان انتهاء علاقة العمل بسبب استقالة العامل…" }],
  map: { S1: { kind: "article", id: "labor__art-85", title: "نظام العمل — المادة الخامسة والثمانون", url: "/laws/labor#labor__art-85" } },
};

const LETTER = {
  type: "إنذار قانوني",
  sender_role: "company",
  sender_name: "شركة النور للتجارة",
  recipient_type: "company",
  recipient_name: "مؤسسة الأفق",
  subject: "تأخر سداد قيمة الفاتورة رقم ١٢ منذ ثلاثة أشهر",
};

const ANSWER = {
  summary: "تستحق ثلث المكافأة [S1]",
  sections: [{ heading: "ما تقوله النصوص", body: "إذا استقال العامل بعد خمس سنوات وقبل عشر استحق ثلثي المكافأة [S1]" }],
};

function db() {
  return fakeDb((q: FakeQuery) => {
    if (q.table === "platform_settings") return { data: { value: ON } };
    if (q.op === "rpc" && q.table === "ai_start_run") {
      const p = q.payload as Record<string, unknown>;
      return { data: [{ run_id: RUN, created: true, status: "running", charged: true, charged_points: p.p_price }] };
    }
    if (q.op === "rpc" && q.table === "ai_fail_run") return { data: true };
    if (q.table === "ai_runs" && q.op === "update") return { data: [{ id: RUN }] };
    return {};
  });
}

type Call = { path: string; mode: string; body: Record<string, unknown> };

function deps(calls: Call[], o: { access?: StartRunDeps["libraryAccess"]; found?: Retrieved } = {}): StartRunDeps {
  return {
    callbackUrl: "https://app.test/api/v1/ai/callback",
    n8n: async (call): Promise<N8nOutcome> => {
      calls.push(call as Call);
      if (call.path === LIB_QUERIES_PATH) return { kind: "result", result: { run_id: RUN, status: "succeeded", output: { queries: ["مكافأة نهاية الخدمة"] } } };
      return { kind: "accepted" };
    },
    libraryAccess: o.access ?? (async () => null),
    retrieve: async () => o.found ?? FOUND,
  };
}

const rpcs = (log: FakeQuery[]) => log.filter((q) => q.op === "rpc").map((q) => q.table);

test("the registry: two 400-point jobs, off by default, no files, the same audience as L11, consultants allowed", () => {
  assert.equal(LEGAL_OPINION_PRICE, 400, "D4: consultation and letter are the 400 tier");
  for (const id of ["legal-opinion-consult", "legal-opinion-letter"]) {
    const t = AI_TOOLS[id];
    assert.equal(t.class, "job", id);
    assert.equal(t.n8nPath, `nzamy-ai/${id}`);
    assert.equal(t.price({}, { pages: null }), 400);
    assert.equal(t.defaultMode, "off");
    assert.equal(t.files, undefined);
    assert.equal(t.consultantBlocked, false, "/ai/legal-opinion is open to consultants (Art. 18)");
    assert.ok(!t.sendsDisplayName, "the letter is signed by the sender typed, never the account");
    assert.deepEqual([...t.roles], ["lawyer", "firm", "individual", "corporate", "micro"]);
  }
  assert.deepEqual(AI_TOOLS["legal-opinion-consult"].retrieval, { from: "question", laws: 8, principles: 4 });
  assert.equal(AI_TOOLS["legal-opinion-letter"].retrieval, undefined, "a letter is not refunded for citing no library text");
  assert.deepEqual(AI_OPINION_TOOL, { consult: "legal-opinion-consult", letter: "legal-opinion-letter" });
});

test("consult input: 20–6,000 characters, refused when longer, never cut; the area optional", () => {
  const v = AI_TOOLS["legal-opinion-consult"].validateInput;
  assert.deepEqual(v({ question: `  ${QUESTION}  ` }), { ok: true, input: { area: null, question: QUESTION } });
  assert.deepEqual(v({ area: "عمالي", question: QUESTION }), { ok: true, input: { area: "عمالي", question: QUESTION } });
  assert.equal(v({ question: "قصير" }).ok, false);
  assert.equal(v({ question: "س".repeat(LEGAL_OPINION_QUESTION_MAX + 1) }).ok, false);
  assert.equal(v({ question: "س".repeat(LEGAL_OPINION_QUESTION_MAX) }).ok, true);
  assert.equal(v({ area: "م".repeat(81), question: QUESTION }).ok, false);
  assert.equal(v(null).ok, false);
});

test("consult output: a conclusion and 1–8 headed sections, all or nothing", () => {
  const v = AI_TOOLS["legal-opinion-consult"].validateOutput;
  assert.deepEqual(v(ANSWER, {}), ANSWER);
  assert.equal(v({ ...ANSWER, summary: " " }, {}), null);
  assert.equal(v({ ...ANSWER, sections: [] }, {}), null);
  assert.equal(v({ ...ANSWER, sections: [...ANSWER.sections, { heading: "x", body: "" }] }, {}), null);
  assert.equal(v({ ...ANSWER, sections: Array(9).fill(ANSWER.sections[0]) }, {}), null);
  assert.equal(v({ ...ANSWER, sections: [{ heading: "x", body: "ب".repeat(6001) }] }, {}), null);
});

test("consult start: the library gate before any charge, then 400 points, the searches, and the texts in the package", async () => {
  const refused = db();
  const none: Call[] = [];
  const r0 = await startRunWith(refused.client as never, deps(none, { access: async () => ({ status: 403, body: { error: "Pro", code: "library_tier" } }) }), INDIVIDUAL, {
    tool: "legal-opinion-consult", input: { question: QUESTION }, idempotencyKey: "key-abcdef01",
  });
  assert.equal(r0.status, 403);
  assert.equal(r0.body.code, "library_tier");
  assert.deepEqual(rpcs(refused.log), [], "nothing charged");
  assert.equal(none.length, 0);

  const { client, log } = db();
  const calls: Call[] = [];
  const r = await startRunWith(client as never, deps(calls), CONSULTANT, { tool: "legal-opinion-consult", input: { question: QUESTION }, idempotencyKey: "key-abcdef02" });
  assert.equal(r.status, 202, "a consultant may run it");
  assert.equal((log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>).p_price, 400);
  assert.deepEqual(calls.map((c) => c.path), [LIB_QUERIES_PATH, "nzamy-ai/legal-opinion-consult"]);
  assert.equal(calls[1].mode, "async");
  assert.deepEqual(calls[1].body.sources, FOUND.sources);
  assert.deepEqual((calls[1].body.respond as Record<string, unknown>).mode, "async");
});

test("consult start: nothing in the library matched — refunded before n8n writes anything", async () => {
  const { client, log } = db();
  const calls: Call[] = [];
  const r = await startRunWith(client as never, deps(calls, { found: { sources: [], map: {} } }), INDIVIDUAL, {
    tool: "legal-opinion-consult", input: { question: QUESTION }, idempotencyKey: "key-abcdef03",
  });
  assert.equal(r.status, 422);
  assert.equal(r.body.code, "no_sources");
  assert.ok(rpcs(log).includes("ai_fail_run"));
  assert.equal(calls.length, 1, "only the search writer was called");
});

function callbackDb(tool: string, input: Record<string, unknown>, stored: Array<Record<string, unknown>>, failed: Array<Record<string, unknown>>) {
  const { client } = fakeDb((q: FakeQuery) => {
    if (q.table === "ai_runs" && q.op === "select") {
      return { data: { id: RUN, tool, status: "running", class: "job", source_ids: tool === "legal-opinion-consult" ? FOUND.map : {}, input } };
    }
    if (q.table === "platform_settings") return { data: { value: ON } };
    if (q.op === "rpc" && q.table === "ai_fail_run") {
      failed.push(q.payload as Record<string, unknown>);
      return { data: true };
    }
    if (q.table === "ai_runs" && q.op === "update") {
      stored.push(q.payload as Record<string, unknown>);
      return { data: [{ id: RUN }] };
    }
    return {};
  });
  return Object.assign(client, {
    schema: () => ({
      from: (table: string) =>
        table === "laws"
          ? { select: () => ({ ilike: () => ({ limit: async () => ({ data: [{ slug: "labor", title: "نظام العمل", status: "active" }], error: null }) }) }) }
          : { select: () => ({ in: () => ({ in: async () => ({ data: [{ id: "labor__art-77", number: 77, status: "active", law_slug: "labor" }], error: null }) }) }) },
    }),
  });
}

test("consult callback: an answer citing a text it was sent is stored with the citation; one citing none is refunded as ungrounded", async () => {
  const stored: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  const ok = await callbackWith(callbackDb("legal-opinion-consult", { question: QUESTION }, stored, failed) as never, {
    run_id: RUN, status: "succeeded", output: ANSWER, citations: ["S1", "S9"],
  });
  assert.equal(ok.body.final, "succeeded");
  const row = stored.find((s) => s.output)!;
  assert.deepEqual(row.citations, [{ sid: "S1", ...FOUND.map.S1 }], "S9 was never sent");
  assert.ok(!("citation_check" in (row.output as Record<string, unknown>)), "no enricher: the sources are the grounding");

  const stored2: Array<Record<string, unknown>> = [];
  const failed2: Array<Record<string, unknown>> = [];
  const bad = await callbackWith(callbackDb("legal-opinion-consult", { question: QUESTION }, stored2, failed2) as never, {
    run_id: RUN, status: "succeeded", output: { summary: "لا تجيب النصوص المتاحة في المكتبة عن هذا السؤال.", sections: [{ heading: "الخلاصة", body: "لا" }] }, citations: [],
  });
  assert.equal(bad.body.final, "failed");
  assert.equal(failed2[0].p_code, "ungrounded", "ai_fail_run refunds the points");
});

test("letter input: the form's facts, the deadline only from the offered list, over-long fields refused never cut", () => {
  const v = AI_TOOLS["legal-opinion-letter"].validateInput;
  const r = v({ ...LETTER, gov_entity: "يُهمل لغير الجهة الحكومية", legal_ref: "  ", deadline_days: 15, annexes: [" صورة الفاتورة "] });
  assert.deepEqual(r.ok && r.input, {
    ...LETTER, gov_entity: null, legal_ref: null, deadline_days: 15, annexes: ["صورة الفاتورة"],
  });
  assert.equal(v({ ...LETTER, recipient_type: "government", gov_entity: "وزارة التجارة" }).ok, true);
  assert.equal(v({ ...LETTER, type: "" }).ok, false);
  assert.equal(v({ ...LETTER, sender_role: "court" }).ok, false);
  assert.equal(v({ ...LETTER, recipient_type: "court" }).ok, false);
  assert.equal(v({ ...LETTER, sender_name: "" }).ok, false);
  assert.equal(v({ ...LETTER, subject: "قصير" }).ok, false);
  const long = v({ ...LETTER, subject: "م".repeat(LETTER_SUBJECT_MAX + 1) });
  assert.equal(long.ok, false);
  assert.equal(v({ ...LETTER, subject: "م".repeat(LETTER_SUBJECT_MAX) }).ok, true);
  assert.equal(v({ ...LETTER, legal_ref: "م".repeat(501) }).ok, false);
  assert.equal(v({ ...LETTER, deadline_days: 7 }).ok, false);
  assert.equal(v({ ...LETTER, annexes: Array(11).fill("مرفق") }).ok, false);
  assert.equal(v({ ...LETTER, annexes: ["م".repeat(151)] }).ok, false);
});

test("letter output: a title and the full text; cited kept for the citation check", () => {
  const v = AI_TOOLS["legal-opinion-letter"].validateOutput;
  const out = v({ title: "إنذار بالسداد", body: "بسم الله الرحمن الرحيم", cited: [{ law: "نظام المعاملات المدنية", article: 1, as_written: "م١" }] }, {}) as Record<string, any>;
  assert.equal(out.cited.length, 1);
  assert.equal(v({ title: "t", body: " " }, {}), null);
  assert.equal(v({ title: "t", body: "ب".repeat(10001) }, {}), null);
  assert.deepEqual((v({ title: "t", body: "b" }, {}) as Record<string, any>).cited, []);
});

test("letter start: 400 points, no searches, and the package carries no account name", async () => {
  const { client, log } = db();
  const calls: Call[] = [];
  const r = await startRunWith(client as never, deps(calls), INDIVIDUAL, { tool: "legal-opinion-letter", input: LETTER, idempotencyKey: "key-abcdef04" });
  assert.equal(r.status, 202);
  assert.equal((log.find((q) => q.table === "ai_start_run")!.payload as Record<string, unknown>).p_price, 400);
  assert.deepEqual(calls.map((c) => c.path), ["nzamy-ai/legal-opinion-letter"]);
  assert.equal((calls[0].body.actor as Record<string, unknown>).display_name, null);
  assert.deepEqual(calls[0].body.sources, []);
});

test("letter callback: the library's citation_check replaces the model's cited list", async () => {
  const stored: Array<Record<string, unknown>> = [];
  const failed: Array<Record<string, unknown>> = [];
  const r = await callbackWith(callbackDb("legal-opinion-letter", LETTER, stored, failed) as never, {
    run_id: RUN, status: "succeeded", citations: [],
    output: { title: "إنذار", body: "نص الخطاب", cited: [{ law: "نظام العمل", article: 77, as_written: "المادة ٧٧ من نظام العمل" }] },
  });
  assert.equal(r.body.final, "succeeded", "no retrieval: no citation is not a refund");
  const out = stored.find((s) => s.output)!.output as Record<string, any>;
  assert.ok(!("cited" in out));
  assert.equal(out.citation_check[0].status, "ok");
  assert.equal(out.citation_check[0].article, 77);
});

test("page helpers: the inputs the page sends pass the server's checks; results read back; refusals end on the team order", () => {
  const consult = consultRunInput("عمالي", `  ${QUESTION} `);
  assert.deepEqual(consult, { area: "عمالي", question: QUESTION });
  assert.equal(AI_TOOLS["legal-opinion-consult"].validateInput(consult).ok, true);
  assert.deepEqual(consultRunInput(undefined, QUESTION), { area: null, question: QUESTION });

  const letter = letterRunInput({
    typeLabel: "إنذار قانوني", senderRole: "company", senderName: " شركة النور للتجارة ", recipientType: "company",
    recipientName: "مؤسسة الأفق", govEntity: "وزارة", subject: LETTER.subject, legalRef: "", deadlineDays: "10", annexes: ["صورة الفاتورة", " "],
  });
  assert.equal(letter.gov_entity, null, "a government entity only for a government recipient");
  assert.equal(letter.deadline_days, 10);
  assert.deepEqual(letter.annexes, ["صورة الفاتورة"]);
  assert.equal(letter.legal_ref, null);
  assert.equal(AI_TOOLS["legal-opinion-letter"].validateInput(letter).ok, true);
  assert.equal(letterRunInput({ typeLabel: "x", senderRole: "individual", senderName: "a", recipientType: "individual", recipientName: "b", govEntity: "", subject: "s", legalRef: "", deadlineDays: null, annexes: [] }).deadline_days, null);

  const a = asConsultAnswer(ANSWER)!;
  assert.equal(consultAnswerText(a), "تستحق ثلث المكافأة [S1]\n\nما تقوله النصوص\nإذا استقال العامل بعد خمس سنوات وقبل عشر استحق ثلثي المكافأة [S1]");
  assert.equal(asConsultAnswer({ summary: "x", sections: [] }), null);
  assert.equal(asConsultAnswer(null), null);
  assert.equal(asLetterDraft({ title: "t", body: "b", citation_check: [] })!.body, "b");
  assert.equal(asLetterDraft({ title: "t", body: "" }), null);

  for (const code of ["library_tier", "library_closed", "tool_off", "invalid_input", null]) {
    const text = aiOpinionErrorText(code, "رسالة الخادم");
    assert.match(text, /فريق نظامي أدناه/, String(code));
    assert.doesNotMatch(text, /المساعد الذكي للمكتبة/);
  }
  assert.match(aiOpinionErrorText("library_tier", null), /Pro/);
});
