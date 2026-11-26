"use client";

import { useEffect, useState } from "react";
import { parseSummariesReviewedOnly, SUMMARIES_REVIEWED_ONLY_DEFAULT, SUMMARIES_REVIEWED_ONLY_KEY } from "@/lib/library/summaryReview";
import {
  DEFAULT_INDIVIDUAL_FREE_QUESTION_TOOL,
  FREE_QUESTION_TOOL_SETTING,
  parseIndividualFreeQuestionTool,
  type IndividualFreeQuestionTool,
} from "@/lib/ai/freeQuestion";
import { arabicVoices, LISTEN_VOICE_DEFAULT, LISTEN_VOICE_SETTING, parseListenVoice, pickVoice } from "@/lib/ai/listenVoice";
import { parseSummaryStatusCount, summaryStatusLines, summaryStatusWarning, type SummaryStatusCounts } from "@/lib/library/summaryStatusCounts";

/**
 * «قواعد المكتبة والأسئلة المجانية» on the admin settings page (batch l12
 * rules, 20261202_50). Two platform_settings keys, each saved through PATCH
 * /api/v1/admin/settings (validated and audited there):
 *   - library_summaries_reviewed_only {"on": boolean} — Q96: only a reviewed
 *     summary is shown in the library (OFF by default);
 *   - free_question_tool_by_account_type {"individual": tool} — Q121: where an
 *     individual's free questions are used (Q181, batch l13: «مساعد نظامي»,
 *     the floating window, by default);
 *   - listen_voice {"voice": name} — Q182 (batch l13): the voice «استمع
 *     للإجابة» reads with ("" = the browser's first ar-SA voice). The list is
 *     this admin's own browser's Arabic voices; a visitor whose browser lacks
 *     the chosen one hears the first ar-SA voice of his own.
 */
export function LibraryRulesSettings({ isDark }: { isDark: boolean }) {
  const [reviewedOnly, setReviewedOnly] = useState(SUMMARIES_REVIEWED_ONLY_DEFAULT);
  const [tool, setTool] = useState<IndividualFreeQuestionTool>(DEFAULT_INDIVIDUAL_FREE_QUESTION_TOOL);
  const [voice, setVoice] = useState(LISTEN_VOICE_DEFAULT);
  const [voiceNames, setVoiceNames] = useState<string[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  // B-50 (batch l16): how many summaries are reviewed / draft / without a status, beside the switch.
  const [statusCounts, setStatusCounts] = useState<SummaryStatusCounts | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/library-summary-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        setStatusCounts({ laws: parseSummaryStatusCount(body.laws), decrees: parseSummaryStatusCount(body.decrees) });
      })
      .catch(() => {
        /* the card shows no count */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const data = (body?.data ?? {}) as Record<string, unknown>;
        if (cancelled) return;
        setReviewedOnly(parseSummariesReviewedOnly(data[SUMMARIES_REVIEWED_ONLY_KEY]));
        setTool(parseIndividualFreeQuestionTool(data[FREE_QUESTION_TOOL_SETTING]));
        setVoice(parseListenVoice(data[LISTEN_VOICE_SETTING]));
      })
      .catch(() => {
        /* the defaults stay on screen */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Q182: this browser's Arabic voices (the list fills in after `voiceschanged`).
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const read = () => setVoiceNames(arabicVoices(synth.getVoices()).map((v) => v.name));
    read();
    synth.addEventListener("voiceschanged", read);
    return () => synth.removeEventListener("voiceschanged", read);
  }, []);

  function tryVoice() {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance("هذا مثال لقراءة الإجابة بصوت نظامي.");
      const v = pickVoice(synth.getVoices(), voice);
      u.lang = v?.lang ?? "ar-SA";
      if (v) u.voice = v;
      synth.speak(u);
    } catch {
      /* no speech in this browser */
    }
  }

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
        (await patch(FREE_QUESTION_TOOL_SETTING, { individual: tool })) ??
        (await patch(LISTEN_VOICE_SETTING, { voice }));
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
      <h3 className={`text-sm font-bold mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>قواعد المكتبة والأسئلة المجانية والاستماع</h3>
      <label className="mt-3 flex items-start gap-2">
        <input type="checkbox" className="mt-1" checked={reviewedOnly} onChange={(e) => setReviewedOnly(e.target.checked)} />
        <span>
          <span className={label}>إخفاء كل موجز غير مراجَع</span>
          <span className={`text-xs ${muted}`}>
            عند تشغيله يظهر الموجز في صفحة النظام وبطاقات المكتبة والقرارات ونتائج البحث فقط إذا كانت حالته «مراجَع». لا تشغّله قبل تحديد حالة موجزات المراسيم، وإلا اختفت كلها.
          </span>
          {statusCounts && (
            <span data-testid="summary-status-counts" className={`mt-1.5 block text-xs ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
              {summaryStatusLines(statusCounts).map((line) => (
                <span key={line} className="block">{line}</span>
              ))}
              {summaryStatusWarning(statusCounts) && (
                <span role="note" className={`mt-1 block font-bold ${isDark ? "text-amber-300" : "text-amber-700"}`}>{summaryStatusWarning(statusCounts)}</span>
              )}
            </span>
          )}
        </span>
      </label>
      <label className="mt-4 block max-w-sm">
        <span className={label}>الأداة التي يستخدم فيها الفرد أسئلته المجانية</span>
        <select value={tool} onChange={(e) => setTool(parseIndividualFreeQuestionTool({ individual: e.target.value }))} className={input}>
          <option value="floating">مساعد نظامي العائم (قرار المالك — الافتراضي)</option>
          <option value="quick-answer">المجيب القانوني السريع</option>
          <option value="assistant">المساعد المتقدم (بعد فتحه للأفراد)</option>
        </select>
        <span className={`mt-1 block text-xs ${muted}`}>
          أسئلة المحامي المجانية في مساعد المكتبة دائماً، مع معاينة مختصرة للمصادر لمن ليس لديه اشتراك مكتبة.
        </span>
      </label>
      <label className="mt-4 block max-w-sm">
        <span className={label}>صوت «استمع للإجابة»</span>
        <select value={voice} onChange={(e) => setVoice(e.target.value)} className={input}>
          <option value="">أول صوت عربي سعودي في متصفح الزائر (الافتراضي)</option>
          {voice && !voiceNames.includes(voice) && <option value={voice}>{voice} (غير موجود في متصفحك)</option>}
          {voiceNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className={`mt-1 block text-xs ${muted}`}>
          القراءة الصوتية مجانية وتتم في متصفح الزائر. القائمة هي الأصوات العربية في متصفحك أنت، وتختلف من جهاز لآخر؛ إن لم يجد متصفح الزائر الصوت المختار قرأ بأول صوت عربي سعودي لديه.
        </span>
        {voiceNames.length > 0 && (
          <button type="button" onClick={tryVoice} className={`mt-2 text-xs font-bold underline ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>
            جرّب الصوت المختار
          </button>
        )}
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
