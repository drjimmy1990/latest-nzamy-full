"use client";

import { useEffect, useState } from "react";
import {
  DRAFT_EXCERPT_RANGE,
  DRAFT_LIMITS_SETTING,
  DRAFT_MAX_ITEMS_RANGE,
  parseDraftLimits,
} from "@/lib/library/draftExport";
import { AI_RETENTION_RANGE, AI_RETENTION_SETTING, parseRetentionMonths } from "@/lib/ai/aiHistory";

/**
 * Batch l12 lib-draft: two platform_settings keys on the admin settings page,
 * saved through PATCH /api/v1/admin/settings (validated and audited there).
 *
 *   library_draft_limits  owner file 03 ل2 answer ج: how many items one
 *                         «نسخ المسودة كاملة» or one Word file may hold, and how
 *                         many characters of text a share carries;
 *   ai_runs_retention     owner file 03 ل11: months an AI run keeps its
 *                         question and answer (default 12), applied by the
 *                         daily retention job.
 */
export function DraftAndAiHistorySettings({ isDark }: { isDark: boolean }) {
  const [maxItems, setMaxItems] = useState<number>(parseDraftLimits(null).maxItems);
  const [excerpt, setExcerpt] = useState<number>(parseDraftLimits(null).shareExcerptChars);
  const [months, setMonths] = useState<number>(parseRetentionMonths(null));
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled) return;
        const data = (body?.data ?? {}) as Record<string, unknown>;
        const limits = parseDraftLimits(data[DRAFT_LIMITS_SETTING]);
        setMaxItems(limits.maxItems);
        setExcerpt(limits.shareExcerptChars);
        setMonths(parseRetentionMonths(data[AI_RETENTION_SETTING]));
      })
      .catch(() => {
        /* the defaults stay on screen */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function patch(key: string, value: unknown): Promise<string | null> {
    const res = await fetch("/api/v1/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    if (res.ok) return null;
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    return typeof body?.error === "string" && body.error ? body.error : "تعذّر الحفظ. حاول مرة أخرى.";
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const a = await patch(DRAFT_LIMITS_SETTING, { max_items: maxItems, share_excerpt_chars: excerpt });
      const b = a ? null : await patch(AI_RETENTION_SETTING, { months });
      const error = a ?? b;
      setStatus(error ? { ok: false, text: error } : { ok: true, text: "حُفظت حدود المسودة ومدة حفظ سجل الذكاء الاصطناعي." });
    } catch {
      setStatus({ ok: false, text: "تعذّر الحفظ. حاول مرة أخرى." });
    } finally {
      setSaving(false);
    }
  }

  const label = `text-xs font-bold block mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`;
  const input = `w-full rounded-xl border px-3 py-2 text-sm font-mono ${isDark ? "border-white/10 bg-[#0d1117] text-white" : "border-gray-200 bg-white text-gray-900"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-500";
  const num = (set: (n: number) => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    set(e.target.value.trim() === "" ? NaN : Math.trunc(Number(e.target.value)));
  const valid = [maxItems, excerpt, months].every(Number.isFinite);

  return (
    <div dir="rtl">
      <h3 className={`text-sm font-bold mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>مسودة المكتبة وسجل الذكاء الاصطناعي</h3>
      <p className={`text-xs mb-4 ${muted}`}>
        حدّ عناصر «نسخ المسودة كاملة» وملف Word، وطول المقتطف الذي تحمله المشاركة (مع العنوان والرابط فقط). ومدة حفظ أسئلة المستخدم
        وأجوبته في «سجلّي»، تُمسح بعدها ويبقى السعر والتاريخ.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className={label}>أقصى عدد عناصر للنسخ وملف Word</span>
          <input type="number" min={DRAFT_MAX_ITEMS_RANGE.min} max={DRAFT_MAX_ITEMS_RANGE.max} value={Number.isFinite(maxItems) ? maxItems : ""} onChange={num(setMaxItems)} className={input} />
        </label>
        <label className="block">
          <span className={label}>طول مقتطف المشاركة (حرفاً)</span>
          <input type="number" min={DRAFT_EXCERPT_RANGE.min} max={DRAFT_EXCERPT_RANGE.max} value={Number.isFinite(excerpt) ? excerpt : ""} onChange={num(setExcerpt)} className={input} />
        </label>
        <label className="block">
          <span className={label}>مدة حفظ سجل الذكاء الاصطناعي (شهراً)</span>
          <input type="number" min={AI_RETENTION_RANGE.min} max={AI_RETENTION_RANGE.max} value={Number.isFinite(months) ? months : ""} onChange={num(setMonths)} className={input} />
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
          disabled={saving || !valid}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] disabled:opacity-50 transition-colors"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>
    </div>
  );
}
