/**
 * exportFile.ts — q345: the decision behind GET /api/v1/branding/export-file, the
 * same-origin bytes of the logo and the Word template. Nothing is downloaded
 * until the print read has answered, and only a path it vouched for. A logo that
 * is not an image is not served, whatever is stored. Reads no document text.
 */
import { BRANDING_FILES_BUCKET, DOCX_MIME } from "../branding/brandingAssets.ts";
import { BRANDING_BUCKET, isMissingBrandingTable, isOwnLogoPath, sniffLogoImage } from "../branding/brandingVault.ts";
import type { BrandingOwner } from "../branding/brandingServer.ts";
import type { VaultForPrint } from "../branding/vaultForPrint.ts";

export type ExportFileKind = "logo" | "letterhead_docx";

export function parseExportKind(value: string | null): ExportFileKind | null {
  return value === "logo" || value === "letterhead_docx" ? value : null;
}

export type ExportFileAnswer =
  | { status: 200; bytes: Uint8Array; contentType: string; filename: string }
  | { status: 403 | 404 | 415 | 500 | 503; error: string };

export interface ExportFileDeps {
  read: () => Promise<VaultForPrint>;
  download: (bucket: string, path: string) => Promise<Uint8Array | null>;
}

const NOT_FOUND: ExportFileAnswer = { status: 404, error: "الملف غير موجود" };

export async function exportFileAnswer(owner: BrandingOwner, kind: ExportFileKind, deps: ExportFileDeps): Promise<ExportFileAnswer> {
  const vault = await deps.read();
  if (vault.denied) return { status: 403, error: "لا تملك صلاحية طباعة هذا الورق المروّس" };
  if (vault.error) {
    return isMissingBrandingTable(vault.error)
      ? { status: 503, error: "يتطلب تحديث قاعدة البيانات" }
      : { status: 500, error: "تعذّر قراءة خزنة الهوية" };
  }

  if (kind === "letterhead_docx") {
    if (!vault.docxPath) return NOT_FOUND;
    const bytes = await deps.download(BRANDING_FILES_BUCKET, vault.docxPath);
    if (!bytes) return NOT_FOUND;
    return { status: 200, bytes, contentType: DOCX_MIME, filename: "letterhead.docx" };
  }

  const logoPath = vault.row?.logo_path;
  if (!logoPath || !isOwnLogoPath(logoPath, owner.scope, owner.ownerId)) return NOT_FOUND;
  const bytes = await deps.download(BRANDING_BUCKET, logoPath);
  if (!bytes) return NOT_FOUND;
  const image = sniffLogoImage(bytes);
  if (!image) return { status: 415, error: "الملف المخزَّن ليس صورة" };
  return { status: 200, bytes, contentType: image.mime, filename: `logo.${image.ext}` };
}
