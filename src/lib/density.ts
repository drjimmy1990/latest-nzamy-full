/**
 * Display density — T28-31 («عرض قياسي» / compact view).
 *
 * A DISPLAY PREFERENCE, like the theme: it lives in this browser's
 * localStorage, never on the server, and it changes how big the interface is
 * drawn — nothing about what it shows.
 *
 * THE DEFAULT IS 75. The owner answered Q153 on 2026-10-03: 75% by default on
 * desktop, and no toggle in the sidebars — a user who wants the full size goes
 * back to 100% from Settings («الإعدادات» → «حجم العرض»), which is the only
 * place the control is mounted now. 85 stays offered there because he named it
 * too, in an earlier note.
 *
 * HOW IT IS APPLIED. `themeInitScript` (src/app/layout.tsx) writes the resolved
 * value onto <html data-density="…"> before first paint, ThemeProvider keeps
 * the attribute in sync afterwards, and globals.css turns 85/75 into CSS
 * `zoom` on the root — desktop only (DENSITY_MEDIA_QUERY), because a phone's
 * text inputs must stay at 16px or iOS zooms the whole page on focus. Root
 * font-size would not do: most text in this product is fixed-px Tailwind
 * (`text-[11px]`, `text-[13px]`), which ignores it.
 *
 * WHAT IS STORED, AND WHY THERE ARE TWO KEYS. Only an explicit choice is
 * stored, under DENSITY_STORAGE_KEY. The first version (2026-09-29, key
 * `nezamy-density`) also wrote the value on every page load, so every desktop
 * that opened the site since then holds "100" there without anyone having
 * picked it — and honouring that "100" would keep the owner himself at full
 * size after he chose 75 as the default. So the old key is read only as a
 * fallback, and only for "85" / "75": with 100 as the old default, those two
 * could only have been written by a click. A deliberate "100" from those days
 * cannot be told apart from the automatic one; that user sees 75 once and
 * picks 100 again in Settings, and from then on it is remembered.
 *
 * Pure module, no `@/` imports: `npm run test:unit` loads it straight through
 * Node's type stripping, and layout.tsx interpolates these constants into the
 * pre-paint script so there is one list of valid values, not two.
 */

/** Explicit choices only — written by setDensity, never on page load. */
export const DENSITY_STORAGE_KEY = "nezamy-density-v2";

/**
 * The first version's key. Read-only fallback; see the header for why only
 * DENSITY_LEGACY_TRUSTED values are honoured from it.
 */
export const DENSITY_LEGACY_STORAGE_KEY = "nezamy-density";

/** Every value the attribute and the storage key may hold, largest first. */
export const DENSITY_VALUES = [100, 85, 75] as const;

export type Density = (typeof DENSITY_VALUES)[number];

/** The owner's answer to Q153 (2026-10-03): 75% unless the user chose otherwise. */
export const DEFAULT_DENSITY: Density = 75;

/**
 * Legacy values that can only have come from a click: the old default was 100
 * and the old code re-wrote whatever was current on every load, so "100" there
 * proves nothing and "85"/"75" prove a choice.
 */
export const DENSITY_LEGACY_TRUSTED: readonly Density[] = [85, 75];

/**
 * Where the zoom actually applies. Mirrors the @media block in globals.css —
 * keep the two identical.
 *
 * - `screen`: a print viewport is sized to the paper, and printed law
 *   articles must not shrink.
 * - `min-width: 1024px` (Tailwind `lg`): desktop, where the owner zooms his
 *   browser today.
 * - `hover: hover` and `pointer: fine`: a mouse. This keeps iPads in
 *   landscape (1024–1366px wide) out — the iOS input guard in globals.css
 *   stops at 767px, so a zoomed iPad would drop inputs below 16px and trigger
 *   Safari's focus zoom.
 */
export const DENSITY_MEDIA_QUERY =
  "screen and (min-width: 1024px) and (hover: hover) and (pointer: fine)";

export interface DensityOption {
  value: Density;
  /** Full label, used in the settings panel and as the accessible name. */
  label: string;
}

export const DENSITY_OPTIONS: readonly DensityOption[] = [
  { value: 100, label: "قياسي 100٪" },
  { value: 85, label: "مكثّف 85٪" },
  { value: 75, label: "مكثّف جداً 75٪" },
];

/** One sentence, shown under the control, saying what the default is and where it applies. */
export const DENSITY_HELP_TEXT =
  "الحجم الافتراضي على شاشات الحاسوب 75٪، ويمكنك العودة إلى 100٪ من هنا. الجوال والجهاز اللوحي يبقيان بالحجم القياسي.";

export function isDensity(value: unknown): value is Density {
  return (DENSITY_VALUES as readonly unknown[]).includes(value);
}

/**
 * Reads a stored or submitted value, or `null` when it is not one. Accepts
 * exactly "100" | "85" | "75" (or the same numbers); anything else — null, "",
 * " 85 ", "90", "85%", "0.85" — is `null`. Strict on purpose: the same rule
 * runs in the pre-paint script, which compares strings, and the two must
 * never disagree.
 */
export function readDensity(raw: unknown): Density | null {
  if (typeof raw === "number") return isDensity(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  for (const value of DENSITY_VALUES) {
    if (raw === String(value)) return value;
  }
  return null;
}

/** `readDensity`, falling back to the default for anything that is not a density. */
export function parseDensity(raw: unknown): Density {
  return readDensity(raw) ?? DEFAULT_DENSITY;
}

/**
 * The density to apply, from the two stored values: the explicit choice if
 * there is one, else a legacy value that proves a choice (85/75), else the
 * default. The pre-paint script in layout.tsx implements this same rule with
 * the same constants.
 */
export function resolveStoredDensity(current: unknown, legacy: unknown): Density {
  const chosen = readDensity(current);
  if (chosen !== null) return chosen;
  const old = readDensity(legacy);
  if (old !== null && DENSITY_LEGACY_TRUSTED.includes(old)) return old;
  return DEFAULT_DENSITY;
}

/** 100 → 1, 85 → 0.85, 75 → 0.75. The CSS `zoom` factor for a density. */
export function densityScale(density: Density): number {
  return density / 100;
}

/**
 * The pre-paint half of `resolveStoredDensity`, as plain ES5 for the inline
 * <script> in layout.tsx (it runs before any bundle, so it cannot import this
 * module). Built here from the same constants so the two cannot drift, and
 * density.test.ts runs it against a fake localStorage to prove it returns
 * what `resolveStoredDensity` returns. Blocked storage → the default.
 */
export function densityInitSnippet(): string {
  const str = (value: Density) => String(value);
  const values = JSON.stringify(DENSITY_VALUES.map(str));
  const trusted = JSON.stringify(DENSITY_LEGACY_TRUSTED.map(str));
  const fallback = JSON.stringify(str(DEFAULT_DENSITY));
  const key = JSON.stringify(DENSITY_STORAGE_KEY);
  const legacyKey = JSON.stringify(DENSITY_LEGACY_STORAGE_KEY);
  return `
  try {
    var density = localStorage.getItem(${key});
    if (${values}.indexOf(density) === -1) {
      density = localStorage.getItem(${legacyKey});
      if (${trusted}.indexOf(density) === -1) density = ${fallback};
    }
    document.documentElement.setAttribute("data-density", density);
  } catch (error) {
    document.documentElement.setAttribute("data-density", ${fallback});
  }`;
}
