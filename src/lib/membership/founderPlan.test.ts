/**
 * founderPlan.test.ts — the lawyer founder membership's constants and the
 * credit an AI run may spend (P3, Task 3).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  creditKindForRun,
  founderCreditChoiceKey,
  founderCreditChoiceView,
  founderCreditLabel,
  founderCreditRefundText,
  FOUNDER_CAMPAIGN_ID,
  FOUNDER_CREDIT_PRICE_TEXT,
  FOUNDER_CREDIT_REFUNDED_FAILURE,
  FOUNDER_CREDIT_USED_TEXT,
  FOUNDER_CREDITS,
  FOUNDER_DRAFT_KINDS,
  FOUNDER_LIBRARY_DAYS,
  FOUNDER_MEMBERSHIP_MONTHS,
  FOUNDER_OUTPUT_TOOLS,
  FOUNDER_PLAN_ID,
} from "./founderPlan.ts";
import { DRAFT_KIND_IDS } from "../ai/draftKinds.ts";
import { PRICE_BOOK } from "../pricing/priceBook.ts";

test("the plan and campaign ids are the manifest's", () => {
  assert.equal(FOUNDER_PLAN_ID, "lawyer-founder-2026");
  assert.equal(FOUNDER_CAMPAIGN_ID, "founder-2026");
});

test("the plan id is the price book's membership entry (one source, no import edge into the book)", () => {
  const entry = PRICE_BOOK[FOUNDER_PLAN_ID];
  assert.ok(entry, "the book sells the founder plan");
  assert.equal(entry.kind, "membership");
});

test("what activation grants mirrors 20261101_10: 12 months, 6 works + 1 output, 365 library days", () => {
  assert.equal(FOUNDER_MEMBERSHIP_MONTHS, 12);
  assert.deepEqual({ ...FOUNDER_CREDITS }, { drafting_work: 6, independent_output: 1 });
  assert.equal(FOUNDER_LIBRARY_DAYS, 365);
  assert.ok(Object.isFrozen(FOUNDER_CREDITS));
});

test("the 7 eligible drafter kinds: every draft kind except rejoinder (R3, owner ٣٩٩)", () => {
  assert.deepEqual([...FOUNDER_DRAFT_KINDS], ["claim", "reply", "supplementary", "closing", "appeal", "cassation", "petition"]);
  assert.ok(!FOUNDER_DRAFT_KINDS.includes("rejoinder"));
  for (const k of FOUNDER_DRAFT_KINDS) assert.ok(DRAFT_KIND_IDS.includes(k), k);
  assert.ok(Object.isFrozen(FOUNDER_DRAFT_KINDS));
});

test("the four independent-output tools", () => {
  assert.deepEqual([...FOUNDER_OUTPUT_TOOLS], ["contracts-pro", "legal-opinion-consult", "legal-opinion-letter", "wargaming"]);
});

test("creditKindForRun: the drafter's first turn of an eligible kind spends a work", () => {
  for (const kind of FOUNDER_DRAFT_KINDS) {
    assert.equal(creditKindForRun("legal-drafter", { kind }, 0), "drafting_work", kind);
  }
});

test("creditKindForRun: the drafter's second turn never spends a second work", () => {
  assert.equal(creditKindForRun("legal-drafter", { kind: "claim" }, 1), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: "appeal" }, 2), null);
});

test("creditKindForRun: rejoinder, a missing, unknown, non-string or inherited kind spends nothing", () => {
  assert.equal(creditKindForRun("legal-drafter", { kind: "rejoinder" }, 0), null);
  assert.equal(creditKindForRun("legal-drafter", {}, 0), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: "memo" }, 0), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: 1 }, 0), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: ["claim"] }, 0), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: "constructor" }, 0), null);
  assert.equal(creditKindForRun("legal-drafter", { kind: "toString" }, 0), null);
});

test("creditKindForRun: each output tool's first turn spends the independent output; a later turn nothing", () => {
  for (const tool of FOUNDER_OUTPUT_TOOLS) {
    assert.equal(creditKindForRun(tool, {}, 0), "independent_output", tool);
    assert.equal(creditKindForRun(tool, { kind: "claim" }, 0), "independent_output", tool);
    assert.equal(creditKindForRun(tool, {}, 1), null, tool);
  }
});

test("creditKindForRun: any other tool, or an inherited key as a tool, spends nothing", () => {
  for (const tool of ["quick-answer", "contract-drafter", "brief-check", "case-brief", "", "constructor", "__proto__", "Legal-Drafter"]) {
    assert.equal(creditKindForRun(tool, { kind: "claim" }, 0), null, tool);
  }
});

test("creditKindForRun: a turn that is not a whole number ≥ 0 spends nothing", () => {
  for (const turn of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(creditKindForRun("legal-drafter", { kind: "claim" }, turn), null, String(turn));
    assert.equal(creditKindForRun("contracts-pro", {}, turn), null, String(turn));
  }
});

// ── the «استخدم رصيد باقة المؤسس» choice on the four tools (Task 7) ─────────

test("founderCreditLabel: the drafting work reads «متبقٍ N من M» in Arabic-Indic digits", () => {
  assert.equal(founderCreditLabel("drafting_work", 5, 6), "استخدم عملاً من باقة المؤسس (متبقٍ ٥ من ٦)");
  assert.equal(founderCreditLabel("drafting_work", 6, 6), "استخدم عملاً من باقة المؤسس (متبقٍ ٦ من ٦)");
  assert.equal(founderCreditLabel("drafting_work", 12, 12), "استخدم عملاً من باقة المؤسس (متبقٍ ١٢ من ١٢)");
});

test("founderCreditLabel: the independent output reads «(N من M)», no «متبقٍ»", () => {
  assert.equal(founderCreditLabel("independent_output", 1, 1), "استخدم مخرجك المستقل من باقة المؤسس (١ من ١)");
});

test("the price and deducted lines are the brief's words", () => {
  assert.equal(FOUNDER_CREDIT_PRICE_TEXT, "من رصيد باقة المؤسس — بلا نقاط");
  assert.equal(FOUNDER_CREDIT_USED_TEXT, "استُخدم من رصيد باقة المؤسس");
});

const MEMBER = {
  member: true,
  endsAt: "2027-11-01T00:00:00.000Z",
  credits: { drafting_work: { total: 6, remaining: 5 }, independent_output: { total: 1, remaining: 1 } },
  libraryUntil: null,
};

test("founderCreditChoiceView: a member with credit left sees it; works checked by default, the output not", () => {
  assert.deepEqual(founderCreditChoiceView("drafting_work", MEMBER), {
    show: true,
    label: "استخدم عملاً من باقة المؤسس (متبقٍ ٥ من ٦)",
    defaultChecked: true,
  });
  assert.deepEqual(founderCreditChoiceView("independent_output", MEMBER), {
    show: true,
    label: "استخدم مخرجك المستقل من باقة المؤسس (١ من ١)",
    defaultChecked: false,
  });
});

test("founderCreditChoiceView: hidden for a non-member, a failed or odd reply, and nothing remaining", () => {
  const spent = { ...MEMBER, credits: { drafting_work: { total: 6, remaining: 0 }, independent_output: { total: 1, remaining: 0 } } };
  const hidden = { show: false };
  for (const kind of ["drafting_work", "independent_output"] as const) {
    assert.deepEqual(founderCreditChoiceView(kind, { ...MEMBER, member: false }), hidden, kind);
    assert.deepEqual(founderCreditChoiceView(kind, spent), hidden, kind);
    assert.deepEqual(founderCreditChoiceView(kind, null), hidden, kind);
    assert.deepEqual(founderCreditChoiceView(kind, undefined), hidden, kind);
    assert.deepEqual(founderCreditChoiceView(kind, { error: "تعذّر تحميل عضويتك الآن" }), hidden, kind);
    assert.deepEqual(founderCreditChoiceView(kind, { member: "true", credits: MEMBER.credits }), hidden, kind);
    assert.deepEqual(founderCreditChoiceView(kind, { member: true }), hidden, kind);
    assert.deepEqual(founderCreditChoiceView(kind, { member: true, credits: {} }), hidden, kind);
    assert.deepEqual(
      founderCreditChoiceView(kind, { member: true, credits: { [kind]: { total: 6, remaining: "5" } } }),
      hidden,
      kind,
    );
    assert.deepEqual(
      founderCreditChoiceView(kind, { member: true, credits: { [kind]: { total: 6, remaining: -1 } } }),
      hidden,
      kind,
    );
    assert.deepEqual(
      founderCreditChoiceView(kind, { member: true, credits: { [kind]: { total: Number.NaN, remaining: 1 } } }),
      hidden,
      kind,
    );
  }
});

test("founderCreditChoiceView: hidden when the run would not spend this credit (rejoinder, a later turn)", () => {
  assert.deepEqual(founderCreditChoiceView("drafting_work", MEMBER, false), { show: false });
  assert.deepEqual(founderCreditChoiceView("independent_output", MEMBER, false), { show: false });
});

test("founderCreditRefundText: a credit run's refund says the credit came back, not the points (R20)", () => {
  assert.equal(
    founderCreditRefundText("تعذّر إكمال الطلب، وأُعيدت نقاطك", true),
    "تعذّر إكمال الطلب، وأُعيد رصيد باقة المؤسس",
  );
  assert.equal(
    founderCreditRefundText("استغرق الطلب وقتاً أطول من المسموح، وأُعيدت نقاطك — حاول مرة أخرى", true),
    "استغرق الطلب وقتاً أطول من المسموح، وأُعيد رصيد باقة المؤسس — حاول مرة أخرى",
  );
  assert.equal(
    founderCreditRefundText("لم أجد في مكتبة الأنظمة نصوصاً تتعلق بسؤالك، وأُعيدت نقاطك — جرّب صياغة أخرى", true),
    "لم أجد في مكتبة الأنظمة نصوصاً تتعلق بسؤالك، وأُعيد رصيد باقة المؤسس — جرّب صياغة أخرى",
  );
  assert.equal(FOUNDER_CREDIT_REFUNDED_FAILURE, "تعذّر إكمال الطلب، وأُعيد رصيد باقة المؤسس");
});

test("founderCreditChoiceKey: a settled credit run remounts the choice (the balance is read again)", () => {
  assert.equal(founderCreditChoiceKey("done", true, "r1"), "spent:r1");
  assert.equal(founderCreditChoiceKey("review", true, "r2"), "spent:r2");
  assert.equal(founderCreditChoiceKey("done", true, null), "spent:");
});

test("founderCreditChoiceKey: idle, busy, a failed (refunded) or a points run keeps the same choice", () => {
  for (const phase of ["idle", "starting", "running", "error"] as const) {
    assert.equal(founderCreditChoiceKey(phase, true, "r1"), "choice", phase);
  }
  assert.equal(founderCreditChoiceKey("done", false, "r1"), "choice");
  assert.equal(founderCreditChoiceKey("review", false, "r1"), "choice");
});

test("founderCreditRefundText: a points run, or a message without a refund, is left exactly as it was", () => {
  assert.equal(founderCreditRefundText("تعذّر إكمال الطلب، وأُعيدت نقاطك", false), "تعذّر إكمال الطلب، وأُعيدت نقاطك");
  assert.equal(
    founderCreditRefundText("لا يتبقى لك رصيد من باقة المؤسس لهذه الأداة", true),
    "لا يتبقى لك رصيد من باقة المؤسس لهذه الأداة",
  );
  assert.equal(founderCreditRefundText("بلغت الحد اليومي لهذه الأداة — حاول غداً", true), "بلغت الحد اليومي لهذه الأداة — حاول غداً");
});
