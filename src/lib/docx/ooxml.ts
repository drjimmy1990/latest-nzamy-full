/**
 * ooxml.ts — q345: a real .docx, written by hand and zipped with fflate. No
 * docx library, no numbering part, no external template: a package small enough
 * to check part by part (packageCheck.testkit.ts is the check).
 *
 * Every string a user or the AI wrote goes through xmlEscape, once, here. Word
 * refuses a whole file for one stray `&`, and it is strict about the order of
 * children: rPr is rFonts, b, bCs, sz, szCs, rtl (not rtl first).
 */
import { zipSync, strToU8 } from "fflate";
import { DOCX_MIME } from "../branding/brandingAssets.ts";

export { DOCX_MIME };

export type DocBlock =
  | { kind: "title"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "para"; text: string }
  | { kind: "list"; items: string[]; ordered: boolean }
  | { kind: "signature"; lines: string[] };

export const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
export const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
export const PACKAGE_RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_TYPE = `${R_NS}`;
const ML = "application/vnd.openxmlformats-officedocument.wordprocessingml";
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const BODY_SIZE = 28;
const TITLE_SIZE = 36;
const HEADING_SIZE = 30;

/**
 * The five characters, and whatever XML 1.0 forbids outright: C0 controls,
 * U+FFFE, U+FFFF, and a lone surrogate (the `u` flag makes the class match only
 * unpaired ones, so a real emoji stays). Direction marks are legal and kept.
 */
export function xmlEscape(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g, "")
    .replace(/[\uD800-\uDFFF]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function runProps(size: number, bold = false, ltr = false): string {
  const weight = bold ? "<w:b/><w:bCs/>" : "";
  const direction = ltr ? "" : "<w:rtl/>";
  return `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/>${weight}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>${direction}</w:rPr>`;
}

/** One run. A newline in the text is a line break inside the run. */
export function runXml(text: string, size: number, bold = false, ltr = false): string {
  const lines = text.split(/\r\n|\r|\n/).map((line) => `<w:t xml:space="preserve">${xmlEscape(line)}</w:t>`);
  return `<w:r>${runProps(size, bold, ltr)}${lines.join("<w:br/>")}</w:r>`;
}

function paragraph(text: string, size: number, bold: boolean, jc: "both" | "center"): string {
  return `<w:p><w:pPr><w:bidi/><w:jc w:val="${jc}"/></w:pPr>${runXml(text, size, bold)}</w:p>`;
}

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const arabicNumber = (n: number) => String(n).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);

export function blocksToBodyXml(blocks: DocBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.kind) {
        case "title":
          return paragraph(block.text, TITLE_SIZE, true, "center");
        case "heading":
          return paragraph(block.text, HEADING_SIZE, true, "both");
        case "para":
          return paragraph(block.text, BODY_SIZE, false, "both");
        case "list":
          return block.items
            .map((item, i) => paragraph(`${block.ordered ? `${arabicNumber(i + 1)}. ` : "• "}${item}`, BODY_SIZE, false, "both"))
            .join("");
        case "signature":
          return block.lines.map((line) => paragraph(line, BODY_SIZE, false, "both")).join("");
      }
    })
    .join("");
}

const STYLES_XML =
  `${XML_DECL}<w:styles xmlns:w="${W_NS}"><w:docDefaults>` +
  `<w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/><w:sz w:val="${BODY_SIZE}"/><w:szCs w:val="${BODY_SIZE}"/><w:lang w:val="ar-SA" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>` +
  `<w:pPrDefault><w:pPr><w:bidi/><w:spacing w:after="120" w:line="312" w:lineRule="auto"/></w:pPr></w:pPrDefault>` +
  `</w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:bidi/></w:pPr></w:style></w:styles>`;

export interface MinimalDocxOptions {
  headerXml?: string;
  footerXml?: string;
  /** Written to word/_rels/header1.xml.rels: an r:embed in a header resolves against the header's own rels. */
  headerRels?: string;
  footerRels?: string;
  media?: { name: string; bytes: Uint8Array }[];
}

export function minimalDocx(bodyXml: string, opts: MinimalDocxOptions = {}): Uint8Array {
  const { headerXml, footerXml, headerRels, footerRels, media = [] } = opts;

  const imageTypes = [...new Set(media.map((m) => m.name.slice(m.name.lastIndexOf(".") + 1).toLowerCase()))]
    .map((ext) => `<Default Extension="${ext}" ContentType="image/${ext === "jpg" ? "jpeg" : ext}"/>`)
    .join("");
  const contentTypes =
    `${XML_DECL}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>${imageTypes}` +
    `<Override PartName="/word/document.xml" ContentType="${ML}.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="${ML}.styles+xml"/>` +
    (headerXml ? `<Override PartName="/word/header1.xml" ContentType="${ML}.header+xml"/>` : "") +
    (footerXml ? `<Override PartName="/word/footer1.xml" ContentType="${ML}.footer+xml"/>` : "") +
    `</Types>`;

  const rootRels =
    `${XML_DECL}<Relationships xmlns="${PACKAGE_RELS_NS}">` +
    `<Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="word/document.xml"/></Relationships>`;

  const documentRels =
    `${XML_DECL}<Relationships xmlns="${PACKAGE_RELS_NS}">` +
    `<Relationship Id="rId1" Type="${REL_TYPE}/styles" Target="styles.xml"/>` +
    (headerXml ? `<Relationship Id="rId2" Type="${REL_TYPE}/header" Target="header1.xml"/>` : "") +
    (footerXml ? `<Relationship Id="rId3" Type="${REL_TYPE}/footer" Target="footer1.xml"/>` : "") +
    `</Relationships>`;

  const sectPr =
    `<w:sectPr>` +
    (headerXml ? `<w:headerReference w:type="default" r:id="rId2"/>` : "") +
    (footerXml ? `<w:footerReference w:type="default" r:id="rId3"/>` : "") +
    `<w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>` +
    `</w:sectPr>`;

  const documentXml =
    `${XML_DECL}<w:document xmlns:w="${W_NS}" xmlns:r="${R_NS}"><w:body>${bodyXml}${sectPr}</w:body></w:document>`;

  // [Content_Types].xml first: some readers sniff the package from the first entry.
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(contentTypes),
    "_rels/.rels": strToU8(rootRels),
    "word/document.xml": strToU8(documentXml),
    "word/_rels/document.xml.rels": strToU8(documentRels),
    "word/styles.xml": strToU8(STYLES_XML),
  };
  if (headerXml) files["word/header1.xml"] = strToU8(headerXml);
  if (footerXml) files["word/footer1.xml"] = strToU8(footerXml);
  if (headerXml && headerRels) files["word/_rels/header1.xml.rels"] = strToU8(headerRels);
  if (footerXml && footerRels) files["word/_rels/footer1.xml.rels"] = strToU8(footerRels);
  for (const m of media) files[`word/media/${m.name}`] = m.bytes;
  return zipSync(files);
}
