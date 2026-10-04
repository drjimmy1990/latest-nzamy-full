"use client";

/**
 * OfficialMetaLockedRow — the ONE row that stands in for a law's official
 * issuance metadata (أداة الإصدار، تاريخه، المصدر الرسمي) when the viewer is
 * not a subscriber (T28-22, owner test 2026-09-28). The API sends those fields
 * as '' with `officialMetaLocked: true`; without this row the reader showed
 * blank labels, and the catalogue silently lost its «صدر:» line.
 *
 * It opens the same upgrade path as the reader's paywall (PaywallModal →
 * /pricing?plan=…), through the caller's `onUnlock`. A <button>, so the
 * catalogue card's own click handler (which ignores clicks on buttons) does
 * not also navigate to the law. The click is deliberately allowed to bubble:
 * the reader's phone index sheet closes on a button click, and must, or it
 * would stay on top of the paywall it just opened.
 */

export const OFFICIAL_META_LOCKED_COPY = "بيانات الإصدار الرسمية متاحة للمشتركين";

export function OfficialMetaLockedRow({
  isDark,
  onUnlock,
  textSize = "text-[10px]",
  className = "",
}: {
  isDark: boolean;
  onUnlock: () => void;
  /** One text-size class, kept separate so it never competes with the default. */
  textSize?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onUnlock}
      title="اشترك لعرض أداة الإصدار وتاريخه ومصدره الرسمي"
      className={`inline-flex items-center gap-1 text-start ${textSize} font-bold leading-snug hover:underline print:hidden ${
        isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"
      } ${className}`}
    >
      <span aria-hidden="true">🔒</span>
      <span>{OFFICIAL_META_LOCKED_COPY}</span>
    </button>
  );
}
