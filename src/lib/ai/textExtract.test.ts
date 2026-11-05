/**
 * textExtract.test.ts — the text of a .docx, .txt or .md, read on the server
 * with no new dependency, and every hostile file refused rather than half-read.
 * Each .docx is built here with fflate, so there is no binary fixture.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/textExtract.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { strToU8, zipSync } from "fflate";
import {
  DOCX_XML_MAX_BYTES,
  TEXT_CHARS_PER_PAGE,
  TEXT_FILE_MAX_CHARS,
  TEXT_SOURCE_MAX_BYTES,
  decodeTextBytes,
  extractDocxText,
  extractText,
  textKindOf,
  textPages,
} from "./textExtract.ts";

const DOC = "word/document.xml";
const body = (inner: string) => `<?xml version="1.0"?><w:document xmlns:w="w"><w:body>${inner}</w:body></w:document>`;
const docx = (inner: string) => zipSync({ [DOC]: strToU8(body(inner)), "[Content_Types].xml": strToU8("<Types/>") });
const para = (t: string) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`;

/** The central directory entry of the only or first file (a zip built by fflate, no comment). */
function centralEntry(zip: Uint8Array) {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const cd = dv.getUint32(zip.length - 22 + 16, true);
  return { dv, cd };
}

test("extractDocxText: paragraphs and entities", () => {
  assert.deepEqual(extractDocxText(docx(para("مرحبا") + para("عالم &amp; نظام"))), { ok: true, text: "مرحبا\nعالم & نظام" });
});

test("extractDocxText: tab", () => {
  const r = extractDocxText(docx("<w:p><w:r><w:t>أ</w:t><w:tab/><w:t>ب</w:t></w:r></w:p>"));
  assert.deepEqual(r, { ok: true, text: "أ\tب" });
});

test("extractDocxText: a tab stop definition is not a tab; br and cr are line breaks", () => {
  const r = extractDocxText(
    docx('<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>أ</w:t><w:br/><w:t>ب</w:t><w:cr/><w:t xml:space="preserve">ج </w:t></w:r></w:p>'),
  );
  assert.deepEqual(r, { ok: true, text: "أ\nب\nج" });
});

test("extractDocxText: an entity is decoded once, and a bad one stays as written", () => {
  const r = extractDocxText(docx(para("&amp;lt; &lt; &gt; &quot; &apos; &#1606; &#x635; &#99999999; &nosuch;")));
  assert.deepEqual(r, { ok: true, text: `&lt; < > " ' ن ص &#99999999; &nosuch;` });
});

test("extractDocxText: three or more line breaks collapse to two", () => {
  assert.deepEqual(extractDocxText(docx(para("أ") + "<w:p/>".repeat(1) + "</w:p></w:p></w:p>" + para("ب"))), { ok: true, text: "أ\n\nب" });
});

test("extractDocxText: tracked deletions are not read as text", () => {
  const r = extractDocxText(docx("<w:p><w:del><w:r><w:delText>محذوف</w:delText></w:r></w:del><w:r><w:t>باقٍ</w:t></w:r></w:p>"));
  assert.deepEqual(r, { ok: true, text: "باقٍ" });
});

test("extractDocxText: a text box Word writes twice (DrawingML and its VML fallback) is read once", () => {
  const box = "<w:txbxContent><w:p><w:r><w:t>مربع</w:t></w:r></w:p></w:txbxContent>";
  const xml =
    para("قبل") +
    `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>${box}</w:drawing></mc:Choice><mc:Fallback><w:pict>${box}</w:pict></mc:Fallback></mc:AlternateContent></w:r></w:p>` +
    para("بعد");
  const r = extractDocxText(docx(xml));
  assert.ok(r.ok);
  assert.equal(r.text.match(/مربع/g)?.length, 1);
  assert.match(r.text, /قبل/);
  assert.match(r.text, /بعد/);
});

test("extractDocxText: an empty or unclosed fallback drops no text after it", () => {
  assert.deepEqual(extractDocxText(docx(`<mc:Fallback/>${para("أ")}<mc:Fallback>${para("ظل")}</mc:Fallback>${para("ب")}`)), { ok: true, text: "أ\nب" });
  assert.deepEqual(extractDocxText(docx(`${para("أ")}<mc:Fallback>${para("ب")}`)), { ok: true, text: "أ\nب" });
});

test("extractDocxText: hostile markup is read in linear time, so it cannot hold the server before the charge", () => {
  // Each of these is about 19 MB of openings with no closing `>`: a pattern that
  // scans to the end of the document from every opening would take hours.
  for (const unit of ["<w:t ", "<w:br ", "<w:cr ", "<w:tab ", "<mc:Fallback ", "<w:t>", "&#"]) {
    const xml = unit.repeat(Math.floor((19 * 1024 * 1024) / unit.length));
    const started = Date.now();
    const r = extractDocxText(zipSync({ [DOC]: strToU8(xml) }, { level: 1 }));
    assert.equal(r.ok, false, unit);
    assert.ok(Date.now() - started < 15_000, `${unit} took ${Date.now() - started} ms`);
  }
});

test("extractDocxText: not a zip, no document.xml, no text", () => {
  assert.deepEqual(extractDocxText(new Uint8Array([1, 2, 3])), { ok: false, code: "docx_unreadable" });
  assert.deepEqual(extractDocxText(new Uint8Array(0)), { ok: false, code: "docx_unreadable" });
  assert.deepEqual(extractDocxText(zipSync({ "word/other.xml": strToU8("<x/>") })), { ok: false, code: "docx_unreadable" });
  assert.deepEqual(extractDocxText(docx("<w:p></w:p>")), { ok: false, code: "docx_unreadable" });
});

test("extractDocxText: a stored (uncompressed) document.xml is read too", () => {
  const zip = zipSync({ [DOC]: [strToU8(body(para("نص"))), { level: 0 }] });
  assert.deepEqual(extractDocxText(zip), { ok: true, text: "نص" });
});

test("extractDocxText: a zip truncated in the middle of its data is refused", () => {
  const zip = docx(para("نص ".repeat(5000)));
  const { dv, cd } = centralEntry(zip);
  // The compressed size in the central entry overruns the real data's end.
  dv.setUint32(cd + 20, zip.length * 2, true);
  assert.deepEqual(extractDocxText(zip), { ok: false, code: "docx_unreadable" });
});

test("extractDocxText: bomb", () => {
  const xml = " ".repeat(21 * 1024 * 1024);
  assert.ok(xml.length > DOCX_XML_MAX_BYTES);
  assert.deepEqual(extractDocxText(zipSync({ [DOC]: strToU8(xml) })), { ok: false, code: "docx_too_large" });
});

test("extractDocxText: a bomb that lies about its size is stopped by the real count, not read short", () => {
  const zip = zipSync({ [DOC]: strToU8(body(para("أ".repeat(30 * 1024 * 1024)))) });
  const { dv, cd } = centralEntry(zip);
  // The declared uncompressed size says 1000 bytes; the data inflates to 60 MB.
  dv.setUint32(cd + 24, 1000, true);
  assert.deepEqual(extractDocxText(zip), { ok: false, code: "docx_too_large" });
});

test("extractDocxText: a zip with two document.xml entries is refused (no memory multiplied by copies)", () => {
  const zip = zipSync({ [DOC]: strToU8(body(para("أ"))), "word/documenx.xml": strToU8(body(para("ب"))) });
  // The two names differ by one byte, in both the local and the central headers.
  for (let i = 0; i < zip.length - 8; i++) {
    if (String.fromCharCode(...zip.subarray(i, i + 8)) === "documenx") zip[i + 7] = "t".charCodeAt(0);
  }
  assert.deepEqual(extractDocxText(zip), { ok: false, code: "docx_unreadable" });
});

test("extractDocxText: an encrypted entry is refused", () => {
  const zip = docx(para("نص"));
  const { dv, cd } = centralEntry(zip);
  dv.setUint16(cd + 8, dv.getUint16(cd + 8, true) | 1, true);
  assert.deepEqual(extractDocxText(zip), { ok: false, code: "docx_unreadable" });
});

test("decodeTextBytes: UTF-8 with BOM, legacy Arabic, and UTF-16 with its BOM", () => {
  assert.equal(decodeTextBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8("نص")])), "نص");
  assert.equal(decodeTextBytes(new Uint8Array([0xe4, 0xd5])), "نص");
  assert.equal(decodeTextBytes(new Uint8Array([0xff, 0xfe, 0x46, 0x06, 0x35, 0x06])), "نص");
  assert.equal(decodeTextBytes(new Uint8Array([0xfe, 0xff, 0x06, 0x46, 0x06, 0x35])), "نص");
});

test("textPages: the pinned rule", () => {
  assert.equal(TEXT_CHARS_PER_PAGE, 3000);
  assert.equal(textPages(""), 1);
  assert.equal(textPages("x".repeat(3000)), 1);
  assert.equal(textPages("x".repeat(3001)), 2);
  assert.equal(textPages("x".repeat(TEXT_FILE_MAX_CHARS)), 30);
});

test("textKindOf: mime first, then the extension for an unhelpful mime", () => {
  assert.equal(textKindOf("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "x.bin"), "docx");
  assert.equal(textKindOf("text/plain", "a.bin"), "txt");
  assert.equal(textKindOf("TEXT/PLAIN; charset=utf-8", null), "txt");
  assert.equal(textKindOf("text/markdown", null), "md");
  assert.equal(textKindOf("text/x-markdown", null), "md");
  assert.equal(textKindOf("application/msword", "x.doc"), "doc");
  assert.equal(textKindOf("", "a.MD"), "md");
  assert.equal(textKindOf(null, "a.markdown"), "md");
  assert.equal(textKindOf("application/octet-stream", "c.docx"), "docx");
  assert.equal(textKindOf("application/octet-stream", "c.txt"), "txt");
  assert.equal(textKindOf("application/x-unknown", "c.doc"), "doc");
});

test("textKindOf: PDF and images stay with AI_FILE_MIMES, whatever the name says", () => {
  assert.equal(textKindOf("application/pdf", "x.pdf"), null);
  assert.equal(textKindOf("application/pdf", "x.docx"), null);
  assert.equal(textKindOf("image/png", "x.txt"), null);
  assert.equal(textKindOf("application/octet-stream", "x.exe"), null);
  assert.equal(textKindOf(null, null), null);
  assert.equal(textKindOf("", "docx"), null, "a bare name with no dot has no extension");
});

test("extractText: one entry point for the file checks and the link", () => {
  assert.deepEqual(extractText("docx", docx(para("نص"))), { ok: true, text: "نص" });
  assert.deepEqual(extractText("txt", strToU8("  نص  ")), { ok: true, text: "نص" });
  assert.deepEqual(extractText("md", strToU8("# نص")), { ok: true, text: "# نص" });
});

test("extractText: an empty text or a binary named .txt is refused, so nobody pays for nothing", () => {
  assert.deepEqual(extractText("txt", strToU8("   \n ")), { ok: false, code: "text_unreadable" });
  assert.deepEqual(extractText("md", new Uint8Array(0)), { ok: false, code: "text_unreadable" });
  assert.deepEqual(extractText("txt", new Uint8Array([0x4d, 0x5a, 0x00, 0x01, 0x00])), { ok: false, code: "text_unreadable" });
});

test("extractText: a source over the byte cap is refused before it is read", () => {
  const huge = new Uint8Array(TEXT_SOURCE_MAX_BYTES + 1);
  assert.deepEqual(extractText("txt", huge), { ok: false, code: "text_too_large" });
  assert.deepEqual(extractText("docx", huge), { ok: false, code: "docx_too_large" });
});

// ── a hostile .docx: the walk stops once the text passes the most one file may carry ──

test("the walk stops past TEXT_FILE_MAX_CHARS: a long document comes back just over the cap, not whole", () => {
  const piece = 1000;
  const r = extractDocxText(docx(para("س".repeat(piece)).repeat(500)));
  assert.ok(r.ok);
  assert.ok(r.text.length > TEXT_FILE_MAX_CHARS, "still over the cap, so every caller refuses it as today");
  assert.ok(r.text.length <= TEXT_FILE_MAX_CHARS + piece + 2, `came back at ${r.text.length}`);
});

test("blank paragraphs do not count: text that fits once collapsed comes back whole", () => {
  const blanks = "<w:p></w:p>".repeat(200_000);
  const half = "س".repeat(TEXT_FILE_MAX_CHARS / 2 - 1);
  const r = extractDocxText(docx(para(half) + blanks + para(half)));
  assert.deepEqual(r, { ok: true, text: `${half}\n\n${half}` });
  assert.equal(r.ok && r.text.length, TEXT_FILE_MAX_CHARS);
});

test("a run of tabs past the cap, with text after it, is not cut back to the text before it", () => {
  const r = extractDocxText(docx(`<w:p><w:r><w:t>أ</w:t>${"<w:tab/>".repeat(TEXT_FILE_MAX_CHARS + 10)}<w:t>ب</w:t></w:r></w:p>`));
  assert.ok(r.ok);
  assert.equal(r.text.length, TEXT_FILE_MAX_CHARS + 12);
});

test("a document that is only tabs and blanks stays unreadable, however long", () => {
  assert.deepEqual(extractDocxText(docx(`<w:p><w:r>${"<w:tab/>".repeat(TEXT_FILE_MAX_CHARS + 10)}</w:r></w:p>`)), { ok: false, code: "docx_unreadable" });
});
