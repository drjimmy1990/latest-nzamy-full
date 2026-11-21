/**
 * Latin digits in number fields (owner, 18 Nov: «أي رقم يُكتب في حقول
 * البطاقة/الجوال/الترخيص/المبلغ يتحوّل إلى أرقام لاتينية حتى من لوحة مفاتيح
 * عربية، والحقل باتجاه ltr»). Pure, no imports beyond the one digit table.
 *
 * The digit table itself is the mobile one (toAsciiDigits in
 * src/lib/services/saudiMobile.ts) — one table, not another copy.
 *
 * Used WHILE TYPING (in onChange), so a field never shows ٤٢٤٢ for a moment
 * and never sends it. A money field must be `type="text"` + `inputMode`
 * (decimal / numeric) + `dir="ltr"`: a `type="number"` input sanitises
 * Arabic-Indic digits to "" before onChange ever sees them.
 */

import { toAsciiDigits } from "../services/saudiMobile.ts";

const NON_LATIN_DIGIT = /[٠-٩۰-۹]/;

/** Arabic-Indic (٠-٩) and Persian (۰-۹) digits → 0-9; everything else kept. */
export function toLatinDigits(value: string): string {
  return toAsciiDigits(value);
}

/** True when the text holds a digit that is not Latin. */
export function hasNonLatinDigits(value: string): boolean {
  return NON_LATIN_DIGIT.test(value);
}

/** Digits only (codes, counts), Latin, optionally capped in length. */
export function latinDigitsOnly(value: string, maxLength?: number): string {
  const digits = toAsciiDigits(value).replace(/\D/g, "");
  return maxLength === undefined ? digits : digits.slice(0, maxLength);
}

/**
 * A whole number that may carry a sign (an admin's «+ أو −» adjustment):
 * Latin digits, one leading + or − kept (the Unicode minus «−» and the dash
 * «–» read as "-"), every other character dropped.
 */
export function latinSignedIntegerInput(value: string): string {
  const t = toAsciiDigits(value).replace(/[−–]/g, "-").trimStart();
  const sign = t.startsWith("-") || t.startsWith("+") ? t[0] : "";
  return sign + t.replace(/\D/g, "");
}

/**
 * A licence or registration number: digits made Latin, the separators the
 * registry uses kept (12/3456, 12-3456), spaces trimmed at the ends only.
 * The server still normalises it (lawyer_registry_norm_licence).
 */
export function latinLicenceInput(value: string): string {
  return toAsciiDigits(value).replace(/^\s+/, "");
}

/**
 * A money amount while it is typed: Latin digits, the Arabic decimal mark
 * «٫» (and a comma typed as one is NOT guessed — it is a thousands mark)
 * becomes ".", thousands marks (٬ , and spaces) are dropped, any other
 * character is dropped, one decimal point at most, `decimals` places at most
 * (2 = halalas; 0 = whole riyals). A partial «12.» survives so the user can
 * keep typing. Never turns an empty field into "0".
 */
export function latinAmountInput(value: string, decimals = 2): string {
  const t = toAsciiDigits(value).replace(/٫/g, ".").replace(/[^\d.]/g, "");
  if (decimals <= 0) return t.replace(/\./g, "");
  const dot = t.indexOf(".");
  if (dot === -1) return t;
  const whole = t.slice(0, dot);
  const frac = t.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
  return `${whole}.${frac}`;
}

/** The part of an <input> the DOM helpers below touch (testable without a DOM). */
export type DigitInput = {
  value: string;
  name?: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  setSelectionRange?: (start: number, end: number) => void;
};

/**
 * Rewrites the field's value to Latin digits in place, keeping the caret
 * (the conversion never changes the length). A no-op — no write at all —
 * when there is nothing to convert. Returns whether it wrote.
 */
export function latinizeInputInPlace(el: DigitInput): boolean {
  const before = el.value;
  if (typeof before !== "string" || !hasNonLatinDigits(before)) return false;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  el.value = toAsciiDigits(before);
  if (start !== null && end !== null && typeof el.setSelectionRange === "function") {
    try {
      el.setSelectionRange(start, end);
    } catch {
      // some input types do not support a selection: the value is what matters
    }
  }
  return true;
}

/** The three card fields of moyasar-payment-form 2.3.0 (rendered in our DOM, not an iframe). */
export const MOYASAR_DIGIT_FIELDS: readonly string[] = ["mysr-cc-number", "mysr-cc-exp", "mysr-cc-csc"];

type CaptureRoot = {
  addEventListener: (type: "input", fn: (e: { target: unknown }) => void, opts: { capture: true }) => void;
  removeEventListener: (type: "input", fn: (e: { target: unknown }) => void, opts: { capture: true }) => void;
};

/**
 * Card fields: one capture-phase `input` listener on the form's container.
 * A capture listener on an ancestor runs before any listener on the field
 * itself, so the digits are Latin before Moyasar's mask (maska, which keeps
 * 0-9 only and would drop ٤) and its own handlers read the value. It only
 * touches the named fields, never dispatches an event (so maska's own
 * re-dispatched `input` cannot loop), and does nothing when the value is
 * already Latin. Returns the function that removes it.
 */
export function attachLatinDigitsCapture(root: CaptureRoot, names: readonly string[] = MOYASAR_DIGIT_FIELDS): () => void {
  const handler = (e: { target: unknown }) => {
    const t = e.target as Partial<DigitInput> | null;
    if (!t || typeof t.value !== "string" || typeof t.name !== "string" || !names.includes(t.name)) return;
    latinizeInputInPlace(t as DigitInput);
  };
  root.addEventListener("input", handler, { capture: true });
  return () => root.removeEventListener("input", handler, { capture: true });
}

// ── l12-access (file 10 ب24): the site-wide sweep ─────────────────────────────
// 41 numeric inputs across the site never called the helpers above (the fee,
// inheritance and deadline calculators, admin settings, offers, coupons,
// secondment …). One capture-phase listener on the document
// (src/components/forms/LatinDigitsEverywhere.tsx, mounted once in the root
// layout) now covers every NUMBER field — and only those: a field qualifies
// by its own markup (type number / tel, or inputMode numeric / decimal / tel,
// or data-latin-digits="true"). Free text — the library search, names,
// notes — is never touched (Arabic digits are legitimate there).

/** The part of an element the sweep looks at (testable without a DOM). */
export type DigitFieldLike = {
  tagName?: string;
  type?: string;
  inputMode?: string;
  getAttribute?: (name: string) => string | null;
};

const NUMERIC_TYPES = new Set(["number", "tel"]);
const NUMERIC_MODES = new Set(["numeric", "decimal", "tel"]);

/** Is this element a number field the sweep makes Latin? */
export function wantsLatinDigits(el: DigitFieldLike | null | undefined): boolean {
  if (!el || typeof el.tagName !== "string" || el.tagName.toUpperCase() !== "INPUT") return false;
  const attr = (n: string) => (typeof el.getAttribute === "function" ? el.getAttribute(n) : null);
  if (attr("data-latin-digits") === "false") return false;
  if (attr("data-latin-digits") === "true") return true;
  const type = (el.type ?? attr("type") ?? "").toLowerCase();
  if (NUMERIC_TYPES.has(type)) return true;
  const mode = (el.inputMode || attr("inputmode") || "").toLowerCase();
  return NUMERIC_MODES.has(mode);
}

/**
 * A `type="number"` field never shows the browser an Arabic digit (it is
 * dropped before any `input` event), so the sweep catches the KEY instead
 * (`beforeinput`): this is the text to insert in its place, or null when the
 * typed text has no non-Latin digit (let the browser handle it).
 */
export function latinReplacementFor(data: string | null | undefined): string | null {
  if (typeof data !== "string" || !hasNonLatinDigits(data)) return null;
  return toAsciiDigits(data).replace(/٫/g, ".");
}
