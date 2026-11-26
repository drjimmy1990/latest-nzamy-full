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

test("l9-parser 20261129_70: cards follow `position` when every card has one; else today's order", () => {
  const withPos = visibleAmendments([
    { source: "م/113", date: "1443/11/09هـ", fullText: "نص 1443", position: 1 },
    { source: "م/6", date: "1440/01/02هـ", fullText: "نص 1440", position: 0 },
  ]);
  assert.deepEqual(withPos.map((c) => c.fullText), ["نص 1440", "نص 1443"], "the parser's order wins over the date");
  const mixed = visibleAmendments([
    { source: "م/6", date: "1440/01/02هـ", fullText: "نص 1440", position: 0 },
    { source: "م/113", date: "1443/11/09هـ", fullText: "نص 1443" },
  ]);
  assert.deepEqual(mixed.map((c) => c.fullText), ["نص 1443", "نص 1440"], "a card without position: newest first, as before the SQL");
});

test("l9-parser 20261129_70: text_status 'unavailable' is «نص غير متوفر», never an empty card", () => {
  const cards = visibleAmendments([
    { source: "المرسوم الملكي م/113", date: null, fullText: "", textStatus: "unavailable", position: 0 },
    { source: null, date: null, sourceLocked: true, fullText: "", textStatus: "unavailable", position: 1 },
    { source: null, date: null, fullText: "", textStatus: "unavailable", position: 2 },
  ]);
  assert.equal(cards.length, 2, "a card with no instrument and no text at all is still dropped");
  assert.ok(cards.every((c) => c.textMissing));
  assert.equal(visibleAmendments([{ source: "م/1", fullText: "نص", textStatus: "available" }])[0].textMissing, false);
});

test("the reader prints «نص غير متوفر» and counts the cards it shows", () => {
  const src = readFileSync(new URL("./_article-components.tsx", import.meta.url), "utf8");
  assert.match(src, /\{amend\.textMissing && \(/);
  assert.ok(src.includes('"نص غير متوفر"'));
  const route = readFileSync(new URL("../../api/library/laws/[slug]/route.ts", import.meta.url), "utf8");
  assert.match(route, /\.\.\.\(typeof a\.position === 'number' \? \{ position: a\.position \} : \{\}\),/);
  assert.match(route, /a\.text_status === 'available' \|\| a\.text_status === 'unavailable' \? \{ textStatus: a\.text_status \} : \{\}/);
  assert.match(src, /الإصدارات السابقة \(\$\{previousVersions\.length\}\)/);
});

test("L5: «عُدّلت بموجب … بتاريخ …» from the newest card that names its instrument", async () => {
  const { amendedByLine, decreePageId } = await import("./_previous-versions.ts");
  const uuid = "0C599A69-4F1F-5CDE-B784-D2F9CA75650F";
  const cards = visibleAmendments([
    { source: "المرسوم الملكي رقم (م/115)", date: "1439/12/05هـ", fullText: "نص أحدث", decreeId: uuid },
    { source: "المرسوم الملكي رقم (م/9)", date: "1430/01/01هـ", fullText: "نص أقدم" },
  ]);
  assert.equal(cards[0].decreeId, uuid.toLowerCase());
  assert.deepEqual(amendedByLine(cards), { kind: "source", text: "عُدّلت بموجب المرسوم الملكي رقم (م/115) بتاريخ 1439/12/05هـ", decreeId: uuid.toLowerCase() });
  // the date already in the instrument is printed once
  const once = visibleAmendments([{ source: "المرسوم الملكي رقم (م/5) وتاريخ 1440/1/1هـ", date: "1440/1/1هـ", fullText: "x" }]);
  assert.deepEqual(amendedByLine(once), { kind: "source", text: "عُدّلت بموجب المرسوم الملكي رقم (م/5) وتاريخ 1440/1/1هـ" });
  // withheld from a non-subscriber: «عُدّلت» only, no id
  const locked = visibleAmendments([{ sourceLocked: true, fullText: "نص", decreeId: uuid }]);
  assert.deepEqual(amendedByLine(locked), { kind: "locked" });
  assert.equal(locked[0].decreeId, undefined);
  // no instrument anywhere: no line, nothing guessed
  assert.equal(amendedByLine(visibleAmendments([{ fullText: "نص قديم" }])), null);
  assert.equal(amendedByLine([]), null);
  // only a decrees_circulars uuid becomes a link
  assert.equal(decreePageId("law-traffic-115"), "");
  assert.equal(decreePageId(" " + uuid + " "), uuid.toLowerCase());
  assert.equal(decreePageId(null), "");
});

test("B-07 (batch l16): the line names the latest-dated instrument even when the source order runs oldest first", async () => {
  const { amendedByLine } = await import("./_previous-versions.ts");
  const cards = visibleAmendments([
    { source: "المرسوم الملكي رقم (م/6)", date: "1440/01/02هـ", fullText: "أقدم", position: 0 },
    { source: "المرسوم الملكي رقم (م/113)", date: "1443/11/09هـ", fullText: "أحدث", position: 1 },
  ]);
  assert.equal(cards[0].fullText, "أقدم", "the parser's order is kept for the cards");
  assert.deepEqual(amendedByLine(cards), { kind: "source", text: "عُدّلت بموجب المرسوم الملكي رقم (م/113) بتاريخ 1443/11/09هـ" });
  // An undated card among them: the first named card, as before.
  const mixed = visibleAmendments([
    { source: "المرسوم الملكي رقم (م/6)", date: "", fullText: "أ", position: 0 },
    { source: "المرسوم الملكي رقم (م/113)", date: "1443/11/09هـ", fullText: "ب", position: 1 },
  ]);
  assert.deepEqual(amendedByLine(mixed), { kind: "source", text: "عُدّلت بموجب المرسوم الملكي رقم (م/6)" });
});
