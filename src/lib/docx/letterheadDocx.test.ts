/**
 * letterheadDocx.test.ts — q345: the letterhead in the .docx, from the office's
 * uploaded Word template or generated. Fixtures are built here with minimalDocx,
 * never from the owner package.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/docx/letterheadDocx.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { buildLetterheadIdentity, qrTargetFor, QR_CAPTION_PLATFORM, type BrandingResponse, type LetterheadIdentity } from "../branding/letterheadIdentity.ts";
import { buildLetterheadDocx, generatedFooterXml, generatedHeaderXml, letterheadQrPayload, mergeIntoTemplate, pngPixelSize, TEMPLATE_FALLBACK_NOTE } from "./letterheadDocx.ts";
import { blocksToBodyXml, minimalDocx, type DocBlock } from "./ooxml.ts";
import { assertPackageOpens, parseXml, runText } from "./packageCheck.testkit.ts";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const HDR = `<w:hdr xmlns:w="${W}"><w:p><w:r><w:t>HEAD</w:t></w:r></w:p></w:hdr>`;
const text = (files: Record<string, Uint8Array>, name: string) => strFromU8(files[name]);
const template = () => minimalDocx(blocksToBodyXml([{ kind: "para", text: "OLD" }]), { headerXml: HDR });
const NEW_BODY = blocksToBodyXml([{ kind: "para", text: "جديد" }]);

const identity = (over: Partial<LetterheadIdentity> = {}): LetterheadIdentity => ({
  nameAr: "مكتب العدل",
  nameEn: "",
  licenceLine: "ترخيص رقم ١٢٣",
  contacts: [],
  logoUrl: null,
  accent: "#C8A762",
  qr: { kind: "platform", url: "https://nezamy.sa", caption: QR_CAPTION_PLATFORM, reason: "unpublished" },
  ...over,
});
const BLOCKS: DocBlock[] = [{ kind: "title", text: "لائحة دعوى" }, { kind: "para", text: "نص" }];
const PNG4 = Uint8Array.of(0x89, 0x50, 0x4e, 0x47);

/** Replaces document.xml of a real template. */
function withDocument(mutate: (xml: string) => string): Uint8Array {
  const files = unzipSync(template());
  files["word/document.xml"] = strToU8(mutate(text(files, "word/document.xml")));
  return zipSync(files);
}

test("keeps the template's header: new body, old section, header byte-identical", () => {
  const source = template();
  const merged = mergeIntoTemplate(source, NEW_BODY);
  assert.equal(merged.ok, true);
  if (!merged.ok) return;
  const files = assertPackageOpens(merged.bytes);
  const doc = text(files, "word/document.xml");
  assert.ok(doc.includes("جديد"));
  assert.ok(!doc.includes("OLD"));
  assert.ok(doc.includes("w:headerReference"));
  assert.deepEqual(files["word/header1.xml"], unzipSync(source)["word/header1.xml"]);
});

test("every other entry of the template stays byte-identical", () => {
  const source = unzipSync(template());
  const merged = mergeIntoTemplate(template(), NEW_BODY);
  assert.ok(merged.ok);
  const out = unzipSync(merged.bytes);
  assert.deepEqual(Object.keys(out), Object.keys(source));
  for (const name of Object.keys(source)) {
    if (name !== "word/document.xml") assert.deepEqual(out[name], source[name], name);
  }
});

test("a `$` in the text is text: the merge slices, it never String.replaces", () => {
  const body = blocksToBodyXml([{ kind: "para", text: "$& $1 $` $' 100$" }]);
  const merged = mergeIntoTemplate(template(), body);
  assert.ok(merged.ok);
  const doc = parseXml(text(unzipSync(merged.bytes), "word/document.xml"));
  assert.equal(runText(doc), "$& $1 $` $' 100$");
});

test("refuses macro templates, by content type or by the VBA part", () => {
  const files = unzipSync(template());
  files["[Content_Types].xml"] = strToU8(text(files, "[Content_Types].xml").replace("document.main+xml", "document.macroEnabled.main+xml"));
  assert.deepEqual(mergeIntoTemplate(zipSync(files), NEW_BODY), { ok: false, reason: "macro" });

  const vba = unzipSync(template());
  vba["word/vbaProject.bin"] = Uint8Array.of(1);
  assert.deepEqual(mergeIntoTemplate(zipSync(vba), NEW_BODY), { ok: false, reason: "macro" });
});

test("not a docx: no document part, or not a zip at all", () => {
  assert.deepEqual(mergeIntoTemplate(zipSync({ "x.txt": strToU8("x") }), NEW_BODY), { ok: false, reason: "not_docx" });
  assert.deepEqual(mergeIntoTemplate(Uint8Array.of(1, 2, 3, 4), NEW_BODY), { ok: false, reason: "not_docx" });
});

test("no usable body or final section → no_body", () => {
  const noBody = withDocument(() => `<w:document xmlns:w="${W}"></w:document>`);
  assert.deepEqual(mergeIntoTemplate(noBody, NEW_BODY), { ok: false, reason: "no_body" });

  const noSection = withDocument((xml) => xml.replace(/<w:sectPr>.*<\/w:sectPr>/, ""));
  assert.deepEqual(mergeIntoTemplate(noSection, NEW_BODY), { ok: false, reason: "no_body" });

  // The only sectPr is a section break inside a paragraph, not the body's own:
  // cutting up to it would leave a broken tree.
  const inParagraph = withDocument((xml) => {
    const sect = /<w:sectPr>.*<\/w:sectPr>/.exec(xml)![0];
    return xml.replace(sect, "").replace("</w:body>", `<w:p><w:pPr>${sect}</w:pPr></w:p></w:body>`);
  });
  assert.deepEqual(mergeIntoTemplate(inParagraph, NEW_BODY), { ok: false, reason: "no_body" });
});

test("a section break in the old body is replaced, the final section is the one kept", () => {
  const twoSections = withDocument((xml) =>
    xml.replace("<w:body>", '<w:body><w:p><w:pPr><w:sectPr><w:pgSz w:w="1" w:h="1"/></w:sectPr></w:pPr></w:p>'),
  );
  const merged = mergeIntoTemplate(twoSections, NEW_BODY);
  assert.ok(merged.ok);
  const doc = assertPackageOpens(merged.bytes);
  assert.ok(!text(doc, "word/document.xml").includes('w:w="1"'));
  assert.ok(text(doc, "word/document.xml").includes('w:w="11906"'));
});

test("a tracked section change: the whole outer sectPr is kept, and <w:sectPrChange> is no match", () => {
  const tracked = withDocument((xml) =>
    xml.replace("</w:sectPr>", '<w:sectPrChange w:id="1" w:author="x"><w:sectPr/></w:sectPrChange></w:sectPr>'),
  );
  const merged = mergeIntoTemplate(tracked, NEW_BODY);
  assert.ok(merged.ok);
  const doc = text(unzipSync(merged.bytes), "word/document.xml");
  parseXml(doc, "merged");
  assert.ok(doc.includes("w:headerReference"), "the outer section survived");
  assert.ok(doc.includes("w:sectPrChange"));
  assert.ok(!doc.includes("OLD"));
});

test("a body with attributes and a self-closed final section both merge", () => {
  const selfClosed = withDocument((xml) => xml.replace("<w:body>", '<w:body w:x="1">').replace(/<w:sectPr>.*<\/w:sectPr>/, "<w:sectPr/>"));
  const merged = mergeIntoTemplate(selfClosed, NEW_BODY);
  assert.ok(merged.ok);
  const doc = text(unzipSync(merged.bytes), "word/document.xml");
  parseXml(doc, "merged");
  assert.ok(doc.endsWith("<w:sectPr/></w:body></w:document>"));
  assert.ok(doc.includes("جديد") && !doc.includes("OLD"));
});

test("falls back when the template has no body, with the note", () => {
  const built = buildLetterheadDocx({ blocks: BLOCKS, identity: identity(), template: zipSync({ "x.txt": strToU8("x") }) });
  assert.equal(built.usedTemplate, false);
  assert.equal(built.note, "تعذّر استخدام قالب Word المرفوع؛ استُخدمت الترويسة المولّدة من بيانات هويتك");
  assert.equal(built.note, TEMPLATE_FALLBACK_NOTE);
  const files = assertPackageOpens(built.bytes);
  assert.ok(text(files, "word/header1.xml").includes("مكتب العدل"));
});

test("with a good template: used, no note, and it carries no generated header", () => {
  const built = buildLetterheadDocx({ blocks: BLOCKS, identity: identity(), template: template(), logoPng: PNG4, qrPng: PNG4 });
  assert.equal(built.usedTemplate, true);
  assert.equal(built.note, null);
  const files = assertPackageOpens(built.bytes);
  assert.equal(text(files, "word/header1.xml"), HDR);
  assert.ok(!("word/media/logo.png" in files), "the office's own header stands");
});

test("no template: no note", () => {
  const built = buildLetterheadDocx({ blocks: BLOCKS, identity: identity() });
  assert.equal(built.usedTemplate, false);
  assert.equal(built.note, null);
  assertPackageOpens(built.bytes);
});

test("owner ٤٤٢(أ): the generated file carries the office's letterhead only — no platform stamp, no QR, no footer", () => {
  for (const tpl of [undefined, zipSync({ "x.txt": strToU8("x") })]) {
    const built = buildLetterheadDocx({ blocks: BLOCKS, identity: identity(), template: tpl, logoPng: PNG4 });
    const files = assertPackageOpens(built.bytes);
    assert.ok(!("word/footer1.xml" in files), "no footer part");
    assert.ok(!("word/media/qr.png" in files), "no QR image");
    assert.ok(text(files, "word/header1.xml").includes("مكتب العدل"), "the office's own header");
    for (const name of Object.keys(files)) {
      if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
      const xml = text(files, name);
      assert.ok(!xml.includes("صادر عبر منصة نظامي"), `${name}: no platform stamp`);
      assert.ok(!xml.includes("footerReference"), `${name}: no footer reference`);
      assert.ok(!xml.includes(QR_CAPTION_PLATFORM), `${name}: no QR caption`);
    }
  }
});

test("generated header names the office", () => {
  const xml = generatedHeaderXml(identity(), null);
  assert.ok(xml.includes("مكتب العدل"));
  assert.ok(xml.includes("ترخيص رقم ١٢٣"));
  assert.ok(!xml.includes("w:drawing"));
  parseXml(xml, "header");
});

test("a hostile office name cannot break the header, and contacts typed LTR are not RTL runs", () => {
  const name = "شركة العدل & الأمانة <ذ.م.م> \u200Fمادة\u202B </w:t></w:r>";
  const xml = generatedHeaderXml(
    identity({ nameAr: name, nameEn: "A&B <Law>", licenceLine: null, contacts: [{ kind: "email", text: "a&b@x.sa", ltr: true }, { kind: "address", text: "الرياض <حي>", ltr: false }] }),
    null,
  );
  const root = parseXml(xml, "header");
  assert.ok(runText(root).includes(name));
  assert.ok(runText(root).includes("A&B <Law>"));
  assert.ok(runText(root).includes("a&b@x.sa"));
  const email = /<w:r>(?:(?!<\/w:r>).)*a&amp;b@x\.sa<\/w:t><\/w:r>/.exec(xml);
  assert.ok(email, "the e-mail run");
  assert.ok(!email[0].includes("<w:rtl/>"));
  assert.ok(/<w:r>(?:(?!<\/w:r>).)*<w:rtl\/>(?:(?!<\/w:r>).)*الرياض/.test(xml));
});

test("an accent that is not a colour never reaches an XML attribute", () => {
  const xml = generatedHeaderXml(identity({ accent: '"/><evil x="' }), null);
  assert.ok(!xml.includes("evil"));
  assert.ok(xml.includes('w:color="C8A762"'));
  assert.ok(generatedHeaderXml(identity({ accent: "#0b3d2e" }), null).includes('w:color="0b3d2e"'));
});

test("opt-in QR (a caller passes qrPng on purpose): logo in the header's rels, QR in the footer's, neither in the document's", () => {
  const built = buildLetterheadDocx({ blocks: BLOCKS, identity: identity(), logoPng: PNG4, qrPng: PNG4 });
  const files = assertPackageOpens(built.bytes);
  assert.ok("word/media/logo.png" in files);
  assert.ok("word/media/qr.png" in files);
  assert.ok(text(files, "word/_rels/header1.xml.rels").includes("media/logo.png"));
  assert.ok(text(files, "word/_rels/footer1.xml.rels").includes("media/qr.png"));
  const docRels = text(files, "word/_rels/document.xml.rels");
  assert.ok(!docRels.includes("media/"));
  const types = text(files, "[Content_Types].xml");
  assert.ok(types.includes('Extension="png"'));
  assert.ok(types.includes('PartName="/word/header1.xml"'));
  assert.ok(types.includes('PartName="/word/footer1.xml"'));
  assert.ok(text(files, "word/header1.xml").includes("r:embed"));
  assert.ok(text(files, "word/footer1.xml").includes("r:embed"));
});

test("logo alone: the QR's parts and the footer are absent, and the strict reader is happy", () => {
  const files = assertPackageOpens(buildLetterheadDocx({ blocks: BLOCKS, identity: identity(), logoPng: PNG4 }).bytes);
  assert.ok(!("word/media/qr.png" in files));
  assert.ok(!("word/footer1.xml" in files));
  assert.ok(!text(files, "[Content_Types].xml").includes("footer1.xml"));
});

test("image size: the logo is 2.5 cm tall and keeps its proportions, the QR 2.2 cm", () => {
  const png = (w: number, h: number) => {
    const b = new Uint8Array(24);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, w);
    new DataView(b.buffer).setUint32(20, h);
    return b;
  };
  assert.deepEqual(pngPixelSize(png(200, 100)), { width: 200, height: 100 });
  assert.equal(pngPixelSize(PNG4), null);
  const ext = (xml: string) => /<wp:extent cx="(\d+)" cy="(\d+)"\/>/.exec(xml)!.slice(1).map(Number);

  const header = (p: Uint8Array) => text(unzipSync(buildLetterheadDocx({ blocks: BLOCKS, identity: identity(), logoPng: p }).bytes), "word/header1.xml");
  assert.deepEqual(ext(header(PNG4)), [900000, 900000], "unknown size: square");
  assert.deepEqual(ext(header(png(200, 100))), [1800000, 900000]);
  const [wideW, wideH] = ext(header(png(1000, 100)));
  assert.ok(wideW <= 2160000, "a wide logo is capped at 6 cm");
  assert.equal(Math.round(wideW / wideH), 10, "and stays in proportion");

  assert.deepEqual(ext(generatedFooterXml("rId1", "تعليق")), [792000, 792000]);
});

test("the opt-in footer carries the QR and its caption, never a platform stamp; hostile caption escaped", () => {
  const xml = generatedFooterXml("rId1", "امسح <الرمز> & تحقق");
  const root = parseXml(xml, "footer");
  assert.ok(runText(root).includes("امسح <الرمز> & تحقق"));
  assert.ok(!xml.includes("صادر عبر منصة نظامي"));
  assert.ok(xml.includes("w:drawing"));
});

/** q343: the privacy switch reaches the file. */
const response = (verifyCard: BrandingResponse["verifyCard"]): BrandingResponse => ({
  available: true,
  scope: "lawyer",
  fields: { display_name_ar: "", display_name_en: "", address: "", phone: "", email: "", website: "", accent_color: "" },
  logoUrl: null,
  licence: { number: "123", verified: true },
  profile: { userId: "u", slug: null, hasRoleProfile: true, readFailed: false, verificationStatus: "verified", marketplaceVisible: false },
  verifyCard,
});

test("the privacy switch: off → the file and its QR hold the platform, never /verify/", () => {
  const origin = "https://nezamy.sa";
  const off = qrTargetFor(response({ token: null, enabled: false }), origin);
  assert.equal(off.kind, "platform");
  assert.equal(letterheadQrPayload(identity({ qr: off })), origin);

  const files = unzipSync(buildLetterheadDocx({ blocks: BLOCKS, identity: identity({ qr: off }), qrPng: PNG4 }).bytes);
  for (const name of Object.keys(files)) {
    if (name.endsWith(".xml") || name.endsWith(".rels")) assert.ok(!text(files, name).includes("/verify/"), name);
  }
  assert.ok(text(files, "word/footer1.xml").includes(QR_CAPTION_PLATFORM));
});

test("the privacy switch: on → the QR payload is the card, and the caption says so", () => {
  const token = "a".repeat(32);
  const on = qrTargetFor(response({ token, enabled: true }), "https://nezamy.sa");
  assert.equal(on.kind, "card");
  assert.equal(letterheadQrPayload(identity({ qr: on })), `https://nezamy.sa/verify/${token}`);
  const files = unzipSync(buildLetterheadDocx({ blocks: BLOCKS, identity: identity({ qr: on }), qrPng: PNG4 }).bytes);
  assert.ok(text(files, "word/footer1.xml").includes(on.caption));
  assert.ok(!text(files, "word/footer1.xml").includes(token), "the token is in the image only");
});

test("an identity from a real response builds a file the strict reader takes", () => {
  const res = response({ token: null, enabled: false });
  res.fields = { display_name_ar: "مكتب <العدل> & شركاه", display_name_en: "", address: "الرياض", phone: "0500000000", email: "a@b.sa", website: "", accent_color: "#C8A762" };
  const built = buildLetterheadDocx({ blocks: BLOCKS, identity: buildLetterheadIdentity(res, "https://nezamy.sa"), logoPng: PNG4, qrPng: PNG4 });
  assertPackageOpens(built.bytes);
});
