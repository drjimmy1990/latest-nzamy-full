/**
 * brandingAssets.ts — the office's own ready-made stationery in its vault
 * (owner note 09 §٢-أ, package 2026-10-30, NOTE-09-C01 / LIVE-F08): the
 * official Word letterhead template, a full-page PDF letterhead, the stamp and
 * the signature. Pure rules — which kinds exist, which bytes each accepts,
 * where the object lives — mirrored by
 * supabase/migrations/20261030_10_branding_assets.sql (its CHECKs, trigger
 * and bucket); brandingAssets.test.ts pins both sides.
 *
 * WHAT IT IS: a private store. The office uploads, replaces, downloads and
 * deletes its files here; nothing more is promised. The platform does NOT yet
 * merge a document into the uploaded .docx or print over the PDF background,
 * and the stamp / signature are not yet placed on any output — the screen says
 * so (BrandingAssetsPanel), and the 2026-10-30 ledger lists that wiring as
 * open.
 *
 * WHERE: the private `branding-files` bucket, a SEPARATE bucket from the
 * logo's `branding` (whose 1 MB image-only shape _verify.sql pins), under the
 * same owner folders:  u/<lawyer uid>/asset-<kind>-<random>.<ext>
 *                 or   f/<firm id>/asset-<kind>-<random>.<ext>
 * — exactly three segments, so the folder is the vault owner's and nothing
 * else (the account purge clears u/<uid>/ in both buckets).
 *
 * No React, no Supabase, no clock — `node --test` runs it directly.
 */
import type { BrandingScope } from "./brandingVault.ts";

export const BRANDING_FILES_BUCKET = "branding-files";

export type BrandingAssetKind = "letterhead_docx" | "letterhead_pdf" | "stamp" | "signature";
export const BRANDING_ASSET_KINDS: readonly BrandingAssetKind[] = ["letterhead_docx", "letterhead_pdf", "stamp", "signature"];

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export type BrandingAssetMime = typeof DOCX_MIME | "application/pdf" | "image/png" | "image/webp";
export type BrandingAssetExt = "docx" | "pdf" | "png" | "webp";

/** 5 MB for the documents (the licence upload's cap — nginx already allows 6m); 1 MB for the images. */
export const BRANDING_DOC_MAX_BYTES = 5 * 1024 * 1024;
export const BRANDING_IMAGE_MAX_BYTES = 1024 * 1024;
/** Room for the multipart envelope over the file itself (Content-Length guard). */
export const BRANDING_MULTIPART_ALLOWANCE = 64 * 1024;

export interface BrandingAssetSpec {
  label: string;
  hint: string;
  accept: string;
  maxBytes: number;
  maxLabel: string;
}

export const BRANDING_ASSET_SPEC: Record<BrandingAssetKind, BrandingAssetSpec> = {
  letterhead_docx: {
    label: "قالب الورق المروّس (Word)",
    hint: "ملف ‎.docx الرسمي للمكتب بترويسته وتذييله. لا تُقبل الملفات ذات وحدات الماكرو (.docm).",
    accept: ".docx," + DOCX_MIME,
    maxBytes: BRANDING_DOC_MAX_BYTES,
    maxLabel: "٥ ميجابايت",
  },
  letterhead_pdf: {
    label: "الورق المروّس الكامل (PDF بمقاس A4)",
    hint: "تصميم المطبوعات الجاهز كملف PDF.",
    accept: ".pdf,application/pdf",
    maxBytes: BRANDING_DOC_MAX_BYTES,
    maxLabel: "٥ ميجابايت",
  },
  stamp: {
    label: "ختم المكتب",
    hint: "صورة PNG أو WebP، ويُفضَّل أن تكون بخلفية شفافة.",
    accept: "image/png,image/webp",
    maxBytes: BRANDING_IMAGE_MAX_BYTES,
    maxLabel: "١ ميجابايت",
  },
  signature: {
    label: "التوقيع",
    hint: "صورة PNG أو WebP، ويُفضَّل أن تكون بخلفية شفافة.",
    accept: "image/png,image/webp",
    maxBytes: BRANDING_IMAGE_MAX_BYTES,
    maxLabel: "١ ميجابايت",
  },
};

export function parseBrandingAssetKind(value: unknown): BrandingAssetKind | null {
  return typeof value === "string" && (BRANDING_ASSET_KINDS as readonly string[]).includes(value) ? (value as BrandingAssetKind) : null;
}

function startsWith(b: Uint8Array, sig: number[]): boolean {
  if (b.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[i] !== sig[i]) return false;
  return true;
}

/** Does `needle` (ASCII) occur anywhere in the bytes? Zip entry names are stored uncompressed. */
function containsAscii(b: Uint8Array, needle: string): boolean {
  const n = Array.from(needle, (c) => c.charCodeAt(0));
  outer: for (let i = 0; i + n.length <= b.length; i++) {
    for (let j = 0; j < n.length; j++) if (b[i + j] !== n[j]) continue outer;
    return true;
  }
  return false;
}

export type SniffedAsset =
  | { ok: true; mime: BrandingAssetMime; ext: BrandingAssetExt }
  | { ok: false; error: string };

/**
 * The file's type from its BYTES — never its name or the Content-Type the
 * browser sends. A .docx is a zip (PK\x03\x04) holding `word/document.xml` and
 * `[Content_Types].xml`; one carrying `vbaProject.bin` (macros) is refused. A
 * PDF starts with `%PDF-`. Stamp and signature: PNG or WebP only (JPEG has no
 * transparency; SVG is a document that can carry script).
 */
export function sniffBrandingAsset(kind: BrandingAssetKind, bytes: Uint8Array): SniffedAsset {
  if (kind === "letterhead_docx") {
    if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || !containsAscii(bytes, "word/document.xml") || !containsAscii(bytes, "[Content_Types].xml")) {
      return { ok: false, error: "قالب Word يجب أن يكون ملف ‎.docx صالحاً" };
    }
    if (containsAscii(bytes, "vbaProject.bin")) {
      return { ok: false, error: "لا يُقبل ملف Word يحتوي وحدات ماكرو" };
    }
    return { ok: true, mime: DOCX_MIME, ext: "docx" };
  }
  if (kind === "letterhead_pdf") {
    if (!startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ok: false, error: "الملف يجب أن يكون PDF" };
    return { ok: true, mime: "application/pdf", ext: "pdf" };
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ok: true, mime: "image/png", ext: "png" };
  if (bytes.length >= 12 && startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
      && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return { ok: true, mime: "image/webp", ext: "webp" };
  }
  return { ok: false, error: "الصورة يجب أن تكون PNG أو WebP (لا يُقبل JPEG ولا SVG)" };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KIND_SLUG: Record<BrandingAssetKind, string> = {
  letterhead_docx: "letterhead-docx",
  letterhead_pdf: "letterhead-pdf",
  stamp: "stamp",
  signature: "signature",
};

/** `u/<uid>/asset-<kind>-<random>.<ext>` or `f/<firm id>/…` — what 20261030_10's CHECK and trigger accept. */
export function brandingAssetPath(scope: BrandingScope, ownerId: string, kind: BrandingAssetKind, random: string, ext: BrandingAssetExt): string {
  const id = ownerId.toLowerCase();
  if (!UUID.test(id)) throw new Error("brandingAssetPath: owner id is not a uuid");
  if (!/^[a-z0-9]{8,40}$/.test(random)) throw new Error("brandingAssetPath: random part must be 8–40 of [a-z0-9]");
  return `${scope === "lawyer" ? "u" : "f"}/${id}/asset-${KIND_SLUG[kind]}-${random}.${ext}`;
}

/** True when `path` is an asset of this very vault and kind (never a logo, never another folder). */
export function isOwnAssetPath(path: string | null | undefined, scope: BrandingScope, ownerId: string, kind: BrandingAssetKind): boolean {
  if (!path) return false;
  const m = /^([uf])\/([0-9a-f-]{36})\/asset-(letterhead-docx|letterhead-pdf|stamp|signature)-[a-z0-9]{8,40}\.(docx|pdf|png|webp)$/.exec(path);
  return !!m && m[1] === (scope === "lawyer" ? "u" : "f") && m[2] === ownerId.toLowerCase() && m[3] === KIND_SLUG[kind];
}

/**
 * The name the office gave the file, kept for the download: no folders, no
 * control or bidi characters, at most 120 characters, the right extension.
 */
export function safeAssetFileName(name: string | null | undefined, ext: BrandingAssetExt): string {
  const base = String(name ?? "")
    .split(/[\\/]/).pop()!
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f‎‏‪-‮⁦-⁩"<>|:*?]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.[A-Za-z0-9]{1,6}$/, "");
  const stem = (base || "file").slice(0, 120 - ext.length - 1).trim() || "file";
  return `${stem}.${ext}`;
}

/** PostgREST / Postgres codes for "branding_assets is not there yet" (20261030_10 not run). */
export function isMissingBrandingAssetsTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /branding_assets/.test(error.message ?? "") && /does not exist|schema cache/i.test(error.message ?? "");
}

export const BRANDING_ASSETS_NEEDS_MIGRATION_AR =
  "يتطلب تحديث قاعدة البيانات — رفع مطبوعات المكتب غير مفعّل بعد على هذا الخادم.";
