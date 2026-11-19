"use client";

import { useEffect, useState } from "react";
import { LIBRARY_MIN_POINTS_MAX, LIBRARY_MIN_POINTS_SETTING, parseLibraryMinPoints } from "@/lib/library/pointsGate";

/**
 * «بوابة النقاط للمكتبة» on the admin settings page (owner register 14 item
 * 48, spec 16.12(6), test G39; batch l9). One platform_settings key,
 * library_min_points_to_browse = {"points": 50}, saved through PATCH
 * /api/v1/admin/settings (validated and audited there: who, when, before and
 * after). Read on every library request, so a change applies to the next one.
 */
export function LibraryPointsGateSettings({ isDark }: { isDark: boolean }) {
  const [points, setPoints] = useState<number>(parseLibraryMinPoints(null));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const data = (body?.data ?? {}) as Record<string, unknown>;
        if (!cancelled) setPoints(parseLibraryMinPoints(data[LIBRARY_MIN_POINTS_SETTING]));
      })
      .catch(() => {
        /* the default stays on screen */
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
        body: JSON.stringify({ key: LIBRARY_MIN_POINTS_SETTING, value: { points } }),
      });
      if (res.ok) {
        setStatus({ ok: true, text: "حُفظ الحد الأدنى للنقاط. يسري على الطلب التالي." });
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
  const input = `w-full rounded-xl border px-3 py-2 text-sm font-mono ${isDark ? "border-white/10 bg-[#0d1117] text-white" : "border-gray-200 bg-white text-gray-900"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-500";

  return (
    <div dir="rtl">
      <h3 className={`text-sm font-bold mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>بوابة النقاط للمكتبة</h3>
      <p className={`text-xs mb-4 ${muted}`}>
        مشترك المكتبة (باقة مكتبة مدفوعة أو المؤسس) يفتح النص الكامل ما دام رصيد نقاطه (ومنها نقاط المؤسس للمكتبة) لا يقل عن هذا الحد؛
        تحته يرى ما يراه الزائر مع رسالة وزر شحن. لا يُطبَّق على المسؤول ولا على الباقات الاحترافية فما فوق ولا على التجربة والدعوات ومنح الإدارة.
        ٠ = بلا شرط.
      </p>
      <label className="block max-w-xs">
        <span className={label}>الحد الأدنى للرصيد لفتح المكتبة (library_min_points_to_browse)</span>
        <input
          type="number"
          min={0}
          max={LIBRARY_MIN_POINTS_MAX}
          value={Number.isFinite(points) ? points : ""}
          onChange={(e) => setPoints(e.target.value.trim() === "" ? NaN : Math.trunc(Number(e.target.value)))}
          className={input}
        />
      </label>
      {status && (
        <p role={status.ok ? "status" : "alert"} className={`mt-3 text-xs font-bold ${status.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
          {status.text}
        </p>
      )}
      <div className="flex justify-end mt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving || !Number.isFinite(points)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] disabled:opacity-50 transition-colors"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>
    </div>
  );
}
