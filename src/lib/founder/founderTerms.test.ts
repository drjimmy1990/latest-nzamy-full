import assert from "node:assert/strict";
import test from "node:test";
import {
  FOUNDER_PROTECTION_ITEMS,
  FOUNDER_TERMS_ITEMS,
  FOUNDER_TERMS_PENDING_NOTE,
  FOUNDER_TERMS_PUBLISHED,
  boldSegments,
  founderTermsText,
} from "./founderTerms.ts";

test("the terms cannot be published while an owner placeholder is left in them", () => {
  if (FOUNDER_TERMS_PUBLISHED) {
    assert.doesNotMatch(founderTermsText(), /\[|يؤكده المالك/, "replace item ٧ with the owner's confirmed refund wording first");
  }
});

test("the pending note is the agreed wording", () => {
  assert.equal(FOUNDER_TERMS_PENDING_NOTE, "الشروط الخاصة بباقة المؤسس قيد المراجعة القانونية النهائية، وتُنشر قبل فتح الشراء");
});

test("the draft's points (TEST-PLAN د) are all in the text", () => {
  const t = founderTermsText();
  for (const s of ["6 أعمال", "5 نقاط", "شحن النقاط بأي قيمة", "18 نوفمبر 2026", "17 ديسمبر 2026", "تحديث عروضها", "الاسترداد", "9,500", "3,445.40", "10 نقاط"]) {
    assert.ok(t.includes(s), s);
  }
  assert.equal(FOUNDER_TERMS_ITEMS.length, 10);
  assert.equal(FOUNDER_PROTECTION_ITEMS.length, 5);
});

test("boldSegments: odd indexes are bold", () => {
  assert.deepEqual(boldSegments("a **b** c"), ["a ", "b", " c"]);
});
