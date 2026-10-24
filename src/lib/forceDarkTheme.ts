/**
 * forceDarkTheme.ts — the theme value inside a dark-only area (the admin
 * console, src/app/dashboard/admin/layout.tsx via ForceDarkTheme in
 * src/components/ThemeProvider.tsx): `theme: "dark"` and `isDark: true`
 * whatever the site theme is, the theme setters made no-ops there, and every
 * other value (language, calendar, density and their setters) the parent's.
 *
 * Pure: no runtime imports, so `node --test` loads it directly.
 */
interface ThemeLike {
  theme: "light" | "dark";
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;
}

const noop = () => {};

export function forceDarkThemeValue<T extends ThemeLike>(parent: T): T {
  return { ...parent, theme: "dark", isDark: true, toggleTheme: noop, setTheme: noop };
}
