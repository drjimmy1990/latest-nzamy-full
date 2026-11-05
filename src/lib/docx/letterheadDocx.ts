/**
 * letterheadDocx.ts — q345: the letterhead in the .docx. With a Word template
 * the office uploaded, its header, footer, styles and fonts all stay untouched;
 * only the body changes. Without one, a generated header and footer.
 *
 * A merge is two slices of document.xml, never a String.replace: user text is
 * full of `$`. A template the merge refuses falls back to the generated header
 * with a note. A macro template is never merged.
 *
 * A merged file carries the office's own header and footer only, so it has no
 * QR unless the office put one in its own template.
 */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { BRANDING_DEFAULT_ACCENT } from "../branding/brandingVault.ts";
import { PLATFORM_STAMP_AR, type LetterheadIdentity } from "../branding/letterheadIdentity.ts";
import { blocksToBodyXml, minimalDocx, PACKAGE_RELS_NS, R_NS, runXml, W_NS, xmlEscape, type DocBlock } from "./ooxml.ts";

export const TEMPLATE_FALLBACK_NOTE = "تعذّر استخدام قالب Word المرفوع؛ استُخدمت ترويسة المنصة";

const EMU_PER_CM = 360_000;
const LOGO_HEIGHT = Math.round(2.5 * EMU_PER_CM);
const LOGO_MAX_WIDTH = 6 * EMU_PER_CM;
const QR_SIDE = Math.round(2.2 * EMU_PER_CM);
const IMAGE_REL = `${R_NS}/image`;
const LOGO_REL_ID = "rIdLogo";
const QR_REL_ID = "rIdQr";

const WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PIC_NS = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const PART_NS = `xmlns:w="${W_NS}" xmlns:r="${R_NS}" xmlns:wp="${WP_NS}" xmlns:a="${A_NS}" xmlns:pic="${PIC_NS}"`;
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export type MergeResult = { ok: true; bytes: Uint8Array } | { ok: false; reason: "not_docx" | "no_body" | "macro" };

/**
 * Where the body's own final section starts, or null. A paragraph's section
 * break and the sectPr nested in a tracked <w:sectPrChange> are not it: the
 * section must close at the depth of the body and be its last child.
 */
function finalSectionStart(xml: string, bodyEnd: number): number | null {
  const tag = /<w:sectPr(?=[\s/>])[^>]*?(\/?)>|<\/w:sectPr>/g;
  const open: number[] = [];
  let start: number | null = null;
  let end = -1;
  for (let m = tag.exec(xml); m && m.index < bodyEnd; m = tag.exec(xml)) {
    if (m[0] === "</w:sectPr>") {
      const from = open.pop();
      if (from === undefined) return null;
      if (open.length === 0) {
        start = from;
        end = m.index + m[0].length;
      }
    } else if (m[1]) {
      if (open.length === 0) {
        start = m.index;
        end = m.index + m[0].length;
      }
    } else {
      open.push(m.index);
    }
  }
  if (start === null || open.length > 0) return null;
  return xml.slice(end, bodyEnd).trim() === "" ? start : null;
}

export function mergeIntoTemplate(templateBytes: Uint8Array, bodyXml: string): MergeResult {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(templateBytes);
  } catch {
    return { ok: false, reason: "not_docx" };
  }
  const documentBytes = files["word/document.xml"];
  if (!documentBytes) return { ok: false, reason: "not_docx" };

  const contentTypes = files["[Content_Types].xml"] ? strFromU8(files["[Content_Types].xml"]) : "";
  if (/macroEnabled/i.test(contentTypes) || "word/vbaProject.bin" in files) return { ok: false, reason: "macro" };

  const xml = strFromU8(documentBytes);
  const bodyOpen = /<w:body(?=[\s>])[^>]*>/.exec(xml);
  const bodyEnd = xml.lastIndexOf("</w:body>");
  if (!bodyOpen || bodyOpen[0].endsWith("/>") || bodyEnd === -1) return { ok: false, reason: "no_body" };
  const bodyStart = bodyOpen.index + bodyOpen[0].length;
  const section = finalSectionStart(xml, bodyEnd);
  if (section === null || section < bodyStart) return { ok: false, reason: "no_body" };

  files["word/document.xml"] = strToU8(xml.slice(0, bodyStart) + bodyXml + xml.slice(section));
  return { ok: true, bytes: zipSync(files) };
}

/** Width and height from a PNG's IHDR, or null when these are not PNG bytes. */
export function pngPixelSize(bytes: Uint8Array): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function logoExtent(size: { width: number; height: number } | null): { cx: number; cy: number } {
  if (!size) return { cx: LOGO_HEIGHT, cy: LOGO_HEIGHT };
  const ratio = size.width / size.height;
  const cx = Math.round(LOGO_HEIGHT * ratio);
  if (cx <= LOGO_MAX_WIDTH) return { cx, cy: LOGO_HEIGHT };
  return { cx: LOGO_MAX_WIDTH, cy: Math.round(LOGO_MAX_WIDTH / ratio) };
}

/** docPr ids must be unique across the whole package: 1 is the logo, 2 the QR. */
function inlineImage(relId: string, docPrId: number, name: string, cx: number, cy: number): string {
  return (
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${docPrId}" name="${name}"/>` +
    `<a:graphic><a:graphicData uri="${PIC_NS}"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${xmlEscape(relId)}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  );
}

/** The accent reaches an XML attribute, so only a plain hex colour gets through. */
function accentHex(accent: string): string {
  const hex = accent.replace(/^#/, "");
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex : BRANDING_DEFAULT_ACCENT.replace(/^#/, "");
}

const centred = (inner: string, border = "") => `<w:p><w:pPr>${border}<w:bidi/><w:jc w:val="center"/></w:pPr>${inner}</w:p>`;

export function generatedHeaderXml(
  identity: LetterheadIdentity,
  logoRelId: string | null,
  logoSize: { width: number; height: number } | null = null,
): string {
  const rule = `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="${accentHex(identity.accent)}"/></w:pBdr>`;
  const paragraphs: string[] = [];
  if (logoRelId) {
    const { cx, cy } = logoExtent(logoSize);
    paragraphs.push(centred(inlineImage(logoRelId, 1, "Logo", cx, cy)));
  }
  if (identity.nameAr) paragraphs.push(centred(runXml(identity.nameAr, 32, true)));
  if (identity.nameEn) paragraphs.push(centred(runXml(identity.nameEn, identity.nameAr ? 22 : 32, !identity.nameAr, true)));
  if (identity.licenceLine) paragraphs.push(centred(runXml(identity.licenceLine, 20)));
  const contacts = identity.contacts.map((c) => runXml(c.text, 18, false, c.ltr));
  const separator = runXml(" · ", 18);
  paragraphs.push(centred(contacts.join(separator), rule));
  return `${XML_DECL}<w:hdr ${PART_NS}>${paragraphs.join("")}</w:hdr>`;
}

export function generatedFooterXml(stampText: string, qrRelId: string | null, caption: string): string {
  const paragraphs: string[] = [];
  if (qrRelId) paragraphs.push(centred(inlineImage(qrRelId, 2, "QR", QR_SIDE, QR_SIDE)));
  if (caption) paragraphs.push(centred(runXml(caption, 16)));
  paragraphs.push(centred(runXml(stampText, 16)));
  return `${XML_DECL}<w:ftr ${PART_NS}>${paragraphs.join("")}</w:ftr>`;
}

const imageRels = (id: string, target: string) =>
  `${XML_DECL}<Relationships xmlns="${PACKAGE_RELS_NS}"><Relationship Id="${id}" Type="${IMAGE_REL}" Target="${target}"/></Relationships>`;

/**
 * What the QR image encodes: identity.qr, whose choice qrTargetFor already made
 * under the privacy switch. The export never builds this address another way.
 */
export function letterheadQrPayload(identity: Pick<LetterheadIdentity, "qr">): string {
  return identity.qr.url;
}

export interface BuildLetterheadInput {
  blocks: DocBlock[];
  identity: LetterheadIdentity;
  template?: Uint8Array | null;
  logoPng?: Uint8Array | null;
  qrPng?: Uint8Array | null;
}

export function buildLetterheadDocx(input: BuildLetterheadInput): { bytes: Uint8Array; usedTemplate: boolean; note: string | null } {
  const { blocks, identity, template, logoPng, qrPng } = input;
  const bodyXml = blocksToBodyXml(blocks);

  let note: string | null = null;
  if (template) {
    const merged = mergeIntoTemplate(template, bodyXml);
    if (merged.ok) return { bytes: merged.bytes, usedTemplate: true, note: null };
    note = TEMPLATE_FALLBACK_NOTE;
  }

  const media: { name: string; bytes: Uint8Array }[] = [];
  if (logoPng) media.push({ name: "logo.png", bytes: logoPng });
  if (qrPng) media.push({ name: "qr.png", bytes: qrPng });
  const bytes = minimalDocx(bodyXml, {
    headerXml: generatedHeaderXml(identity, logoPng ? LOGO_REL_ID : null, logoPng ? pngPixelSize(logoPng) : null),
    footerXml: generatedFooterXml(PLATFORM_STAMP_AR, qrPng ? QR_REL_ID : null, qrPng ? identity.qr.caption : ""),
    headerRels: logoPng ? imageRels(LOGO_REL_ID, "media/logo.png") : undefined,
    footerRels: qrPng ? imageRels(QR_REL_ID, "media/qr.png") : undefined,
    media,
  });
  return { bytes, usedTemplate: false, note };
}
