/**
 * draftingRequest.test.ts — owner Q485 (N02-7 / N06-18): the library
 * assistant's drafting guard. A request to write a memo / claim / appeal is
 * refused before the model; a question ABOUT one is not.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/draftingRequest.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  DRAFTER_HREF,
  DRAFTING_REFUSAL_TEXT,
  DRAFTING_REFUSED_CODE,
  draftingRefusal,
  foldArabic,
  isDraftingRequest,
} from "./draftingRequest.ts";

const REQUESTS = [
  "اكتب لي مذكرة",
  "اكتب لي مذكرة اعتراضية على حكم المحكمة العمالية",
  "اكتبْ لي مذكرةً",
  "صياغة لائحة دعوى",
  "صياغة لائحة الدعوى ضد صاحب العمل",
  "حرر لي استئناف",
  "حرّر لي استئنافاً ضد الحكم",
  "صغ لي لائحة اعتراضية",
  "جهز لي صحيفة دعوى مطالبة بأجور",
  "أريد منك أن تكتب لي صحيفة دعوى",
  "ممكن تجهز لي مذكرة رد؟",
  "هل يمكنك صياغة مذكرة دفاع؟",
  "هل تكتب لي مذكرة جوابية؟",
  "ابي مذكرة جوابية",
  "أحتاج لائحة اعتراضية",
  "أعدّ لي عريضة دعوى",
  "اكتب التماس إعادة نظر",
  "من فضلك اكتب لي مذكرة",
  "اكتب لي نموذج مذكرة اعتراضية",
  "لو سمحت صياغة مذكرة بالدفوع",
  "كتابة مذكرة استئناف",
  "حررلي تظلماً إلى ديوان المظالم",
];

const QUESTIONS = [
  "ما هي مدة الاستئناف؟",
  "ما شروط صياغة لائحة الدعوى؟",
  "كيف أكتب مذكرة اعتراضية؟",
  "اشرح لي المادة الثمانين",
  "متى يجوز الاعتراض على الحكم؟",
  "اكتب لي ملخص أحكام الاستئناف",
  "اكتب لي شروط الاستئناف",
  "أريد معرفة مدة الاستئناف",
  "أريد أن أقدم اعتراضاً على الحكم، ما المدة؟",
  "ما الفرق بين الاستئناف والتماس إعادة النظر؟",
  "هل يمكن تقديم مذكرة بعد قفل باب المرافعة؟",
  "هل تعد المذكرة الاعتراضية من طرق الطعن؟",
  "اشرح اللائحة التنفيذية لنظام العمل",
  "هل يجب أن أكتب مذكرة قبل الجلسة؟",
  "ما المقصود بصحيفة الدعوى في هذه المادة؟",
  "اكتب لي شرحاً لهذه المادة",
  "",
];

test("a request to write a pleading is a drafting request", () => {
  for (const m of REQUESTS) assert.equal(isDraftingRequest(m), true, m);
});

test("a question about a pleading is not", () => {
  for (const m of QUESTIONS) assert.equal(isDraftingRequest(m), false, m);
});

test("folding: alef forms, taa marbuta, alef maqsura, tashkeel and tatweel compare equal", () => {
  assert.equal(foldArabic("أُكْتُبْ مذكـرةً إلى"), "اكتب مذكره الي");
  assert.equal(foldArabic("استئناف"), foldArabic("استيناف"));
});

test("the refusal: the drafter link only for a caller who may use it", () => {
  const plain = draftingRefusal(false);
  assert.equal(plain.code, DRAFTING_REFUSED_CODE);
  assert.equal(plain.error, DRAFTING_REFUSAL_TEXT);
  assert.equal("action" in plain, false);
  const lawyer = draftingRefusal(true);
  assert.equal(lawyer.code, DRAFTING_REFUSED_CODE);
  assert.match(lawyer.error, /الصائغ القانوني/);
  assert.deepEqual(lawyer.action, { label: "افتح الصائغ القانوني", href: DRAFTER_HREF });
  assert.equal(DRAFTER_HREF, "/ai/draft");
});
