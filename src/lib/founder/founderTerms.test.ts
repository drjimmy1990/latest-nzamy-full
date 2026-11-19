import assert from "node:assert/strict";
import test from "node:test";
import {
  FOUNDER_PROTECTION_ITEMS,
  FOUNDER_REFUND_CLAUSE,
  FOUNDER_TERMS_ITEMS,
  FOUNDER_TERMS_PENDING_NOTE,
  FOUNDER_TERMS_PUBLISHED,
  FOUNDER_TERMS_TITLE,
  FOUNDER_TERMS_VERSION,
  boldSegments,
  founderTermsText,
} from "./founderTerms.ts";
import { CURRENT_TERMS_VERSION } from "../legal/termsVersion.ts";

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

test("item ٧ is the owner's 19-Nov refund (draft clause 7): no AI feature AND no more than 5 full texts read, browsing within those limits allowed, full incl. VAT, no fee, credit note", () => {
  const refund = FOUNDER_TERMS_ITEMS.find((i) => i.title.endsWith("الاسترداد"));
  assert.equal(refund?.id, "refund", "/founder-terms#refund is the founder page's refund link");
  assert.equal(
    refund?.paragraphs?.[0],
    "يحق لك الاسترداد خلال **14 يوماً** من الشراء بشرط **ألا تكون قد استخدمت أي ميزة ذكاء اصطناعي في الباقة**: الصائغ القانوني، أو أدوات المحترفين، أو مساعد المكتبة الذكي والنقاط، **وألا تكون قد قرأت أكثر من 5 ملفات نصاً كاملاً في المكتبة القانونية**. ولا يمنع الاسترداد تصفح المكتبة القانونية العادية في هذه الحدود. ويُردّ المبلغ كاملاً شاملاً ضريبة القيمة المضافة إلى وسيلة الدفع نفسها دون خصم أي رسوم، ويصدر بذلك إشعار دائن. وتحدد جهة إصدار بطاقتك مدة ظهور المبلغ في حسابك.",
  );
  assert.equal(refund?.paragraphs?.[0], FOUNDER_REFUND_CLAUSE);
  assert.doesNotMatch(founderTermsText(), /خدمات الباقة/, "the published wording the owner called an urgent fix is gone");
});

test("l9: ONE new version (register 31), later than the published 2026-11-20, shared with /terms", () => {
  assert.equal(FOUNDER_TERMS_VERSION, "2026-11-21");
  assert.ok(FOUNDER_TERMS_VERSION > "2026-11-20", "never backwards");
  assert.equal(FOUNDER_TERMS_VERSION, CURRENT_TERMS_VERSION, "/terms gained clauses 14–15 in the same version");
});

test("l9 (register 7 / 29 / 32 / 55): minimum top-up 50 points; the 15 % is on top-ups AND any plan, his renewal included, while the yearly subscription is active; the larger discount only", () => {
  const t = founderTermsText();
  assert.doesNotMatch(t, /أي قيمة|أي مبلغ|مدى الحياة|دائم/);
  assert.ok(t.includes("**شحن النقاط بحد أدنى 50 نقطة**"));
  const discount = FOUNDER_TERMS_ITEMS.flatMap((i) => i.bullets ?? []).find((b) => b.includes("15%"));
  assert.ok(discount, "the discount bullet");
  assert.match(discount!, /على شحنات النقاط وعلى أي باقة تشتريها من نظامي/);
  assert.match(discount!, /بما فيها تجديد اشتراكك السنوي/);
  assert.match(discount!, /ما دام اشتراكك السنوي ساريّاً/);
  assert.match(discount!, /فُقد الخصم نهائياً/);
  assert.match(discount!, /الأعلى خصم واحد فقط/);
  assert.doesNotMatch(t, /شحنات النقاط وحدها|على الشحن وحده/, "the l8 «top-ups only» wording is gone");
  const rules = FOUNDER_TERMS_ITEMS.find((i) => i.title.startsWith("١٣."));
  assert.match(rules?.paragraphs?.[0] ?? "", /أعلى خصم واحد فقط/);
  assert.match(FOUNDER_TERMS_ITEMS.find((i) => i.title.startsWith("٤."))?.paragraphs?.[0] ?? "", /يُعلن قبل نهاية السنة بـ60 يوماً/);
});

test("l9: item ٥ — the library is open for the year while the balance is 50 or more; the assistant stops below one question's cost (register 6), not at 50", () => {
  const t = founderTermsText();
  for (const s of ["مفتوحة طوال سنة العضوية **بشرط ألا ينزل رصيدك عن 50 نقطة**", "الشحن لا يجدّد السنة", "فتح المستند نفسه لا يخصم نقاطاً", "100 نقطة تأسيسية", "والسؤال الواحد عليه يخصم **5 نقاط** من أول سؤال", "ويقف المساعد إذا قلّ رصيدك عن كلفة السؤال"]) {
    assert.ok(t.includes(s), s);
  }
  assert.doesNotMatch(t, /أُقفل التصفح والمساعد/, "register 6 beats the draft: the assistant is not locked at 50");
  assert.doesNotMatch(t, /وتبقى المكتبة مفتوحة طوال مدة العضوية/, "the l8 «always open» line is gone");
});

test("l9 (register 62): the founder's «other tool» output is NOT published in the terms", () => {
  assert.doesNotMatch(founderTermsText(), /مخرج مستقل|أدوات المحترفين الأربع/);
});

test("l9 (register 12, file 15 row 81): no live-search line, no 10-point price for it", () => {
  const t = founderTermsText();
  assert.doesNotMatch(t, /البحث الحي|بحث حي/);
  assert.doesNotMatch(t, /10 نقاط/);
});

test("l9: clauses ١٠–١٥ and ١٤-أ are the draft's text", () => {
  const titles = FOUNDER_TERMS_ITEMS.map((i) => i.title);
  for (const prefix of ["١٠.", "١١.", "١٢.", "١٣.", "١٤.", "١٤-أ.", "١٥."]) {
    assert.ok(titles.some((x) => x.startsWith(prefix)), prefix);
  }
  const t = founderTermsText();
  for (const s of [
    "**تحذير عند 30 فتحاً في اليوم**",
    "**50 فتحاً في اليوم** أو **150 فتحاً في أسبوع** (أي 7 أيام متحركة) بتوقيت الرياض",
    "يُسمح بجهازين لاستخدام المكتبة",
    "**ثلاثة أشهر** للشحنات الأقل من 500 وللشحنة 500، و**6 أشهر** لشحنة 1,000، و**12 شهراً** لشحنة 2,500 فأكثر",
    "فانتهاء صلاحية شحنة قد يُقفل التصفح حتى تشحن من جديد",
    "(مثل Claude وCodex وChatGPT وAntigravity وGemini وغيرها)",
    "(6) أي التفاف على القيود التقنية.",
    "وعند الشك يُفسَّر النص لصالح المنع.",
    "**والإذن الوحيد القائم** هو ما يسمح به ملف robots.txt",
  ]) {
    assert.ok(t.includes(s), s);
  }
  const exception = FOUNDER_TERMS_ITEMS.find((i) => i.title.startsWith("١٤-أ."));
  assert.equal(exception?.bullets?.length, 6);
  assert.equal(exception?.after?.length, 1, "the closing paragraph comes after the six limits");
});

test("the pending note is the agreed wording", () => {
  assert.equal(FOUNDER_TERMS_PENDING_NOTE, "الشروط الخاصة بباقة المؤسس قيد المراجعة القانونية النهائية، وتُنشر قبل فتح الشراء");
});

test("the draft's points (TEST-PLAN د) are all in the text", () => {
  const t = founderTermsText();
  for (const s of ["6 أعمال", "5 نقاط", "شحن النقاط", "18 نوفمبر 2026", "17 ديسمبر 2026", "تحديث عروضها", "الاسترداد", "9,500", "3,445.40", "14 يوماً"]) {
    assert.ok(t.includes(s), s);
  }
  // l9: items ١–١٥ plus ١٤-أ; the live-search item is gone
  assert.equal(FOUNDER_TERMS_ITEMS.length, 16);
  assert.equal(FOUNDER_PROTECTION_ITEMS.length, 5);
});

test("boldSegments: odd indexes are bold", () => {
  assert.deepEqual(boldSegments("a **b** c"), ["a ", "b", " c"]);
});
