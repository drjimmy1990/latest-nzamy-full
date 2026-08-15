"use client";

import { useState } from "react";
import { PaperPlaneTilt, Warning, Paperclip } from "@phosphor-icons/react";

interface Props {
  isDark: boolean;
  summary: { label: string; value: string }[];
  attachments: { name: string; size: number }[];
  notes: string;
  setNotes: (v: string) => void;
  submitting: boolean;
  errors: string[];
  onSubmit: () => void;
}

export function StepSubmit({
  isDark, summary, attachments, notes, setNotes, submitting, errors, onSubmit,
}: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  return (
    <div className={`${card} p-5 space-y-5`} dir="rtl">
      <div>
        <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
          مراجعة وإرسال
        </h2>
        <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
          سيتولى فريق نظامي إعداد المذكرة يدوياً، وسيصلك إشعار عند جهوزيتها.
        </p>
      </div>

      <dl className="space-y-2">
        {summary.map((row) => (
          <div key={row.label} className="flex gap-3 text-[12px]">
            <dt className={isDark ? "text-zinc-500 w-32 shrink-0" : "text-zinc-400 w-32 shrink-0"}>
              {row.label}
            </dt>
            <dd className={isDark ? "text-zinc-200" : "text-zinc-800"}>{row.value || "—"}</dd>
          </div>
        ))}
      </dl>

      {attachments.length > 0 && (
        <div className="space-y-1.5">
          <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
            المرفقات ({attachments.length})
          </p>
          {attachments.map((a) => (
            <div key={a.name} className={`flex items-center gap-2 text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              <Paperclip size={12} /> {a.name}
            </div>
          ))}
        </div>
      )}

      <div>
        <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
          ملاحظات للفريق (اختياري)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={`w-full rounded-xl p-3 text-[12px] border ${
            isDark ? "bg-zinc-950 border-white/[0.07] text-zinc-200" : "bg-white border-zinc-200 text-zinc-800"
          }`}
        />
      </div>

      {errors.length > 0 && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-3 space-y-1">
          {errors.map((e) => (
            <p key={e} className="flex items-center gap-1.5 text-[11px] text-red-500">
              <Warning size={12} /> {e}
            </p>
          ))}
        </div>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5" />
        <span className={`text-[11px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          أقر بأن البيانات المدخلة صحيحة، وأوافق على معالجتها لإعداد المذكرة.
        </span>
      </label>

      <button
        onClick={onSubmit}
        disabled={!confirmed || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-6 py-3 text-[13px] font-bold text-white shadow-md disabled:opacity-40"
      >
        <PaperPlaneTilt size={15} />
        {submitting ? "جارٍ الإرسال..." : "إرسال الطلب"}
      </button>
    </div>
  );
}
