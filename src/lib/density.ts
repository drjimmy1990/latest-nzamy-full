/**
 * Display density — T28-31 («عرض قياسي» / compact view).
 *
 * A DISPLAY PREFERENCE, like the theme: it lives in this browser's
 * localStorage (`nezamy-density`), never on the server, and it changes how
 * big the interface is drawn — nothing about what it shows.
 *
 * WHY THREE VALUES. The owner asked for a one-tap compact view and named two
 * sizes for it — "75%" in one note and "85%" in another — and which of them is
 * the default is still his open question (registry Q153: "we add the toggle
 * and keep the current size as default until you choose"). So the default is
 * today's size, 100, and both of his numbers are offered.
 *
 * HOW IT IS APPLIED. `themeInitScript` (src/app/layout.tsx) writes the stored
 * value onto <html data-density="…"> before first paint, ThemeProvider keeps
 * the attribute in sync afterwards, and globals.css turns 85/75 into CSS
 * `zoom` on the root — desktop only (DENSITY_MEDIA_QUERY), because a phone's
 * text inputs must stay at 16px or iOS zooms the whole page on focus. Root
 * font-size would not do: most text in this product is fixed-px Tailwind
 * (`text-[11px]`, `text-[13px]`), which ignores it.
 *
 * Pure module, no `@/` imports: `npm run test:unit` loads it straight through
 * Node's type stripping, and layout.tsx interpolates these constants into the
 * pre-paint script so there is one list of valid values, not two.
 */

export const DENSITY_STORAGE_KEY = "nezamy-density";

/** Every value the attribute and the storage key may hold, largest first. */
export const DENSITY_VALUES = [100, 85, 75] as const;

export type Density = (typeof DENSITY_VALUES)[number];

/** Today's size. Stays the default until the owner answers Q153. */
export const DEFAULT_DENSITY: Density = 100;

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
  /** Short label for the compact sidebar control. */
  shortLabel: string;
}

export const DENSITY_OPTIONS: readonly DensityOption[] = [
  { value: 100, label: "قياسي 100٪", shortLabel: "100٪" },
  { value: 85, label: "مكثّف 85٪", shortLabel: "85٪" },
  { value: 75, label: "مكثّف جداً 75٪", shortLabel: "75٪" },
];

/** One sentence, shown under the control, saying where it has an effect. */
export const DENSITY_HELP_TEXT =
  "يصغّر حجم العرض على شاشات الحاسوب فقط؛ الجوال والجهاز اللوحي يبقيان بالحجم القياسي.";

export function isDensity(value: unknown): value is Density {
  return (DENSITY_VALUES as readonly unknown[]).includes(value);
}

/**
 * Reads a stored or submitted value. Accepts exactly "100" | "85" | "75"
 * (or the same numbers); anything else — null, "", " 85 ", "90", "85%",
 * "0.85" — is the default. Strict on purpose: the same rule runs in the
 * pre-paint script, which compares strings, and the two must never disagree.
 */
export function parseDensity(raw: unknown): Density {
  if (typeof raw === "number") return isDensity(raw) ? raw : DEFAULT_DENSITY;
  if (typeof raw !== "string") return DEFAULT_DENSITY;
  for (const value of DENSITY_VALUES) {
    if (raw === String(value)) return value;
  }
  return DEFAULT_DENSITY;
}

/** 100 → 1, 85 → 0.85, 75 → 0.75. The CSS `zoom` factor for a density. */
export function densityScale(density: Density): number {
  return density / 100;
}
