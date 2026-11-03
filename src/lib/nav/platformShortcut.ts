/**
 * platformShortcut.ts — the modifier key a shortcut hint should print.
 *
 * Owner package 2026-10-30, UX17: the sidebar search showed «⌘ K» in a
 * Windows session. The handler (GlobalSearch.tsx) accepts Ctrl+K and ⌘+K
 * alike; only the printed hint was Apple-only. Apple platforms keep ⌘,
 * everything else (Windows, Linux, Android, ChromeOS) prints Ctrl.
 *
 * Pure so node --test can load it. The caller reads the platform from
 * `navigator` after hydration; the server and the first client paint use the
 * non-Apple default so the markup matches.
 */
export type ShortcutModifier = "⌘" | "Ctrl";

export const SERVER_SHORTCUT_MODIFIER: ShortcutModifier = "Ctrl";

const APPLE = /mac|iphone|ipad|ipod/i;

export function shortcutModifierFor(platform: string | null | undefined): ShortcutModifier {
  return platform && APPLE.test(platform) ? "⌘" : "Ctrl";
}

/** Best available platform string from a Navigator-like object. */
export function platformOf(nav: {
  userAgentData?: { platform?: string } | null;
  platform?: string;
  userAgent?: string;
} | null | undefined): string {
  if (!nav) return "";
  return nav.userAgentData?.platform || nav.platform || nav.userAgent || "";
}
