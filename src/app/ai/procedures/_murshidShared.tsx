"use client";

import { useEffect, useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";

/**
 * Shared bits of the three «المرشد القضائي» tabs built from the owner's
 * corrected murshid package (batch 2026-11-08, A2): «إجراءات التظلم حسب
 * القطاع», «القنوات الوطنية», «دليل ناجز».
 *
 * The data comes from /api/v1/murshid/* (src/lib/murshid/murshidStore.ts) —
 * never from an import of src/data/murshid, which is ~2 MB; a source-contract
 * test pins that. Every string is rendered as React text.
 */

/** «٢٨ أكتوبر ٢٠٢٦» for the package date the routes report. */
export function arabicDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString("ar-SA-u-ca-gregory-nu-arab", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

/** GET a murshid route once per `url`; `null` url = do not fetch yet. */
export function useMurshidJson<T>(url: string | null): { data: T | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; data: T | null; failed: boolean }>({ url: null, data: null, failed: false });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))
      .then((data) => { if (!cancelled) setState({ url, data, failed: false }); })
      .catch(() => { if (!cancelled) setState({ url, data: null, failed: true }); });
    return () => { cancelled = true; };
  }, [url]);
  if (!url || state.url !== url) return { data: null, failed: false };
  return { data: state.data, failed: state.failed };
}

export const CHANNEL_LABEL: Record<string, string> = {
  portal: "إلكترونياً",
  form: "نموذج",
  in_person: "حضورياً",
};

/** The host of an https URL, for a short link label. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * An outbound link. The server already dropped every non-https link; this
 * checks again so a non-https value can never become an href here.
 */
export function SafeLink({ url, label, isDark }: { url: string | null | undefined; label?: string; isDark: boolean }) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-0.5 break-all underline underline-offset-2 ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}
    >
      {label || hostOf(url)} <ArrowSquareOut size={10} className="flex-shrink-0" />
    </a>
  );
}

export function tone(isDark: boolean) {
  return {
    muted: isDark ? "text-zinc-400" : "text-slate-500",
    body: isDark ? "text-zinc-300" : "text-slate-600",
    strong: isDark ? "text-zinc-100" : "text-slate-800",
    card: isDark ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60" : "rounded-2xl border border-slate-100 bg-white shadow-sm",
    field: `rounded-xl border px-3 py-2 text-[12px] outline-none ${isDark ? "bg-zinc-900 border-white/[0.08] text-zinc-200" : "bg-white border-slate-200 text-slate-700"}`,
    chip: isDark ? "bg-zinc-800 text-zinc-300" : "bg-slate-100 text-slate-600",
    warn: isDark ? "text-amber-400" : "text-amber-700",
  };
}
