"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise } from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { staffMaySee } from "@/lib/auth/adminNavAccess";

/**
 * «القضايا المقيّدة» — owner decision س٢١٦ (migration 20261206_12). The
 * administration sees a restricted firm case's metadata only (number, firm,
 * status, dates). Emergency access («الوصول الطارئ») needs a written reason,
 * the approval of a SECOND super admin, a short window (15–240 minutes), and
 * the firm is notified when it is approved; every step is audited.
 *   GET  /api/v1/admin/restricted-cases
 *   POST /api/v1/admin/restricted-cases/access  { action, requestId | grantId, reason?, minutes?, note? }
 *   GET  /api/v1/admin/restricted-cases/[id]/break-glass
 * Super admins only (staff.manage); the database decides every step.
 */

type Props = { isDark: boolean; card: string };

type CaseRow = { id: string; firmName: string | null; status: string | null; createdAt: string | null; updatedAt: string | null };
type GrantRow = {
  id: string; requestId: string; reason: string; durationMinutes: number;
  requestedAt: string; requestedBy: string | null; requestedByMe: boolean;
  approvedBy: string | null; expiresAt: string | null; status: string; statusAr: string;
};
type Summary = {
  case: { id: string; title: string | null; description: string | null; status: string | null } | null;
  documents: Array<{ id: number; file_name: string; created_at: string | null }>;
};

const MINUTES = [15, 30, 60, 120, 240] as const;

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });
};

export default function RestrictedCasesPanel({ isDark, card }: Props) {
  const { staffRole } = useUser();
  const allowed = staffMaySee(staffRole, "staff.manage");
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [installed, setInstalled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ requestId: string; reason: string; minutes: number }>({ requestId: "", reason: "", minutes: 60 });
  const [summary, setSummary] = useState<{ grantId: string; data: Summary } | null>(null);

  const tp = isDark ? "text-white" : "text-slate-800";
  const ts = isDark ? "text-zinc-400" : "text-slate-500";
  const input = `w-full rounded-lg border px-3 py-2 text-[12px] outline-none ${
    isDark ? "border-white/10 bg-zinc-900 text-white" : "border-slate-200 bg-white text-slate-800"
  }`;
  const btn = `rounded-lg px-3 py-1.5 text-[11px] font-bold disabled:opacity-50 ${
    isDark ? "bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
  }`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/restricted-cases", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice({ ok: false, msg: body?.error ?? "تعذّر تحميل القضايا المقيّدة." });
        return;
      }
      setCases(Array.isArray(body?.cases) ? body.cases : []);
      setGrants(Array.isArray(body?.grants) ? body.grants : []);
      setInstalled(body?.installed !== false);
    } catch {
      setNotice({ ok: false, msg: "تعذّر الاتصال بالخادم." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (allowed) load(); else setLoading(false); }, [allowed, load]);

  const act = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v1/admin/restricted-cases/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      setNotice(res.ok ? { ok: true, msg: okMsg } : { ok: false, msg: body?.error ?? "تعذّر إتمام العملية." });
      if (res.ok) await load();
      return res.ok;
    } catch {
      setNotice({ ok: false, msg: "تعذّر الاتصال بالخادم." });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const read = async (g: GrantRow) => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/v1/admin/restricted-cases/${encodeURIComponent(g.requestId)}/break-glass`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok) setNotice({ ok: false, msg: body?.error ?? "تعذّر فتح القضية." });
      else setSummary({ grantId: g.id, data: body.data as Summary });
    } catch {
      setNotice({ ok: false, msg: "تعذّر الاتصال بالخادم." });
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <div className={`${card} p-6 text-[12px] ${ts}`}>
        هذا القسم لمسؤول أعلى في المنصة فقط.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${card} space-y-2 p-5`}>
        <div className="flex items-center justify-between">
          <h2 className={`text-[14px] font-bold ${tp}`}>القضايا المقيّدة — البيانات الوصفية فقط</h2>
          <button onClick={load} disabled={loading} className={btn} aria-label="تحديث">
            <ArrowClockwise size={13} />
          </button>
        </div>
        <p className={`text-[11px] leading-6 ${ts}`}>
          لا تطّلع الإدارة على محتوى القضية المقيّدة. الوصول الطارئ يحتاج سبباً مكتوباً وموافقة مسؤول أعلى ثانٍ،
          ومدته قصيرة، ويُبلَّغ المكتب عند الموافقة، ويُسجَّل كل إجراء في سجل التدقيق.
        </p>
        {!installed && <p className="text-[11px] font-bold text-amber-500">الوصول الطارئ قيد التفعيل.</p>}
        {notice && (
          <p className={`text-[11px] font-bold ${notice.ok ? "text-emerald-500" : "text-red-500"}`}>{notice.msg}</p>
        )}
        {loading ? (
          <p className={`text-[12px] ${ts}`}>جارٍ التحميل…</p>
        ) : cases.length === 0 ? (
          <p className={`text-[12px] ${ts}`}>لا توجد قضايا مقيّدة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[11px]">
              <thead className={ts}>
                <tr><th className="py-1">رقم القضية</th><th>المكتب</th><th>الحالة</th><th>آخر تحديث</th><th></th></tr>
              </thead>
              <tbody className={tp}>
                {cases.map((c) => (
                  <tr key={c.id} className={isDark ? "border-t border-white/[0.06]" : "border-t border-slate-100"}>
                    <td className="py-1.5 font-mono">{c.id}</td>
                    <td>{c.firmName ?? "—"}</td>
                    <td>{c.status ?? "—"}</td>
                    <td>{fmt(c.updatedAt)}</td>
                    <td>
                      <button className={btn} disabled={!installed}
                        onClick={() => setForm((f) => ({ ...f, requestId: c.id }))}>طلب وصول طارئ</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form.requestId && (
        <div className={`${card} space-y-2 p-5`}>
          <h3 className={`text-[13px] font-bold ${tp}`}>طلب وصول طارئ إلى القضية {form.requestId}</h3>
          <textarea className={input} rows={3} maxLength={1000} value={form.reason}
            placeholder="اكتب سبب الوصول بوضوح (٢٠ حرفاً على الأقل)"
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
          <div className="flex flex-wrap items-center gap-2">
            <label className={`text-[11px] ${ts}`}>المدة بعد الموافقة:</label>
            <select className={`${input} w-auto`} value={form.minutes}
              onChange={(e) => setForm((f) => ({ ...f, minutes: Number(e.target.value) }))}>
              {MINUTES.map((m) => <option key={m} value={m}>{m} دقيقة</option>)}
            </select>
            <button className={btn} disabled={busy || form.reason.trim().length < 20}
              onClick={async () => {
                const ok = await act({ action: "request", requestId: form.requestId, reason: form.reason, minutes: form.minutes },
                  "أُرسل الطلب، وينتظر موافقة مسؤول أعلى ثانٍ.");
                if (ok) setForm({ requestId: "", reason: "", minutes: 60 });
              }}>إرسال الطلب</button>
            <button className={btn} disabled={busy} onClick={() => setForm({ requestId: "", reason: "", minutes: 60 })}>إلغاء</button>
          </div>
        </div>
      )}

      <div className={`${card} space-y-2 p-5`}>
        <h2 className={`text-[14px] font-bold ${tp}`}>طلبات الوصول الطارئ</h2>
        {grants.length === 0 ? (
          <p className={`text-[12px] ${ts}`}>لا توجد طلبات.</p>
        ) : grants.map((g) => (
          <div key={g.id} className={`rounded-xl border p-3 text-[11px] ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <div className={`flex flex-wrap items-center gap-2 ${tp}`}>
              <span className="font-mono">{g.requestId}</span>
              <span className="font-bold">{g.statusAr}</span>
              <span className={ts}>طلبه {g.requestedBy ?? "—"} في {fmt(g.requestedAt)} لمدة {g.durationMinutes} دقيقة</span>
              {g.approvedBy && <span className={ts}>وافق {g.approvedBy}؛ ينتهي {fmt(g.expiresAt)}</span>}
            </div>
            <p className={`mt-1 ${ts}`}>السبب: {g.reason}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {g.status === "pending" && !g.requestedByMe && (
                <>
                  <button className={btn} disabled={busy}
                    onClick={() => act({ action: "approve", grantId: g.id }, "تمت الموافقة، وأُبلغ المكتب.")}>موافقة ثانية</button>
                  <button className={btn} disabled={busy}
                    onClick={() => act({ action: "reject", grantId: g.id }, "رُفض الطلب.")}>رفض</button>
                </>
              )}
              {g.status === "pending" && g.requestedByMe && (
                <button className={btn} disabled={busy}
                  onClick={() => act({ action: "reject", grantId: g.id }, "سُحب الطلب.")}>سحب الطلب</button>
              )}
              {g.status === "active" && g.requestedByMe && (
                <button className={btn} disabled={busy} onClick={() => read(g)}>فتح القضية</button>
              )}
              {g.status === "active" && (
                <button className={btn} disabled={busy}
                  onClick={() => act({ action: "revoke", grantId: g.id }, "أُنهي الوصول.")}>إنهاء الوصول الآن</button>
              )}
            </div>
            {summary?.grantId === g.id && summary.data.case && (
              <div className={`mt-3 space-y-1 rounded-lg p-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                <p className={`font-bold ${tp}`}>{summary.data.case.title ?? "بلا عنوان"}</p>
                <p className={`whitespace-pre-wrap ${ts}`}>{summary.data.case.description || "—"}</p>
                <p className={`font-bold ${tp}`}>المستندات ({summary.data.documents.length})</p>
                <ul className={`list-disc pr-5 ${ts}`}>
                  {summary.data.documents.map((d) => <li key={d.id}>{d.file_name} — {fmt(d.created_at)}</li>)}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
