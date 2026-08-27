import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLetterPrintDocument,
  buildLetterWordDocument,
  composeLetterBlocks,
  dayCountAr,
  escapeHtml,
  isLetterPrintDocumentReady,
  letterDocumentTitle,
  letterFileBaseName,
  letterFileName,
  letterPlainText,
  toArabicDigits,
  type LetterBlock,
} from "./letterExport.ts";

/**
 * What these tests are actually protecting.
 *
 * The letter composer shipped with two dead download buttons and a hardcoded
 * template behind a fake spinner. Making the buttons real means this module now
 * decides what a client's OWN WORDS look like inside an HTML document that the
 * app then loads into a same-origin iframe. So the two properties that matter
 * most are not cosmetic: the escaping (a `<` in the client's story is both a
 * broken letter and script injection into our origin) and the filename (a
 * download name is rendered by the OS, not by us).
 *
 * Everything here is pure. The Blob, the object URL and the print call live in
 * ClientLetterWorkflow.tsx, which `node --test` cannot load — that split is the
 * reason this module exists as a separate file.
 */

const BASE_INPUT = {
  recipientPreset: "individual",
  recipientName: "أحمد العنزي",
  senderName: "خالد الغامدي",
  story: "دفعت الإيجار كاملاً ولم يُعَد لي مبلغ الضمان.",
  includeDeadline: false,
  deadlineDays: "7",
};

/* ── Arabic number agreement ─────────────────────────────────────────────── */

test("toArabicDigits converts only digits", () => {
  assert.equal(toArabicDigits("14"), "١٤");
  assert.equal(toArabicDigits("خلال 30 يوم"), "خلال ٣٠ يوم");
  assert.equal(toArabicDigits("بدون أرقام"), "بدون أرقام");
});

test("dayCountAr uses the right plural for each band", () => {
  // The picker's four values. «14 أيام» — western digits, wrong plural — is
  // what the button used to print.
  assert.equal(dayCountAr("3"), "٣ أيام");
  assert.equal(dayCountAr("7"), "٧ أيام");
  assert.equal(dayCountAr("14"), "١٤ يوماً");
  assert.equal(dayCountAr("30"), "٣٠ يوماً");
  assert.equal(dayCountAr("1"), "يوم واحد");
  assert.equal(dayCountAr("2"), "يومان");
});

test("dayCountAr degrades instead of throwing on a value the picker cannot make", () => {
  assert.equal(dayCountAr(""), " يوم");
  assert.equal(dayCountAr("abc"), "abc يوم");
});

/* ── Composition ─────────────────────────────────────────────────────────── */

const salutationOf = (blocks: LetterBlock[]) => blocks.find((b) => b.id === "salutation")!.content;

/**
 * Every honorific the composer must never emit again.
 *
 * The letter used to address «السيد / …» (asserting the recipient is a man),
 * «السادة / …», and — for a government entity — «معالي / سعادة رئيس …», which
 * asserts a rank AND that the addressee heads the body named. The form asks for
 * none of that. «المحترم» is in the list with them because it agrees for gender
 * too, so "keeping the formality" is how the defect comes back.
 */
const HONORIFICS = /السيد|السادة|الأستاذ|الدكتور|معالي|سعادة|المحترم/;

test("composeLetterBlocks addresses the recipient by name, with no honorific, for every preset", () => {
  for (const preset of ["landlord", "company", "employer", "bank", "individual", "government"]) {
    // A woman's name: the old «السيد /» made this letter say something false
    // about her in a document going out under the client's name.
    const named = salutationOf(composeLetterBlocks({ ...BASE_INPUT, recipientPreset: preset, recipientName: "نورة السالم" }));
    assert.match(named, /^إلى \/ نورة السالم\n/, `${preset}: name not addressed as typed`);
    assert.doesNotMatch(named, HONORIFICS, `${preset}: an honorific reached the salutation`);
  }
});

test("composeLetterBlocks reproduces the recipient name exactly as typed", () => {
  // Including a name that already carries its own title: the client's text is
  // the client's, and the composer neither adds to it nor edits it.
  const blocks = composeLetterBlocks({ ...BASE_INPUT, recipientName: "د. نورة السالم" });
  assert.match(salutationOf(blocks), /^إلى \/ د\. نورة السالم\n/);
});

test("composeLetterBlocks falls back to a form of address when the name is blank", () => {
  // The form marks the recipient name optional, so an empty name is a normal
  // path and not an error state. «الجهة المعنية» / «الطرف المعني» say how the
  // addressee relates to the letter — they assert nothing about who they are.
  for (const [preset, expected] of [
    ["company", "الجهة المعنية"],
    ["bank", "الجهة المعنية"],
    ["government", "الجهة المعنية"],
    ["individual", "الطرف المعني"],
    ["employer", "الطرف المعني"],
    ["landlord", "الطرف المعني"],
  ] as const) {
    const blank = salutationOf(composeLetterBlocks({ ...BASE_INPUT, recipientPreset: preset, recipientName: "   " }));
    assert.match(blank, new RegExp(`^إلى / ${expected}\n`), `${preset}: wrong fallback`);
    assert.doesNotMatch(blank, HONORIFICS, `${preset}: an honorific reached the fallback`);
  }
});

test("composeLetterBlocks includes the deadline paragraph only when asked", () => {
  assert.equal(composeLetterBlocks(BASE_INPUT).some((b) => b.id === "deadline"), false);

  const withDeadline = composeLetterBlocks({ ...BASE_INPUT, includeDeadline: true, deadlineDays: "14" });
  const deadline = withDeadline.find((b) => b.id === "deadline");
  assert.ok(deadline, "deadline block missing");
  assert.match(deadline.content, /١٤ يوماً/);
});

test("composeLetterBlocks carries the client's story verbatim", () => {
  // The whole point of the tool: the letter is the client's account, framed.
  // Any transformation here would be the platform putting words in their mouth.
  const blocks = composeLetterBlocks(BASE_INPUT);
  assert.ok(blocks.find((b) => b.id === "body")!.content.includes(BASE_INPUT.story));
});

test("composeLetterBlocks leaves the signature and date as blanks, never as values", () => {
  const closing = composeLetterBlocks(BASE_INPUT).find((b) => b.id === "closing")!.content;
  assert.ok(closing.includes("التوقيع: ........................"));
  assert.ok(closing.includes("التاريخ: ........................"));
  // No year anywhere: the platform does not know when this letter will be sent
  // and must not assert one.
  assert.doesNotMatch(closing, /\d{4}/);
});

/* ── The single source for the letter's words ────────────────────────────── */

test("letterPlainText joins the blocks and drops the ones a client emptied", () => {
  const blocks: LetterBlock[] = [
    { id: "a", label: "أ", content: "الفقرة الأولى" },
    { id: "b", label: "ب", content: "   " },
    { id: "c", label: "ج", content: "الفقرة الثالثة" },
  ];
  assert.equal(letterPlainText(blocks), "الفقرة الأولى\n\nالفقرة الثالثة");
});

test("letterPlainText never prints the editor's block labels", () => {
  // The labels («البسملة», «الختام») are scaffolding for the person editing.
  // A letter that carries them reads like a form. This is also the string that
  // goes into metadata.intake.fullLetterText, so the office would read them too.
  const text = letterPlainText(composeLetterBlocks(BASE_INPUT));
  for (const label of ["البسملة", "المخاطَب", "موضوع الخطاب", "الختام"]) {
    assert.ok(!text.includes(label), `label leaked into the letter body: ${label}`);
  }
});

/* ── Escaping ────────────────────────────────────────────────────────────── */

test("escapeHtml replaces & first, so an escape is never double-escaped", () => {
  // The classic ordering bug: replacing < before & turns "&lt;" into "&amp;lt;"
  // and the reader sees the escape sequence instead of the character.
  assert.equal(escapeHtml("<"), "&lt;");
  assert.equal(escapeHtml("&"), "&amp;");
  assert.equal(escapeHtml("a & b < c"), "a &amp; b &lt; c");
  assert.equal(escapeHtml("&amp;"), "&amp;amp;");
});

test("escapeHtml covers every character that can break out of text or an attribute", () => {
  assert.equal(escapeHtml(`<>&"'`), "&lt;&gt;&amp;&quot;&#39;");
});

test("a script tag in the client's own words cannot reach the document as markup", () => {
  // The print document is loaded into a same-origin iframe, so this is script
  // injection into the app's origin, not just a broken letter.
  const blocks = composeLetterBlocks({
    ...BASE_INPUT,
    story: `<script>alert("لست خطاباً")</script>`,
    recipientName: `<img src=x onerror="alert(1)">`,
  });
  for (const html of [
    buildLetterPrintDocument({ title: letterDocumentTitle("مطالبة", `<b>x</b>`), blocks }),
    buildLetterWordDocument({ title: letterDocumentTitle("مطالبة", `<b>x</b>`), blocks }),
  ]) {
    // Assert on the TAG, not on the substring "onerror=": once escaped, the
    // client's text still reads `onerror=&quot;alert(1)&quot;` as plain text,
    // and that is exactly the harmless outcome we want. What must not exist is
    // a `<` that opens an element.
    assert.ok(!html.includes("<script"), "raw <script> reached the document");
    assert.ok(!html.includes("<img"), "raw <img> reached the document");
    assert.ok(html.includes("&lt;script&gt;"), "the client's text was dropped instead of escaped");
    assert.ok(
      html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"),
      "the recipient name was not escaped intact",
    );
  }
});

/* ── Filenames ───────────────────────────────────────────────────────────── */

test("letterFileBaseName keeps Arabic and drops path separators", () => {
  assert.equal(letterFileBaseName("إنذار قانوني — شركة الوطني"), "إنذار قانوني — شركة الوطني");
  assert.equal(letterFileBaseName("مطالبة/إيجار"), "مطالبة إيجار");
  assert.equal(letterFileBaseName("a\\b:c*d?e\"f<g>h|i"), "a b c d e f g h i");
});

test("letterFileBaseName strips bidi overrides — the filename-spoofing trick", () => {
  // U+202E in a download name is what makes "…cod.exe" display as "…exe.doc".
  const spoof = "تقرير\u202Ecod.exe";
  const name = letterFileBaseName(spoof);
  assert.ok(!name.includes("\u202E"), "a right-to-left override survived into the filename");
  assert.equal(name, "تقريرcod.exe");
});

test("letterFileBaseName removes control characters", () => {
  assert.equal(letterFileBaseName("خطاب\u0007\u001Fرسمي"), "خطابرسمي");
});

test("letterFileBaseName never returns a dotfile, a trailing dot, or an empty stem", () => {
  assert.equal(letterFileBaseName("...خطاب"), "خطاب");
  assert.equal(letterFileBaseName("خطاب..."), "خطاب");
  assert.equal(letterFileBaseName("خطاب  "), "خطاب");
  assert.equal(letterFileBaseName("   "), "خطاب");
  assert.equal(letterFileBaseName("///"), "خطاب");
});

test("letterFileBaseName refuses the Windows reserved device names", () => {
  // "CON.doc" cannot be created on Windows at all — the download fails silently.
  assert.equal(letterFileBaseName("CON"), "خطاب");
  assert.equal(letterFileBaseName("com1"), "خطاب");
  // Only the exact name is reserved; a longer title containing it is fine.
  assert.equal(letterFileBaseName("CONTRACT"), "CONTRACT");
});

test("letterFileBaseName caps the stem so a pasted paragraph cannot overflow the filesystem limit", () => {
  const long = "ط".repeat(400);
  assert.equal(letterFileBaseName(long).length, 80);
});

test("letterFileName appends the extension to the cleaned stem", () => {
  assert.equal(letterFileName("مطالبة/إيجار", "doc"), "مطالبة إيجار.doc");
});

test("letterDocumentTitle omits the recipient rather than inventing one", () => {
  assert.equal(letterDocumentTitle("أطالب بأموال", "شركة الوطني"), "أطالب بأموال — شركة الوطني");
  assert.equal(letterDocumentTitle("أطالب بأموال", "  "), "أطالب بأموال");
});

/* ── The documents ───────────────────────────────────────────────────────── */

test("the print document is a standalone RTL page that carries its own font stack", () => {
  const html = buildLetterPrintDocument({ title: "خطاب", blocks: composeLetterBlocks(BASE_INPUT) });
  // It inherits nothing from the app — no Tailwind, no font. Each of these
  // being absent is a real, visible failure: Latin default serif, LTR text, or
  // a page with no margins.
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.includes(`<html lang="ar" dir="rtl">`));
  assert.ok(html.includes(`<body dir="rtl" data-letter-print="ready">`));
  assert.ok(html.includes("direction: rtl"));
  assert.ok(html.includes("Traditional Arabic"));
  assert.ok(html.includes("@page { size: A4; margin: 2cm; }"));
});

test("the print document carries no script — the parent frame calls print()", () => {
  const html = buildLetterPrintDocument({ title: "خطاب", blocks: composeLetterBlocks(BASE_INPUT) });
  assert.ok(!html.includes("<script"), "an inline script would be the first thing a CSP breaks");
});

test("the Word document opens as UTF-8 Arabic in Word, not as mojibake", () => {
  const html = buildLetterWordDocument({ title: "خطاب", blocks: composeLetterBlocks(BASE_INPUT) });
  // Without the BOM, Word guesses the encoding from the locale; a Windows-1256
  // guess renders every Arabic letter wrong. This is the single most common way
  // the .doc trick is shipped broken.
  assert.equal(html[0], "\uFEFF");
  assert.ok(html.includes(`xmlns:w="urn:schemas-microsoft-com:office:word"`));
  assert.ok(html.includes("<w:WordDocument>"));
  assert.ok(html.includes(`<body dir="rtl">`));
});

test("both documents render one paragraph per line and keep a blank line", () => {
  // Word's HTML importer collapses raw newlines, so a five-line closing arrived
  // as one run-on line; an empty <p> has zero height, so the blank the client
  // typed vanished.
  const blocks: LetterBlock[] = [{ id: "x", label: "س", content: "سطر أول\n\nسطر ثالث" }];
  for (const html of [
    buildLetterPrintDocument({ title: "خطاب", blocks }),
    buildLetterWordDocument({ title: "خطاب", blocks }),
  ]) {
    assert.ok(html.includes("<p>سطر أول</p><p>&#160;</p><p>سطر ثالث</p>"));
  }
});

test("both documents drop a block the client emptied", () => {
  const blocks: LetterBlock[] = [
    { id: "keep", label: "أ", content: "يبقى" },
    { id: "drop", label: "ب", content: "  \n  " },
  ];
  const html = buildLetterPrintDocument({ title: "خطاب", blocks });
  assert.equal(html.match(/class="blk"/g)?.length, 1);
});

test("bold and centred blocks carry their classes", () => {
  const blocks = composeLetterBlocks(BASE_INPUT);
  const html = buildLetterPrintDocument({ title: "خطاب", blocks });
  assert.ok(html.includes(`<p class="b c">بسم الله الرحمن الرحيم</p>`));
});

/* ── The print readiness handshake ───────────────────────────────────────── */

/** A stand-in for `iframe.contentWindow.document`, with only what the check reads. */
function fakeDoc(readyState: string, bodyAttrs: string[] | null) {
  return {
    readyState,
    body: bodyAttrs && { hasAttribute: (name: string) => bodyAttrs.includes(name) },
  };
}

test("isLetterPrintDocumentReady refuses the about:blank the iframe starts on", () => {
  // THE BUG. An iframe fires a load event for its initial about:blank document,
  // and that document is already readyState "complete" — so a readyState check
  // alone says "ready" and print() opens a dialogue over an empty page. Only a
  // marker our own document carries can tell the two apart.
  assert.equal(isLetterPrintDocumentReady(fakeDoc("complete", [])), false);
  assert.equal(isLetterPrintDocumentReady(fakeDoc("complete", ["data-letter-print"])), true);
});

test("isLetterPrintDocumentReady waits for a document that is still parsing", () => {
  // The poll can land mid-parse, before the letter's paragraphs exist.
  assert.equal(isLetterPrintDocumentReady(fakeDoc("loading", ["data-letter-print"])), false);
  assert.equal(isLetterPrintDocumentReady(fakeDoc("interactive", ["data-letter-print"])), true);
});

test("isLetterPrintDocumentReady never throws on a frame that has no document yet", () => {
  assert.equal(isLetterPrintDocumentReady(null), false);
  assert.equal(isLetterPrintDocumentReady(undefined), false);
  assert.equal(isLetterPrintDocumentReady(fakeDoc("complete", null)), false);
});

test("the print document carries the marker the readiness check looks for", () => {
  // The two halves of the handshake live in one file so they cannot drift: if
  // the attribute is ever renamed in the document, this fails rather than the
  // print button silently timing out in the client's browser.
  const html = buildLetterPrintDocument({ title: "خطاب", blocks: composeLetterBlocks(BASE_INPUT) });
  const attributes = html.match(/<body([^>]*)>/)![1].trim().split(/\s+/).map((pair) => pair.split("=")[0]);
  assert.ok(isLetterPrintDocumentReady({ readyState: "complete", body: { hasAttribute: (n) => attributes.includes(n) } }));
});

test("the title is escaped in <title> too", () => {
  // The recipient name flows into the title, and the title flows into <title>.
  const html = buildLetterPrintDocument({ title: `مطالبة <script>`, blocks: [] });
  assert.ok(html.includes("<title>مطالبة &lt;script&gt;</title>"));
});
