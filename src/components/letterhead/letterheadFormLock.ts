/**
 * letterheadFormLock.ts — when the identity form may be typed into (CODE-F37,
 * package 2026-10-30).
 *
 * THE BUG: the fields stayed editable while «حفظ الهوية» was in flight, and the
 * server's reply then REPLACED the fields with what had been sent — so a word
 * typed during the save was silently wiped. The fix chosen of the two the
 * package allows: every identity input (text, colour, the «ذهبي المنصة» reset,
 * logo and file buttons) is disabled while a save is in flight. Nothing can be
 * typed between the request and the reply, so adopting the server's
 * normalised fields (trimmed, https:// added, colour upper-cased) on success
 * can no longer overwrite a newer edit.
 *
 * Also locked: before 20261026_63 runs (`available: false`) and for a caller
 * without the explicit `branding.manage` permission (owner ٣١٥).
 */

export type LetterheadSaveKind = "idle" | "saving" | "saved" | "error";

export function identityInputsLocked(input: { available: boolean; canManage: boolean; saveKind: LetterheadSaveKind }): boolean {
  return !input.available || !input.canManage || input.saveKind === "saving";
}
