"use client";

import { useEffect, useState } from "react";
import {
  DAY_NAMES_AR,
  PRIORITY_MINUTES_CHOICES,
  workingHoursAr,
  type PriorityMinutes,
  type WorkingHours,
} from "@/lib/marketplace/marketPriority";

/**
 * Owner س٢٣ (batch l16): «نافذة أولوية نظامي» on /dashboard/admin/marketplace/orders —
 * the minutes (0 / 15 / 30 / 60) a client's new free request stays with the
 * Nezamy team before it joins the lawyers' market, and the working hours they
 * are counted in. Its own route (/api/v1/admin/marketplace/priority), so the
 * market settings above are untouched. A change applies to new requests.
 */
interface PriorityData {
  minutes: PriorityMinutes;
  workingHours: WorkingHours;
  installed: boolean;
}

export default function PrioritySettingsBox({ isDark }: { isDark: boolean }) {
  const [data, setData] = useState<PriorityData | null>(null);
  const [draft, setDraft] = useState<PriorityData | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/v1/admin/marketplace/priority", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { data?: PriorityData; error?: string };
        if (res.ok && body.data) {
          setData(body.data);
          setDraft(body.data);
        } else {
          setMsg({ ok: false, text: body.error || "تعذّر تحميل إعداد الأولوية." });
        }
      })
      .catch(() => setMsg({ ok: false, text: "تعذّر الاتصال." }));
  }, []);

  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const input = isDark
    ? "rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-sm text-white"
    : "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800";

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/admin/marketplace/priority", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: draft.minutes, workingHours: draft.workingHours }),
      });
      const body = (await res.json().catch(() => ({}))) as { data?: PriorityData; error?: string };
      if (!res.ok || !body.data) {
        setMsg({ ok: false, text: body.error || "تعذّر الحفظ." });
        return;
      }
      setData(body.data);
      setDraft(body.data);
      setMsg({ ok: true, text: "حُفظ. يسري على الطلبات الجديدة." });
    } catch {
      setMsg({ ok: false, text: "تعذّر الاتصال." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`mt-4 border-t pt-4 ${isDark ? "border-white/10" : "border-slate-200"}`} aria-labelledby="market-priority">
      <h3 id="market-priority" className={`text-sm font-bold mb-1 ${tp}`}>نافذة أولوية نظامي</h3>
      <p className={`text-xs mb-3 ${ts}`}>
        يبقى طلب العميل الجديد لدى فريق نظامي هذه المدة من ساعات العمل، ثم يُعرض تلقائياً على جميع المحامين الموثَّقين. يستطيع العميل فتحه للجميع فوراً،
        ويستطيع الفريق إسناده خلال النافذة من قائمة الطلبات أدناه. الطلب المنشور يدوياً لا ينتظر.
      </p>
      {!draft && !msg && <p className={`text-sm ${ts}`}>جارٍ التحميل…</p>}
      {draft && !draft.installed && <p className={`text-sm ${ts}`}>لم تُفعَّل بعد على قاعدة البيانات.</p>}
      {draft && draft.installed && (
        <div className="space-y-3 text-sm">
          <label className={`flex flex-wrap items-center gap-2 ${tp}`}>
            المدة
            <select
              className={input}
              value={draft.minutes}
              onChange={(e) => setDraft({ ...draft, minutes: Number(e.target.value) as PriorityMinutes })}
            >
              {PRIORITY_MINUTES_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "بلا نافذة (يُعرض فوراً)" : `${m.toLocaleString("ar-SA")} دقيقة`}
                </option>
              ))}
            </select>
          </label>
          <div className={`flex flex-wrap items-center gap-3 ${tp}`}>
            <span>أيام العمل:</span>
            {DAY_NAMES_AR.map((name, day) => (
              <label key={day} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={draft.workingHours.days.includes(day)}
                  onChange={(e) => {
                    const days = e.target.checked
                      ? [...draft.workingHours.days, day].sort((a, b) => a - b)
                      : draft.workingHours.days.filter((d) => d !== day);
                    setDraft({ ...draft, workingHours: { ...draft.workingHours, days } });
                  }}
                />
                {name}
              </label>
            ))}
          </div>
          <div className={`flex flex-wrap items-center gap-2 ${tp}`}>
            <label className="flex items-center gap-1">
              من
              <input
                type="time"
                className={input}
                value={draft.workingHours.start}
                onChange={(e) => setDraft({ ...draft, workingHours: { ...draft.workingHours, start: e.target.value } })}
              />
            </label>
            <label className="flex items-center gap-1">
              إلى
              <input
                type="time"
                className={input}
                value={draft.workingHours.end}
                onChange={(e) => setDraft({ ...draft, workingHours: { ...draft.workingHours, end: e.target.value } })}
              />
            </label>
            <span className={`text-xs ${ts}`}>بتوقيت الرياض</span>
          </div>
          {data && <p className={`text-xs ${ts}`}>الحالي: {data.minutes ? `${data.minutes.toLocaleString("ar-SA")} دقيقة` : "بلا نافذة"} — {workingHoursAr(data.workingHours)}. لا تُحتسب الإجازات الرسمية.</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-lg px-3 py-1.5 text-xs font-bold disabled:opacity-50 bg-emerald-600 text-white hover:bg-emerald-700"
            >
              حفظ نافذة الأولوية
            </button>
          </div>
        </div>
      )}
      {msg && (
        <p role="status" className={`mt-2 text-xs ${msg.ok ? "text-emerald-600" : "text-red-600 dark:text-red-400"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
