/**
 * Which uploaded files an AI job can read: PDF (text or scanned) and images —
 * the same list as the server's AI_FILE_MIMES (aiFiles.ts). The vault also
 * takes Word files, which the team orders read but Gemini does not open; a
 * screen sends only the readable ones and names the rest, instead of letting
 * a 250-point run fail on `file_type`.
 *
 * `textFiles` is the screen's AI_TEXT_FILES_ON (aiTextFilesFlag.ts): then .docx,
 * .txt and .md are readable as well, because the server extracts their text. A
 * legacy .doc never is. Every default is off, which is today's behaviour.
 *
 * Pure, and safe in a client bundle: `node --test` runs it. It must never import
 * aiFiles.ts, which pulls in pdf-lib and node:crypto; the test pins the wording
 * below to FILE_COPY.doc instead. pageCount.ts has no imports at all.
 */
import { measurePaste } from "../../lib/ai/pageCount.ts";

export function aiReadableAccept(textFiles = false): string {
  return `.pdf,.png,.jpg,.jpeg,.webp${textFiles ? ",.docx,.txt,.md" : ""}`;
}
export const AI_READABLE_ACCEPT = aiReadableAccept(false);

const READABLE = /\.(pdf|png|jpe?g|webp)$/i;
const READABLE_WITH_TEXT = /\.(pdf|png|jpe?g|webp|docx|txt|md)$/i;

export function isAiReadable(name: string, textFiles = false): boolean {
  return (textFiles ? READABLE_WITH_TEXT : READABLE).test(name.trim());
}

/** The ids to send as fileIds, and the names left out. */
export function splitAiReadable<T extends { documentId: string; name: string }>(
  files: readonly T[],
  textFiles = false,
): { ids: string[]; skipped: string[] } {
  const ids: string[] = [];
  const skipped: string[] = [];
  for (const f of files) (isAiReadable(f.name, textFiles) ? ids.push(f.documentId) : skipped.push(f.name));
  return { ids, skipped };
}

/** A wizard's own picker list, plus the plain-text kinds when the flag is on. */
export function withTextAccept(accept: string, textFiles = false): string {
  return textFiles ? `${accept},.txt,.md` : accept;
}

/** The same sentence as the server's FILE_COPY.doc. */
export const AI_DOC_FILE_COPY = "ملف Word القديم (.doc) لا يُقرأ — احفظه بصيغة .docx أو PDF ثم أرفقه";

/** What a screen says about the files it leaves out once only a .doc can be left out. */
export function aiSkippedNote(skipped: readonly string[]): string {
  return `${AI_DOC_FILE_COPY}. لن تُرسل: ${skipped.join("، ")}`;
}

/**
 * A paste box's state, by the server's own function (pageCount.measurePaste,
 * which tools.ts pastedText calls): `chars` is the counted length — no
 * tashkeel, no tatweel, one space a run of whitespace (owner ٤٣٩).
 */
export function pasteState(text: string, rules: { min: number; max: number }) {
  const { chars, empty, tooShort, tooLong } = measurePaste(text, rules);
  return { chars, empty, tooShort, tooLong, ok: !empty && !tooShort && !tooLong };
}
