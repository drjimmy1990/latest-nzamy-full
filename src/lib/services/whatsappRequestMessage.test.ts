/**
 * whatsappRequestMessage.test.ts — run with:
 *   node --test src/lib/services/whatsappRequestMessage.test.ts
 * or with the whole suite: npm run test:unit
 *
 * THE DEFECTS UNDER TEST, all of them public: the floating WhatsApp widget is
 * mounted on every page of the site for signed-in users AND anonymous
 * visitors.
 *
 *  1. A request placed through it reached localStorage and nothing else, while
 *     the success screen printed a reference number for it.
 *  2. The message the CLIENT forwarded to the law office carried «حالة التنفيذ:
 *     تم تسجيل طلب محلي وجاهز للربط بالباك إند» — a developer's note about an
 *     unfinished integration, in the client's own WhatsApp.
 *  3. The stored answers were English machine ids (`provider: "lawyer"`,
 *     `urgency: "urgent"`), which the fulfilment brief renders under their raw
 *     key because labelFor() has no Arabic for a value it was never given.
 *
 * What is pinned below is therefore: the outcome and the sentence about it can
 * never disagree; a reference exists only where a row does; every value that
 * reaches `metadata.intake` is Arabic; and no row is ever printed with an
 * invented value behind it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWhatsAppHref,
  buildWhatsAppMessage,
  buildWhatsAppRequestContent,
  outcomeScreenCopyAr,
  outcomeStatusLineAr,
  resolveConsultTiming,
  resolveWhatsAppFlow,
  whatsAppRequestType,
  whatsAppServiceTitle,
  widgetPriceAr,
  widgetPriceValue,
  type WhatsAppOutcome,
  type WhatsAppWizardAnswers,
} from "./whatsappRequestMessage.ts";

const EMPTY_ANSWERS: WhatsAppWizardAnswers = {
  detailsTitle: "",
  detailsDesc: "",
  contractNotes: "",
  repDetails: "",
  calDay: null,
  calSlot: null,
  paymentMethod: "",
  selections: {},
};

function answers(patch: Partial<WhatsAppWizardAnswers>): WhatsAppWizardAnswers {
  return { ...EMPTY_ANSWERS, ...patch };
}

/** Every string a user or the office could ever see, from one built request. */
function allText(content: { title: string; description: string; intake: Record<string, unknown>; rows: Array<[string, string]> }) {
  return [
    content.title,
    content.description,
    ...Object.values(content.intake).map(String),
    ...content.rows.flat(),
  ].join("\n");
}

// ─── flow resolution ─────────────────────────────────────────────────────────

test("the flow is read from the step history, in the documented order", () => {
  assert.equal(resolveWhatsAppFlow(["service-select", "consult-timing"]), "consult");
  assert.equal(resolveWhatsAppFlow(["service-select", "contract-type"]), "contract");
  assert.equal(resolveWhatsAppFlow(["representation-sub"]), "representation");
  assert.equal(resolveWhatsAppFlow(["notary-type"]), "notary");
  assert.equal(resolveWhatsAppFlow(["service-select"]), "generic");
  assert.equal(resolveWhatsAppFlow([]), "generic");
});

test("the three answers to «متى تريد الاستشارة؟» are recoverable from the history", () => {
  assert.equal(resolveConsultTiming(["consult-timing", "consult-instant-modality"]), "instant");
  assert.equal(resolveConsultTiming(["consult-timing", "consult-next-details"]), "asap");
  assert.equal(resolveConsultTiming(["consult-timing", "consult-specific-details"]), "calendar");
  assert.equal(resolveConsultTiming(["consult-timing", "consult-calendar"]), "calendar");
  // Asked but not answered, and a flow that never asks, are both "no answer".
  assert.equal(resolveConsultTiming(["consult-timing"]), null);
  assert.equal(resolveConsultTiming(["notary-type"]), null);
});

test("only a corporate dispute is a business_case", () => {
  assert.equal(whatsAppRequestType("consult", "individual"), "consultation");
  assert.equal(whatsAppRequestType("representation", "corporate"), "business_case");
  assert.equal(whatsAppRequestType("representation", "individual"), "service");
  assert.equal(whatsAppRequestType("notary", "corporate"), "service");
});

test("the title names the service, and the two role-specific wordings survive", () => {
  assert.equal(whatsAppServiceTitle("consult", "government"), "طلب دعم قانوني حكومي");
  assert.equal(whatsAppServiceTitle("consult", "individual"), "طلب استشارة قانونية");
  assert.equal(whatsAppServiceTitle("contract", "firm"), "طلب مراجعة عقد داخل المكتب");
  assert.equal(whatsAppServiceTitle("generic", "individual"), "طلب خدمة قانونية");
});

// ─── nothing invented ────────────────────────────────────────────────────────

test("a flow with no price has no price — not a zero", () => {
  assert.equal(widgetPriceAr({}), "");
  assert.equal(widgetPriceValue({}), null);

  const content = buildWhatsAppRequestContent({
    flow: "representation",
    history: [],
    category: "individual",
    answers: answers({ selections: { specialty: "عمالية" } }),
  });

  assert.equal(content.intake.estimatedPrice, undefined);
  assert.equal(content.ids.originalPrice, undefined);
  assert.ok(!content.rows.some(([label]) => label.includes("السعر")));
});

test("an unanswered wizard produces no blank rows at all", () => {
  const content = buildWhatsAppRequestContent({
    flow: "generic",
    history: [],
    category: "guest",
    answers: EMPTY_ANSWERS,
  });

  // `service` and `schemaVersion` are bookkeeping and are hidden from the brief
  // by HIDDEN_INTAKE_KEYS (src/lib/services/intakeValues.ts:588).
  assert.deepEqual(Object.keys(content.intake), ["service", "schemaVersion"]);
  assert.deepEqual(content.rows, []);
  // Never an empty description: buildOrderPrompt prints it verbatim.
  assert.equal(content.description, "طلب خدمة قانونية");
});

test("whitespace-only free text is dropped, not stored as a blank answer", () => {
  const content = buildWhatsAppRequestContent({
    flow: "consult",
    history: [],
    category: "individual",
    answers: answers({ detailsTitle: "   ", detailsDesc: "\n  " }),
  });

  assert.equal(content.intake.subject, undefined);
  assert.equal(content.intake.description, undefined);
});

const CALENDAR_HISTORY = ["consult-timing", "consult-specific-details", "consult-calendar"];

test("a half-answered calendar names the half that was answered", () => {
  const dayOnly = buildWhatsAppRequestContent({
    flow: "consult",
    history: CALENDAR_HISTORY,
    category: "individual",
    answers: answers({ calDay: "الجمعة 28 أغسطس", calSlot: null }),
  });
  assert.equal(dayOnly.intake.preferredTiming, "تفضيل: الجمعة 28 أغسطس");

  const both = buildWhatsAppRequestContent({
    flow: "consult",
    history: CALENDAR_HISTORY,
    category: "individual",
    answers: answers({ calDay: "الجمعة 28 أغسطس", calSlot: "11:00" }),
  });
  assert.equal(both.intake.preferredTiming, "تفضيل: الجمعة 28 أغسطس — 11:00");

  // The visitor asked for a specific date and never picked one. Saying so beats
  // both a blank row and a made-up date.
  const neither = buildWhatsAppRequestContent({
    flow: "consult",
    history: CALENDAR_HISTORY,
    category: "individual",
    answers: answers({ calDay: "", calSlot: "" }),
  });
  assert.equal(neither.intake.preferredTiming, "تفضيل: موعد من التقويم (لم يُحدَّد)");
});

test("«استشارة فورية» and «أقرب وقت متاح» reach the office too", () => {
  // Neither branch writes a calDay, so before this the most urgent of the three
  // answers to «متى تريد الاستشارة؟» arrived with no timing row at all.
  const instant = buildWhatsAppRequestContent({
    flow: "consult",
    history: ["consult-timing", "consult-instant-modality", "consult-instant-provider"],
    category: "individual",
    answers: EMPTY_ANSWERS,
  });
  assert.equal(instant.intake.preferredTiming, "تفضيل: الأسرع الممكن");
  assert.equal(instant.ids.scheduleMode, "instant");

  const asap = buildWhatsAppRequestContent({
    flow: "consult",
    history: ["consult-timing", "consult-next-details", "consult-next-modality"],
    category: "individual",
    answers: EMPTY_ANSWERS,
  });
  assert.equal(asap.intake.preferredTiming, "تفضيل: أول وقت يتوفر");
  assert.equal(asap.ids.scheduleMode, "asap");
});

test("a flow that was never asked about timing gets no timing row", () => {
  const notary = buildWhatsAppRequestContent({
    flow: "notary",
    history: ["notary-type", "notary-location", "notary-urgency"],
    category: "individual",
    answers: answers({ selections: { notaryType: "وكالة شرعية" } }),
  });

  assert.equal(notary.intake.preferredTiming, undefined);
  assert.equal(notary.ids.scheduleMode, undefined);
  assert.ok(!notary.rows.some(([label]) => label.includes("التوقيت")));
});

test("«غير مطلوب» is not a payment method the client chose, so it gets no row", () => {
  const content = buildWhatsAppRequestContent({
    flow: "notary",
    history: [],
    category: "individual",
    answers: answers({ paymentMethod: "not_required", selections: { notaryType: "وكالة شرعية" } }),
  });

  assert.ok(!content.rows.some(([label]) => label.includes("الدفع")));
  assert.equal(content.ids.paymentMethodId, undefined);
});

test("a chosen card is reported as a preference, never as a payment", () => {
  const content = buildWhatsAppRequestContent({
    flow: "consult",
    history: [],
    category: "individual",
    answers: answers({ paymentMethod: "mada", selections: { provider: "lawyer" } }),
  });

  const row = content.rows.find(([label]) => label.includes("الدفع"));
  assert.ok(row, "the chosen card should reach the office");
  assert.equal(row?.[1], "مدى");
  assert.ok(row?.[0].includes("لم يُحصَّل"), "the row must say no money changed hands");
  assert.equal(content.ids.paymentMethodId, "mada");
});

// ─── every intake value is Arabic ────────────────────────────────────────────

test("machine ids are translated to the picker's own Arabic, never stored raw", () => {
  const content = buildWhatsAppRequestContent({
    flow: "consult",
    history: [],
    category: "individual",
    answers: answers({
      detailsTitle: "فصل تعسفي",
      detailsDesc: "أُنهي عقدي بلا إشعار.",
      paymentMethod: "visa",
      selections: { modality: "video", provider: "lawyer" },
    }),
  });

  assert.equal(content.intake.subject, "فصل تعسفي");
  assert.equal(content.intake.description, "أُنهي عقدي بلا إشعار.");
  assert.equal(content.intake.consultationType, "استشارة عبر فيديو مع محامي متخصص");
  assert.equal(content.intake.estimatedPrice, "٧٠٠ ر.س");
  // The ids are kept, but on `metadata` above the intake, where no summary
  // walker reaches them.
  assert.equal(content.ids.modalityId, "video");
  assert.equal(content.ids.providerId, "lawyer");
  assert.equal(content.ids.originalPrice, 700);

  for (const id of ["video", "lawyer", "visa", "consult"]) {
    assert.ok(
      !allText(content).includes(id),
      `machine id "${id}" must not reach a screen — labelFor() would print it raw`,
    );
  }
});

test("every representation answer is Arabic, ids and all", () => {
  const content = buildWhatsAppRequestContent({
    flow: "representation",
    history: [],
    category: "individual",
    answers: answers({
      repDetails: "نزاع على مستحقات.",
      selections: {
        repSub: "attendance",
        specialty: "عمالية",
        city: "الرياض",
        role: "plaintiff",
        stage: "استئناف",
      },
    }),
  });

  assert.equal(content.intake.caseType, "حضور جلسة");
  assert.equal(content.intake.role, "مدعي");
  assert.equal(content.intake.litigationStage, "استئناف");
  assert.equal(content.intake.city, "الرياض");
  assert.equal(content.intake.specialty, "عمالية");

  for (const id of ["attendance", "plaintiff", "Plaintiff"]) {
    assert.ok(!allText(content).includes(id), `machine id "${id}" must not reach a screen`);
  }
});

test("the four unlabelled keys are also spelled out on the description", () => {
  // labelFor() has no Arabic for city / contractService / notaryType /
  // notaryLocation, so each would print under its raw English key in the
  // fulfilment brief. Until intakeValues.ts gains them, the description says
  // them in Arabic — drop a line here when its label lands.
  const content = buildWhatsAppRequestContent({
    flow: "notary",
    history: [],
    category: "individual",
    answers: answers({
      selections: { notaryType: "وكالة شرعية", notaryLocation: "remote", urgency: "urgent" },
    }),
  });

  assert.ok(content.description.includes("نوع الوثيقة: وكالة شرعية"));
  assert.ok(content.description.includes("طريقة التوثيق: إلكتروني (عن بعد)"));
  assert.equal(content.intake.urgency, "عاجل");
});

test("only the branch that collected the free text stores it", () => {
  const contract = buildWhatsAppRequestContent({
    flow: "contract",
    history: [],
    category: "individual",
    answers: answers({
      detailsDesc: "نص من فرع آخر",
      contractNotes: "العقد مرفق أعلاه.",
      selections: { contractType: "عقد عمل", contractService: "lawyer-review" },
    }),
  });

  assert.equal(contract.intake.description, "العقد مرفق أعلاه.");
  assert.equal(contract.intake.contractType, "عقد عمل");
  assert.equal(contract.intake.contractService, "محامي متخصص");
  assert.ok(!allText(contract).includes("نص من فرع آخر"));
});

// ─── the sentence and the outcome cannot disagree ────────────────────────────

test("a reference is quoted only where a row exists", () => {
  assert.match(outcomeStatusLineAr({ kind: "recorded", reference: "WA-XY-1" }), /WA-XY-1/);

  for (const outcome of [
    { kind: "whatsapp_only", reason: "anonymous" },
    { kind: "whatsapp_only", reason: "not_recorded" },
    { kind: "pending" },
  ] as WhatsAppOutcome[]) {
    const line = outcomeStatusLineAr(outcome);
    assert.ok(!/\bWA-/.test(line), `"${line}" must not carry a reference`);
  }
});

test("an unrecorded request says so, and offers no number to quote", () => {
  const anonymous = outcomeScreenCopyAr({ kind: "whatsapp_only", reason: "anonymous" });
  assert.equal(anonymous.reference, null);
  assert.equal(anonymous.showWhatsAppLink, true);
  assert.ok(anonymous.lines.some(l => l.includes("لا يوجد رقم طلب")));
  assert.ok(!anonymous.header.includes("تم استلام"));

  const failed = outcomeScreenCopyAr({ kind: "whatsapp_only", reason: "not_recorded" });
  assert.equal(failed.reference, null);
  assert.equal(failed.tone, "warning");
  assert.ok(failed.lines.some(l => l.includes("لا يوجد رقم طلب")));
});

test("nothing is offered or claimed while the request is still in flight", () => {
  const pending = outcomeScreenCopyAr({ kind: "pending" });
  assert.equal(pending.reference, null);
  assert.equal(pending.showWhatsAppLink, false);
  assert.equal(pending.tone, "pending");
});

test("a recorded request shows the server's reference and points at «طلباتي»", () => {
  const copy = outcomeScreenCopyAr({ kind: "recorded", reference: "WA-K3-9Q" });
  assert.equal(copy.reference, "WA-K3-9Q");
  assert.equal(copy.tone, "success");
  assert.ok(copy.lines.some(l => l.includes("طلباتي")));
});

// ─── the message the client forwards to the office ───────────────────────────

const ACTOR = {
  name: "محمد",
  categoryLabel: "عميل فرد",
  roleLabel: undefined,
  entityName: undefined,
  scopeLabel: "نطاق المستخدم",
};

test("the office is told who, what, where, and whether there is a row to open", () => {
  const message = buildWhatsAppMessage({
    intro: "مرحباً، أرسلت طلباً عبر نظامي:",
    serviceTitle: "طلب استشارة قانونية",
    actor: ACTOR,
    sourcePath: "/library",
    outcome: { kind: "recorded", reference: "WA-K3-9Q" },
    detailRows: [["موضوع الطلب", "فصل تعسفي"]],
  });

  assert.ok(message.includes("- الخدمة: طلب استشارة قانونية"));
  assert.ok(message.includes("- الاسم: محمد"));
  assert.ok(message.includes("- نوع المستخدم: عميل فرد"));
  assert.ok(message.includes("- موضوع الطلب: فصل تعسفي"));
  assert.ok(message.includes("- المسار: /library"));
  assert.ok(message.includes("WA-K3-9Q"));
  // An absent role/entity leaves no empty row behind.
  assert.ok(!message.includes("- الدور:"));
  assert.ok(!message.includes("- الكيان:"));
});

test("an unnamed visitor gets no «الاسم» row rather than a made-up one", () => {
  const message = buildWhatsAppMessage({
    intro: "مرحباً،",
    serviceTitle: "طلب توثيق",
    actor: { name: "", categoryLabel: "زائر", scopeLabel: "نطاق المستخدم" },
    sourcePath: "/",
    outcome: { kind: "whatsapp_only", reason: "anonymous" },
  });

  assert.ok(!message.includes("- الاسم:"));
  assert.ok(message.includes("- نوع المستخدم: زائر"));
});

test("no developer copy survives anywhere in the message", () => {
  // The exact strings the widget used to send to the law office, in the
  // client's own WhatsApp. This is a regression pin, not a style check.
  const banned = [
    "الباك إند",
    "طلب محلي",
    "محلياً",
    "Backend-ready",
    "backendReady",
    "جاهز للربط",
    "WA-DEMO",
  ];

  for (const outcome of [
    { kind: "recorded", reference: "WA-1" },
    { kind: "whatsapp_only", reason: "anonymous" },
    { kind: "whatsapp_only", reason: "not_recorded" },
    { kind: "pending" },
  ] as WhatsAppOutcome[]) {
    const message = buildWhatsAppMessage({
      intro: "مرحباً، أرسلت طلباً عبر نظامي:",
      serviceTitle: "طلب استشارة قانونية",
      actor: ACTOR,
      sourcePath: "/",
      outcome,
    });
    const screen = outcomeScreenCopyAr(outcome);
    const surface = [message, screen.header, screen.headline, ...screen.lines].join("\n");

    for (const phrase of banned) {
      assert.ok(!surface.includes(phrase), `"${phrase}" must not reach a client or the office`);
    }
  }
});

test("the wa.me link points at the office and carries the message encoded", () => {
  const href = buildWhatsAppHref("مرحباً فريق نظامي", "966560655552");
  assert.ok(href.startsWith("https://wa.me/966560655552?text="));
  assert.equal(decodeURIComponent(href.split("?text=")[1]), "مرحباً فريق نظامي");

  // Newlines and «&» survive intact — the message is a multi-line list and an
  // unencoded ampersand would truncate it at the query boundary.
  const multiline = buildWhatsAppHref("- الخدمة: أ & ب\n- المسار: /x", "966560655552");
  assert.equal(decodeURIComponent(multiline.split("?text=")[1]), "- الخدمة: أ & ب\n- المسار: /x");
});
