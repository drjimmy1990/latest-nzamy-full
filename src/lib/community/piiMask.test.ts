/**
 * piiMask.test.ts — S5-3: community text is masked before it is stored.
 * Every identifier below is made up (the IBANs are the published format
 * examples); none belongs to a real person or company.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PII_PLACEHOLDER_AR,
  findCommunityPii,
  ibanChecksumOk,
  maskCommunityFields,
  maskCommunityPii,
  piiMaskedNoticeAr,
  type PiiKind,
} from "./piiMask.ts";

const P = PII_PLACEHOLDER_AR;
const kindsOf = (s: string): PiiKind[] => maskCommunityPii(s).kinds;
const unchanged = (s: string) => assert.equal(maskCommunityPii(s).text, s, `should stay as written: ${s}`);

// ── phones ──────────────────────────────────────────────────────────────────
test("Saudi mobiles in every common spelling, Latin and Arabic-Indic digits", () => {
  for (const [input, expected] of [
    ["اتصل على 0501234567 مساءً", `اتصل على ${P.phone} مساءً`],
    ["اتصل على ٠٥٠١٢٣٤٥٦٧ مساءً", `اتصل على ${P.phone} مساءً`],
    ["رقمي +966501234567", `رقمي ${P.phone}`],
    ["رقمي +٩٦٦٥٠١٢٣٤٥٦٧", `رقمي ${P.phone}`],
    ["رقمي 00966 50 123 4567", `رقمي ${P.phone}`],
    ["جوالي 050-123-4567", `جوالي ${P.phone}`],
    ["جوالي 501234567", `جوالي ${P.phone}`],
  ] as const) {
    assert.equal(maskCommunityPii(input).text, expected, input);
    assert.deepEqual(kindsOf(input), ["phone"], input);
  }
});

test("landlines, 9200 and 800 numbers; «واتساب» keeps its word", () => {
  assert.equal(maskCommunityPii("المكتب 0112345678").text, `المكتب ${P.phone}`);
  assert.equal(maskCommunityPii("المكتب ٠١٢٦٥٤٣٢١٠").text, `المكتب ${P.phone}`);
  assert.equal(maskCommunityPii("الرقم الموحد للشركة 920012345 للاستفسار").text, `الرقم الموحد للشركة ${P.phone} للاستفسار`);
  assert.equal(maskCommunityPii("اتصل 800 123 4567").text, `اتصل ${P.phone}`);
  assert.equal(maskCommunityPii("واتساب: 0551234567").text, `واتساب: ${P.phone}`);
});

// ── e-mail ──────────────────────────────────────────────────────────────────
test("e-mail addresses, including the spelled-out form", () => {
  assert.equal(maskCommunityPii("راسلني على someone.x@example.com شكراً").text, `راسلني على ${P.email} شكراً`);
  assert.equal(maskCommunityPii("someone (at) example (dot) com").text, P.email);
  assert.deepEqual(kindsOf("a.b@example.org و 0501234567"), ["phone", "email"]);
});

// ── national ID / iqama ─────────────────────────────────────────────────────
test("national ID (1…) and iqama (2…), Latin and Arabic-Indic digits", () => {
  assert.equal(maskCommunityPii("هويتي 1012345678").text, `هويتي ${P.national_id}`);
  assert.equal(maskCommunityPii("إقامتي ٢٣٤٥٦٧٨٩٠١ منتهية").text, `إقامتي ${P.national_id} منتهية`);
  assert.equal(maskCommunityPii("الرقم 1098765432.").text, `الرقم ${P.national_id}.`);
  // spaced digits only with an ID word before them
  assert.equal(maskCommunityPii("رقم الهوية: 1 0 1 2 3 4 5 6 7 8").text, `رقم الهوية: ${P.national_id}`);
  assert.equal(maskCommunityPii("رقم الإقامة ٢٣٤-٥٦٧-٨٩٠١").text, `رقم الإقامة ${P.national_id}`);
  assert.deepEqual(kindsOf("هويتي 1012345678"), ["national_id"]);
});

// ── IBAN ────────────────────────────────────────────────────────────────────
test("Saudi IBAN with or without spaces; another country's only with a valid checksum", () => {
  assert.equal(maskCommunityPii("حوّل إلى SA0380000000608010167519").text, `حوّل إلى ${P.iban}`);
  assert.equal(maskCommunityPii("الآيبان SA03 8000 0000 6080 1016 7519 باسمي").text, `الآيبان ${P.iban} باسمي`);
  assert.equal(maskCommunityPii("الآيبان sa٠٣٨٠٠٠٠٠٠٠٦٠٨٠١٠١٦٧٥١٩").text, `الآيبان ${P.iban}`);
  assert.deepEqual(kindsOf("SA0380000000608010167519"), ["iban"], "an IBAN is not also read as an ID or a phone");
  assert.equal(ibanChecksumOk("GB82WEST12345698765432"), true);
  assert.equal(ibanChecksumOk("GB83WEST12345698765432"), false);
  assert.equal(maskCommunityPii("IBAN GB82WEST12345698765432").text, `IBAN ${P.iban}`);
  unchanged("المرجع AB12CDEFGHIJKLMNOP");
});

// ── commercial registration ─────────────────────────────────────────────────
test("CR numbers with their word; standalone unified 70… numbers", () => {
  assert.equal(maskCommunityPii("سجل تجاري رقم 4030123456").text, `سجل تجاري رقم ${P.cr}`);
  assert.equal(maskCommunityPii("السجل التجاري: ٤٠٣٠١٢٣٤٥٦").text, `السجل التجاري: ${P.cr}`);
  assert.equal(maskCommunityPii("س.ت 1010123456").text, `س.ت ${P.cr}`);
  assert.equal(maskCommunityPii("CR 2050123456").text, `CR ${P.cr}`);
  assert.equal(maskCommunityPii("الرقم الموحد 7001234567").text, `الرقم الموحد ${P.cr}`);
  assert.equal(maskCommunityPii("المنشأة 7001234567").text, `المنشأة ${P.cr}`);
  assert.deepEqual(kindsOf("سجل تجاري 1010123456"), ["cr"], "the CR word wins over the ID reading");
});

// ── false positives ─────────────────────────────────────────────────────────
test("never masked: articles, years, decrees, amounts, case and deed numbers", () => {
  for (const s of [
    "المادة ١٨٧ من نظام العمل",
    "المادة 77 والمادة 80",
    "صدر عام ١٤٤٥هـ وعُدّل في 2024",
    "بالمرسوم الملكي رقم م/٥١ وتاريخ ٢٣/٨/١٤٢٦هـ",
    "المبلغ 1,500,000 ريال",
    "المبلغ ١٬٥٠٠٬٠٠٠٬٠٠٠ ريال",
    "التعويض 1500000000 ريال",
    "مطالبة بمبلغ 2000000000",
    "قيمة العقد 500000000 ريال",
    "القضية رقم 4470123456",
    "القضية رقم 1445012345",
    "صك رقم ٤٤١٢٣٤٥٦٧٨",
    "الصك 2012345678",
    "القرار رقم: 1440123456",
    "رقم القيد 4403512345",
    "الدعوى 4612345678 أمام المحكمة العمالية",
    "نسبة 15% من 500 ألف",
    "رقم الترخيص 12/345",
  ]) {
    unchanged(s);
  }
  assert.equal(piiMaskedNoticeAr(kindsOf("المادة ١٨٧")), null);
});

test("a case number without its word, starting 4…, is not a CR or an ID", () => {
  unchanged("أُحيلت 4470123456 للدائرة");
});

// ── offsets, idempotence, fields, notice ────────────────────────────────────
test("text outside the hits is copied as written (Arabic-Indic digits kept)", () => {
  assert.equal(
    maskCommunityPii("وفق المادة ١٨٧، اتصل ٠٥٠١٢٣٤٥٦٧ أو هويتي ١٠١٢٣٤٥٦٧٨").text,
    `وفق المادة ١٨٧، اتصل ${P.phone} أو هويتي ${P.national_id}`,
  );
});

test("masking twice gives the same text as masking once", () => {
  for (const s of [
    "اتصل 0501234567 وهويتي 1012345678 وبريدي a@example.com وSA0380000000608010167519 وسجل تجاري 4030123456",
    "واتساب ٠٥٥١٢٣٤٥٦٧",
  ]) {
    const once = maskCommunityPii(s).text;
    assert.equal(maskCommunityPii(once).text, once);
    assert.deepEqual(maskCommunityPii(once).kinds, []);
    assert.equal(/[0-9٠-٩@]/.test(once), false, "no identifier digit survives");
  }
});

test("hits never overlap and stay inside the input", () => {
  const s = "SA0380000000608010167519 1012345678 0501234567";
  const hits = findCommunityPii(s);
  assert.equal(hits.length, 3);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i].index >= hits[i - 1].end);
  assert.ok(hits.every((h) => h.index >= 0 && h.end <= s.length));
});

test("maskCommunityFields masks strings and tag lists, passes other values through", () => {
  const { fields, kinds } = maskCommunityFields({
    title: "سؤال عن 0501234567",
    body: "هويتي 1012345678",
    tags: ["عمل", "a@example.com"],
    category: undefined,
    n: 3,
  });
  assert.equal(fields.title, `سؤال عن ${P.phone}`);
  assert.equal(fields.body, `هويتي ${P.national_id}`);
  assert.deepEqual(fields.tags, ["عمل", P.email]);
  assert.equal(fields.category, undefined);
  assert.equal(fields.n, 3);
  assert.deepEqual(kinds, ["phone", "email", "national_id"]);
  assert.deepEqual(maskCommunityFields({ title: "عادي", body: "" }).kinds, []);
});

test("the author's notice names the kinds, never the values", () => {
  assert.equal(piiMaskedNoticeAr([]), null);
  const one = piiMaskedNoticeAr(["phone"]) ?? "";
  assert.match(one, /رقم الهاتف/);
  const many = piiMaskedNoticeAr(["cr", "phone", "email", "phone"]) ?? "";
  assert.match(many, /رقم الهاتف، البريد الإلكتروني ورقم السجل التجاري/);
  assert.equal(/[0-9@]/.test(many), false);
});
