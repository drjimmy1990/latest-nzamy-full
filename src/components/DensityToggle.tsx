"use client";

/**
 * DensityToggle — T28-31, the owner's one-tap «عرض قياسي» / compact view.
 *
 * Three sizes: «قياسي 100٪» (the default, today's size — his Q153 on which
 * size should be the default is still open), «مكثّف 85٪» and «مكثّف جداً
 * 75٪», the two numbers he named. The choice is a display preference like the
 * theme: this browser only (localStorage `nezamy-density`), applied as
 * <html data-density> and turned into CSS `zoom` by globals.css. Everything
 * about values, storage and where it applies lives in src/lib/density.ts.
 *
 * It only has an effect on a desktop screen with a mouse (≥1024px): phones
 * and tablets stay at 100% so iOS never zooms the page on a text field.
 * - variant="compact" (sidebar, top-bar menu): short labels, and the whole
 *   control is hidden where it would do nothing (`nz-density-desktop-only`).
 * - variant="panel" (a settings screen): full labels plus a help line saying
 *   where it applies; always visible, so nobody wonders where it went.
 *
 * A WAI-ARIA radio group: one tab stop, arrow keys move the choice (in the
 * reading direction), Home/End jump to the ends.
 */

import { useId, useRef } from "react";
import type { KeyboardEvent } from "react";
import { TextAa } from "@phosphor-icons/react";
import { useDensity, useTheme } from "@/components/ThemeProvider";
import { DENSITY_HELP_TEXT, DENSITY_OPTIONS } from "@/lib/density";

interface DensityToggleProps {
  variant?: "compact" | "panel";
  /**
   * "auto" follows the site theme (dark: variants). "dark" is for chrome that
   * is dark whatever the theme — the admin console.
   */
  tone?: "auto" | "dark";
  className?: string;
}

const GROUP_LABEL = "حجم العرض";

export default function DensityToggle({
  variant = "compact",
  tone = "auto",
  className = "",
}: DensityToggleProps) {
  const { density, setDensity } = useDensity();
  const { isRTL } = useTheme();
  const helpId = useId();
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  const currentIndex = Math.max(
    0,
    DENSITY_OPTIONS.findIndex((option) => option.value === density),
  );

  const choose = (index: number) => {
    const option = DENSITY_OPTIONS[index];
    if (!option) return;
    setDensity(option.value);
    buttonsRef.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = DENSITY_OPTIONS.length - 1;
    // The options run in reading order, so in RTL "next" is to the LEFT.
    const forward = isRTL ? "ArrowLeft" : "ArrowRight";
    const backward = isRTL ? "ArrowRight" : "ArrowLeft";
    let next: number | null = null;
    if (event.key === forward || event.key === "ArrowDown") next = currentIndex === last ? 0 : currentIndex + 1;
    else if (event.key === backward || event.key === "ArrowUp") next = currentIndex === 0 ? last : currentIndex - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    choose(next);
  };

  const dark = tone === "dark";

  if (variant === "panel") {
    return (
      <div className={className}>
        <span
          id={`${helpId}-label`}
          className="block text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5"
        >
          <span className="flex items-center gap-1.5">
            <TextAa size={16} />
            {GROUP_LABEL}
          </span>
        </span>
        <div
          role="radiogroup"
          aria-labelledby={`${helpId}-label`}
          aria-describedby={helpId}
          onKeyDown={onKeyDown}
          className="flex rounded-2xl border border-slate-200/60 dark:border-white/[0.06] overflow-hidden shadow-inner bg-white/50 dark:bg-white/[0.02]"
        >
          {DENSITY_OPTIONS.map((option, index) => {
            const checked = index === currentIndex;
            return (
              <button
                key={option.value}
                ref={(el) => { buttonsRef.current[index] = el; }}
                type="button"
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                onClick={() => choose(index)}
                className={`flex-1 py-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8A762] ${
                  checked
                    ? "bg-[#0B3D2E] text-white"
                    : "text-zinc-600 dark:text-zinc-400 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        <p id={helpId} className="mt-1.5 text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">
          {DENSITY_HELP_TEXT}
        </p>
      </div>
    );
  }

  // Compact: one row, short labels, full labels as the accessible names.
  const labelTone = dark ? "text-zinc-500" : "text-slate-500 dark:text-zinc-400";
  const groupTone = dark
    ? "border-white/[0.08] bg-white/[0.03]"
    : "border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03]";
  const checkedTone = dark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-[#0B3D2E] text-white shadow-sm";
  const idleTone = dark
    ? "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
    : "text-slate-500 hover:text-slate-800 hover:bg-white dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.06]";

  return (
    <div className={`nz-density-desktop-only ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span id={`${helpId}-label`} className={`flex items-center gap-1 text-[11px] font-semibold ${labelTone}`}>
          <TextAa size={13} weight="bold" aria-hidden="true" />
          {GROUP_LABEL}
        </span>
        <div
          role="radiogroup"
          aria-labelledby={`${helpId}-label`}
          aria-describedby={helpId}
          onKeyDown={onKeyDown}
          className={`flex items-center gap-0.5 rounded-lg border p-0.5 ${groupTone}`}
        >
          {DENSITY_OPTIONS.map((option, index) => {
            const checked = index === currentIndex;
            return (
              <button
                key={option.value}
                ref={(el) => { buttonsRef.current[index] = el; }}
                type="button"
                role="radio"
                aria-checked={checked}
                aria-label={option.label}
                title={option.label}
                tabIndex={checked ? 0 : -1}
                onClick={() => choose(index)}
                className={`min-w-[2.5rem] rounded-md px-1.5 py-1 text-[11px] font-bold tabular-nums leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8A762] ${
                  checked ? checkedTone : idleTone
                }`}
              >
                {option.shortLabel}
              </button>
            );
          })}
        </div>
      </div>
      <span id={helpId} className="sr-only">
        {DENSITY_HELP_TEXT}
      </span>
    </div>
  );
}
