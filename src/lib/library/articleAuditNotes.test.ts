/**
 * BUG-01 (owner package 6-Nov): stripArticleAuditNotes — the corpus's audit
 * notes out of the text a reader sees AS the article (text, original_text,
 * regulation text), without eating law. The positives are strings served live
 * on 2026-11-08 (law-traffic arts. 1–2, `originalText`) and lines measured in
 * the owner's 10-03 export; the negatives are law and scanning noise from the
 * same export that an earlier draft of the markers removed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { residualSuspectNotes, scanSuspectNotes } from "./auditNoteScan.ts";
import { stripArticleAuditNotes, stripAuditNotes } from "./lawPreambleBlocks.ts";

const LEAD_1 = "عُدّلت هذه المادة بموجب المرسوم الملكي رقم (م/115) وتاريخ 1439/12/5هـ، لتكون بالنص الحالي أعلاه.";
/** law-traffic art. 1 `originalText`, as served to an anonymous GET on 2026-11-08. */
const LIVE_ART_1 =
  `${LEAD_1} **تصحيح 2026-08-14 (جولة تدقيق منهجي)**: النص المخزَّن سابقاً هنا ("تسري أحكام هذا النظام، والجداول الملحقة به، ولائحته، على المركبات بجميع أنواعها والدراجات، كما يسري على مرور المشاة والحيوان في الطرق العامة وجميع مستخدمي الطريق.") كان نصاً سابقاً على تعديل م/115 لم يُحدَّث فعلياً رغم وسم المادة "[معدّلة]" — نفس نمط الخلل المكتشَف بف1056 (مواد 20، 36، 61، 62، 68، 73)، اكتُشف هنا عبر تدقيق منهجي موسَّع لكل مادة تحمل هذا الوسم. صُحِّح بمطابقة مباشرة مع نص المرسوم م/115 الأصلي المصوَّر (\`ncar.gov.sa\\مراسيم ملكية\\مرسوم-م-115...pdf\`، إعادة قراءة معزولة)، ومطابق أيضاً لنص اللائحة الحيّ أدناه (الذي كان صحيحاً طوال الوقت). راجع سجل المشاكل ف1072.`;
const ART_2_KEPT =
  "عُدّلت هذه المادة بموجب المرسوم الملكي رقم (م/115) وتاريخ 1439/12/5هـ.\n\n" +
  "الفقرة (20) من هذه المادة عُدّلت لتكون بالنص الآتي: \"السيارة الخاصة: السيارة المعدة للاستعمال الخاص بنقل الركاب ومستلزماتهم دون أجر، ويجوز استخدام السيارة الخاصة المصرح لقائدها من هيئة النقل العام بمزاولة النقل بأجر برخصة القيادة الخاصة\" (المرسوم الملكي رقم م/115 وتاريخ 1439/12/5هـ).";
/** law-traffic art. 2 `originalText`, live 2026-11-08: the law above, then a note paragraph. */
const LIVE_ART_2 =
  `${ART_2_KEPT}\n\n**تصحيح 2026-08-14 (جولة تدقيق منهجي)**: بمقارنة مباشرة مع نص المرسوم م/115 الأصلي المصوَّر، ثبت أن المادة الثانية كانت تحمل ست فقرات إضافية بصياغة سابقة على م/115 لم تُحدَّث فعلياً (نفس نمط الخلل المكتشَف بف1056): الفقرات 3 (المسار)، 18 (المركبة) — صُحِّحت جميعها أعلاه لتطابق نص م/115. **كما ثبت أن الفقرة (44) "هيكل المركبة" هي فعلياً جزء أصيل من تعريفات المادة الثانية** (لا إضافة خاصة باللائحة كما ذُكر خطأً بملاحظة سابقة أسفل نص اللائحة أدناه) — أُضيفت هنا للمرة الأولى. راجع سجل المشاكل ف1072.`;

test("live law-traffic art. 1: the note goes, the statutory lead before it stays", () => {
  assert.equal(stripArticleAuditNotes(LIVE_ART_1), LEAD_1);
  // The amendment path (stripAuditNotes fullText) no longer drops the lead with the note either.
  assert.equal(stripAuditNotes(LIVE_ART_1, "fullText"), LEAD_1);
});

test("live law-traffic art. 2: the note paragraph goes, the amendment text stays", () => {
  assert.equal(stripArticleAuditNotes(LIVE_ART_2), ART_2_KEPT);
  assert.deepEqual(residualSuspectNotes(LIVE_ART_2), []);
});

test("the export's other dated labels are caught (10-03 export)", () => {
  const law = "يعاقب المخالف بغرامة لا تزيد على ألف ريال.";
  for (const note of [
    "**تصحيح مهم 2026-08-14 (جولة تدقيق منهجي)**: فقرة (ب) كانت مخزَّنة سابقاً بأربعة بنود فقط.",
    "⚠️ **ملاحظة تحقق 2026-08-14 (جولة تدقيق منهجي، لم يُعدَّل النص أعلاه)**: نص المرسوم يحمل صياغة عامة.",
    "> ⚠️ ملاحظة (مُنقَّحة 2026-08-14، جولة تدقيق منهجي): النص أدناه هو نص اللائحة كما نُشر أصلاً.",
    "📝 **تصحيح جوهري (2026-08-28):** كان النص المخزَّن هنا محلياً قبل هذا التصحيح مشوَّهاً.",
    "> **ملاحظة هيكلية (تحديث 2026-08-28):** كانت هذه المادة الاصطناعية مخصَّصة لإيواء نص.",
    "**ملاحظة تحرير (استرجاع 2026-08-10):** استُخرج هذا النص كاملاً من ملف PDF الرسمي.",
    "**[تصحيح 2026-09-21]:** النص الأصلي المُبقى أعلاه كان في نسخة سابقة من هذا الملف مشوَّهاً.",
    "**تنبيه توثيقي (لا هلوسة):** النص الذي كان مخزَّناً هنا محلياً قبل هذا التصحيح (2026-08-27) كان مبعثراً.",
    "ملاحظة تحقق حي 2026-08-26: سجل هيئة الخبراء نفسه يُظهر قيمة وسيطة.",
    "**[محسوم 2026-08-14] حسم قاطع عبر قناة ثامنة (ف1014/ف1031) — قاعدة بيانات المركز الوطني:**",
    "| **✅ تكرار محتوى مؤكَّد** | مقارنة حرفية كاملة (2026-08-29) — راجع editorial_notes للتفصيل |",
    "> ✅ فجوة التزامن المذكورة سابقاً محسومة (2026-08-14): النص اللائحي أدناه صحيح ومطابق تماماً لنص المادة النظامية.",
    "> ✅ **فجوة جدول (68/1-68/8) محسومة بالكامل (2026-08-14)**: أعيدت قراءة النشر الأصلي (جريدة أم القرى العدد 4812).",
    "> ✅ **فجوة محسومة 2026-08-14** (كانت موثقة سابقاً كقراءة غير مستقرة ومتضاربة): أعيدت المطابقة.",
  ]) {
    assert.equal(stripArticleAuditNotes(`${law}\n${note}`), law, note);
  }
});

test("a note inside an aside that starts with law keeps the law", () => {
  assert.equal(
    stripArticleAuditNotes("- قرار مجلس الوزراء رقم (217) (أضاف \"ورئاسة أمن الدولة\" بعد \"رئاسة الاستخبارات العامة\" — تصحيح استكمال توثيق 2026-08-26: كان مذكوراً سابقاً نص آخر)"),
    "- قرار مجلس الوزراء رقم (217) (أضاف \"ورئاسة أمن الدولة\" بعد \"رئاسة الاستخبارات العامة\")",
  );
});

test("live-check notes «تحقق … 2026-…» go; «يتحقق» / «التحقق» with a date stay", () => {
  const law = "بموجب المرسوم الملكي رقم (م/17) وتاريخ 1427/3/13هـ، ونصها: «تحل الهيئة العامة للولاية على أموال القاصرين».";
  assert.equal(
    stripArticleAuditNotes("بموجب المرسوم الملكي رقم (م/17) وتاريخ 1427/3/13هـ (المنشور 1427/4/21هـ — تحقق مباشر عبر DOM على البوابة الحية 2026-07-19)، ونصها: «تحل الهيئة العامة للولاية على أموال القاصرين»."),
    law, // the whole aside is the editor's publication note, not statute
  );
  assert.equal(stripArticleAuditNotes(`${law}\n**تحقق حي 2026-08-26:** سجل الهيئة يُظهر القيمة نفسها.`), law);
  for (const keep of ["يتحقق الشرط في 2026-01-01م.", "التحقق من الهوية بتاريخ 2025-02-03 إلزامي.", "تحقق الغاية من النظام في 2024-05-05."]) {
    assert.equal(stripArticleAuditNotes(keep), keep, keep);
  }
});

test("a dated label in front of law loses the label only", () => {
  assert.equal(
    stripArticleAuditNotes("> **ملاحظة ختامية معدَّلة (2026-08-15، وفق قرار مجلس الوزراء رقم 117 وتاريخ 1410/07/10هـ):** تُمنح الفئة (5) لخريجي مراكز التدريب المهني."),
    "> تُمنح الفئة (5) لخريجي مراكز التدريب المهني.",
  );
});

test("law and scanning noise from the same export are never touched", () => {
  for (const keep of [
    "تصحيح 1441/3/10هـ: صُحّح الخطأ المطبعي في الفقرة (ب) بموجب قرار مجلس الوزراء",
    "تصحيح الخطأ المادي في المادة",
    "يتولى الديوان إجراء تدقيق منهجي على حسابات الجهات المشمولة برقابته.",
    "تلتزم الجهة (ويشمل ذلك جولة تدقيق سنوية) بما يلي:",
    "كما ورد في م12 ف3 من هذه المادة",
    "٢٨. وهذا جدول لفلل المشروع (محل الدعوى)، ونسب الإنجاز فيها",
    "500الف500Kإلى",
    "بمد الاطلاع على المعاملة المرافقة لهذا الواردة برقم ٧ / ف٢١٥٣٨",
    "الديوان خطاب المحكمة الكبرى بالرياض رقم (...) ف١٤١٥/١٢/٢ ٥ مشفوعا به",
    "في نهاية المشروع يُقدَّم تقرير يحتوي على الدروس المستفادة وسجل المشاكل والحلول والمخاطر.",
    " ف100دنوووةد وووور",
    "يُقدَّم الطلب [تحقق من الهوية] عبر المنصة.",
    "تسد الجهة أي فجوة في التغطية التأمينية خلال مدة محسومة من تاريخ الإشعار.",
    "الموافق 2022-10-17م صدر القرار.",
    "| البند | المبلغ |\n|---|---|\n| رسوم | 100 ريال |",
  ]) {
    assert.equal(stripArticleAuditNotes(keep), keep, keep);
  }
  assert.equal(stripArticleAuditNotes(null), "");
  assert.equal(stripArticleAuditNotes(undefined), "");
});

test("the wide-net scanner flags what the stripper leaves for a person to read", () => {
  const leftover = "ℹ️ استُكملت الصيغة الوسيطة أعلاه بتاريخ 2026-08-28 عن طريق law.arbiter.sa.";
  assert.equal(stripArticleAuditNotes(leftover), leftover);
  assert.deepEqual(residualSuspectNotes(leftover).map((h) => h.pattern), ["Gregorian ISO date"]);
  assert.ok(scanSuspectNotes(LIVE_ART_1).some((h) => h.match === "ف1072"));
  assert.ok(scanSuspectNotes(LIVE_ART_1).some((h) => /سجل/.test(h.match)));
});

test("final review 2026-11-09 NIT 3: a Western-digit date after an OCR «ف» is law, an issue ref with «/ج» is a note", () => {
  const law = "صدر بالمرسوم الملكي رقم م/7 ف1415/12/2هـ ويعمل به من تاريخ نشره.";
  assert.equal(stripArticleAuditNotes(law), law);
  const note = "نص المادة كما هو.\nراجع سجل المشاكل ف858/ج-11.";
  assert.equal(stripArticleAuditNotes(note).includes("ف858"), false);
  assert.ok(stripArticleAuditNotes(note).includes("نص المادة كما هو."));
});
