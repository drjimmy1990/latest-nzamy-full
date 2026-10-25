/**
 * noteColors.ts — the five pastel note colours (owner §٤٧ ٣) as Tailwind
 * classes, light and dark in the same string so the dark-mode guard
 * (src/lib/ui/darkModeGuard.test.ts) sees each surface's dark counterpart.
 */

import type { NoteColor } from "@/lib/dashboardNotes/notesInput";

export const NOTE_CARD_CLASS: Record<NoteColor, string> = {
  amber: "bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-500/10 dark:border-amber-400/25 dark:text-amber-50",
  emerald: "bg-emerald-50 border-emerald-200 text-emerald-950 dark:bg-emerald-500/10 dark:border-emerald-400/25 dark:text-emerald-50",
  sky: "bg-sky-50 border-sky-200 text-sky-950 dark:bg-sky-500/10 dark:border-sky-400/25 dark:text-sky-50",
  rose: "bg-rose-50 border-rose-200 text-rose-950 dark:bg-rose-500/10 dark:border-rose-400/25 dark:text-rose-50",
  violet: "bg-violet-50 border-violet-200 text-violet-950 dark:bg-violet-500/10 dark:border-violet-400/25 dark:text-violet-50",
};

/** The round swatch in the colour picker. */
export const NOTE_SWATCH_CLASS: Record<NoteColor, string> = {
  amber: "bg-amber-300 dark:bg-amber-400",
  emerald: "bg-emerald-300 dark:bg-emerald-400",
  sky: "bg-sky-300 dark:bg-sky-400",
  rose: "bg-rose-300 dark:bg-rose-400",
  violet: "bg-violet-300 dark:bg-violet-400",
};
