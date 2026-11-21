/**
 * Owner file 11 item 1 (researcher V3 phase A5): the legal reading normalizer.
 * The named case the owner gave: «م/77» is an article («المادة السابعة
 * والسبعين») and «م/46» after «المرسوم الملكي» is a royal decree number — by
 * context, never by the digits.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/arabicLegalTtsNormalizer.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  articleOrdinal,
  cardinalWords,
  normalizeLegalTextForSpeech as speak,
  toAsciiNumber,
} from "./arabicLegalTtsNormalizer.ts";

test("م/77 is an article and م/46 after «المرسوم الملكي» is a decree, by context", () => {
  assert.equal(
    speak("تنص م/77 من نظام العمل، المعدّلة بالمرسوم الملكي رقم (م/46)."),
    "تنص المادة السابعة والسبعين من نظام العمل، المعدّلة بالمرسوم الملكي رقم (ميم ستة وأربعين).",
  );
  // Arabic-Indic digits and spaces around the slash.
  assert.equal(speak("م / ٧٧ نظام العمل"), "المادة السابعة والسبعين نظام العمل");
  assert.equal(speak("الصادر بالمرسوم الملكي م/٥١ والمعدّل"), "الصادر بالمرسوم الملكي ميم واحد وخمسين والمعدّل");
  // A number right before «وتاريخ» is a decree even without the word.
  assert.equal(speak("رقم م/٤٦ وتاريخ ١٤٣٦/٠٦/٠٥هـ").startsWith("رقم ميم ستة وأربعين وتاريخ"), true);
  // «الأمر الملكي» too; a decree word in an earlier sentence does not reach the next one.
  assert.equal(speak("بالأمر الملكي م/١٢"), "بالأمر الملكي ميم اثني عشر");
  assert.equal(speak("صدر المرسوم الملكي. وتنص م/٨ على البطلان"), "صدر المرسوم الملكي. وتنص المادة الثامنة على البطلان");
});

test("«المادة (N)» / «المادة N» read as the ordinal; «بعد المائة» past one hundred", () => {
  assert.equal(speak("وفق المادة (٨٠) والمادة 121 وللمادة ١٠٠"), "وفق المادة الثمانين والمادة الحادية والعشرين بعد المائة وللمادة المائة");
  assert.equal(speak("(م/٢٣٤ نظام العمل)"), "(المادة الرابعة والثلاثين بعد المائتين نظام العمل)");
  assert.equal(articleOrdinal(1), "الأولى");
  assert.equal(articleOrdinal(11), "الحادية عشرة");
  assert.equal(articleOrdinal(12), "الثانية عشرة");
  assert.equal(articleOrdinal(20), "العشرين");
  assert.equal(articleOrdinal(77), "السابعة والسبعين");
  assert.equal(articleOrdinal(200), "المائتين");
  assert.equal(articleOrdinal(0), null);
  assert.equal(articleOrdinal(1000), null);
});

test("Hijri dates and years read as words; a decision number is neither an article nor a date", () => {
  assert.equal(speak("بتاريخ ١٤٣٦/٠٦/٠٥هـ"), "بتاريخ الخامس من جمادى الآخرة عام ألف وأربعمائة وستة وثلاثين للهجرة");
  assert.equal(speak("في 18/2/1431ه"), "في الثامن عشر من صفر عام ألف وأربعمائة وواحد وثلاثين للهجرة");
  assert.equal(speak("صدر في 1436هـ."), "صدر في عام ألف وأربعمائة وستة وثلاثين للهجرة.");
  assert.equal(speak("مدونة المبادئ لعام 1431ه"), "مدونة المبادئ لعام ألف وأربعمائة وواحد وثلاثين للهجرة");
  assert.equal(speak("مبدأ المحكمة العليا رقم (٨٩/١٤٤٢)."), "مبدأ المحكمة العليا رقم (تسعة وثمانين لعام ألف وأربعمائة واثنين وأربعين).");
  assert.doesNotMatch(speak("مبدأ رقم ٨٩/١٤٤٢"), /المادة/);
  // An impossible date is left as written.
  assert.equal(speak("١٤٣٦/١٤/٠٥هـ"), "١٤٣٦/١٤/٠٥هـ");
  // A three-part decision number without «هـ» stays as written.
  assert.equal(speak("القرار رقم (90/2/431)"), "القرار رقم (90/2/431)");
});

test("citation markers and Markdown marks go; the wording does not change", () => {
  assert.equal(speak("**أولاً:** يستحق العامل التعويض [S1] [S2]."), "أولاً: يستحق العامل التعويض.");
  assert.equal(speak("نص بلا أرقام."), "نص بلا أرقام.");
  assert.equal(speak(""), "");
  assert.equal(speak(undefined as unknown as string), "");
});

test("number helpers", () => {
  assert.equal(toAsciiNumber("٠٧"), 7);
  assert.equal(toAsciiNumber("۴۶"), 46);
  assert.ok(Number.isNaN(toAsciiNumber("x")));
  assert.equal(cardinalWords(1442), "ألف وأربعمائة واثنين وأربعين");
  assert.equal(cardinalWords(2000), "ألفين");
  assert.equal(cardinalWords(10), "عشرة");
  assert.equal(cardinalWords(0), null);
});
