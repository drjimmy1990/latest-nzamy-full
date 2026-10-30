"use client";

import { useEffect, useState } from "react";
import { msUntilNextRiyadhMidnight, riyadhToday } from "@/lib/riyadhDay";

/**
 * Riyadh's calendar day, "YYYY-MM-DD" — "" until the component has mounted.
 *
 * The SSR cached-date trap: a `useState(new Date())` initialiser runs during
 * the server render, and nginx caches that HTML, so a page could show the day
 * it was first rendered on. The day is read here only in an effect, then
 * re-read at Riyadh midnight and whenever the tab becomes visible again (a
 * laptop opened the next morning) — LIVE-F38, CODE-F29.
 *
 * Callers treat "" as "not known yet" and filter nothing by date until then.
 */
export function useRiyadhToday(): string {
  const [today, setToday] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      setToday(riyadhToday());
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, msUntilNextRiyadhMidnight());
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return today;
}
