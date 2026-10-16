"use client";

import { useId, type ReactNode } from "react";

/**
 * DisabledReason — the tooltip half of the disabled-button standard (owner
 * decision ١٣, 2026-10-06: «عتامة 50% مع مؤشر منع cursor-not-allowed وتول تيب
 * يوضح سبب التعطيل»). The 50% opacity and the not-allowed cursor come from
 * the global rule at the end of src/app/globals.css, for every disabled
 * button; this component adds the reason.
 *
 * Wrap a button and pass `reason` ONLY while it is disabled (null/undefined
 * renders the child alone, untouched):
 *
 *   <DisabledReason reason={loadFailed ? "تعذّر تحميل بياناتك" : null}>
 *     <button disabled={loadFailed} …>حفظ</button>
 *   </DisabledReason>
 *
 * A disabled <button> receives no focus and no JS pointer events, so the
 * tooltip hangs off a wrapper instead: it shows on hover, and the wrapper
 * becomes a tab stop that shows it on keyboard focus and names it through
 * aria-describedby. The named group (`group/dr`) keeps an outer `group`
 * card's hover from opening it.
 */
export default function DisabledReason({
  reason,
  children,
  className = "",
}: {
  /** Why the button is disabled, in Arabic. Pass null while it is enabled. */
  reason?: string | null;
  children: ReactNode;
  /** Layout for the wrapper, e.g. "w-full" when the button fills its row. */
  className?: string;
}) {
  const id = useId();
  if (!reason) return <>{children}</>;
  return (
    <span
      className={`group/dr relative inline-flex focus:outline-none ${className}`}
      tabIndex={0}
      aria-describedby={id}
      data-disabled-reason=""
    >
      {children}
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-zinc-900 px-3 py-1.5 text-center text-xs font-medium leading-relaxed text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/dr:opacity-100 group-focus-visible/dr:opacity-100 dark:bg-zinc-700"
      >
        {reason}
      </span>
    </span>
  );
}
