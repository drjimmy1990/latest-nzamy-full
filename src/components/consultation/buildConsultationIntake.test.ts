import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConsultationIntake,
  timingLabelAr,
  type ConsultationIntakeInput,
} from "./buildConsultationIntake.ts";

const base: ConsultationIntakeInput = {
  specialtyLabel: "قضايا عمالية",
  specialtyId: "labor",
  description: "فُصلت من عملي بعد ثلاث سنوات بدون سبب واضح وأريد معرفة حقوقي.",
  consultTypeLabel: "استشارة مرئية",
  consultTypeId: "video",
  estimatedPrice: "٢٩٩ ر.س",
  scheduleMode: "calendar",
  calDay: "الأحد",
  calTime: "10:00",
};

// ─── timingLabelAr ────────────────────────────────────────────────────────────

test("every timing branch describes a preference, never a promise", () => {
  // The regression this guards: the wizard used to print «خلال ١٥–٢٠ دقيقة» and
  // «تم العثور على محامٍ متاح» on a flow where fulfilment is entirely manual.
  const labels = [
    timingLabelAr({ consultTypeId: "ai", scheduleMode: null, calDay: null, calTime: null }),
    timingLabelAr({ consultTypeId: "video", scheduleMode: "instant", calDay: null, calTime: null }),
    timingLabelAr({ consultTypeId: "video", scheduleMode: "asap", calDay: null, calTime: null }),
    timingLabelAr({ consultTypeId: "video", scheduleMode: "calendar", calDay: "الأحد", calTime: "10:00" }),
    timingLabelAr({ consultTypeId: "video", scheduleMode: null, calDay: null, calTime: null }),
  ];
  for (const label of labels) {
    assert.ok(label.length > 0, "a timing label is never blank");
    assert.ok(!/١٥|20 min|١٥–٢٠/.test(label), `must not quote an interval: ${label}`);
    assert.ok(!/عُثر|العثور/.test(label), `must not claim a lawyer was found: ${label}`);
  }
});

test("the AI channel has no schedule, so it never borrows one", () => {
  assert.equal(
    timingLabelAr({ consultTypeId: "ai", scheduleMode: "calendar", calDay: "الأحد", calTime: "10:00" }),
    "دون موعد محدد — يُنفَّذ من فريق نظامي",
  );
});

test("a half-answered calendar prints only the half that was answered", () => {
  assert.equal(
    timingLabelAr({ consultTypeId: "video", scheduleMode: "calendar", calDay: "الأحد", calTime: null }),
    "تفضيل: الأحد",
  );
  assert.equal(
    timingLabelAr({ consultTypeId: "video", scheduleMode: "calendar", calDay: null, calTime: null }),
    "تفضيل: موعد من التقويم (لم يُحدَّد)",
  );
});

// ─── buildConsultationIntake ──────────────────────────────────────────────────

test("the intake carries the wizard's answers as Arabic display text", () => {
  const { intake } = buildConsultationIntake(base);
  assert.equal(intake.service, "consultation");
  assert.equal(intake.legalBranch, "قضايا عمالية");
  assert.equal(intake.description, base.description);
  assert.equal(intake.consultationType, "استشارة مرئية");
  assert.equal(intake.preferredTiming, "تفضيل: الأحد — 10:00");
  assert.equal(intake.estimatedPrice, "٢٩٩ ر.س");
});

test("no machine id is ever stored inside the intake", () => {
  // THE REGRESSION THIS EXISTS FOR — buildSummaryRows() hides only
  // attachments/schemaVersion/service and prints every other key through
  // labelFor(), which falls back to the RAW KEY. An id parked in the intake
  // therefore renders as «specialtyId: labor» on the client's Arabic receipt
  // and on the team's brief: the exact «**contractDesc:**» defect that
  // src/lib/services/intakeValues.ts was written to end.
  const { intake, ids } = buildConsultationIntake(base);
  for (const key of ["specialtyId", "consultTypeId", "scheduleMode", "calDay", "calTime"]) {
    assert.equal(intake[key], undefined, `${key} must not reach metadata.intake`);
  }
  assert.equal(ids.specialtyId, "labor");
  assert.equal(ids.consultTypeId, "video");
  assert.equal(ids.scheduleMode, "calendar");
  assert.equal(ids.calDay, "الأحد");
  assert.equal(ids.calTime, "10:00");
});

test("every visible intake value is Arabic display text, not an id", () => {
  const { intake } = buildConsultationIntake(base);
  const HIDDEN = new Set(["attachments", "schemaVersion", "service"]);
  for (const [key, value] of Object.entries(intake)) {
    if (HIDDEN.has(key)) continue;
    assert.equal(typeof value, "string", `${key} should be display text`);
    assert.ok(/[؀-ۿ]/.test(String(value)), `${key} renders on an Arabic screen: ${value}`);
  }
});

test("preferredTiming is the only timing row, so nothing repeats it", () => {
  const { intake } = buildConsultationIntake(base);
  assert.equal(intake.preferredDay, undefined);
  assert.equal(intake.preferredTime, undefined);
});

test("intake.service stays outside the four AI keys so the server guard passes it through", () => {
  // checkOrderIntake() dispatches on this exact string; matching one of the
  // four would run a validator that knows nothing about consultations and
  // reject every booking with a 400.
  const { intake } = buildConsultationIntake(base);
  assert.ok(!["draft", "contracts", "wargaming", "legal_opinion"].includes(String(intake.service)));
});

test("a non-calendar booking stores no day or time at all", () => {
  const { intake, ids } = buildConsultationIntake({
    ...base,
    scheduleMode: "asap",
    // Stale values left behind by a client who picked a slot and then switched
    // modes must not survive into the order.
    calDay: "الأحد",
    calTime: "10:00",
  });
  assert.equal(ids.calDay, undefined);
  assert.equal(ids.calTime, undefined);
  assert.equal(intake.preferredTiming, "تفضيل: أول وقت يتوفر");
});

test("empty answers are dropped rather than stored as blanks", () => {
  const { intake, ids } = buildConsultationIntake({
    ...base,
    specialtyId: null,
    consultTypeId: null,
    estimatedPrice: "   ",
    scheduleMode: null,
  });
  assert.equal(ids.specialtyId, undefined);
  assert.equal(ids.consultTypeId, undefined);
  assert.equal(intake.estimatedPrice, undefined);
  assert.equal(ids.scheduleMode, undefined);
});

test("the description column is a readable Arabic brief that ends with the client's own words", () => {
  const { description } = buildConsultationIntake(base);
  assert.ok(description.includes("التخصص: قضايا عمالية"));
  assert.ok(description.includes("نوع الاستشارة: استشارة مرئية"));
  assert.ok(description.includes("التوقيت المطلوب: تفضيل: الأحد — 10:00"));
  assert.ok(description.includes(base.description));
});

test("the price is labelled an estimate wherever it is written", () => {
  // The owner's ruling of 26 August: submission is free and the team quotes
  // afterwards, so a bare figure would read as a charge the client just agreed
  // to.
  const { description, intake } = buildConsultationIntake(base);
  assert.ok(description.includes("السعر التقديري"));
  assert.ok(!/^السعر: /m.test(description));
  assert.equal(intake.estimatedPrice, "٢٩٩ ر.س");
});

test("a description of only whitespace becomes an em dash, not an empty section", () => {
  const { description, intake } = buildConsultationIntake({ ...base, description: "   \n  " });
  assert.ok(description.trimEnd().endsWith("—"));
  assert.equal(intake.description, undefined);
});

test("the title names the specialty so the admin queue is scannable", () => {
  assert.equal(buildConsultationIntake(base).title, "حجز استشارة — قضايا عمالية");
});
