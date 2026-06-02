/**
 * normalizeDigits — FIX-05
 * Converts Arabic-Indic (٠-٩) and Extended Arabic-Indic (۰-۹) digits
 * to Western Arabic (0-9) for consistent search/filter matching.
 *
 * Example:
 *   normalizeDigits('١٢٣') // '123'
 *   normalizeDigits('٢٠٢٦') // '2026'
 */
export function normalizeDigits(str: string): string {
  return str
    // Arabic-Indic digits (U+0660–U+0669)
    .replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    // Extended Arabic-Indic digits (U+06F0–U+06F9, used in Persian/Urdu)
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}
