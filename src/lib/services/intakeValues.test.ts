import test from "node:test";
import assert from "node:assert/strict";

import {
  INTAKE_VALUE_AR,
  valueLabelAr,
  labelFor,
  buildSummaryRows,
  type SummaryField,
  type SummaryValue,
} from "./intakeValues.ts";
import { validateDraftIntake } from "./orderIntake.ts";
import { validateContractsIntake } from "./orderIntake.contracts.ts";
import { validateWargamingIntake } from "./orderIntake.wargaming.ts";
import { validateLegalOpinionIntake } from "./orderIntake.legalOpinion.ts";

// ─── the two-layer lookup ─────────────────────────────────────────────────────

test("a plain value key resolves for any field name", () => {
  // "individual"/"company"/"government" are the only plain keys: the party
  // pickers in الصائغ القانوني and محترف العقود share them with identical
  // Arabic, which is the whole reason the plain layer exists.
  assert.equal(valueLabelAr("type", "individual"), "فرد");
  assert.equal(valueLabelAr("type", "company"), "شركة");
  assert.equal(valueLabelAr("type", "government"), "جهة حكومية");
  // Same value, a different field, same answer — that is what "plain" means.
  assert.equal(valueLabelAr("senderRole", "individual"), "فرد");
  assert.equal(valueLabelAr("recipientType", "government"), "جهة حكومية");
});

test("a field-scoped key beats the plain key for the same value", () => {
  // The letter wizard's sender/recipient pickers say "شركة / مؤسسة"; the party
  // picker says "شركة". Both are in the dictionary and the scoped one must win,
  // or the client sees a label they were never shown.
  assert.equal(valueLabelAr("senderRole", "company"), "شركة / مؤسسة");
  assert.equal(valueLabelAr("recipientType", "company"), "شركة / مؤسسة");
  assert.notEqual(valueLabelAr("senderRole", "company"), INTAKE_VALUE_AR.company);
});

test("an unknown value falls through UNCHANGED", () => {
  // This is the contract free text depends on: a client's own sentence, a
  // court name typed by hand, a future enum nobody has translated yet — all
  // must reach the screen exactly as stored rather than blanking or throwing.
  assert.equal(
    valueLabelAr("caseText", "فُصل موكلي دون إشعار مسبق بتاريخ ١٤٤٧/٠٢/١٠"),
    "فُصل موكلي دون إشعار مسبق بتاريخ ١٤٤٧/٠٢/١٠",
  );
  assert.equal(valueLabelAr("courtType", "المحكمة العمالية"), "المحكمة العمالية");
  assert.equal(valueLabelAr("memoType", "a_type_added_next_year"), "a_type_added_next_year");
  assert.equal(valueLabelAr("anythingAtAll", ""), "");
});

test("a non-string passes through String()", () => {
  // attachments.id is a Postgres bigserial and PostgREST serialises int8 as a
  // JSON number, so a numeric value genuinely reaches this function.
  assert.equal(valueLabelAr("documentId", 1284), "1284");
  assert.equal(valueLabelAr("deadlineDays", 10), "10");
  assert.equal(valueLabelAr("responseDeadline", true), "true");
  assert.equal(valueLabelAr("lawyerNotes", null), "null");
  assert.equal(valueLabelAr("lawyerNotes", undefined), "undefined");
});

// ─── the dictionary itself ────────────────────────────────────────────────────

test("outputType is keyed on the stored underscore ids, not the wizard's hyphenated ones", () => {
  // OUTPUT_TYPE_TO_STORED (legal-opinion/page.tsx:42-50) rewrites the UI ids
  // before persisting, so keying on "legal-memo" would translate nothing.
  assert.equal(valueLabelAr("outputType", "memo"), "مذكرة رأي");
  assert.equal(valueLabelAr("outputType", "due_diligence"), "تقرير العناية الواجبة");
  assert.equal(valueLabelAr("outputType", "cross_exam"), "مُولّد أسئلة الاستجواب");
  for (const uiOnlyId of ["legal-memo", "due-diligence", "cross-exam"]) {
    assert.equal(INTAKE_VALUE_AR[`outputType:${uiOnlyId}`], undefined);
  }
});

test("the owner's four worked examples render in Arabic", () => {
  assert.equal(valueLabelAr("letterType", "warning"), "إنذار قانوني");
  assert.equal(valueLabelAr("searchDepth", "deep"), "عميق");
  assert.equal(valueLabelAr("clientRole", "plaintiff"), "مُدَّعِي");
  assert.equal(valueLabelAr("targets", "critique"), "نقض المذكرة");
});

test("every letter type the picker offers has an Arabic label", () => {
  // The ids are written out rather than imported from
  // src/app/ai/legal-opinion/_constants.ts on purpose: LETTER_TYPES carries an
  // `Icon` per entry from @phosphor-icons/react, and this suite runs under
  // `node --test` with no React and no JSX pipeline. Keep this list in step
  // with LETTER_TYPES plus the "other" tile LetterWorkflow.tsx appends inline.
  //
  // What this guards: valueLabelAr falls back to the RAW stored value when a
  // key is missing, so a tile added without a `letterType:<id>` entry prints
  // its English id in the admin brief instead of failing loudly.
  const LETTER_TYPE_IDS = [
    "warning", "termination", "demand", "eviction", "settlement",
    "notice", "objection", "request", "proxy", "release", "other",
    // Retired from the picker, still stored on older orders — the dictionary
    // must keep resolving them or those letters print English to the team.
    "complaint",
  ];
  for (const id of LETTER_TYPE_IDS) {
    const ar = valueLabelAr("letterType", id);
    assert.notEqual(ar, id, `letterType:${id} has no label — the admin brief would print «${id}»`);
    assert.match(ar, /[؀-ۿ]/, `letterType:${id} resolved to «${ar}», which is not Arabic`);
  }
  // Three spelled out so a silent rewording is caught too. The wording is the
  // owner's own, from LETTER_TYPES — «عرض» تسوية, not «طلب», and the two Saudi
  // families he asked for that the earlier list had no tile for at all.
  assert.equal(valueLabelAr("letterType", "settlement"), "عرض تسوية ودية");
  assert.equal(valueLabelAr("letterType", "eviction"), "إشعار إخلاء عقار");
  assert.equal(valueLabelAr("letterType", "termination"), "إخطار بفسخ عقد / إنهاء علاقة");
});

test("the tenth letter type reaches the admin brief in Arabic, not as «settlement»", () => {
  // The regression this repeats: a tile added to LETTER_TYPES without a
  // dictionary key printed its raw English id here, because valueLabelAr
  // returns the stored value unchanged on a miss.
  const letterRow = summaryLines(LEGAL_OPINION_LETTER_SETTLEMENT_ORDER)
    .find((l) => l.startsWith("بيانات الخطاب:"));
  assert.ok(letterRow, "the letter sub-object should render");
  assert.ok(letterRow.includes("نوع الخطاب: عرض تسوية ودية"), letterRow);
  assert.ok(!letterRow.includes("settlement"), letterRow);
  // …and the annex names arrive under a label that says they are not files.
  assert.ok(letterRow.includes("مرفقات ذيل الخطاب (أسماء فقط — غير مرفوعة): صورة العقد، كشف المستخلصات"), letterRow);
});

test("the same id reads differently per field, exactly as each picker words it", () => {
  assert.equal(valueLabelAr("clientRole", "plaintiff"), "مُدَّعِي");
  assert.equal(valueLabelAr("role", "plaintiff"), "مدّعٍ / موكلي مدّعٍ");
  assert.equal(valueLabelAr("side", "plaintiff"), "مدّعٍ");
  assert.equal(valueLabelAr("memoType", "appeal"), "طعن");
  assert.equal(valueLabelAr("litigationStage", "appeal"), "استئناف");
  assert.equal(valueLabelAr("studyGoal", "dispute"), "دعوى / نزاع قائم");
  assert.equal(valueLabelAr("goal", "dispute"), "تسوية نزاع");
  assert.equal(valueLabelAr("area", "labor"), "نظام العمل");
  assert.equal(valueLabelAr("topicArea", "labor"), "عمالي");
});

test("no dictionary value still contains a raw machine id", () => {
  // A copy/paste slip that left the English id as its own translation would
  // otherwise pass every test above.
  for (const [key, ar] of Object.entries(INTAKE_VALUE_AR)) {
    const value = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
    assert.notEqual(ar, value, `${key} was never translated`);
    assert.ok(ar.trim().length > 0, `${key} has a blank translation`);
  }
});

test("researchLimit's numeric ids are field-scoped so deadlineDays is untouched", () => {
  assert.equal(valueLabelAr("researchLimit", "10"), "١٠");
  // The letter flow stores deadlineDays as the string "10"; it is a count the
  // client typed, not a picker id, and must not be rewritten.
  assert.equal(valueLabelAr("deadlineDays", "10"), "10");
  assert.equal(INTAKE_VALUE_AR["10"], undefined);
  assert.equal(INTAKE_VALUE_AR["5"], undefined);
});

// ─── the label layer ──────────────────────────────────────────────────────────

test("a parent-scoped label beats the plain label for the same key", () => {
  // `scope` (due diligence) contains a `contracts` and an `ip`; `memoStructure`
  // contains an `attachments`. All three names are already taken at the top
  // level by unrelated fields, which is why these are scoped and not plain.
  assert.equal(labelFor("contracts"), "contracts");
  assert.equal(labelFor("contracts", "scope"), "العقود القائمة");
  assert.equal(labelFor("contractType"), "نوع العقد");
  assert.equal(labelFor("attachments", "memoStructure"), "الملاحق");
  // Unscoped lookups are unaffected by a parent that has no scoped entry.
  assert.equal(labelFor("type", "one"), "نوع الطرف");
  assert.equal(labelFor("anythingAtAll", "settings"), "anythingAtAll");
});

// ═══ end-to-end: real orders, rendered by the real module ═════════════════════
//
// Every fixture below is pushed through its own validator first — the
// validator is what decides the shape and the key ORDER that reach the
// database, so buildSummaryRows() is fed the stored object rather than a
// hand-arranged one. The report's before/after tables are generated from these
// same fixtures.
//
// The field combinations are the wizard's, with one known exception. Only
// استشارة and دراسة render a topic-area grid (ContextConsult.tsx:104-110,
// ContextStudy.tsx:192-195), and clearFlowState() blanks topicArea on every
// sub-flow switch (legal-opinion/page.tsx:221, called at :540) — so the memo,
// research, due-diligence and cross-exam fixtures below carry a topicArea
// their own sub-flow cannot set today. The validator takes it as optional
// (orderIntake.legalOpinion.ts:36, :93, :102) and none of those four fixtures
// asserts on the row it produces, so it is left as-is rather than quietly
// edited; it is reported instead.
//
// Co-occurrence rules respected here, each verified in source:
//  · legal-memo settings are {searchDepth, memoStructure, memoDetailLevel,
//    audience, side} and nothing else — litigationStage belongs to the study
//    branch and only when studyGoal === "dispute"; responseDeadline is written
//    by the letter flow into the `letter` sub-object, never into `settings`
//    (buildSettings(), src/app/ai/legal-opinion/page.tsx:271-307).
//  · contracts contractType/language/selectedClauses exist only when
//    complexity === "detailed" (useContractsState.ts:166-180).
//  · memoSubType comes from MEMO_SUB_TYPES_REGULAR[memoType] for a regular
//    legal branch (draftConstants.ts:53-61); a committee branch
//    (جمركية/ضريبية/زكوية) would use MEMO_SUB_TYPES_COMMITTEES instead.
//  · wargaming memoAttachmentIds appears only when the client tagged an
//    uploaded file as the memo (wargaming/page.tsx:922-923).

function validated(
  result: { ok: true; value: unknown } | { ok: false; errors: string[] },
  what: string,
): Record<string, unknown> {
  assert.ok(result.ok, `${what} fixture is not a valid order: ${result.ok ? "" : result.errors.join(" | ")}`);
  return result.value as Record<string, unknown>;
}

const PARTY_COMPANY = {
  type: "company",
  companyName: "شركة الأفق للمقاولات",
  commercialReg: "١٠١٠٤٥٦٧٨٩",
  unifiedNum: "٧٠٠١٢٣٤٥٦٧",
  representative: "خالد بن سعد العتيبي",
  representativeRole: "المدير العام",
  address: "الرياض — طريق الملك فهد",
  fullName: "", idNumber: "", nationality: "",
  entityName: "", unifiedNumGov: "", contactPerson: "", taxOrCustomsNum: "",
};

const PARTY_INDIVIDUAL = {
  type: "individual",
  companyName: "", commercialReg: "", unifiedNum: "",
  representative: "", representativeRole: "", address: "",
  fullName: "ماجد بن علي الشهري",
  idNumber: "١٠٢٣٤٥٦٧٨٩",
  nationality: "سعودي",
  entityName: "", unifiedNumGov: "", contactPerson: "", taxOrCustomsNum: "",
};

/** الصائغ القانوني — a defendant company answering a labour claim. */
export const DRAFT_ORDER = validated(validateDraftIntake({
  schemaVersion: 1,
  service: "draft",
  clientRole: "defendant",
  memoType: "reply",
  memoSubType: "مذكرة رد أساسية",
  legalBranch: "عمالي",
  caseText: "أقام المدعي دعوى عمالية يطالب فيها بمكافأة نهاية الخدمة وأجرة شهرين، وقد أُنهيت خدمته لغيابه المتكرر دون عذر.",
  parties: { one: PARTY_COMPANY, two: PARTY_INDIVIDUAL },
  judgment: {
    number: "٤٥٦١٢٣٤",
    court: "المحكمة العمالية بالرياض",
    date: "١٤٤٧/٠٢/١٠",
    text: "قضت الدائرة بإلزام المدعى عليها بدفع مبلغ ثمانية عشر ألف ريال.",
    reasons: "استندت الدائرة إلى عدم إثبات الإنذارات الكتابية السابقة على الفصل.",
  },
  lawyerNotes: "الإنذاران مرفقان ضمن المستندات.",
  attachments: [{ documentId: "1284", name: "لائحة الدعوى.pdf", size: 184320 }],
}), "draft");

/** محترف العقود — a detailed Arabic labour contract, draft mode. */
export const CONTRACTS_ORDER = validated(validateContractsIntake({
  schemaVersion: 1,
  service: "contracts",
  mode: "draft",
  complexity: "detailed",
  parties: { one: PARTY_COMPANY, two: PARTY_INDIVIDUAL },
  contractDesc: "عقد عمل محدد المدة لمهندس موقع لمدة سنتين مع بند سرية وعدم منافسة بعد انتهاء العلاقة.",
  courtType: "المحكمة العمالية بالرياض",
  contractType: "labor",
  language: "ar",
  selectedClauses: [
    "الطرف الأول والثاني",
    "نطاق العمل والالتزامات",
    "المقابل المالي وطريقة الدفع",
    "مدة العقد والتجديد",
    "بند السرية وعدم المنافسة",
    "الإنهاء والفسخ",
    "القانون الحاكم وحل النزاعات",
  ],
  additionalClauses: ["بند تسليم العهدة عند انتهاء العقد"],
  attachments: [],
}), "contracts");

/** المحاكي الشامل — critique target satisfied by an uploaded memo file. */
export const WARGAMING_ORDER = validated(validateWargamingIntake({
  schemaVersion: 1,
  service: "wargaming",
  role: "defendant",
  area: "labor",
  caseSummary: "دعوى عمالية بمطالبة مالية عن مكافأة نهاية الخدمة، والخصم قدّم مذكرة مسبقة نرغب في نقضها.",
  targets: ["opponent", "court", "critique"],
  memoAttachmentIds: ["1284"],
  attachments: [{ documentId: "1284", name: "مذكرة الخصم.pdf", size: 242688 }],
}), "wargaming");

/** الرأي الفصل — مذكرة رأي, the sub-flow that carries memoStructure. */
export const LEGAL_OPINION_MEMO_ORDER = validated(validateLegalOpinionIntake({
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "memo",
  topicArea: "labor",
  description: "مذكرة رأي حول مدى نظامية فصل موظف لغياب متكرر دون توجيه إنذارات كتابية موثقة.",
  question: "هل يعد الفصل مشروعاً في ظل غياب الإنذارات الكتابية؟",
  settings: {
    searchDepth: "deep",
    memoStructure: { facts: true, legal: true, recommendation: true, attachments: false },
    memoDetailLevel: "detailed",
    audience: "judge",
    side: "plaintiff",
  },
  attachments: [],
}), "legal_opinion/memo");

/** الرأي الفصل — خطاب رسمي, a "warning" letter (the duplicate-row case). */
export const LEGAL_OPINION_LETTER_ORDER = validated(validateLegalOpinionIntake({
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "letter",
  letter: {
    letterType: "warning",
    letterTypeCustom: undefined,
    letterTypeLabel: "إنذار قانوني",
    senderName: "شركة الأفق للمقاولات",
    senderRole: "company",
    recipientName: "ماجد بن علي الشهري",
    recipientType: "individual",
    responseDeadline: true,
    deadlineDays: "10",
    letterSubject: "إنذار بسداد مستحقات متأخرة",
    letterLegalRef: "المادة (٧٧) من نظام العمل",
    attachmentLabels: ["صورة من العقد", "كشف حساب"],
    fullLetterText: "السيد / ماجد بن علي الشهري\n\nالموضوع: إنذار بسداد مستحقات متأخرة",
  },
  attachments: [],
}), "legal_opinion/letter");

/** The same letter with the "other" type, where the client names it himself.
 *  The custom wording must stay something LETTER_TYPES does NOT cover, or this
 *  fixture stops testing "other" at all. «خطاب تسوية ودية» used to sit here and
 *  was retired once `settlement` («طلب تسوية ودية») became a built-in type;
 *  «خطاب تزكية» is one of step 1's own placeholder examples and has no tile. */
export const LEGAL_OPINION_LETTER_OTHER_ORDER = validated(validateLegalOpinionIntake({
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "letter",
  letter: {
    letterType: "other",
    letterTypeCustom: "خطاب تزكية موظف",
    letterTypeLabel: "خطاب تزكية موظف",
    senderName: "شركة الأفق للمقاولات",
    senderRole: "company",
    recipientName: "ماجد بن علي الشهري",
    recipientType: "individual",
    letterSubject: "تزكية زميل سابق لدى جهة توظيف",
    letterLegalRef: "",
    attachmentLabels: [],
    fullLetterText: "السيد / ماجد بن علي الشهري\n\nالموضوع: تزكية زميل سابق لدى جهة توظيف",
  },
  attachments: [],
}), "legal_opinion/letter-other");

/** The tenth letter type (owner request, 25 August), carried through the real
 *  validator and both dictionary sweeps below — a new tile whose id never
 *  reaches validateLegalOpinionIntake in a test is a tile nothing proves is
 *  submittable. `attachmentLabels` is populated here on purpose: it is the one
 *  fixture that exercises the annex row's own label. */
export const LEGAL_OPINION_LETTER_SETTLEMENT_ORDER = validated(validateLegalOpinionIntake({
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "letter",
  letter: {
    letterType: "settlement",
    letterTypeCustom: undefined,
    letterTypeLabel: "طلب تسوية ودية",
    senderName: "شركة الأفق للمقاولات",
    senderRole: "company",
    recipientName: "ماجد بن علي الشهري",
    recipientType: "individual",
    letterSubject: "عرض إنهاء الخلاف على مستخلصات المشروع ودّياً قبل اللجوء للقضاء",
    letterLegalRef: "",
    attachmentLabels: ["صورة العقد", "كشف المستخلصات"],
    fullLetterText: "السيد / ماجد بن علي الشهري\n\nيعرض تسوية ودية / شركة الأفق للمقاولات",
  },
  attachments: [],
}), "legal_opinion/letter-settlement");

/** الرأي الفصل — the remaining sub-flows, for the English-key sweep. */
export const LEGAL_OPINION_RESEARCH_ORDER = validated(validateLegalOpinionIntake({
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "research",
  topicArea: "labor",
  description: "بحث مقارن في أحكام الفصل التعسفي بين النظام السعودي والنظام الإماراتي.",
  settings: {
    researchType: "compare",
    compareWith: "النظام الإماراتي",
    keywords: ["الفصل التعسفي", "مكافأة نهاية الخدمة"],
    researchSources: { nzamy: true, laws: true, judgments: false, decrees: false },
    researchLimit: "10",
  },
  attachments: [],
}), "legal_opinion/research");

export const LEGAL_OPINION_DD_ORDER = validated(validateLegalOpinionIntake({
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "due_diligence",
  topicArea: "companies",
  description: "فحص نافٍ للجهالة على شركة مقاولات تمهيداً للاستحواذ على حصة أغلبية فيها.",
  settings: {
    entityType: "company",
    entityName: "شركة الأفق للمقاولات",
    extraField: "١٠١٠٤٥٦٧٨٩",
    goal: "acquisition",
    side: "buyer",
    scope: {
      legal_structure: true, regulatory: true, contracts: true,
      disputes: false, ip: true, financial: false,
    },
  },
  attachments: [],
}), "legal_opinion/due-diligence");

export const LEGAL_OPINION_STUDY_ORDER = validated(validateLegalOpinionIntake({
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "study",
  topicArea: "labor",
  description: "دراسة قانونية لمركزنا في نزاع عمالي قائم أمام المحكمة العمالية بالرياض.",
  settings: { searchDepth: "comprehensive", studyGoal: "dispute", litigationStage: "appeal" },
  attachments: [],
}), "legal_opinion/study");

export const LEGAL_OPINION_CONSULT_ORDER = validated(validateLegalOpinionIntake({
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "consult",
  topicArea: "labor",
  description: "استشارة سريعة حول إمكانية إنهاء عقد عمل محدد المدة قبل انتهاء مدته.",
  attachments: [],
}), "legal_opinion/consult");

export const LEGAL_OPINION_CROSS_EXAM_ORDER = validated(validateLegalOpinionIntake({
  schemaVersion: 1,
  service: "legal_opinion",
  outputType: "cross_exam",
  topicArea: "labor",
  description: "أسئلة استجواب لشاهد الخصم في الجلسة القادمة أمام المحكمة العمالية.",
  settings: { witnessRole: "مدير الموارد البشرية", destroyGoal: "إثبات عدم وجود إنذارات كتابية" },
  attachments: [],
}), "legal_opinion/cross-exam");

export const ALL_ORDERS: [string, Record<string, unknown>][] = [
  ["الصائغ القانوني", DRAFT_ORDER],
  ["محترف العقود", CONTRACTS_ORDER],
  ["المحاكي الشامل", WARGAMING_ORDER],
  ["الرأي الفصل — مذكرة رأي", LEGAL_OPINION_MEMO_ORDER],
  ["الرأي الفصل — خطاب رسمي", LEGAL_OPINION_LETTER_ORDER],
  ["الرأي الفصل — خطاب مخصص", LEGAL_OPINION_LETTER_OTHER_ORDER],
  ["الرأي الفصل — طلب تسوية ودية", LEGAL_OPINION_LETTER_SETTLEMENT_ORDER],
  ["الرأي الفصل — بحث قانوني", LEGAL_OPINION_RESEARCH_ORDER],
  ["الرأي الفصل — العناية الواجبة", LEGAL_OPINION_DD_ORDER],
  ["الرأي الفصل — دراسة قانونية", LEGAL_OPINION_STUDY_ORDER],
  ["الرأي الفصل — استشارة", LEGAL_OPINION_CONSULT_ORDER],
  ["الرأي الفصل — الاستجواب", LEGAL_OPINION_CROSS_EXAM_ORDER],
];

/** Flatten one rendered value the way the screen reads it, for assertions. */
export function flattenValue(v: SummaryValue): string {
  if (v.kind === "text") return v.text;
  if (v.kind === "list") return v.items.map(flattenValue).join("، ");
  return v.fields.map((f) => `${f.label}: ${flattenValue(f.value)}`).join("، ");
}

/** Every label in the tree, at every depth. */
function allLabels(fields: SummaryField[]): string[] {
  return fields.flatMap((f) => {
    const nested: string[] = [];
    const walk = (v: SummaryValue) => {
      if (v.kind === "list") v.items.forEach(walk);
      if (v.kind === "fields") nested.push(...allLabels(v.fields));
    };
    walk(f.value);
    return [f.label, ...nested];
  });
}

/** "label: value" per top-level row, the way the report tables print them. */
export function summaryLines(intake: Record<string, unknown>): string[] {
  return buildSummaryRows(intake).map((r) => `${r.label}: ${flattenValue(r.value)}`);
}

// ─── Defect 1: the duplicated «نوع الخطاب» row ────────────────────────────────

test("a letter order shows نوع الخطاب exactly once", () => {
  const lines = summaryLines(LEGAL_OPINION_LETTER_ORDER);
  const letterRow = lines.find((l) => l.startsWith("بيانات الخطاب:"));
  assert.ok(letterRow, "the letter sub-object should render");
  const occurrences = letterRow.split("نوع الخطاب:").length - 1;
  assert.equal(occurrences, 1, `«نوع الخطاب» appeared ${occurrences}× in: ${letterRow}`);
  assert.ok(letterRow.includes("نوع الخطاب: إنذار قانوني"));
});

test("a custom letter type still reaches the screen after letterTypeLabel is suppressed", () => {
  // letterType "other" resolves to «أخرى»; the client's own wording survives in
  // letterTypeCustom, which the step-1 gate guarantees is never blank in a
  // submitted order. LetterWorkflow.tsx:319 is not the file's only
  // setLetterStep(2) — :626 is a second one — but it is the only one outside
  // steps 2-4, so it is the only door out of step 1, and :320 disables it
  // while the custom field is empty. Full argument in HIDDEN_NESTED_KEYS's
  // docblock in intakeValues.ts.
  const letterRow = summaryLines(LEGAL_OPINION_LETTER_OTHER_ORDER)
    .find((l) => l.startsWith("بيانات الخطاب:"));
  assert.ok(letterRow);
  assert.ok(letterRow.includes("نوع الخطاب: أخرى"), letterRow);
  assert.ok(letterRow.includes("نوع الخطاب (مخصص): خطاب تزكية موظف"), letterRow);
  // …and the client's wording is printed once, not twice.
  assert.equal(letterRow.split("خطاب تزكية موظف").length - 1, 1, letterRow);
});

// ─── Defect 2: English keys inside nested objects ─────────────────────────────

test("memoStructure renders Arabic checkbox names, keeping the unticked one", () => {
  const settingsRow = summaryLines(LEGAL_OPINION_MEMO_ORDER)
    .find((l) => l.startsWith("إعدادات إضافية:"));
  assert.ok(settingsRow);
  assert.ok(settingsRow.includes("هيكل المذكرة: الوقائع: نعم، الأساس النظامي: نعم، التوصية: نعم، الملاحق: لا"), settingsRow);
  // The unticked box is a real answer and must survive: the top-level
  // "attachments" hide is top-level only, exactly so this row is not deleted.
  assert.ok(settingsRow.includes("الملاحق: لا"), settingsRow);
});

test("researchSources and scope render Arabic too — the same defect, swept", () => {
  const research = summaryLines(LEGAL_OPINION_RESEARCH_ORDER).find((l) => l.startsWith("إعدادات إضافية:"));
  assert.ok(research);
  assert.ok(research.includes("مصادر البحث: قاعدة نظامي: نعم، الأنظمة واللوائح: نعم، الأحكام القضائية: لا، المراسيم الملكية: لا"), research);

  const dd = summaryLines(LEGAL_OPINION_DD_ORDER).find((l) => l.startsWith("إعدادات إضافية:"));
  assert.ok(dd);
  assert.ok(dd.includes("نطاق الفحص: الهيكل القانوني: نعم، الالتزامات التنظيمية: نعم، العقود القائمة: نعم، النزاعات المعلقة: لا، الملكية الفكرية: نعم، البنية المالية (للاطلاع فقط): لا"), dd);
});

test("no label anywhere in any real order is a raw English key", () => {
  // The guard that catches the next one of these before a client does. It
  // checks LABELS only: a few dictionary VALUES legitimately carry Latin terms
  // of art the picker itself shows ("دليل الموظف (Handbook)",
  // "اتفاقية سرية NDA"), and rewriting a legal type list is exactly the drift
  // this dictionary exists to prevent.
  for (const [service, intake] of ALL_ORDERS) {
    for (const label of allLabels(buildSummaryRows(intake))) {
      assert.ok(!/[A-Za-z]/.test(label), `${service}: label "${label}" is untranslated`);
    }
  }
});

test("no rendered VALUE in any real order is a bare picker id", () => {
  // Free text and names are exempt by nature; what this catches is an id the
  // dictionary missed, which always looks like a lowercase ASCII token.
  const FREE_TEXT_ROWS = new Set([
    "وقائع القضية", "ملخص القضية", "وصف العقد", "الوصف", "السؤال", "نقاط القلق",
    "نص المذكرة", "نص الخطاب", "الكلمات المفتاحية", "المقارنة مع", "بيانات إضافية",
    "صفة الشاهد", "الهدف من الاستجواب", "ملاحظات إضافية",
    "أرقام مستندات المذكرة المراد نقضها",
  ]);
  for (const [service, intake] of ALL_ORDERS) {
    for (const row of buildSummaryRows(intake)) {
      if (FREE_TEXT_ROWS.has(row.label)) continue;
      const text = flattenValue(row.value);
      assert.ok(
        !/(^|[:،\s])[a-z][a-z_]{2,}([،\s]|$)/.test(text),
        `${service} → ${row.label}: "${text}" still contains a machine id`,
      );
    }
  }
});

// ─── the corporate legal request ──────────────────────────────────────────────

test("the corporate request's intake renders in Arabic, not raw keys", () => {
  // src/app/dashboard/business/_components/AddCaseModal.tsx writes exactly
  // this shape. Before it was repointed at /api/v1/service-requests the row
  // never reached a human at all; now that it does, a missing label here is
  // what puts «caseType» / «department» / «urgency» / «details» in front of
  // the fulfilment team, because labelFor() falls back to the raw key.
  const rows = buildSummaryRows({
    service: "business_case",
    caseType: "مراجعة عقد مورد (تجاري)",
    department: "المشتريات والعقود",
    urgency: "عاجلة",
    details: "المورد أوقف التوريد بعد الدفعة الثانية",
  });
  // `service` is a HIDDEN_INTAKE_KEY, so four rows, not five.
  assert.deepEqual(
    rows.map((r) => r.label),
    ["نوع الطلب / القضية", "القسم الطالب", "مستوى الأهمية / الاستعجال", "تفاصيل إضافية لفريق نظامي القانوني"],
  );
  // The values are already the Arabic the modal's own pickers showed, so they
  // must survive untouched — a dictionary hit here would mean some unrelated
  // INTAKE_VALUE_AR key had started rewriting a corporate answer.
  assert.deepEqual(
    rows.map((r) => flattenValue(r.value)),
    ["مراجعة عقد مورد (تجاري)", "المشتريات والعقود", "عاجلة", "المورد أوقف التوريد بعد الدفعة الثانية"],
  );
});

test("an unanswered corporate field drops its row instead of printing an empty label", () => {
  // «تفاصيل إضافية» is the one optional field on that modal; an empty string
  // must not reach the brief as a label with nothing after it.
  const rows = buildSummaryRows({
    service: "business_case",
    caseType: "أخرى",
    department: "المالية",
    urgency: "طبيعية",
    details: "",
  });
  assert.deepEqual(rows.map((r) => r.label), ["نوع الطلب / القضية", "القسم الطالب", "مستوى الأهمية / الاستعجال"]);
});
