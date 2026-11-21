"use client";

import { useEffect, useState } from "react";
import {
  DECREE_FREE_PAGES_MAX,
  LIBRARY_READER_DISPLAY_KEY,
  parseLibraryReaderDisplay,
  type LibraryReaderDisplay,
} from "@/lib/library/readerDisplaySettings";

/**
 * «عرض المكتبة» on the admin settings page (batch l12, lib-a): the reader's
 * display choices the owner has not fixed yet, one platform_settings key
 * (library_reader_display), saved through PATCH /api/v1/admin/settings
 * (validated and audited there):
 *   - decree_free_pages: pages of a decree a non-subscriber reads (Q101; 0);
 *   - child_name_form: a sub-legislation's name under a /laws card, full or
 *     short (library question 5; full).
 */
export function LibraryReaderDisplaySettings({ isDark }: { isDark: boolean }) {
  const [value, setValue] = useState<LibraryReaderDisplay>(parseLibraryReaderDisplay(null));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        const data = (body?.data ?? {}) as Record<string, unknown>;
        setValue(parseLibraryReaderDisplay(data[LIBRARY_READER_DISPLAY_KEY]));
      })
      .catch(() => {
        /* the defaults stay on screen */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/v1/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: LIBRARY_READER_DISPLAY_KEY, value }),
      });
      if (res.ok) {
        setStatus({ ok: true, text: "حُفظت إعدادات عرض المكتبة. تسري خلال دقيقة." });
      } else {
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        setStatus({ ok: false, text: typeof body?.error === "string" && body.error ? body.error : "تعذّر الحفظ. حاول مرة أخرى." });
      }
    } catch {
      setStatus({ ok: false, text: "تعذّر الحفظ. حاول مرة أخرى." });
    } finally {
      setSaving(false);
    }
  }

  const label = `text-xs font-bold block mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`;
  const input = `w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-white/10 bg-[#0d1117] text-white" : "border-gray-200 bg-white text-gray-900"}`;
  const muted = isDark ? "text-zinc-400" : "text-slate-500";

  return (
    <div dir="rtl">
      <h3 className={`text-sm font-bold mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>عرض المكتبة</h3>
      <p className={`text-xs mb-4 ${muted}`}>
        خيارات عرض لم يُحسم أمرها بعد: صفحات المراسيم المتاحة لغير المشترك، وصيغة اسم التشريع الفرعي تحت بطاقة النظام في صفحة المكتبة.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>صفحات المرسوم أو القرار المتاحة لغير المشترك (٠ = للمشتركين فقط)</span>
          <input
            type="number"
            min={0}
            max={DECREE_FREE_PAGES_MAX}
            value={Number.isFinite(value.decree_free_pages) ? value.decree_free_pages : ""}
            onChange={(e) => setValue({ ...value, decree_free_pages: e.target.value.trim() === "" ? NaN : Number(e.target.value) })}
            className={`${input} font-mono`}
          />
        </label>
        <label className="block">
          <span className={label}>اسم التشريع الفرعي تحت بطاقة النظام</span>
          <select
            value={value.child_name_form}
            onChange={(e) => setValue({ ...value, child_name_form: e.target.value === "short" ? "short" : "full" })}
            className={input}
          >
            <option value="full">كاملاً: «اللائحة التنفيذية لنظام المرور»</option>
            <option value="short">مختصراً: «اللائحة التنفيذية»</option>
          </select>
        </label>
      </div>
      {status && (
        <p role={status.ok ? "status" : "alert"} className={`mt-3 text-xs font-bold ${status.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {status.text}
        </p>
      )}
      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] disabled:opacity-50 transition-colors"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>
    </div>
  );
}
