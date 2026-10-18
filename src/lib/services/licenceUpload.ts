/**
 * The checks on a lawyer's licence image (owner answer ٢١٩, ruling P12).
 *
 * POST /api/v1/lawyer/licence-image runs these before anything reaches
 * Storage, and the profile edit page runs the size/type half before it sends
 * anything, so the lawyer sees the refusal without a round trip.
 *
 * Pure, with no imports, so `node --test` can load it through a relative
 * `.ts` import (see licenceUpload.test.ts).
 */

/** 5 MB — the route answers 413 above this. */
export const LICENCE_MAX_BYTES = 5 * 1024 * 1024;

type LicenceMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/** The declared type of the upload must be one of these, spelled exactly. */
export const LICENCE_MIME_TYPES: readonly LicenceMime[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** For `<input type="file" accept>`. */
export const LICENCE_ACCEPT = LICENCE_MIME_TYPES.join(",");

const EXT: Record<LicenceMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const LICENCE_ERRORS = {
  empty: "الملف فارغ. اختر صورة الترخيص من جديد.",
  tooLarge: "حجم الملف أكبر من ٥ ميغابايت. صغّر الصورة ثم أعد المحاولة.",
  badType: "نوع الملف غير مقبول. المقبول: صورة JPG أو PNG أو WEBP، أو ملف PDF.",
  mismatch: "محتوى الملف لا يطابق نوعه. ارفع الصورة أو ملف PDF الأصلي دون تغيير امتداده.",
} as const;

export type LicenceCheck =
  | { ok: true; contentType: LicenceMime; ext: string }
  | { ok: false; error: string; status: 400 | 413 };

function startsWith(head: Uint8Array, bytes: readonly number[], offset = 0): boolean {
  if (head.length < offset + bytes.length) return false;
  return bytes.every((b, i) => head[offset + i] === b);
}

/** What the first bytes say the file is, or null when they match none of the four. */
function sniff(head: Uint8Array): LicenceMime | null {
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  // RIFF at 0 and WEBP at 8 — RIFF alone is also WAV/AVI.
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

/**
 * `head` is the first bytes of the file (at least 12 — WEBP's mark sits at
 * offset 8). Order: empty → 400, over 5 MB → 413, a declared type outside the
 * four → 400, bytes that say something else → 400.
 *
 * On success `contentType` is what Storage records and `ext` is the extension
 * the stored name ends in — both from the checked type, never from the name.
 */
export function validateLicenceUpload(input: { size: number; type: string; head: Uint8Array }): LicenceCheck {
  const { size, type, head } = input;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: LICENCE_ERRORS.empty, status: 400 };
  if (size > LICENCE_MAX_BYTES) return { ok: false, error: LICENCE_ERRORS.tooLarge, status: 413 };
  if (!(LICENCE_MIME_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: LICENCE_ERRORS.badType, status: 400 };
  }
  const declared = type as LicenceMime;
  if (sniff(head) !== declared) return { ok: false, error: LICENCE_ERRORS.mismatch, status: 400 };
  return { ok: true, contentType: declared, ext: EXT[declared] };
}

const MAX_STEM = 60;

/**
 * The stem of the uploaded file's name, safe for a Storage path segment:
 * the last path segment only, its extension dropped (the route appends the
 * checked type's), spaces → "-", then only [A-Za-z0-9._-] kept, runs of dots
 * collapsed, leading/trailing dots, dashes and underscores trimmed, capped at
 * 60 characters. A name with no Latin letter or digit left (an Arabic-only
 * name) becomes «licence».
 */
export function safeLicenceName(name: string): string {
  const last = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const dot = last.lastIndexOf(".");
  const stem = dot >= 0 ? last.slice(0, dot) : last;
  const trim = (s: string) => s.replace(/^[._-]+/, "").replace(/[._-]+$/, "");
  let out = trim(
    stem
      .replace(/\s+/g, "-")
      .replace(/[^A-Za-z0-9._-]/g, "")
      .replace(/\.{2,}/g, "."),
  );
  if (out.length > MAX_STEM) out = trim(out.slice(0, MAX_STEM));
  return /[A-Za-z0-9]/.test(out) ? out : "licence";
}
