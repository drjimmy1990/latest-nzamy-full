import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { cleanVersionText, hijriDateKey, visibleAmendments } from "./_previous-versions.ts";

const card = (over: Partial<ReturnType<typeof visibleAmendments>[number]>) => ({
  source: "",
  date: "",
  summary: "",
  fullText: "",
  sourceLocked: false,
  textMissing: false,
  ...over,
});

test("a card with no summary, no text and no instrument is not shown", () => {
  assert.deepEqual(visibleAmendments([{ date: null, source: null, summary: "", fullText: "" }]), []);
  assert.deepEqual(visibleAmendments([{ date: "  ", source: "\n", summary: " ", fullText: "\t" }]), []);
  assert.deepEqual(visibleAmendments([{}]), []);
});

test("a withheld instrument alone is not a card: the lock line would be its only content", () => {
  assert.deepEqual(visibleAmendments([{ date: null, source: null, sourceLocked: true, summary: "", fullText: "" }]), []);
});

test("a withheld instrument with a version text is shown, with the lock note and without the instrument", () => {
  const cards = visibleAmendments([{ date: "1445/1/1", source: "م/1", sourceLocked: true, summary: "", fullText: " النص السابق " }]);
  assert.deepEqual(cards, [card({ fullText: "النص السابق", sourceLocked: true })]);
});

test("file 16 §4: an instrument with no text is marked «نص غير متوفر», never an empty frame", () => {
  const cards = visibleAmendments([{ date: "1445/1/1", source: "مرسوم ملكي م/5", summary: null, fullText: null }]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].source, "مرسوم ملكي م/5");
  assert.equal(cards[0].fullText, "");
  assert.equal(cards[0].textMissing, true);
});

test("file 16 §4 (screenshot 04): no repeated «📜 الإصدارات السابقة», no «>», no wrapping quotes, the date once", () => {
  const cards = visibleAmendments([
    { source: "📜 الإصدارات السابقة", date: null, summary: null, fullText: '> "يحدد المجلس الأعلى للقضاء فترة انتقالية."' },
    { source: "المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09هـ", date: "1443/11/09هـ", summary: null, fullText: null },
    { source: "المرسوم الملكي رقم (م/6) وتاريخ 1440/01/02هـ", date: "1440/1/2هـ", summary: null, fullText: null },
  ]);
  assert.equal(cards.length, 3, "the count is the number of cards");
  const text = cards.find((c) => c.fullText)!;
  assert.equal(text.source, "", "the heading is no instrument");
  assert.equal(text.fullText, "يحدد المجلس الأعلى للقضاء فترة انتقالية.");
  for (const c of cards.filter((x) => x.source)) {
    assert.equal(c.date, "", `${c.source}: its date is already in the instrument`);
    assert.equal(c.textMissing, true);
  }
});

test("newest first: dated cards by Hijri date, undated after them in their own order", () => {
  const cards = visibleAmendments([
    { fullText: "نص أ" },
    { source: "م/6 وتاريخ 1440/01/02هـ", fullText: "نص 1440" },
    { fullText: "نص ب" },
    { source: "م/113", date: "1443/11/09هـ", fullText: "نص 1443" },
  ]);
  assert.deepEqual(cards.map((c) => c.fullText), ["نص 1443", "نص 1440", "نص أ", "نص ب"]);
  assert.equal(cards[0].date, "1443/11/09هـ", "a date the instrument does not name is kept");
});

test("version text cleaning", () => {
  assert.equal(cleanVersionText("📜 الإصدارات السابقة\n> «النص القديم»"), "النص القديم");
  assert.equal(cleanVersionText('> "سطر أول\n> سطر ثان"'), "سطر أول\nسطر ثان");
  assert.equal(cleanVersionText('"أ" و"ب"'), '"أ" و"ب"', "quotes inside the text are not a wrapping pair");
  assert.equal(hijriDateKey("وتاريخ ١٤٤٣/١١/٩هـ"), 14431109);
  assert.equal(hijriDateKey("بلا تاريخ"), 0);
});

test("empty cards are dropped and the rest keep their order and count", () => {
  const cards = visibleAmendments([
    { date: null, source: null, summary: "تعديل أول", fullText: "" },
    { date: null, source: null, summary: "", fullText: "" },
    { date: null, source: null, summary: "", fullText: "نص ثالث" },
  ]);
  assert.deepEqual(cards.map((c) => c.summary || c.fullText), ["تعديل أول", "نص ثالث"]);
});

test("no list or a malformed list is no card, never a throw", () => {
  assert.deepEqual(visibleAmendments(undefined), []);
  assert.deepEqual(visibleAmendments(null), []);
  // @ts-expect-error — a malformed payload must not break the reader.
  assert.deepEqual(visibleAmendments([null, "x"]), []);
});

test("the reader prints «نص ما قبل التعديل غير متوفر» and counts the cards it shows", () => {
  const src = readFileSync(new URL("./_article-components.tsx", import.meta.url), "utf8");
  assert.match(src, /\{amend\.textMissing && \(/);
  assert.ok(src.includes("نص ما قبل التعديل غير متوفر"));
  assert.match(src, /الإصدارات السابقة \(\$\{previousVersions\.length\}\)/);
});
