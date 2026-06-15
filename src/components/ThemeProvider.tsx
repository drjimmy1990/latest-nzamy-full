"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type Lang = "ar" | "en";
export type CalendarType = "hijri" | "miladi" | "both";

interface ThemeContextType {
  theme: Theme;
  lang: Lang;
  calendarType: CalendarType;
  isDark: boolean;
  isRTL: boolean;
  toggleTheme: () => void;
  toggleLang: () => void;
  setLang: (l: Lang) => void;
  setTheme: (t: Theme) => void;
  setCalendarType: (c: CalendarType) => void;
  t: Lang;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  lang: "ar",
  calendarType: "both",
  isDark: true,
  isRTL: true,
  toggleTheme: () => {},
  toggleLang: () => {},
  setLang: () => {},
  setTheme: () => {},
  setCalendarType: () => {},
  t: "ar",
});

export function useTheme() {
  return useContext(ThemeContext);
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

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [lang, setLangState] = useState<Lang>("ar");
  const [calendarType, setCalendarTypeState] = useState<CalendarType>("both");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const resolvedTheme = readTheme(localStorage.getItem("nezamy-theme"));
    const resolvedLang = readLang(localStorage.getItem("nezamy-lang"));
    const resolvedCalendar = readCalendarType(localStorage.getItem("nezamy-calendar"));

    setThemeState(resolvedTheme);
    setLangState(resolvedLang);
    setCalendarTypeState(resolvedCalendar);
    syncDocument(resolvedTheme, resolvedLang);
    setMounted(true);
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

  const isDark = theme === "dark";
  const isRTL = lang === "ar";

  return (
    <ThemeContext.Provider
      value={{
        theme,
        lang,
        calendarType,
        isDark,
        isRTL,
        toggleTheme,
        toggleLang,
        setTheme,
        setLang,
        setCalendarType,
        t: lang,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
