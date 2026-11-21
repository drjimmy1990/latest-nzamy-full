"use client";

import { useEffect, useState } from "react";
import { parseSummariesReviewedOnly, SUMMARIES_REVIEWED_ONLY_KEY } from "@/lib/library/summaryReview";
import {
  FREE_QUESTION_TOOL_SETTING,
  GENERAL_FREE_QUESTION_TOOL,
  parseIndividualFreeQuestionTool,
  type IndividualFreeQuestionTool,
} from "@/lib/ai/freeQuestion";

/**
 * «قواعد المكتبة والأسئلة المجانية» on the admin settings page (batch l12
 * rules, 20261202_50). Two platform_settings keys, each saved through PATCH
 * /api/v1/admin/settings (validated and audited there):
 *   - library_summaries_reviewed_only {"on": boolean} — Q96: only a reviewed
 *     summary is shown in the library (ON by default);
 *   - free_question_tool_by_account_type {"individual": tool} — Q121: where an
 *     individual's free questions are used (quick-answer by default).
 */
export function LibraryRulesSettings({ isDark }: { isDark: boolean }) {
  const [reviewedOnly, setReviewedOnly] = useState(true);
  const [tool, setTool] = useState<IndividualFreeQuestionTool>(GENERAL_FREE_QUESTION_TOOL);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const data = (body?.data ?? {}) as Record<string, unknown>;
        if (cancelled) return;
        setReviewedOnly(parseSummariesReviewedOnly(data[SUMMARIES_REVIEWED_ONLY_KEY]));
        setTool(parseIndividualFreeQuestionTool(data[FREE_QUESTION_TOOL_SETTING]));
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
      const err =
        (await patch(SUMMARIES_REVIEWED_ONLY_KEY, { on: reviewedOnly })) ??
        (await patch(FREE_QUESTION_TOOL_SETTING, { individual: tool }));
      setStatus(err ? { ok: false, text: err } : { ok: true, text: "حُفظت القواعد. تسري خلال دقيقة." });
    } catch {
      setStatus({ ok: false, text: "تعذّر الحفظ. حاول مرة أخرى." });
    } finally {
      setSaving(false);
    }
  }

  const label = `text-xs font-bold block mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`;
  const input = `w-full rounded-xl border px-3 py-2 text-sm ${isDark ? "border-white/10 bg-[#0d1117] text-white" : "border-gray-200 bg-white text-gray-900"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-500";

  return (
    <div dir="rtl">
      <h3 className={`text-sm font-bold mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>قواعد المكتبة والأسئلة المجانية</h3>
      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={reviewedOnly} onChange={(e) => setReviewedOnly(e.target.checked)} />
        <span>
          <span className={label}>إخفاء كل موجز غير مراجَع</span>
          <span className={`text-xs ${muted}`}>
            يظهر الموجز في صفحة النظام وبطاقات المكتبة والقرارات ونتائج البحث فقط إذا كانت حالته «مراجَع». أطفئه لإظهار الموجزات كما كانت.
          </span>
        </span>
      </label>
      <label className="mt-4 block max-w-sm">
        <span className={label}>الأداة التي يستخدم فيها الفرد أسئلته المجانية</span>
        <select value={tool} onChange={(e) => setTool(parseIndividualFreeQuestionTool({ individual: e.target.value }))} className={input}>
          <option value="quick-answer">المجيب القانوني السريع (الحالي)</option>
          <option value="assistant">المساعد المتقدم (بعد فتحه للأفراد)</option>
        </select>
        <span className={`mt-1 block text-xs ${muted}`}>
          أسئلة المحامي المجانية في مساعد المكتبة دائماً، مع معاينة مختصرة للمصادر لمن ليس لديه اشتراك مكتبة.
        </span>
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
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-white hover:bg-[#0a3328] disabled:opacity-50 transition-colors"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ"}
        </button>
      </div>
    </div>
  );
}
