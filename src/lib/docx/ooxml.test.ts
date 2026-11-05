/**
 * ooxml.test.ts — q345: the hand-written .docx writer (fflate, no docx library).
 * packageCheck.testkit.ts is the stand-in for Word's strict reader.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/docx/ooxml.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, unzipSync } from "fflate";
import { DOCX_MIME, blocksToBodyXml, minimalDocx, xmlEscape, type DocBlock } from "./ooxml.ts";
import { assertPackageOpens, parseXml, runText } from "./packageCheck.testkit.ts";

const text = (files: Record<string, Uint8Array>, name: string) => strFromU8(files[name]);
const bodyOf = (xml: string) => parseXml(`<w:body xmlns:w="w">${xml}</w:body>`);

test("xmlEscape: the five characters, and the characters XML 1.0 forbids are dropped", () => {
  assert.equal(xmlEscape('a<b>&"\x01'), "a&lt;b&gt;&amp;&quot;");
  assert.equal(xmlEscape("'"), "&apos;");
  assert.equal(xmlEscape("\x00\x08\x0B\x0C\x0E\x1F"), "");
  assert.equal(xmlEscape("\uFFFE\uFFFF"), "");
  assert.equal(xmlEscape("قبل\uD83Dبعد"), "قبلبعد", "a lone surrogate, as a cut-off AI answer can end");
  assert.equal(xmlEscape("😀"), "😀", "a real emoji stays");
  assert.equal(xmlEscape("\t\n\r"), "\t\n\r", "the three allowed controls stay");
});

test("xmlEscape keeps Arabic and every direction mark", () => {
  const marks = "\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069";
  assert.equal(xmlEscape(`مرحبا${marks}`), `مرحبا${marks}`);
});

test("blocksToBodyXml: a paragraph is RTL with bidi and the right fonts", () => {
  const xml = blocksToBodyXml([{ kind: "para", text: "مرحبا" }]);
  assert.ok(xml.includes("<w:bidi/>"));
  assert.ok(xml.includes("<w:rtl/>"));
  assert.ok(xml.includes("مرحبا"));
  assert.ok(xml.includes('<w:pPr><w:bidi/><w:jc w:val="both"/></w:pPr>'));
  assert.ok(xml.includes('<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/>'));
  assert.ok(xml.includes('<w:sz w:val="28"/><w:szCs w:val="28"/>'));
  assert.ok(!xml.includes("<w:body"), "paragraphs only");
});

test("blocksToBodyXml: title and heading are bold in both scripts, the title centred", () => {
  const title = blocksToBodyXml([{ kind: "title", text: "لائحة" }]);
  assert.ok(title.includes('<w:jc w:val="center"/>'));
  assert.ok(title.includes("<w:b/><w:bCs/>"), "w:b alone leaves Arabic unbold");
  assert.ok(title.includes('<w:sz w:val="36"/><w:szCs w:val="36"/>'));
  const heading = blocksToBodyXml([{ kind: "heading", text: "الوقائع" }]);
  assert.ok(heading.includes("<w:b/><w:bCs/>"));
  assert.ok(heading.includes('<w:sz w:val="30"/><w:szCs w:val="30"/>'));
});

test("blocksToBodyXml: lists are paragraphs with Arabic numbers or a bullet; signature lines are paragraphs", () => {
  const ordered = bodyOf(blocksToBodyXml([{ kind: "list", ordered: true, items: ["أ", "ب"] }]));
  assert.deepEqual(ordered.children.map(runText), ["١. أ", "٢. ب"]);
  const bullets = bodyOf(blocksToBodyXml([{ kind: "list", ordered: false, items: ["أ"] }]));
  assert.deepEqual(bullets.children.map(runText), ["• أ"]);
  const sign = bodyOf(blocksToBodyXml([{ kind: "signature", lines: ["الاسم", "التوقيع"] }]));
  assert.deepEqual(sign.children.map(runText), ["الاسم", "التوقيع"]);
});

test("blocksToBodyXml: a newline in text becomes <w:br/>, spaces survive", () => {
  const xml = blocksToBodyXml([{ kind: "para", text: "سطر  أول\nسطر ثان" }]);
  assert.ok(xml.includes('<w:t xml:space="preserve">سطر  أول</w:t><w:br/><w:t xml:space="preserve">سطر ثان</w:t>'));
  assert.ok(!blocksToBodyXml([{ kind: "para", text: "a\r\nb" }]).includes("\r"));
});

const HOSTILE = "شركة العدل & الأمانة <ذ.م.م> \u200Fمادة 5\u202B \"مقتبس\" 'نص' $& $1 </w:t></w:r></w:p><w:p> ]]> &amp;";

test("every user string is escaped: Arabic with & < > quotes, RTL marks and even XML of its own", () => {
  const blocks: DocBlock[] = [
    { kind: "title", text: HOSTILE },
    { kind: "heading", text: HOSTILE },
    { kind: "para", text: HOSTILE },
    { kind: "list", ordered: true, items: [HOSTILE] },
    { kind: "signature", lines: [HOSTILE] },
  ];
  const body = bodyOf(blocksToBodyXml(blocks));
  assert.equal(body.children.length, 5, "the text added no paragraph");
  for (const p of [0, 1, 2, 4]) assert.equal(runText(body.children[p]), HOSTILE, `block ${p} reads back exactly`);
  assert.equal(runText(body.children[3]), `١. ${HOSTILE}`);
});

test("a valid package", () => {
  const files = unzipSync(minimalDocx(blocksToBodyXml([{ kind: "title", text: "لائحة" }])));
  for (const key of ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/_rels/document.xml.rels", "word/styles.xml"]) {
    assert.ok(key in files, key);
  }
  assert.equal(Object.keys(files)[0], "[Content_Types].xml", "the content types come first");
  const doc = text(files, "word/document.xml");
  assert.ok(doc.includes('<w:pgSz w:w="11906" w:h="16838"/>'));
  assert.ok(doc.includes("لائحة"));
  assert.ok(doc.includes('w:top="1440"') && doc.includes('w:gutter="0"'));
});

test("the package passes the strict reader, with hostile text inside", () => {
  const blocks: DocBlock[] = [{ kind: "title", text: HOSTILE }, { kind: "para", text: `${HOSTILE}\nثانٍ` }, { kind: "list", ordered: false, items: [HOSTILE] }];
  assertPackageOpens(minimalDocx(blocksToBodyXml(blocks)));
});

const HDR = '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>HEAD</w:t></w:r></w:p></w:hdr>';
const FTR = '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>FOOT</w:t></w:r></w:p></w:ftr>';

test("header referenced when given, footer too, and the strict reader follows them", () => {
  const files = assertPackageOpens(minimalDocx(blocksToBodyXml([{ kind: "para", text: "س" }]), { headerXml: HDR, footerXml: FTR }));
  const doc = text(files, "word/document.xml");
  assert.ok(doc.includes("w:headerReference"));
  assert.ok(doc.includes("w:footerReference"));
  const rels = text(files, "word/_rels/document.xml.rels");
  assert.ok(rels.includes("header1.xml"));
  assert.ok(rels.includes("footer1.xml"));
  const types = text(files, "[Content_Types].xml");
  assert.ok(types.includes('PartName="/word/header1.xml"') && types.includes("wordprocessingml.header+xml"));
  assert.ok(types.includes('PartName="/word/footer1.xml"') && types.includes("wordprocessingml.footer+xml"));
});

test("no header given: no reference and no part", () => {
  const files = assertPackageOpens(minimalDocx(blocksToBodyXml([{ kind: "para", text: "س" }])));
  assert.ok(!text(files, "word/document.xml").includes("w:headerReference"));
  assert.ok(!("word/header1.xml" in files));
  assert.ok(!text(files, "[Content_Types].xml").includes("header"));
});

test("media and part rels are written where asked; png is typed only when an image exists", () => {
  const rel = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>';
  const files = assertPackageOpens(minimalDocx("", { headerXml: HDR, headerRels: rel, media: [{ name: "logo.png", bytes: Uint8Array.of(1, 2, 3) }] }));
  assert.deepEqual([...files["word/media/logo.png"]], [1, 2, 3]);
  assert.equal(text(files, "word/_rels/header1.xml.rels"), rel);
  assert.ok(text(files, "[Content_Types].xml").includes('Extension="png"'));
  assert.ok(!text(unzipSync(minimalDocx("")), "[Content_Types].xml").includes('Extension="png"'));
});

test("no macro content type, and the strict reader would notice a broken part", () => {
  const types = text(unzipSync(minimalDocx("")), "[Content_Types].xml");
  assert.ok(!types.includes("macroEnabled"));
  assert.throws(() => parseXml("<a><b></a>"), /closes/);
  assert.throws(() => parseXml("<a>x & y</a>"), /raw &/);
  assert.throws(() => parseXml("<a x=1/>"), /broken tag/);
  assert.throws(() => parseXml("<a>\x01</a>"), /forbids/);
});

test("DOCX_MIME is the one the vault uses", () => {
  assert.equal(DOCX_MIME, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
});
