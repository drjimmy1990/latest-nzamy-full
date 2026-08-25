import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOrderPrompt } from "./orderPrompt.ts";

const base = {
  title: "مذكرة دعوى — عمالي",
  description: "نزاع على مستحقات نهاية الخدمة",
  metadata: {
    serviceTitleAr: "الصائغ القانوني",
    intake: { service: "draft", clientRole: "plaintiff", caseText: "و".repeat(40) },
    attachments: [{ documentId: 7, name: "عقد.pdf", size: 2048 }],
  },
};

test("starts with the service and the title", () => {
  const md = buildOrderPrompt(base);
  assert.ok(md.includes("الصائغ القانوني"));
  assert.ok(md.includes("مذكرة دعوى — عمالي"));
});

test("renders intake fields as readable lines, not JSON braces", () => {
  const md = buildOrderPrompt(base);
  // Tightened when the brief switched to the shared Arabic dictionary: this
  // used to accept the raw key "caseText" as an alternative, which is now the
  // very thing the regression block at the bottom of this file forbids.
  assert.ok(md.includes("وقائع القضية"));
  assert.ok(md.includes("و".repeat(10)));
  assert.ok(!md.includes('{"service"'));
});

test("lists attachments by name", () => {
  assert.ok(buildOrderPrompt(base).includes("عقد.pdf"));
});

test("a numeric documentId does not break rendering", () => {
  // attachments.id is a Postgres bigserial and arrives as a JSON number.
  assert.ok(buildOrderPrompt(base).includes("عقد.pdf"));
});

test("survives an order with no intake at all", () => {
  const md = buildOrderPrompt({ title: "t", description: "d", metadata: {} });
  assert.equal(typeof md, "string");
  assert.ok(md.length > 0);
});

test("never emits the internal team note", () => {
  const md = buildOrderPrompt({
    ...base,
    metadata: { ...base.metadata, internalNotes: "لا ترسل هذا" },
  });
  assert.ok(!md.includes("لا ترسل هذا"));
});

test("nested intake objects are flattened, not stringified", () => {
  const md = buildOrderPrompt({
    ...base,
    metadata: { ...base.metadata, intake: { service: "contracts", parties: { one: { fullName: "محمد" } } } },
  });
  assert.ok(md.includes("محمد"));
});

// ─── the admin panel speaks Arabic ───────────────────────────────────────────
// Regression guard for the reported defect. The owner screenshotted the admin
// fulfilment panel showing this exact order as
//     **complexity:** simple
//     **contractDesc:** بيسشلسبلسيبلسيبلسيبل
//     **schemaVersion:** 1
// while the client's own page for the SAME order read «نوع الطلب: صياغة عقد»,
// «نوع الطرف: شركة», «مستوى التفصيل: عقد بسيط». Both surfaces now render
// through src/lib/services/intakeValues.ts, so they cannot say different
// things again without one of these failing.

const screenshotOrder = {
  title: "صياغة عقد — عقود العمل",
  description: "عقد عمل لموظف تنفيذي",
  metadata: {
    serviceTitleAr: "محترف العقود",
    schemaVersion: 1,
    intake: {
      service: "contracts",
      schemaVersion: 1,
      mode: "draft",
      contractType: "labor",
      complexity: "simple",
      contractDesc: "بيسشلسبلسيبلسيبلسيبل",
      parties: { one: { type: "company", companyName: "شركة الأمل" } },
    },
  },
};

test("the three strings from the screenshot render in Arabic", () => {
  const md = buildOrderPrompt(screenshotOrder);
  assert.ok(md.includes("وصف العقد"));
  assert.ok(md.includes("مستوى التفصيل"));
  assert.ok(md.includes("عقد بسيط"));
  // …and the rows the client page shows alongside them.
  assert.ok(md.includes("نوع الطلب"));
  assert.ok(md.includes("صياغة عقد"));
  assert.ok(md.includes("نوع الطرف"));
  assert.ok(md.includes("شركة"));
});

test("no English storage key survives into the brief", () => {
  const md = buildOrderPrompt(screenshotOrder);
  assert.ok(!md.includes("contractDesc"));
  assert.ok(!md.includes("complexity"));
  assert.ok(!md.includes("simple"));
  // schemaVersion is suppressed, not translated — HIDDEN_INTAKE_KEYS, the same
  // set the client page applies, which also drops `service` and the duplicate
  // `attachments` list. Only schemaVersion is asserted by name: a bare
  // !includes("service") would read as a guard while actually depending on no
  // fixture ever carrying that substring in a title, and the Latin-letter
  // sweep below already covers the section those two keys could leak into.
  assert.ok(!md.includes("schemaVersion"));
});

test("the client's own free text reaches the brief byte for byte", () => {
  // The dictionary miss returns the value unchanged; that is what carries
  // typed prose, and it is the half of the fix that must NOT translate.
  assert.ok(buildOrderPrompt(screenshotOrder).includes("بيسشلسبلسيبلسيبلسيبل"));
});

test("a picker-only intake leaves no Latin letters in the intake section", () => {
  // Sweep guard rather than a key list: a field added next year with no entry
  // in INTAKE_LABELS shows up here as its raw English key and fails, instead
  // of quietly reopening the defect on one row.
  const md = buildOrderPrompt(screenshotOrder);
  const start = md.indexOf("## بيانات العميل المُدخلة");
  assert.ok(start >= 0);
  const section = md.slice(start + "## بيانات العميل المُدخلة".length).split("\n---")[0];
  assert.match(section, /\S/);
  assert.ok(!/[A-Za-z]/.test(section), `Latin letters left in the intake section: ${section}`);
});

test("a boolean is نعم/لا, never true/false", () => {
  const md = buildOrderPrompt({
    ...screenshotOrder,
    metadata: {
      ...screenshotOrder.metadata,
      intake: { service: "legal_opinion", letter: { responseDeadline: true, deadlineDays: "10" } },
    },
  });
  assert.ok(md.includes("مهلة الرد مطلوبة"));
  assert.ok(md.includes("نعم"));
  assert.ok(!md.includes("true"));
});

test("an intake with nothing printable leaves a dash, not a bare heading", () => {
  const md = buildOrderPrompt({
    title: "t",
    description: "d",
    metadata: { intake: { service: "draft", schemaVersion: 1, caseText: "   " } },
  });
  assert.ok(md.includes("## بيانات العميل المُدخلة\n—"));
});
