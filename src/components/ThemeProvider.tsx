"use client";

import { createContext, useContext, useEffect, useState } from "react";
import {
  DEFAULT_DENSITY,
  DENSITY_STORAGE_KEY,
  parseDensity,
  type Density,
} from "@/lib/density";

type Theme = "light" | "dark";
type Lang = "ar" | "en";
export type CalendarType = "hijri" | "miladi" | "both";

interface ThemeContextType {
  theme: Theme;
  lang: Lang;
  calendarType: CalendarType;
  /** Display density (T28-31): 100 | 85 | 75. See src/lib/density.ts. */
  density: Density;
  isDark: boolean;
  isRTL: boolean;
  toggleTheme: () => void;
  toggleLang: () => void;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  setCalendarType: (c: CalendarType) => void;
  setDensity: (d: Density) => void;
  t: Lang;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  lang: "ar",
  calendarType: "both",
  density: DEFAULT_DENSITY,
  isDark: true,
  isRTL: true,
  toggleTheme: () => {},
  toggleLang: () => {},
  setLang: () => {},
  setTheme: () => {},
  setCalendarType: () => {},
  setDensity: () => {},
  t: "ar",
});

export function useTheme() {
  return useContext(ThemeContext);
}

/** The display-density slice of the theme context. */
export function useDensity() {
  const { density, setDensity } = useContext(ThemeContext);
  return { density, setDensity };
}

function readTheme(value: string | null): Theme {
  return value === "light" || value === "dark" ? value : "dark";
}

function readLang(value: string | null): Lang {
  return value === "ar" || value === "en" ? value : "ar";
}

function readCalendarType(value: string | null): CalendarType {
  return value === "hijri" || value === "miladi" || value === "both" ? value : "both";
}

function syncDocument(theme: Theme, lang: Lang) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = lang;
  document.documentElement.style.colorScheme = theme;
}

// The attribute globals.css keys the zoom on. themeInitScript (layout.tsx)
// sets it before first paint; this keeps it in step once the user changes it.
function syncDensity(density: Density) {
  document.documentElement.setAttribute("data-density", String(density));
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [lang, setLangState] = useState<Lang>("ar");
  const [calendarType, setCalendarTypeState] = useState<CalendarType>("both");
  const [density, setDensityState] = useState<Density>(DEFAULT_DENSITY);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const resolvedTheme = readTheme(localStorage.getItem("nezamy-theme"));
    const resolvedLang = readLang(localStorage.getItem("nezamy-lang"));
    const resolvedCalendar = readCalendarType(localStorage.getItem("nezamy-calendar"));
    let resolvedDensity: Density = DEFAULT_DENSITY;
    try {
      resolvedDensity = parseDensity(localStorage.getItem(DENSITY_STORAGE_KEY));
    } catch { /* storage blocked — keep the default, as the pre-paint script does */ }

    setThemeState(resolvedTheme);
    setLangState(resolvedLang);
    setCalendarTypeState(resolvedCalendar);
    setDensityState(resolvedDensity);
    syncDocument(resolvedTheme, resolvedLang);
    syncDensity(resolvedDensity);
    setMounted(true);
  }, []);

  // Density: written only once `mounted`, like theme/lang below — writing on
  // the first commit would put the default (100) over the value the pre-paint
  // script already applied, and the page would flash to full size.
  useEffect(() => {
    if (!mounted) return;
    syncDensity(density);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, String(density));
    } catch { /* storage blocked — the choice still applies to this page */ }
  }, [density, mounted]);

  // A change made in another tab of the same browser applies here too.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === DENSITY_STORAGE_KEY) setDensityState(parseDensity(event.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    syncDocument(theme, lang);
    localStorage.setItem("nezamy-theme", theme);
    localStorage.setItem("nezamy-lang", lang);
  }, [theme, lang, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem("nezamy-calendar", calendarType);
  }, [calendarType, mounted]);

  const toggleTheme = () => setThemeState((current) => (current === "light" ? "dark" : "light"));
  const toggleLang = () => setLangState((current) => (current === "ar" ? "en" : "ar"));
  const setTheme = (nextTheme: Theme) => setThemeState(nextTheme);
  const setLang = (nextLang: Lang) => setLangState(nextLang);
  const setCalendarType = (nextCalendarType: CalendarType) => setCalendarTypeState(nextCalendarType);
  const setDensity = (nextDensity: Density) => setDensityState(parseDensity(nextDensity));

  const isDark = theme === "dark";
  const isRTL = lang === "ar";

  return (
    <ThemeContext.Provider
      value={{
        theme,
        lang,
        calendarType,
        density,
        isDark,
        isRTL,
        toggleTheme,
        toggleLang,
        setTheme,
        setLang,
        setCalendarType,
        setDensity,
        t: lang,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
