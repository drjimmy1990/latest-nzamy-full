"use client";

import {
  PLATFORM_PROTECTION_ANCHOR,
  TERMS_CONSENT_AR,
  TERMS_CONSENT_EN,
} from "@/lib/legal/termsVersion";

/**
 * The signup consent box (R7, owner package 2026-11-17, file 11 part «ب»).
 * Unticked by default — the parent owns `checked` and starts it false, and
 * keeps its submit button disabled until it is true.
 *
 * The sentence is the owner's, verbatim (termsVersion.ts). The links open in a
 * new tab so a half-filled form is not lost.
 */
export default function TermsConsentCheckbox({
  checked,
  onChange,
  isAr,
  id = "terms-consent",
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  isAr: boolean;
  id?: string;
  disabled?: boolean;
}) {
  const t = isAr ? TERMS_CONSENT_AR : TERMS_CONSENT_EN;
  const link = "font-semibold text-royal underline hover:no-underline dark:text-gold";
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-royal"
        />
        <label htmlFor={id} className="cursor-pointer text-xs leading-relaxed text-ink-muted dark:text-gray-300">
          {t.before}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className={link}>
            {t.termsLink}
          </a>
          {t.middle}
          <a href={`/terms#${PLATFORM_PROTECTION_ANCHOR}`} target="_blank" rel="noopener noreferrer" className={link}>
            {t.protectionLink}
          </a>
          {t.after}
        </label>
      </div>
      <p className="mt-2 ps-7 text-[11px] text-ink-faint dark:text-gray-400">
        <a href="/terms" target="_blank" rel="noopener noreferrer" className={link}>
          {isAr ? "الشروط والأحكام" : "Terms & Conditions"}
        </a>
        <span className="mx-2">·</span>
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className={link}>
          {isAr ? "سياسة الخصوصية" : "Privacy Policy"}
        </a>
      </p>
    </div>
  );
}
