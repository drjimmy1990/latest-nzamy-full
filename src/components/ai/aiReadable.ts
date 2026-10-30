/**
 * Which uploaded files an AI job can read: PDF (text or scanned) and images —
 * the same list as the server's AI_FILE_MIMES (aiFiles.ts). The vault also
 * takes Word files, which the team orders read but Gemini does not open; a
 * screen sends only the readable ones and names the rest, instead of letting
 * a 250-point run fail on `file_type`.
 *
 * Pure: `node --test` runs it.
 */
export const AI_READABLE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const READABLE = /\.(pdf|png|jpe?g|webp)$/i;

export function isAiReadable(name: string): boolean {
  return READABLE.test(name.trim());
}

/** The ids to send as fileIds, and the names left out. */
export function splitAiReadable<T extends { documentId: string; name: string }>(files: readonly T[]): { ids: string[]; skipped: string[] } {
  const ids: string[] = [];
  const skipped: string[] = [];
  for (const f of files) (isAiReadable(f.name) ? ids.push(f.documentId) : skipped.push(f.name));
  return { ids, skipped };
}
