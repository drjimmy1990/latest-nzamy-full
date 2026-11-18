import assert from "node:assert/strict";
import test from "node:test";
import {
  FOUNDER_PROTECTION_ITEMS,
  FOUNDER_TERMS_ITEMS,
  FOUNDER_TERMS_PENDING_NOTE,
  FOUNDER_TERMS_PUBLISHED,
  FOUNDER_TERMS_TITLE,
  FOUNDER_TERMS_VERSION,
  boldSegments,
  founderTermsText,
} from "./founderTerms.ts";

test("the terms cannot be published while an owner placeholder is left in them", () => {
  if (FOUNDER_TERMS_PUBLISHED) {
    assert.doesNotMatch(founderTermsText(), /\[|\]|يؤكده المالك|صيغة المالك|يراجعها محامٍ/, "no bracketed or editorial note may be published");
    assert.doesNotMatch(`${FOUNDER_TERMS_TITLE}\n${founderTermsText()}`, /مسودة/, "a production title and text, never «مسودة» (owner ١٦)");
  }
});

test("owner ١٦ (17 Nov 2026): the terms are published, with a version the checkout records", () => {
  assert.equal(FOUNDER_TERMS_PUBLISHED, true);
  assert.match(FOUNDER_TERMS_VERSION, /^\d{4}-\d{2}-\d{2}$/);
});

test("item ٧ is the owner's 18-Nov refund (draft clause 7): no AI feature, browsing allowed, full incl. VAT, no fee, credit note", () => {
  const refund = FOUNDER_TERMS_ITEMS.find((i) => i.title.endsWith("الاسترداد"));
  assert.equal(refund?.id, "refund", "/founder-terms#refund is the founder page's refund link");
  assert.equal(
    refund?.paragraphs?.[0],
    "يحق لك الاسترداد خلال **14 يوماً** من الشراء بشرط **ألا تكون قد استخدمت أي ميزة ذكاء اصطناعي في الباقة**: الصائغ القانوني، أو أدوات المحترفين، أو مساعد المكتبة الذكي والنقاط. ولا يمنع الاسترداد تصفح المكتبة القانونية العادية. ويُردّ المبلغ كاملاً شاملاً ضريبة القيمة المضافة إلى وسيلة الدفع نفسها دون خصم أي رسوم، ويصدر بذلك إشعار دائن. وتحدد جهة إصدار بطاقتك مدة ظهور المبلغ في حسابك.",
  );
  assert.doesNotMatch(founderTermsText(), /خدمات الباقة/, "the published wording the owner called an urgent fix is gone");
});

test("the 18-Nov text has its own version, so new consents record it", () => {
  assert.equal(FOUNDER_TERMS_VERSION, "2026-11-19");
});

test("item ٥ carries the draft's library bullet: the year, no-renewal top-up, 100 founding points from the first question", () => {
  const t = founderTermsText();
  for (const s of ["لسنة كاملة من تفعيل الباقة", "الشحن لا يجدّد السنة", "استخدام المكتبة العادية لا يستهلك نقاطاً", "100 نقطة تأسيسية", "والسؤال الواحد عليه يخصم **5 نقاط** من أول سؤال", "أُغلق المساعد الذكي وحده", "وتبقى المكتبة مفتوحة طوال مدة العضوية"]) {
    assert.ok(t.includes(s), s);
  }
});

test("the pending note is the agreed wording", () => {
  assert.equal(FOUNDER_TERMS_PENDING_NOTE, "الشروط الخاصة بباقة المؤسس قيد المراجعة القانونية النهائية، وتُنشر قبل فتح الشراء");
});

test("the draft's points (TEST-PLAN د) are all in the text", () => {
  const t = founderTermsText();
  for (const s of ["6 أعمال", "5 نقاط", "شحن النقاط بأي قيمة", "18 نوفمبر 2026", "17 ديسمبر 2026", "تحديث عروضها", "الاسترداد", "9,500", "3,445.40", "10 نقاط", "14 يوماً"]) {
    assert.ok(t.includes(s), s);
  }
  assert.equal(FOUNDER_TERMS_ITEMS.length, 10);
  assert.equal(FOUNDER_PROTECTION_ITEMS.length, 5);
});

test("boldSegments: odd indexes are bold", () => {
  assert.deepEqual(boldSegments("a **b** c"), ["a ", "b", " c"]);
});
