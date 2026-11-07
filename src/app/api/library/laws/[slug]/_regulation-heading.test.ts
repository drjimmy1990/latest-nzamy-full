import { test } from "node:test";
import assert from "node:assert/strict";
import { liftRegulationHeading, regulationHeadingForViewer } from "./_regulation-heading.ts";

// The owner's literal line (law-traffic, article 1), digits as he sent them.
const OWNER_LINE = "من اللائحة التنفيذية لنظام المرور (القرار الوزاري رقم ۲۲٤۹ وتاريخ ١٤٤١/٣/١٠هـ):";
const BODY = "يقصد بالألفاظ والعبارات الآتية المعاني المبينة أمامها:\n- الطريق: كل سبيل مفتوح للسير.";

test("the trailing introducing line leaves the text and becomes the heading", () => {
  const out = liftRegulationHeading(`${BODY}\n\n${OWNER_LINE}\n`, false);
  assert.equal(out.text, BODY);
  assert.equal(out.heading, "اللائحة التنفيذية لنظام المرور (القرار الوزاري رقم ۲۲٤۹ وتاريخ ١٤٤١/٣/١٠هـ)");
});

test("a non-subscriber gets the heading without the instrument's number and date", () => {
  const out = liftRegulationHeading(`${BODY}\n${OWNER_LINE}`, true);
  assert.equal(out.text, BODY);
  assert.equal(out.heading, "اللائحة التنفيذية لنظام المرور");
  // A number left outside any parenthetical: nothing is shown rather than leak it.
  assert.equal(regulationHeadingForViewer("من اللائحة الصادرة بالقرار رقم 2249:", true), null);
  assert.equal(regulationHeadingForViewer("من اللائحة الصادرة بالقرار رقم 2249:", false), "اللائحة الصادرة بالقرار رقم 2249");
});

test("markdown marks, CRLF and the other instrument words are handled", () => {
  const crlf = liftRegulationHeading(`${BODY.replace(/\n/g, "\r\n")}\r\n> **من القواعد التنفيذية للنظام:**\r\n`, false);
  assert.equal(crlf.text, BODY.replace(/\n/g, "\r\n"));
  assert.equal(crlf.heading, "القواعد التنفيذية للنظام");
  assert.equal(liftRegulationHeading(`${BODY}\nمن الضوابط المنظمة لذلك:`, false).heading, "الضوابط المنظمة لذلك");
  assert.equal(liftRegulationHeading(`${BODY}\nمِن لائحة الجزاءات:`, false).heading, "لائحة الجزاءات");
});

test("anything else is left exactly as it was", () => {
  for (const text of [
    BODY,
    // Not the last line.
    `${OWNER_LINE}\n${BODY}`,
    // No closing colon: a sentence of the article, not an introducing line.
    `${BODY}\nمن اللائحة التنفيذية تستثنى الحالات الآتية`,
    // Nothing but the line: never empty the article.
    OWNER_LINE,
    "",
  ]) {
    const out = liftRegulationHeading(text, false);
    assert.equal(out.text, text);
    assert.equal(out.heading, null);
  }
  assert.deepEqual(liftRegulationHeading(null, true), { text: "", heading: null });
});

// The route cannot be unit-executed (next/server, "@/…" aliases) — a source
// contract in the shape of regulation-paywall.routes.test.ts.
test("the law route lifts the heading before the locked preview and filters every amendment", async () => {
  const { readFileSync } = await import("node:fs");
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  // Lifted only for an article with regulation rows, masked for non-subscribers.
  assert.match(route, /regulationRows\.length > 0\s*\?\s*liftRegulationHeading\(article\.text, !showOfficialMeta\)/);
  // The locked preview is cut from the text WITHOUT the heading.
  assert.match(route, /result\.text = preview\(lifted\.text\)/);
  assert.doesNotMatch(route, /result\.text = preview\(article\.text\)/);
  // Sent only inside the unlocked regulations block.
  const unlocked = route.indexOf("result.regulations = sorted.map");
  const heading = route.indexOf("result.regulationHeading = lifted.heading");
  assert.ok(unlocked > 0 && heading > unlocked, "regulationHeading is emitted with the unlocked regulations");
  // Both amendment fields go through stripAuditNotes.
  assert.match(route, /summary: stripAuditNotes\(a\.summary as string \| null, 'summary'\)/);
  assert.match(route, /fullText: stripAuditNotes\(a\.full_text as string \| null, 'fullText'\)/);
});
