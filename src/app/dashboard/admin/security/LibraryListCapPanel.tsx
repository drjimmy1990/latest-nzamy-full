"use client";

import { useCallback, useEffect, useState } from "react";
import { FloppyDisk, ShieldWarning } from "@phosphor-icons/react";
import { LIST_CAP_DEFAULTS, LIST_CAP_INTS, type ListCapSettings } from "@/lib/library/publicListCap";
import { useUser } from "@/hooks/useUser";
import { staffMaySee } from "@/lib/auth/adminNavAccess";

/**
 * «حد تصفح القوائم لغير المشترك» (batch l12, Q100a) — inside the «حماية
 * المكتبة من السحب» tab. OFF until the owner approves the evidence (the
 * server refuses ON without the confirmation box). GET|PUT
 * /api/v1/admin/library-monitor/list-cap.
 */

type Props = { isDark: boolean; card: string };

interface DayStats {
  day: string;
  viewers: number;
  items: number;
  refusedRequests: number;
  refusedItems: number;
}

function settingsFrom(value: unknown): ListCapSettings {
  const s = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out: ListCapSettings = { ...LIST_CAP_DEFAULTS };
  if (typeof s.enabled === "boolean") out.enabled = s.enabled;
  for (const i of LIST_CAP_INTS) if (typeof s[i.key] === "number") out[i.key] = s[i.key] as never;
  return out;
}

export default function LibraryListCapPanel({ isDark, card }: Props) {
  const { staffRole } = useUser();
  const canWrite = staffMaySee(staffRole, "settings.write");
  const [saved, setSaved] = useState<ListCapSettings>({ ...LIST_CAP_DEFAULTS });
  const [draft, setDraft] = useState<ListCapSettings>({ ...LIST_CAP_DEFAULTS });
  const [confirmEvidence, setConfirmEvidence] = useState(false);
  const [days, setDays] = useState<DayStats[]>([]);
  const [missing, setMissing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const line = isDark ? "border-white/[0.06]" : "border-slate-100";
  const warn = isDark ? "text-amber-300" : "text-amber-700";
  const input = `w-full rounded-lg border px-3 py-2 text-[12px] outline-none ${
    isDark ? "border-white/10 bg-zinc-900 text-white" : "border-slate-200 bg-white text-slate-800"
  }`;

  const apply = useCallback((s: ListCapSettings) => {
    setSaved(s);
    setDraft(s);
    setConfirmEvidence(false);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/admin/library-monitor/list-cap", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !body) {
        setNotice({ ok: false, msg: String(body?.error ?? "تعذّر تحميل الإعدادات.") });
        return;
      }
      apply(settingsFrom(body.settings));
      setMissing(body.migrationMissing ? String(body.message ?? "") : null);
      const stats = body.stats && typeof body.stats === "object" ? (body.stats as Record<string, unknown>) : null;
      setDays(Array.isArray(stats?.days) ? (stats!.days as DayStats[]) : []);
    } catch {
      setNotice({ ok: false, msg: "تعذّر الاتصال بالخادم." });
    }
  }, [apply]);

  useEffect(() => {
    load();
  }, [load]);

  const patch: Record<string, unknown> = {};
  if (draft.enabled !== saved.enabled) patch.enabled = draft.enabled;
  for (const i of LIST_CAP_INTS) if (draft[i.key] !== saved[i.key]) patch[i.key] = draft[i.key];
  const changed = Object.keys(patch).length;
  const switchingOn = draft.enabled && !saved.enabled;

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/admin/library-monitor/list-cap", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list: patch, ...(switchingOn ? { confirmEvidence } : {}) }),
      });
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok || !body) setNotice({ ok: false, msg: String(body?.error ?? "تعذّر حفظ الإعدادات.") });
      else {
        apply(settingsFrom(body.settings));
        setNotice({ ok: true, msg: "حُفظت الإعدادات. تسري خلال دقيقة." });
      }
    } catch {
      setNotice({ ok: false, msg: "تعذّر الاتصال بالخادم." });
    }
    setBusy(false);
  }

  return (
    <div className={`${card} p-5 space-y-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className={`text-[12px] font-bold ${tp}`}>حد تصفح القوائم لغير المشترك</p>
          <p className={`text-[11px] leading-relaxed ${ts}`}>
            يُحسب كل عنصر مختلف يظهر لغير المشترك في قوائم المكتبة ونتائج البحث. العنصر الذي ظهر له اليوم لا يُحسب مرة أخرى.
            لا تُحسب صفحات المستندات ولا مربع الاقتراحات. المشترك لا يدخل في هذا الحد، ولا زاحف البحث بعد التحقق من عنوانه.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={save}
            disabled={changed === 0 || busy || !!missing || (switchingOn && !confirmEvidence)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            <FloppyDisk size={13} /> حفظ {changed > 0 ? `(${changed})` : ""}
          </button>
        )}
      </div>
      {notice && (
        <p className={`text-[12px] font-bold ${notice.ok ? (isDark ? "text-emerald-300" : "text-emerald-700") : isDark ? "text-red-300" : "text-red-700"}`}>
          {notice.msg}
        </p>
      )}
      {missing && <p className={`text-[12px] font-bold ${warn}`}>غير متاح بعد: {missing}</p>}
      <p className={`text-[12px] font-bold ${saved.enabled ? warn : tp}`}>الحالة الآن: {saved.enabled ? "مُشغَّل" : "مُطفأ"}</p>

      <fieldset disabled={!canWrite} className={`rounded-xl border p-4 space-y-3 ${line}`}>
        <label className={`flex items-center gap-2 text-[12px] ${tp}`}>
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
          تشغيل حد تصفح القوائم لغير المشترك
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          {LIST_CAP_INTS.map((spec) => (
            <div key={spec.key}>
              <label className={`mb-1 block text-[11px] ${ts}`}>{spec.labelAr}</label>
              <input
                type="number"
                min={spec.min}
                max={spec.max}
                value={String(draft[spec.key] ?? "")}
                onChange={(e) => {
                  const n = Math.trunc(Number(e.target.value));
                  if (Number.isFinite(n)) setDraft({ ...draft, [spec.key]: n });
                }}
                className={input}
              />
              <p className={`mt-0.5 text-[9px] ${ts}`}>من {spec.min} إلى {spec.max}</p>
            </div>
          ))}
        </div>
        {switchingOn && (
          <div className={`flex items-start gap-2 rounded-lg border p-3 ${isDark ? "border-amber-400/30" : "border-amber-300"}`}>
            <ShieldWarning size={16} className={warn} />
            <label className={`flex items-start gap-2 text-[11px] leading-relaxed ${tp}`}>
              <input type="checkbox" checked={confirmEvidence} onChange={(e) => setConfirmEvidence(e.target.checked)} />
              اطلعتُ على أدلة عدم الإضرار بالظهور في محركات البحث، ووافق المالك على تشغيل حد القوائم.
            </label>
          </div>
        )}
      </fieldset>

      <div>
        <p className={`mb-2 text-[12px] font-bold ${tp}`}>آخر سبعة أيام</p>
        {days.length === 0 ? (
          <p className={`text-[11px] ${ts}`}>لا أرقام بعد (الحد مُطفأ أو لم يُشغَّل ملف الترحيل).</p>
        ) : (
          <table className={`w-full text-[11px] ${ts}`}>
            <thead>
              <tr className={tp}>
                <th className="p-1 text-start">اليوم</th>
                <th className="p-1 text-start">زوار</th>
                <th className="p-1 text-start">عناصر ظهرت</th>
                <th className="p-1 text-start">طلبات قُصّت</th>
                <th className="p-1 text-start">عناصر حُجبت</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d.day} className={`border-t ${line}`}>
                  <td className="p-1">{d.day}</td>
                  <td className="p-1">{d.viewers}</td>
                  <td className="p-1">{d.items}</td>
                  <td className="p-1">{d.refusedRequests}</td>
                  <td className="p-1">{d.refusedItems}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
