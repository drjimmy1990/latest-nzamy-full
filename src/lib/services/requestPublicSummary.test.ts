/**
 * requestPublicSummary.test.ts — owner decisions ١٠ + ١٩: the line a verified
 * lawyer sees for an open request never carries a name, a number, a mobile,
 * an e-mail or a URL. No model is called here.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/services/requestPublicSummary.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_SUMMARY_MAX,
  clampSummary,
  fallbackPublicSummary,
  finalizePublicSummary,
  findSummaryProblems,
  firstSentence,
  isSafePublicSummary,
  personNameWords,
  readSummaryReply,
  scrubPersonalData,
  summaryModelInput,
} from "./requestPublicSummary.ts";

const noDigit = (s: string) => assert.doesNotMatch(s, /[0-9٠-٩۰-۹０-９]/u, s);

// ── digits of every script ──────────────────────────────────────────────────
test("Latin, Arabic-Indic, Persian and full-width digits are all removed", () => {
  for (const input of [
    "مبلغ 50000 ريال",
    "مبلغ ٥٠٠٠٠ ريال",
    "مبلغ ۵۰۰۰۰ ريال",
    "مبلغ ５００００ ريال",
    "القضية رقم ٤٤٣١٢٣٤٥٦٧ لعام ١٤٤٥هـ",
    "بتاريخ 12/05/2024",
    "الهوية 1098765432",
  ]) {
    const out = scrubPersonalData(input);
    noDigit(out);
    assert.ok(isSafePublicSummary(clampSummary(out)) || out === "", input);
  }
  assert.equal(scrubPersonalData("مبلغ ٥٠٠٠٠ ريال"), "مبلغ ريال");
});

// ── mobiles ──────────────────────────────────────────────────────────────────
test("Saudi mobiles in every common spelling are removed", () => {
  for (const phone of [
    "0551234567", "055 123 4567", "055-123-4567", "+966551234567", "+966 55 123 4567",
    "00966551234567", "966551234567", "٠٥٥١٢٣٤٥٦٧", "+٩٦٦٥٥١٢٣٤٥٦٧", "٠٥٥ ١٢٣ ٤٥٦٧", "(055) 123-4567",
  ]) {
    const out = scrubPersonalData(`تواصل معي على ${phone} شكراً`);
    noDigit(out);
    assert.doesNotMatch(out, /\+/u, phone);
    assert.match(out, /تواصل معي على/u, phone);
  }
});

test("the words that introduce a contact go with it", () => {
  const out = scrubPersonalData("جوالي 0551234567 وواتساب ٠٥٠١١١٢٢٢٣ أريد استشارة في عقد إيجار");
  noDigit(out);
  assert.doesNotMatch(out, /جوالي/u);
  assert.match(out, /استشارة في عقد إيجار/u);
});

// ── e-mails and URLs ─────────────────────────────────────────────────────────
test("e-mails, URLs and bare domains are removed", () => {
  const out = scrubPersonalData(
    "راسلني على name.surname+x@example.com أو على https://example.sa/path?a=1 أو www.site.com أو site.sa/abc وكذلك foo [at] bar.com",
  );
  assert.doesNotMatch(out, /@|https?:|www\.|example|site\.|\.sa|\.com|\[at\]/iu, out);
  assert.match(out, /راسلني على/u);
});

// ── names ────────────────────────────────────────────────────────────────────
test("names after «اسمي» / «المدعو» / «السيد» / «الأستاذة» are removed", () => {
  const cases: Array<[string, RegExp]> = [
    ["اسمي محمد أحمد الغامدي وأريد رفع دعوى عمالية", /محمد|أحمد|الغامدي/u],
    ["المدعو خالد سعد العتيبي لم يسدد الإيجار", /خالد|سعد|العتيبي/u],
    ["السيد فهد القحطاني امتنع عن تسليم الشقة", /فهد|القحطاني/u],
    ["الأستاذة نورة الشهري، طلبت مني التوقيع", /نورة|الشهري/u],
    ["واسمي عبدالله في العقد", /عبدالله/u],
  ];
  for (const [input, leak] of cases) {
    const out = scrubPersonalData(input);
    assert.doesNotMatch(out, leak, `${input} → ${out}`);
  }
  assert.match(scrubPersonalData("اسمي محمد أحمد الغامدي وأريد رفع دعوى عمالية"), /رفع دعوى عمالية/u);
  assert.match(scrubPersonalData("المدعو خالد سعد العتيبي لم يسدد الإيجار"), /لم يسدد الإيجار/u);
});

test("«أنا» drops the next word and any name chain, not the whole sentence", () => {
  const out = scrubPersonalData("أنا سارة بنت علي الزهراني أريد الطلاق");
  assert.doesNotMatch(out, /سارة|علي|بنت/u, out);
  assert.match(out, /أريد الطلاق/u);
  const out2 = scrubPersonalData("انا موظف في شركة وتم فصلي تعسفياً");
  assert.match(out2, /فصلي تعسفياً/u);
});

test("«بن / بنت / آل» chains are removed anywhere", () => {
  const out = scrubPersonalData("نزاع مع جاري ماجد بن فيصل حول الحدود ومع آل سالم");
  assert.doesNotMatch(out, /ماجد|فيصل|سالم|بن |آل/u, out);
  assert.match(out, /حول الحدود/u);
});

test("every word of the requester's own name is removed wherever it appears", () => {
  const out = scrubPersonalData("أرسل لي العقد باسم تركي المطيري وتوقيع المطيري", { names: ["تركي بن عبدالعزيز المطيري"] });
  assert.doesNotMatch(out, /تركي|المطيري|عبدالعزيز/u, out);
  assert.deepEqual(personNameWords(["أ. تركي بن عبدالعزيز المطيري", null, "  "]), ["تركي", "عبدالعزيز", "المطيري"]);
});

// ── the post-check ───────────────────────────────────────────────────────────
test("findSummaryProblems flags digits, e-mails, URLs, line breaks and length", () => {
  assert.deepEqual(findSummaryProblems("نزاع عمالي حول مستحقات نهاية الخدمة"), []);
  assert.ok(findSummaryProblems("رقم ٠٥٥").includes("digit"));
  assert.ok(findSummaryProblems("رقم ۵").includes("digit"));
  assert.ok(findSummaryProblems("رقم ５").includes("digit"));
  assert.ok(findSummaryProblems("رقم 5").includes("digit"));
  assert.ok(findSummaryProblems("a@b").includes("email"));
  assert.ok(findSummaryProblems("انظر https://x").includes("url"));
  assert.ok(findSummaryProblems("انظر www.x").includes("url"));
  assert.ok(findSummaryProblems("انظر example.sa").includes("url"));
  assert.ok(findSummaryProblems("سطر\nثان").includes("line_break"));
  assert.ok(findSummaryProblems("ع".repeat(PUBLIC_SUMMARY_MAX + 1)).includes("too_long"));
  assert.deepEqual(findSummaryProblems(""), ["empty"]);
  assert.deepEqual(findSummaryProblems(null), ["empty"]);
});

test("clampSummary cuts at a word boundary with «…» and never exceeds the max", () => {
  const long = "كلمة ".repeat(60);
  const out = clampSummary(long);
  assert.ok([...out].length <= PUBLIC_SUMMARY_MAX, String([...out].length));
  assert.ok(out.endsWith("…"));
  assert.equal(clampSummary("قصير"), "قصير");
});

test("firstSentence stops at . ! ? ؟ ؛ and line breaks", () => {
  assert.equal(firstSentence("أولى. ثانية"), "أولى");
  assert.equal(firstSentence("  ؟أولى؟ ثانية"), "أولى");
  assert.equal(firstSentence("أولى\nثانية"), "أولى");
  assert.equal(firstSentence(""), "");
});

// ── the fallback ─────────────────────────────────────────────────────────────
test("fallbackPublicSummary: type label + first scrubbed sentence, safe, ≤ 100", () => {
  const s = fallbackPublicSummary({
    type: "consultation",
    description: "اسمي فهد العتيبي وجوالي 0551234567. أريد معرفة حقوقي بعد الفصل من العمل وتأخر الرواتب لمدة ستة أشهر",
    names: ["فهد العتيبي"],
  });
  assert.ok(s);
  assert.ok(isSafePublicSummary(s), s);
  assert.equal(s, "استشارة: أريد معرفة حقوقي بعد الفصل من العمل وتأخر الرواتب لمدة ستة أشهر");
  assert.doesNotMatch(s, /فهد|العتيبي/u);
});

test("fallbackPublicSummary: a sentence left with nothing useful gives the type label alone", () => {
  assert.equal(fallbackPublicSummary({ type: "service", description: "0551234567" }), "خدمة");
  assert.equal(fallbackPublicSummary({ type: "service", description: "" , title: "" }), "خدمة");
  assert.equal(fallbackPublicSummary({ type: "unknown_type", description: "" }), "طلب");
});

test("fallbackPublicSummary uses the scrubbed title when there is no description", () => {
  const s = fallbackPublicSummary({ type: "service", description: "", title: "مراجعة عقد شراكة تجارية" });
  assert.equal(s, "خدمة: مراجعة عقد شراكة تجارية");
});

test("fallbackPublicSummary: a dot inside a removed e-mail does not cut the sentence", () => {
  const s = fallbackPublicSummary({ type: "service", description: "راسلوني على a.b@x.sa بخصوص صياغة عقد عمل" });
  assert.ok(s && /صياغة عقد عمل/u.test(s), String(s));
});

// ── model input and reply ────────────────────────────────────────────────────
test("summaryModelInput never hands the model a digit, e-mail, URL or the requester's name", () => {
  const input = summaryModelInput({
    type: "service",
    description: "اسمي ريم الحربي، جوالي +966501234567 وبريدي reem@mail.com، لدي نزاع على إيجار محل تجاري في الرياض",
    names: ["ريم الحربي"],
  });
  assert.ok(input);
  noDigit(input.text);
  assert.doesNotMatch(input.text, /@|ريم|الحربي|mail/u, input.text);
  assert.match(input.text, /نزاع على إيجار محل تجاري/u);
  assert.equal(input.type_label, "خدمة");
  assert.equal(summaryModelInput({ type: "service", description: "0551234567" }), null);
});

test("readSummaryReply accepts a string, {summary} and {result:{summary}}", () => {
  assert.equal(readSummaryReply("س"), "س");
  assert.equal(readSummaryReply({ summary: "س" }), "س");
  assert.equal(readSummaryReply({ result: { summary: "س" } }), "س");
  assert.equal(readSummaryReply({ result: "س" }), "س");
  assert.equal(readSummaryReply({ nope: 1 }), null);
  assert.equal(readSummaryReply(null), null);
});

// ── finalize (the post-check on the model's line) ────────────────────────────
const SRC = { type: "service", description: "لدي نزاع عمالي حول مستحقات نهاية الخدمة", names: ["سلمان الدوسري"] };

test("a clean model line is kept as is", () => {
  assert.deepEqual(finalizePublicSummary("نزاع عمالي على مستحقات نهاية الخدمة بعد الاستقالة", SRC), {
    summary: "نزاع عمالي على مستحقات نهاية الخدمة بعد الاستقالة",
    source: "model",
  });
});

test("a model line with a digit, phone, e-mail or URL is scrubbed, never shown raw", () => {
  for (const bad of [
    "نزاع عمالي على مستحقات قدرها ٤٠٠٠٠ ريال",
    "نزاع عمالي، للتواصل 0551234567",
    "نزاع عمالي، للتواصل x@y.com",
    "نزاع عمالي، التفاصيل في https://x.sa",
  ]) {
    const r = finalizePublicSummary(bad, SRC);
    assert.ok(r.summary && isSafePublicSummary(r.summary), `${bad} → ${r.summary}`);
    assert.notEqual(r.source, "model");
  }
});

test("a model line naming the requester loses the name", () => {
  const r = finalizePublicSummary("سلمان الدوسري يطالب بمستحقات نهاية الخدمة", SRC);
  assert.ok(r.summary);
  assert.doesNotMatch(r.summary, /سلمان|الدوسري/u);
  assert.equal(r.source, "model_scrubbed");
});

test("only the first line of a multi-line reply is used, without list marks or quotes", () => {
  const r = finalizePublicSummary("\n- «نزاع عمالي على مستحقات نهاية الخدمة»\nسطر ثانٍ فيه 123", SRC);
  assert.equal(r.summary, "نزاع عمالي على مستحقات نهاية الخدمة");
});

test("no reply, an empty reply or a reply with nothing left → the fallback", () => {
  for (const reply of [null, undefined, 42, "", "   ", "0551234567", "a@b.com"]) {
    const r = finalizePublicSummary(reply, SRC);
    assert.equal(r.source, "fallback", String(reply));
    assert.equal(r.summary, fallbackPublicSummary(SRC));
  }
});

test("a very long model line is cut to the max", () => {
  const r = finalizePublicSummary("نزاع ".repeat(80), SRC);
  assert.ok(r.summary && [...r.summary].length <= PUBLIC_SUMMARY_MAX);
  assert.ok(isSafePublicSummary(r.summary));
});
