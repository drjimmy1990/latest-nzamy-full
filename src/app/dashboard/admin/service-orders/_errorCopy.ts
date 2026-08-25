/**
 * _errorCopy.ts — map a deliver-upload failure to Arabic-only user-facing copy.
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * deliver() in page.tsx catches whatever uploadDocumentFile() throws, and that
 * can be a mix of causes:
 *   - our own literal English sentinels ("upload_unavailable_demo" for
 *     demo-mode, "Unauthorized" for a dropped session)
 *   - a raw Supabase Storage error string (quota, mime-type rejection,
 *     duplicate path — whatever Storage's SDK returns verbatim)
 *   - apiMutate's generic "API error: <status>" fallback when a route's JSON
 *     body has no `error` field
 *   - an already-Arabic error body forwarded from an API route (e.g.
 *     "غير مصرح" from POST /api/v1/documents' ownership check, or the admin
 *     PATCH handler's own Arabic error strings)
 *
 * The project requires every user-facing string to be Arabic, including API
 * error messages (see CLAUDE.md). Showing the caught Error.message verbatim
 * would leak untranslated English into the one red-banner every admin sees.
 *
 * RULE: pass an already-Arabic message through unchanged (it's a deliberate,
 * correctly-localized error body); replace anything else — recognizably
 * non-Arabic, or no message at all — with a generic Arabic fallback rather
 * than rendering raw English/technical text.
 */

const GENERIC_UPLOAD_FAILURE = "تعذّر رفع الملف. حاول مرة أخرى.";

/**
 * True if `s` contains at least one Arabic-script code point (Unicode block
 * U+0600–U+06FF). Checked via numeric code-point comparison rather than a
 * regex character class — a literal Arabic range embedded in a regex is a
 * bidi-rendering hazard in a source file already full of RTL strings (it
 * can display scrambled in diffs/editors and get silently mangled by the
 * next edit); plain hex bounds sidestep that entirely.
 */
function containsArabic(s: string): boolean {
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0600 && code <= 0x06ff) return true;
  }
  return false;
}

/** Turn whatever deliver()'s catch block received into safe Arabic copy. */
export function uploadErrorMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : "";
  if (message && containsArabic(message)) return message;
  return GENERIC_UPLOAD_FAILURE;
}
