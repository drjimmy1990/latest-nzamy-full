"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, LockSimple, LockSimpleOpen, Plus } from "@phosphor-icons/react";
import type { LockDto } from "@/lib/library/securityLockAdmin";
import { LIBRARY_READ_QUOTA } from "@/lib/library/readQuota";

/**
 * «قفل المكتبة» — owner note ١٣ C09: the REAL tab of the security page. It
 * lists the library-only security locks (public.library_security_locks), lets
 * an admin lift one with one click, and lock a user's library reading by
 * e-mail. A lock never freezes or deletes the account.
 *   GET  /api/v1/admin/library-security-locks?state=open|all
 *   POST /api/v1/admin/library-security-locks            { email, note, until? }
 *   POST /api/v1/admin/library-security-locks/[id]/lift  { note?, resetToday }
 */

type Props = { isDark: boolean; card: string };

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
};

export default function LibraryLocksPanel({ isDark, card }: Props) {
  const [state, setState] = useState<"open" | "all">("open");
  const [rows, setRows] = useState<LockDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [liftNote, setLiftNote] = useState<Record<string, string>>({});
  const [resetToday, setResetToday] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ email: "", note: "", until: "" });
  const [creating, setCreating] = useState(false);

  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const input = `w-full rounded-lg border px-3 py-2 text-[12px] outline-none ${
    isDark ? "border-white/10 bg-zinc-900 text-white" : "border-slate-200 bg-white text-slate-800"
  }`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/library-security-locks?state=${state}`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setRows([]);
        setNotice({ ok: false, msg: body?.error ?? "تعذّر تحميل أقفال المكتبة." });
      } else {
        setRows(Array.isArray(body?.data) ? body.data : []);
        if (body?.migrationMissing) setNotice({ ok: false, msg: body.message });
      }
    } catch {
      setNotice({ ok: false, msg: "تعذّر الاتصال بالخادم." });
    } finally {
      setLoading(false);
    }
  }, [state]);

  useEffect(() => { load(); }, [load]);

  async function lift(row: LockDto) {
    setBusyId(row.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/admin/library-security-locks/${row.id}/lift`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: liftNote[row.id] ?? "", resetToday: resetToday[row.id] ?? true }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) setNotice({ ok: false, msg: body?.error ?? "تعذّر رفع الإيقاف." });
      else {
        setNotice({ ok: true, msg: `رُفع الإيقاف ${row.reference}. يقرأ المستخدم المكتبة من جديد خلال دقيقة.` });
        await load();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/admin/library-security-locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          note: form.note.trim(),
          until: form.until ? new Date(form.until).toISOString() : null,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) setNotice({ ok: false, msg: body?.error ?? "تعذّر إيقاف القراءة." });
      else {
        setNotice({ ok: true, msg: `أُوقفت قراءة المكتبة لهذا الحساب — المرجع ${body?.data?.reference ?? ""}.` });
        setForm({ email: "", note: "", until: "" });
        await load();
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={`${card} p-5`}>
        <p className={`text-[13px] font-bold mb-1 ${tp}`}>قفل المكتبة — إيقاف القراءة فقط</p>
        <p className={`text-[11px] leading-relaxed ${ts}`}>
          القفل يوقف قراءة المكتبة القانونية وحدها؛ لا يجمّد الحساب ولا يحذفه، وبقية خدمات المنصة تعمل. يُفتح تلقائياً
          إذا حاول القارئ فتح {LIBRARY_READ_QUOTA.lockAfterRefused} وثيقة مختلفة بعد بلوغ حده في اليوم نفسه (الحد:{" "}
          {LIBRARY_READ_QUOTA.dailyDocs} وثيقة للفرد، {LIBRARY_READ_QUOTA.memberDailyDocs} لعضو المكتب أو الشركة،{" "}
          {LIBRARY_READ_QUOTA.hourlyDocs} في الساعة)، أو بقرار منك هنا. يرى المستخدم رقم المرجع ورابط «تواصل معنا».
        </p>
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-2.5 text-[12px] ${
            notice.ok
              ? isDark ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-emerald-200 bg-emerald-50 text-emerald-800"
              : isDark ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {notice.msg}
        </div>
      )}

      <form onSubmit={create} className={`${card} p-5 grid gap-3 md:grid-cols-4`}>
        <div className="md:col-span-1">
          <label className={`mb-1 block text-[11px] ${ts}`}>بريد المستخدم</label>
          <input type="email" required dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
        </div>
        <div className="md:col-span-2">
          <label className={`mb-1 block text-[11px] ${ts}`}>السبب (للسجل، لا يراه المستخدم)</label>
          <input type="text" required maxLength={1000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={input} />
        </div>
        <div className="md:col-span-1">
          <label className={`mb-1 block text-[11px] ${ts}`}>ينتهي في (اختياري)</label>
          <input type="datetime-local" value={form.until} onChange={(e) => setForm({ ...form, until: e.target.value })} className={input} />
        </div>
        <div className="md:col-span-4 flex justify-end">
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-[12px] font-bold text-white hover:bg-red-500 disabled:opacity-50"
          >
            <Plus size={13} weight="bold" /> إيقاف قراءة المكتبة لهذا الحساب
          </button>
        </div>
      </form>

      <div className={`${card} p-5`}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {(["open", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setState(s)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${
                  state === s ? (isDark ? "bg-white/10 text-white" : "bg-slate-800 text-white") : ts
                }`}
              >
                {s === "open" ? "الأقفال المفتوحة" : "كل السجل"}
              </button>
            ))}
          </div>
          <button onClick={load} className={`inline-flex items-center gap-1 text-[11px] ${ts}`}>
            <ArrowClockwise size={12} /> تحديث
          </button>
        </div>

        {loading ? (
          <p className={`py-6 text-center text-[12px] ${ts}`}>جارِ التحميل…</p>
        ) : rows.length === 0 ? (
          <p className={`py-6 text-center text-[12px] ${ts}`}>
            {state === "open" ? "لا توجد أقفال مفتوحة الآن." : "لا يوجد أي قفل في السجل."}
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className={`rounded-xl border p-3 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {r.active ? <LockSimple size={14} className="text-red-400" /> : <LockSimpleOpen size={14} className="text-emerald-400" />}
                    <span dir="ltr" className={`font-mono text-[12px] font-bold ${tp}`}>#{r.reference}</span>
                    <span className={`text-[12px] ${tp}`}>{r.user.name || r.user.email || r.userId}</span>
                    {r.user.email && r.user.name && <span dir="ltr" className={`text-[11px] ${ts}`}>{r.user.email}</span>}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    r.active ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-500"
                  }`}>
                    {r.active ? "مفعّل" : r.liftedAt ? "مرفوع" : "انتهت مدته"}
                  </span>
                </div>
                <div className={`mt-1.5 grid gap-x-4 gap-y-0.5 text-[11px] md:grid-cols-2 ${ts}`}>
                  <span>السبب: {r.reasonAr}{r.note ? ` — ${r.note}` : ""}</span>
                  <span>بدأ: {fmt(r.lockedAt)}{r.lockedBy ? ` — بواسطة ${r.lockedBy.name || r.lockedBy.email || "مسؤول"}` : ""}</span>
                  <span>ينتهي: {r.lockedUntil ? fmt(r.lockedUntil) : "حتى يُرفع"}</span>
                  {r.liftedAt && (
                    <span>رُفع: {fmt(r.liftedAt)}{r.liftedBy ? ` — ${r.liftedBy.name || r.liftedBy.email || "مسؤول"}` : ""}{r.liftNote ? ` — ${r.liftNote}` : ""}</span>
                  )}
                  {r.reason === "quota_breach" && r.details && (
                    <span>
                      وثائق مفتوحة: {String(r.details.allowed_docs ?? "—")} من {String(r.details.day_limit ?? "—")}، ومحاولات بعد الحد:{" "}
                      {String(r.details.refused_docs ?? "—")}
                    </span>
                  )}
                </div>
                {r.active && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      placeholder="ملاحظة الرفع (اختياري)"
                      maxLength={1000}
                      value={liftNote[r.id] ?? ""}
                      onChange={(e) => setLiftNote({ ...liftNote, [r.id]: e.target.value })}
                      className={`${input} max-w-xs`}
                    />
                    <label className={`inline-flex items-center gap-1 text-[11px] ${ts}`}>
                      <input
                        type="checkbox"
                        checked={resetToday[r.id] ?? true}
                        onChange={(e) => setResetToday({ ...resetToday, [r.id]: e.target.checked })}
                      />
                      تصفير عدّاد اليوم
                    </label>
                    <button
                      onClick={() => lift(r)}
                      disabled={busyId === r.id}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      <LockSimpleOpen size={12} /> رفع الإيقاف
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
