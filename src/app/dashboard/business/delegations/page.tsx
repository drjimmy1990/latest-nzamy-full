"use client";

/**
 * «التفويض» — /dashboard/business/delegations.
 *
 * Owner decision ٣٦: «تعديل بيانات الشركة محصور في مالك الحساب الرئيسي (Owner)،
 * أو المفوّض رسمياً بصلاحية إدارية مسجلة في جدول التفويضات», and owner
 * decision ٥, which lists «التفويض» among the five company sections to build
 * first. This page IS that register: `public.business_delegations`
 * (20261017_30) through /api/v1/business/delegations.
 *
 *   • the owner registers an active member as a delegate (optionally until a
 *     last day) and revokes a delegation;
 *   • every active member reads the register — who may edit the company data,
 *     since when, until when, who granted and who revoked;
 *   • a delegate is told so and sent to «بيانات المنشأة» to use the power.
 *
 * Nothing here is decided in the browser: `canManage`, the eligible members and
 * each row's state come from the server, and the database refuses what the
 * server would refuse.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Handshake, Plus, Warning, CheckCircle, ArrowLeft, Buildings, XCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import {
  getBusinessDelegations,
  createBusinessDelegation,
  revokeBusinessDelegation,
  type DelegationsRead,
} from "@/lib/services/businessDelegationsService";
import { DELEGATION_NOTE_MAX } from "@/lib/auth/businessDelegations";

function formatDay(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value.length === 10 ? `${value}T12:00:00+03:00` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
    timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric",
  }).format(d);
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  expired: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20",
  revoked: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  lapsed: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
};

export default function BusinessDelegationsPage() {
  const { isDark } = useTheme();
  const [read, setRead] = useState<DelegationsRead | null>(null);
  const [delegateId, setDelegateId] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRead(await getBusinessDelegations());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-400" : "text-slate-500";
  const heading = isDark ? "text-white" : "text-slate-800";
  const inputCls = `w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#0B3D2E]/30 ${
    isDark ? "bg-zinc-900 border-white/[0.08] text-zinc-200" : "bg-white border-slate-200 text-slate-800"
  }`;

  const handleCreate = async () => {
    if (saving) return;
    setFormError(null);
    if (!delegateId) {
      setFormError("اختر العضو الذي تريد تفويضه.");
      return;
    }
    setSaving(true);
    try {
      await createBusinessDelegation({
        delegateUserId: delegateId,
        expiresOn: expiresOn || null,
        note: note.trim() || null,
      });
      setDelegateId("");
      setExpiresOn("");
      setNote("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error && /[؀-ۿ]/.test(err.message) ? err.message : "تعذّر حفظ التفويض.");
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (revoking) return;
    if (!window.confirm("إلغاء التفويض نهائي ويبقى في السجل. هل تريد المتابعة؟")) return;
    setRowError(null);
    setRevoking(id);
    try {
      await revokeBusinessDelegation(id);
      await load();
    } catch (err) {
      setRowError(err instanceof Error && /[؀-ۿ]/.test(err.message) ? err.message : "تعذّر إلغاء التفويض.");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className={`text-xl font-black flex items-center gap-2 ${heading}`}>
            <Handshake size={22} weight="duotone" className="text-[#0B3D2E] dark:text-emerald-400" />
            التفويض
          </h1>
          <p className={`text-sm mt-1 ${muted}`}>
            سجل التفويضات الرسمي للمنشأة: من يملك صلاحية تعديل بيانات المنشأة غير مالك الحساب، ومنذ متى، وإلى متى.
          </p>
        </div>
        <Link
          href="/dashboard/business/company"
          className={`inline-flex items-center gap-2 self-start rounded-xl px-4 py-2 text-xs font-bold border ${
            isDark ? "border-white/[0.08] text-zinc-200 hover:bg-white/[0.05]" : "border-slate-200 text-slate-700 hover:bg-slate-50"
          }`}
        >
          <Buildings size={15} /> بيانات المنشأة
          <ArrowLeft size={13} />
        </Link>
      </div>

      {read === null && (
        <div className="py-16 text-center">
          <div className="inline-block w-8 h-8 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
        </div>
      )}

      {read && read.state !== "ok" && (
        <div className={`${card} p-6 flex items-start gap-3`}>
          <Warning size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className={`text-sm font-bold ${heading}`}>{read.message}</p>
            {read.state === "failed" && (
              <button onClick={() => void load()} className="mt-2 text-xs font-bold text-[#0B3D2E] dark:text-emerald-400 hover:underline">
                إعادة المحاولة
              </button>
            )}
          </div>
        </div>
      )}

      {read && read.state === "ok" && (
        <>
          {read.callerScope === "delegate" && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle size={17} weight="fill" />
              أنت مفوَّض بتعديل بيانات المنشأة.
              <Link href="/dashboard/business/company" className="underline mr-1">افتح بيانات المنشأة</Link>
            </div>
          )}

          {read.canManage && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`${card} p-5 space-y-4`}>
              <h2 className={`text-sm font-bold flex items-center gap-2 ${heading}`}>
                <Plus size={15} /> تسجيل تفويض جديد — تعديل بيانات المنشأة
              </h2>
              {read.eligibleMembers.length === 0 ? (
                <p className={`text-sm ${muted}`}>
                  لا يوجد عضو نشط يمكن تفويضه الآن. التفويض لأعضاء فريق المنشأة النشطين فقط؛ أضف العضو من «إدارة الفريق» أولاً.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className={`block text-xs font-bold mb-1.5 ${muted}`}>العضو</label>
                    <select value={delegateId} onChange={(e) => setDelegateId(e.target.value)} className={inputCls} disabled={saving}>
                      <option value="">— اختر عضواً نشطاً —</option>
                      {read.eligibleMembers.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.name ?? "عضو بلا اسم معروض"}{m.role ? ` — ${m.role}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${muted}`}>آخر يوم للتفويض (اختياري)</label>
                    <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} className={inputCls} disabled={saving} />
                    <p className={`text-[11px] mt-1 ${muted}`}>اتركه فارغاً ليبقى التفويض سارياً حتى تلغيه.</p>
                  </div>
                  <div>
                    <label className={`block text-xs font-bold mb-1.5 ${muted}`}>ملاحظة (اختياري)</label>
                    <input
                      value={note}
                      maxLength={DELEGATION_NOTE_MAX}
                      onChange={(e) => setNote(e.target.value)}
                      className={inputCls}
                      disabled={saving}
                      placeholder="مثال: خلال إجازة المدير العام"
                    />
                  </div>
                  {formError && (
                    <p className="sm:col-span-2 text-xs text-rose-500 flex items-center gap-1">
                      <Warning size={12} /> {formError}
                    </p>
                  )}
                  <div className="sm:col-span-2">
                    <button
                      onClick={handleCreate}
                      disabled={saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#0d5238] disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {saving ? "جاري الحفظ..." : "تسجيل التفويض"}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {!read.canManage && read.callerScope !== "delegate" && (
            <p className={`text-xs ${muted}`}>تسجيل التفويضات وإلغاؤها لمالك الحساب وحده. يمكنك الاطلاع على السجل فقط.</p>
          )}

          {rowError && (
            <p className="text-xs text-rose-500 flex items-center gap-1">
              <Warning size={12} /> {rowError}
            </p>
          )}

          <div className={`${card} overflow-hidden`}>
            {read.rows.length === 0 ? (
              <div className="p-10 text-center">
                <Handshake size={34} className={isDark ? "mx-auto text-zinc-700" : "mx-auto text-slate-300"} />
                <p className={`mt-3 text-sm font-bold ${heading}`}>لا توجد تفويضات مسجّلة</p>
                <p className={`mt-1 text-xs ${muted}`}>بيانات المنشأة يعدّلها مالك الحساب وحده حتى يسجّل تفويضاً.</p>
              </div>
            ) : (
              <ul className={isDark ? "divide-y divide-white/[0.05]" : "divide-y divide-slate-100"}>
                {read.rows.map((row) => (
                  <li key={row.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`text-sm font-bold ${heading}`}>{row.delegateName ?? "عضو بلا اسم معروض"}</p>
                        {row.delegateRole && <span className={`text-[11px] ${muted}`}>{row.delegateRole}</span>}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_TONE[row.status] ?? ""}`}>
                          {row.statusLabel}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 ${muted}`}>
                        {row.scopeLabel} · منذ {formatDay(row.grantedAt)}
                        {row.grantedByName ? ` بقرار ${row.grantedByName}` : ""}
                        {row.expiresOn ? ` · حتى ${formatDay(row.expiresOn)}` : " · حتى الإلغاء"}
                      </p>
                      {row.revokedAt && (
                        <p className={`text-xs mt-0.5 ${muted}`}>
                          أُلغي في {formatDay(row.revokedAt)}{row.revokedByName ? ` بقرار ${row.revokedByName}` : ""}
                        </p>
                      )}
                      {row.note && <p className={`text-xs mt-1 ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{row.note}</p>}
                    </div>
                    {read.canManage && !row.revokedAt && (
                      <button
                        onClick={() => void handleRevoke(row.id)}
                        disabled={revoking === row.id}
                        className="inline-flex items-center gap-1.5 self-start rounded-xl border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:border-rose-500/20 dark:text-rose-300 dark:hover:bg-rose-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <XCircle size={14} /> {revoking === row.id ? "جاري الإلغاء..." : "إلغاء التفويض"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
