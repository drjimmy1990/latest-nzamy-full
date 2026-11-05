/**
 * exportKit.ts — q345: builds and downloads the .docx, in the browser. Loaded on
 * the click (it carries fflate and qrcode). The logo and the template come
 * through GET /api/v1/branding/export-file, which applies the print gate.
 *
 * The document text stays in this tab: it goes into the file, and nowhere else.
 */
import type { BrandingScope } from "@/lib/branding/brandingVault";
import type { LetterheadIdentity } from "@/lib/branding/letterheadIdentity";
import { buildLetterheadDocx, letterheadQrPayload } from "@/lib/docx/letterheadDocx";
import { DOCX_MIME, type DocBlock } from "@/lib/docx/ooxml";
import type { ExportFileKind } from "@/lib/docx/exportFile";

export const DOCX_EXPORT_FAILED_AR = "تعذّر إنشاء ملف Word — انسخ النص";

const LOGO_MAX_SIDE = 1600;
const QR_PIXELS = 400;

async function fileBytes(scope: BrandingScope, kind: ExportFileKind): Promise<Blob> {
  const res = await fetch(`/api/v1/branding/export-file?scope=${scope}&kind=${kind}`, { cache: "no-store" });
  if (!res.ok) throw new Error(kind);
  return res.blob();
}

/** Whatever the office uploaded (png, jpg, webp) → PNG bytes, the only type the .docx carries. */
async function logoToPng(logo: Blob): Promise<Uint8Array> {
  const url = URL.createObjectURL(logo);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("logo"));
      image.src = url;
    });
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("logo");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("logo");
    return new Uint8Array(await png.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function qrToPng(address: string): Promise<Uint8Array> {
  const mod = await import("qrcode");
  // CommonJS: the functions arrive as named exports or under `default`.
  const toDataURL = typeof mod.toDataURL === "function" ? mod.toDataURL : mod.default.toDataURL;
  const dataUrl = await toDataURL(address, { errorCorrectionLevel: "H", width: QR_PIXELS, margin: 2 });
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export interface DownloadDocxInput {
  scope: BrandingScope;
  blocks: DocBlock[];
  identity: LetterheadIdentity;
  /** Set when the office uploaded a Word template. Only its presence is read; the bytes come through export-file. */
  docxUrl: string | null;
  filename: string;
}

/** Saves the file. The answer is the fallback note, if any. Throws DOCX_EXPORT_FAILED_AR. */
export async function downloadDocx(input: DownloadDocxInput): Promise<{ note: string | null }> {
  const { scope, blocks, identity, docxUrl, filename } = input;
  try {
    const [template, logoPng, qrPng] = await Promise.all([
      docxUrl ? fileBytes(scope, "letterhead_docx").then(async (b) => new Uint8Array(await b.arrayBuffer())) : null,
      identity.logoUrl ? fileBytes(scope, "logo").then(logoToPng) : null,
      qrToPng(letterheadQrPayload(identity)),
    ]);
    const built = buildLetterheadDocx({ blocks, identity, template, logoPng, qrPng });

    const url = URL.createObjectURL(new Blob([built.bytes as BlobPart], { type: DOCX_MIME }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.docx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { note: built.note };
  } catch {
    throw new Error(DOCX_EXPORT_FAILED_AR);
  }
}
