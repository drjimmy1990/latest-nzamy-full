/**
 * contractVersionFile.ts
 * ─────────────────────────────────────────────────────────
 * What a contract version file may be (LIVE-F40 / CODE-F39, owner package
 * 2026-10-30): the modal said «PDF أو Word» and its `accept` filtered the
 * picker, but nothing else checked — a 54-byte TXT was uploaded and became
 * the contract's current version.
 *
 * The policy, decided by the file's CONTENT, never by the name or the
 * declared MIME type a browser reports:
 *   • PDF  — starts with `%PDF-`
 *   • DOC  — the OLE2 compound-file signature D0 CF 11 E0 A1 B1 1A E1
 *   • DOCX — a ZIP (`PK\x03\x04`). That signature proves a ZIP, not a Word
 *            document; the name must also end in .docx. Opening the archive
 *            to look for `word/document.xml` is not done here.
 *   • 1 byte … 20 MB (MAX_UPLOAD_BYTES, the same limit as every other upload
 *     in the product; the bucket itself allows 100 MB).
 * The name's extension must agree with what the bytes are, so a PDF renamed
 * `.docx` is refused as well.
 *
 * Used in three places: the modal (before the lawyer can press «رفع»), the
 * service (before any byte reaches Storage) and the registration route (on
 * the bytes Storage actually holds — the check a direct API call cannot skip).
 *
 * Pure, no imports, so `node --test` loads it directly.
 */

export const CONTRACT_VERSION_MAX_BYTES = 20 * 1024 * 1024;

/** How many leading bytes the sniff needs. */
export const CONTRACT_VERSION_HEAD_BYTES = 8;

export type ContractVersionKind = "pdf" | "doc" | "docx";

export const CONTRACT_VERSION_MIME: Record<ContractVersionKind, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** For `<input type="file" accept>` — a picker filter only, never the check. */
export const CONTRACT_VERSION_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Shown under the picker before anything is chosen. */
export const CONTRACT_VERSION_LIMIT_NOTE = "المقبول: PDF أو Word (.doc / .docx) فقط، بحد أقصى ٢٠ ميجابايت.";

export const CONTRACT_VERSION_ERRORS = {
  empty: "الملف فارغ — اختر ملفاً يحتوي على محتوى.",
  tooLarge: "حجم الملف أكبر من ٢٠ ميجابايت — الحد الأقصى لنسخة العقد ٢٠ ميجابايت.",
  badExtension: "نوع الملف غير مقبول — المقبول PDF أو Word (.doc / .docx) فقط.",
  badContent: "محتوى الملف ليس PDF ولا Word، مهما كان امتداده. ارفع ملف PDF أو Word الأصلي.",
  mismatch: "امتداد الملف لا يطابق محتواه. ارفع الملف الأصلي دون تغيير امتداده.",
} as const;

export type ContractVersionCheck =
  | { ok: true; kind: ContractVersionKind; contentType: string }
  | { ok: false; error: string; status: 400 | 413 };

function startsWith(head: Uint8Array, bytes: readonly number[]): boolean {
  if (head.length < bytes.length) return false;
  return bytes.every((b, i) => head[i] === b);
}

/** What the first bytes say the file is, or null when none of the three. */
export function sniffContractVersion(head: Uint8Array): ContractVersionKind | null {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "doc";
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return "docx"; // ZIP container
  return null;
}

/** The lower-cased extension after the last dot, "" when there is none. */
export function fileExtension(name: string): string {
  const last = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const dot = last.lastIndexOf(".");
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : "";
}

function isKind(ext: string): ext is ContractVersionKind {
  return ext === "pdf" || ext === "doc" || ext === "docx";
}

/**
 * Size and name first (both known without reading a byte), then content.
 * Order: empty → too large (413) → extension → content → extension/content
 * agreement. On success `contentType` is what Storage should record — from
 * the checked kind, never from the browser's `file.type`.
 */
export function validateContractVersionFile(input: {
  name: string;
  size: number;
  head: Uint8Array;
}): ContractVersionCheck {
  const { name, size, head } = input;
  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: CONTRACT_VERSION_ERRORS.empty, status: 400 };
  if (size > CONTRACT_VERSION_MAX_BYTES) return { ok: false, error: CONTRACT_VERSION_ERRORS.tooLarge, status: 413 };
  const ext = fileExtension(name);
  if (!isKind(ext)) return { ok: false, error: CONTRACT_VERSION_ERRORS.badExtension, status: 400 };
  const sniffed = sniffContractVersion(head);
  if (sniffed === null) return { ok: false, error: CONTRACT_VERSION_ERRORS.badContent, status: 400 };
  if (sniffed !== ext) return { ok: false, error: CONTRACT_VERSION_ERRORS.mismatch, status: 400 };
  return { ok: true, kind: sniffed, contentType: CONTRACT_VERSION_MIME[sniffed] };
}

/** The checks that need no bytes — for the modal's instant answer on pick. */
export function precheckContractVersionFile(input: { name: string; size: number }): string | null {
  if (!Number.isFinite(input.size) || input.size <= 0) return CONTRACT_VERSION_ERRORS.empty;
  if (input.size > CONTRACT_VERSION_MAX_BYTES) return CONTRACT_VERSION_ERRORS.tooLarge;
  if (!isKind(fileExtension(input.name))) return CONTRACT_VERSION_ERRORS.badExtension;
  return null;
}

/**
 * Upload → register, removing the uploaded object if registration fails, so
 * no file sits in the bucket without a version row. The steps are passed in
 * so the cleanup path is testable without Storage (contractVersionFile.test.ts).
 * The object is NOT removed when the upload itself failed — there is nothing
 * to remove — and never on success.
 */
export async function uploadThenRegister<T>(steps: {
  upload: () => Promise<void>;
  register: () => Promise<T>;
  remove: () => Promise<unknown>;
}): Promise<T> {
  await steps.upload();
  try {
    return await steps.register();
  } catch (err) {
    await steps.remove().catch(() => undefined);
    throw err;
  }
}
