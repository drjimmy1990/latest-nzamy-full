/**
 * letterExport.ts — the pure half of «صائغ الخطابات» (the client letter
 * composer at /dashboard/client/letters).
 *
 * WHY THIS FILE EXISTS AT ALL
 * The composer used to do three things in the component and none of them
 * honestly:
 *   - «تنزيل PDF» and «تنزيل Word» had no onClick. Two live-looking buttons
 *     that did nothing at all.
 *   - «اصنع الخطاب بالذكاء الاصطناعي» slept 1800ms and then filled a hardcoded
 *     template. The wait was the only thing that made it look like work.
 *   - «مساعدة AI» slept 1400ms and appended the client's own instruction to the
 *     paragraph as «[ملاحظة AI: …]» — it pasted the request INTO the letter.
 *
 * The tool is a TEMPLATE COMPOSER, which is exactly what the owner ruled these
 * instant tools are (س٣, 26 August: «نماذج وقوالب استرشادية فورية»). So the
 * composition is a synchronous pure function, and it lives here rather than in
 * the component for the reason every other pure module in this folder does:
 * `node --test` strips TypeScript but does not compile JSX, so anything left
 * inside a .tsx file cannot be put under test. Everything that decides what the
 * document SAYS is here; the component only owns Blob/iframe/print, which a
 * unit test cannot reach anyway.
 *
 * WHY NO PDF LIBRARY
 * jsPDF is installed but ships Latin-only fonts and does no bidi reordering or
 * Arabic letter joining, so «بسم الله» comes out as disconnected reversed
 * glyphs. That is already documented as the blocker on the receipt document.
 * The browser's own print pipeline shapes Arabic correctly and every desktop
 * and mobile browser offers "Save as PDF" from it — so the print document below
 * is the PDF path, and the button that opens it says «طباعة / حفظ PDF» rather
 * than promising a file that never downloads.
 *
 * Value imports are RELATIVE with an explicit .ts extension where this module
 * imports anything at all (it imports nothing today) — the `node --test` runner
 * does not resolve tsconfig paths. Same convention as ./intakeGuard.ts.
 */

/** One paragraph of the composed letter, as the editor holds it. */
export interface LetterBlock {
  id: string;
  /**
   * The editor's own heading for this paragraph («البسملة», «الختام»). It is
   * scaffolding for the person editing and is deliberately NOT printed: a
   * letter that carries «موضوع الخطاب:» above its own body reads like a form,
   * not like a letter.
   */
  label: string;
  content: string;
  isBold?: boolean;
  isCenter?: boolean;
}

export interface LetterComposeInput {
  /** A RECIPIENT_PRESETS id — landlord | company | employer | bank | individual | government. */
  recipientPreset: string;
  /** Free text, may be empty: the form marks the name optional. */
  recipientName: string;
  /** The client, or the company they act for. */
  senderName: string;
  /** The client's own account of what happened, in their own words. */
  story: string;
  includeDeadline: boolean;
  /** "3" | "7" | "14" | "30" as the picker stores it. */
  deadlineDays: string;
}

export interface LetterDocument {
  /** Used for <title>, and as the stem of the download filename. */
  title: string;
  blocks: LetterBlock[];
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Arabic helpers
 * ═════════════════════════════════════════════════════════════════════════ */

const ARABIC_INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/**
 * Western digits → Arabic-Indic, for the body of a formal Saudi letter.
 *
 * Hand-rolled rather than `Number(n).toLocaleString("ar-SA")` on purpose: the
 * locale call depends on the ICU data the runtime happens to carry, so it
 * returns "٧" under a full-ICU Node and "7" under a small-ICU one — a unit test
 * that passes on one machine and fails on another. This is deterministic.
 *
 * Only digits are touched; everything else passes through untouched.
 */
export function toArabicDigits(value: string): string {
  return value.replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

/**
 * A day count in correct Arabic number agreement: «يوم واحد», «يومان», «٧ أيام»
 * for 3–10, «١٤ يوماً» for 11 and up.
 *
 * The picker used to print «14 أيام» on its own button — western digits and the
 * wrong plural. Legal-register Arabic is part of what the office is selling
 * here, so the rule lives in one tested place and both the button and the
 * letter read from it.
 *
 * A value that is not a positive whole number comes back as the raw string with
 * «يوم» after it rather than throwing: the picker can only produce 3/7/14/30
 * today, but a letter is not worth crashing over a bad day count.
 */
export function dayCountAr(days: string): string {
  const n = Number(days);
  if (!Number.isInteger(n) || n <= 0) return `${toArabicDigits(days)} يوم`;
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  const digits = toArabicDigits(String(n));
  return n <= 10 ? `${digits} أيام` : `${digits} يوماً`;
}

/**
 * Presets whose recipient is an organisation, used ONLY to pick the fallback
 * noun when the client left the name blank. `landlord`, `employer` and
 * `individual` are outside the set because each of them is a natural person in
 * the client's telling far more often than it is a legal entity.
 */
const ORGANISATION_PRESETS = new Set(["company", "bank", "government"]);

/**
 * The opening address.
 *
 * WHAT THIS USED TO DO, AND WHY IT WAS WRONG
 * It picked one of three honorifics from the preset the client tapped:
 *   - «السيد / فلان … المحترم،» for a person,
 *   - «السادة / فلان … المحترمين،» for a company or a bank,
 *   - «معالي / سعادة رئيس فلان … المحترم،» for a government entity.
 * The form never asks for any of that. «السيد» asserts the recipient is a man —
 * the letter addressed «نورة السالم» as «السيد /». «معالي / سعادة» asserts a
 * rank, and «رئيس» asserts that the named body's HEAD is the addressee, which
 * is a second claim on top of the first. These go out in a formal letter under
 * the client's own name, so each one is the platform making a factual statement
 * about a third party that nobody entered and nobody checked.
 *
 * WHAT IT DOES NOW
 * The recipient is addressed by the name the client typed, exactly as typed,
 * with no honorific at all. «المحترم،» went with them and not by accident: it
 * agrees for gender too («المحترمة» for a woman, «المحترمين» for a group), so
 * keeping it to preserve the formality would have re-landed the same defect in
 * a politer word. The greeting line that follows («السلام عليكم…») carries the
 * courtesy, and it is neutral.
 *
 * A blank name is a normal path — the form marks it optional — so it falls back
 * to a form of address rather than to an invented name. «الجهة المعنية» /
 * «الطرف المعني» describe the addressee's relation to the letter, not who they
 * are, and «الطرف» is a grammatical masculine that refers to the party, not to
 * the person's sex.
 *
 * The rejected alternative was asking for the title on the form (a picker: أ. /
 * د. / م. / السيد / السيدة). That would make the honorific true instead of
 * removing it, but it adds a required question to a three-step consumer flow to
 * buy back a word, and a client who picks the wrong one is back to a false
 * claim with the platform's fingerprints off it.
 */
function salutationFor(recipientPreset: string, recipientName: string): string {
  const name = recipientName.trim();
  if (name) return `إلى / ${name}`;
  return `إلى / ${ORGANISATION_PRESETS.has(recipientPreset) ? "الجهة المعنية" : "الطرف المعني"}`;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Composition — the template, made explicit
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * Build the letter from the client's answers. Synchronous, deterministic, and
 * the only place the template text lives.
 *
 * Every block is editable afterwards; these are starting points, not output the
 * platform stands behind on its own. That is what the notice at the top of the
 * page says and it is why nothing here is dressed up as generated.
 *
 * The signature/date lines at the end are BLANKS, not values. A printed letter
 * with nowhere to sign is unusable, but writing today's date into it would be
 * the platform asserting when the letter was sent — which it does not know.
 */
export function composeLetterBlocks(input: LetterComposeInput): LetterBlock[] {
  const sender = input.senderName.trim() || "المرسِل";
  const blocks: LetterBlock[] = [
    { id: "basmala", label: "البسملة", content: "بسم الله الرحمن الرحيم", isBold: true, isCenter: true },
    {
      id: "salutation",
      label: "المخاطَب",
      content: `${salutationFor(input.recipientPreset, input.recipientName)}\nالسلام عليكم ورحمة الله وبركاته، وبعد،`,
      isBold: true,
    },
    {
      id: "body",
      label: "موضوع الخطاب",
      content: `يتشرف المرسِل / ${sender} بإحاطتكم علماً بالآتي:\n${input.story.trim()}`,
    },
  ];

  if (input.includeDeadline) {
    blocks.push({
      id: "deadline",
      label: "مهلة الرد",
      content:
        `وعليه، نأمل منكم اتخاذ اللازم خلال (${dayCountAr(input.deadlineDays)}) من تاريخ استلامكم هذا الخطاب، ` +
        `وفي حال عدم الرد خلال المدة المذكورة يحتفظ المرسِل بكامل حقه النظامي في اتخاذ ما يلزم من إجراءات.`,
      isBold: true,
    });
  }

  blocks.push({
    id: "closing",
    label: "الختام",
    content: `وتفضلوا بقبول وافر التقدير والاحترام،\n\nمقدمه / ${sender}\nالتوقيع: ........................\nالتاريخ: ........................`,
    isBold: true,
  });

  return blocks;
}

/**
 * The letter as plain text, in reading order.
 *
 * THE SINGLE SOURCE for the letter's words. The .doc export, the print
 * document and `metadata.intake.fullLetterText` — the copy the fulfilment team
 * reviews — all derive from the same blocks through this function or through
 * the shared renderer below. Composing the team's copy separately is how the
 * letter the client downloaded and the letter the office read drift apart.
 *
 * Empty blocks are dropped: a client who clears a paragraph meant to delete it.
 */
export function letterPlainText(blocks: LetterBlock[]): string {
  return blocks
    .map((block) => block.content.trim())
    .filter((content) => content.length > 0)
    .join("\n\n");
}

/** The letter's title — the <title>, the filename stem, and the on-screen heading. */
export function letterDocumentTitle(letterTypeLabel: string, recipientName: string): string {
  const type = letterTypeLabel.trim() || "خطاب رسمي";
  const to = recipientName.trim();
  return to ? `${type} — ${to}` : type;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * HTML documents
 * ═════════════════════════════════════════════════════════════════════════ */

/**
 * Escape text for HTML.
 *
 * This document reproduces the client's OWN words verbatim — their story, the
 * other party's name, whatever they typed into a paragraph. A `<` in any of
 * that is both a broken document and, since the print document is loaded into
 * an iframe on our origin, script injection into the app's own origin.
 *
 * `&` MUST be replaced first. Doing it after `<` turns the `&` of `&lt;` into
 * `&amp;lt;` and the reader sees the escape sequence instead of the character.
 * That ordering is pinned by a test.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Windows refuses these as filenames whatever extension follows them. */
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * A safe, stable filename stem from an Arabic title.
 *
 * Arabic characters are KEPT. Every browser this app supports sends the
 * `download` attribute as UTF-8 and every desktop OS has accepted Arabic
 * filenames for two decades; transliterating «إنذار» to "indhar" would make the
 * file harder for its owner to find, not safer.
 *
 * What is removed, and why each one:
 *  - Bidi and zero-width format controls. A filename is rendered by the file
 *    manager, not by us, and U+202E RIGHT-TO-LEFT OVERRIDE inside one is the
 *    classic spoof that displays "…cod.exe" as "…exe.doc". The document itself
 *    is right-to-left from its own dir="rtl"; no control character is needed
 *    anywhere for the Arabic to render.
 *  - C0/C1 control characters, which some filesystems accept and no user wants.
 *  - \ / : * ? " < > | — reserved on Windows, and the first two are path
 *    separators everywhere. Replaced with a space rather than deleted so
 *    «مطالبة/إيجار» does not become one run-on word.
 *  - Leading dots (a dotfile on Unix) and trailing dots or spaces (silently
 *    stripped by Windows, which then breaks any exact-name lookup).
 *
 * The stem is capped at 80 characters: the recipient name is free text and a
 * pasted paragraph would blow past the 255-byte limit once UTF-8 Arabic is
 * counted at two bytes per letter.
 */
export function letterFileBaseName(title: string): string {
  const cleaned = title
    // Written as \uXXXX escapes on purpose: these characters are INVISIBLE,
    // and a regex holding them literally is unreadable in review and one stray
    // copy-paste away from silently matching nothing.
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const stem = cleaned
    .slice(0, 80)
    .replace(/^\.+/, "")
    .replace(/[.\s]+$/, "")
    .trim();

  if (!stem || WINDOWS_RESERVED_NAMES.test(stem)) return "خطاب";
  return stem;
}

/** `letterFileBaseName` plus an extension — "خطاب مطالبة.doc". */
export function letterFileName(title: string, extension: string): string {
  return `${letterFileBaseName(title)}.${extension}`;
}

/**
 * The shared page CSS.
 *
 * Both documents are standalone: neither the .doc opened in Word nor the
 * srcdoc iframe inherits a single rule from the app, so the font stack, the
 * direction and the page geometry all have to be stated here. Without the
 * explicit stack the Arabic falls back to the browser's default serif, which on
 * Windows means a Latin face with no Arabic coverage.
 *
 * `pt` throughout rather than `px`: both outputs are paper, and Word measures
 * in points.
 */
const DOCUMENT_CSS = `
@page { size: A4; margin: 2cm; }
body {
  font-family: "Traditional Arabic", "Simplified Arabic", "Sakkal Majalla", "Arial", sans-serif;
  direction: rtl;
  text-align: right;
  font-size: 14pt;
  line-height: 1.9;
  color: #111111;
  margin: 0;
}
p { margin: 0 0 6pt 0; }
.blk { margin: 0 0 16pt 0; }
.b { font-weight: bold; }
.c { text-align: center; }
`.trim();

/**
 * Render the blocks as HTML.
 *
 * One `<p>` per source line, not one `<p>` per block with `<br>` inside: Word's
 * HTML importer collapses raw newlines and treats `<br>` inconsistently across
 * versions, so a five-line closing arrived as one run-on line. An empty line
 * keeps a non-breaking space so the blank the client typed survives — an empty
 * `<p>` has zero height in Word.
 */
function renderBlocksHtml(blocks: LetterBlock[]): string {
  return blocks
    .filter((block) => block.content.trim().length > 0)
    .map((block) => {
      const classes = [block.isBold ? "b" : "", block.isCenter ? "c" : ""].filter(Boolean).join(" ");
      const attr = classes ? ` class="${classes}"` : "";
      const lines = block.content
        .split("\n")
        .map((line) => `<p${attr}>${escapeHtml(line) || "&#160;"}</p>`)
        .join("");
      return `<div class="blk">${lines}</div>`;
    })
    .join("\n");
}

/**
 * The stamp that says «this is the letter, not the empty page the iframe starts
 * on». See isLetterPrintDocumentReady below for what it is for; it is not
 * exported, because the only correct way to read it is through that predicate.
 */
const PRINT_READY_ATTR = "data-letter-print";

/**
 * The document the print dialogue renders — and therefore the PDF path.
 *
 * Loaded into a same-origin iframe by the component and printed from there. No
 * inline script: the parent calls `contentWindow.print()` itself, which is one
 * fewer thing for a future CSP to break, and it lets the parent clean the frame
 * up on `afterprint`. The readiness handshake is an ATTRIBUTE for the same
 * reason — a `<script>` that messaged the parent would work and would also be
 * the first thing a CSP kills.
 */
export function buildLetterPrintDocument(doc: LetterDocument): string {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.title)}</title>
<style>
${DOCUMENT_CSS}
</style>
</head>
<body dir="rtl" ${PRINT_READY_ATTR}="ready">
${renderBlocksHtml(doc.blocks)}
</body>
</html>`;
}

/** The shape of `iframe.contentWindow.document` that the check below needs. */
export interface PrintFrameDocument {
  readyState: string;
  body: { hasAttribute(name: string): boolean } | null;
}

/**
 * Is this frame showing the letter, and has it finished parsing?
 *
 * THE BUG THIS EXISTS FOR
 * An `<iframe>` inserted into the page starts life on `about:blank` and fires a
 * `load` event for it. The print path attached `onload`, appended the frame and
 * then set `srcdoc`; in Chromium the about:blank load fires first, so
 * `print()` ran against an empty document. The client pressed «طباعة / حفظ
 * PDF», got a real print dialogue, and saved a blank page — worse than the dead
 * button it replaced, because it looks like it worked.
 *
 * Checking `readyState` alone does NOT catch it: about:blank is already
 * "complete" when its load event fires. The only reliable discriminator is
 * something only OUR document carries, hence the attribute — and it is on
 * `<body>`, which exists even when the client has emptied every paragraph, so
 * an empty letter still prints instead of silently timing out.
 *
 * Structurally typed rather than taking `Document`: that is what lets
 * `node --test` exercise it without a DOM.
 */
export function isLetterPrintDocumentReady(doc: PrintFrameDocument | null | undefined): boolean {
  if (!doc || !doc.body) return false;
  if (doc.readyState === "loading") return false;
  return doc.body.hasAttribute(PRINT_READY_ATTR);
}

/**
 * A Word-openable document.
 *
 * `application/msword` over an HTML body, which is the one .doc format that can
 * be produced with no dependency at all. It opens in Word, in LibreOffice and
 * in Google Docs, and — unlike a generated PDF — the client can keep editing
 * the letter, which is the whole point of handing it to them.
 *
 * Three things here are load-bearing and each looks like decoration:
 *  - The BOM. It is returned as part of the string rather than added by the
 *    caller so the caller cannot forget it. Without it Word guesses the
 *    encoding from the locale and a Windows-1256 guess renders every Arabic
 *    letter as mojibake.
 *  - The `xmlns:w` / `xmlns:o` declarations plus the `mso 9` block. They are
 *    what makes Word treat the file as a document rather than as a web page,
 *    which is what makes @page margins apply.
 *  - `dir="rtl"` on <html> AND on <body>: Word reads the body attribute, the
 *    browsers that preview .doc read the html one.
 *
 * The alternative was a real .docx (a zip of XML parts). It needs either a
 * dependency or ~200 lines of hand-built OOXML, and buys nothing a client can
 * see — this file opens and edits identically.
 */
export function buildLetterWordDocument(doc: LetterDocument): string {
  return `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<title>${escapeHtml(doc.title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
${DOCUMENT_CSS}
</style>
</head>
<body dir="rtl">
${renderBlocksHtml(doc.blocks)}
</body>
</html>`;
}
