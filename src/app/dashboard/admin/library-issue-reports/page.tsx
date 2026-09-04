"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag, CheckCircle, XCircle, ArrowClockwise, User, BookOpen } from "@phosphor-icons/react";
import {
  adminListIssueReports, adminUpdateIssueReport, ISSUE_KIND_AR, ISSUE_STATUS_AR,
  type LibraryIssueReport, type IssueStatus,
} from "@/lib/services/feedbackService";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";

/**
 * Admin → Library issue reports triage (Phase 6).
 * «أبلغ عن خطأ في هذه المادة» — GET /api/v1/admin/library-issue-reports?status=
 * (newest first), PATCH /api/v1/admin/library-issue-reports/[id] { status }.
 */

const STATUS_TABS: Array<{ key: IssueStatus | "all"; label: string }> = [
  { key: "all", label: "الكل" },
  { key: "new", label: ISSUE_STATUS_AR.new },
  { key: "reviewed", label: ISSUE_STATUS_AR.reviewed },
  { key: "fixed", label: ISSUE_STATUS_AR.fixed },
  { key: "rejected", label: ISSUE_STATUS_AR.rejected },
];

const STATUS_BADGE: Record<IssueStatus, string> = {
  new:      "bg-amber-500/10 text-amber-300 border-amber-500/20",
  reviewed: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  fixed:    "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  rejected: "bg-red-500/10 text-red-300 border-red-500/20",
};

const STATUS_OPTIONS = (Object.keys(ISSUE_STATUS_AR) as IssueStatus[]);

export default function AdminLibraryIssueReportsPage() {
  const [filter, setFilter] = useState<IssueStatus | "all">("all");
  const [read, setRead] = useState<ListRead<LibraryIssueReport> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<Record<string, IssueStatus>>({});
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRead(await adminListIssueReports({ status: filter }));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function saveRow(row: LibraryIssueReport) {
    const nextStatus = statusDraft[row.id] ?? row.status;
    if (nextStatus === row.status) return;
    setBusyId(row.id);
    setToast(null);
    try {
      await adminUpdateIssueReport(row.id, { status: nextStatus });
      setToast({ ok: true, msg: "تم حفظ التعديل" });
      await load();
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : "تعذّر حفظ التعديل" });
    } finally {
      setBusyId(null);
    }
  }

  const state = listViewState(loading, read);
  const rows = itemsOf(read);

  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8A762]/10 border border-[#C8A762]/20">
          <Flag size={22} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">بلاغات المكتبة القانونية</h1>
          <p className="text-[12px] text-zinc-500">بلاغات «أبلغ عن خطأ في هذه المادة» — راجعها وحدّث حالتها.</p>
        </div>
      </div>

      {toast && (
        <div className={`mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-semibold border ${
          toast.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-red-500/10 border-red-500/30 text-red-300"
        }`}>
          {toast.ok ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />}
          {toast.msg}
        </div>
      )}

      {/* Status filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        {STATUS_TABS.map((s) => (
          <button key={s.key} onClick={() => setFilter(s.key)}
            className={`rounded-xl px-4 py-2 text-[12px] font-bold transition-all border ${
              filter === s.key
                ? "bg-[#0B3D2E]/40 border-[#0B3D2E]/60 text-emerald-300"
                : "bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-zinc-300"
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {state === "loading" && <p className="text-center text-[12px] text-zinc-600 py-10">جارٍ التحميل…</p>}

      {state === "unreadable" && (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-[13px] text-red-400">تعذّر تحميل البلاغات</p>
          <button onClick={load} className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] border border-white/[0.08] px-3 py-1.5 text-[12px] font-bold text-zinc-300 hover:bg-white/[0.08]">
            <ArrowClockwise size={13} />
            إعادة المحاولة
          </button>
        </div>
      )}

      {state === "empty" && (
        <div className="flex flex-col items-center py-14 text-center">
          <Flag size={38} weight="thin" className="text-zinc-700 mb-2" />
          <p className="text-[13px] text-zinc-600">لا توجد بلاغات في هذه الحالة</p>
        </div>
      )}

      {state === "ready" && (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const currentStatus = statusDraft[row.id] ?? row.status;
            const dirty = currentStatus !== row.status;
            return (
              <div key={row.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1 text-[12px] font-bold text-white">
                        <BookOpen size={13} className="text-[#C8A762]" />
                        {row.lawSlug}
                        {row.articleRef && <span className="text-zinc-500"> — {row.articleRef}</span>}
                      </span>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[row.status]}`}>
                        {ISSUE_STATUS_AR[row.status]}
                      </span>
                      <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#C8A762]">{ISSUE_KIND_AR[row.kind]}</span>
                    </div>
                    <p className="mt-1.5 text-[12px] text-zinc-400 whitespace-pre-wrap">{row.description}</p>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-600">
                      <User size={11} />
                      {row.userName ?? row.userId ?? "مستخدم محذوف"}
                      <span className="mx-1">·</span>
                      {new Date(row.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <select
                        value={currentStatus}
                        onChange={(e) => setStatusDraft((p) => ({ ...p, [row.id]: e.target.value as IssueStatus }))}
                        className="rounded-lg bg-white/[0.04] border border-white/[0.08] px-2 py-1.5 text-[11px] text-white focus:outline-none"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s} className="bg-[#0d0d15]">{ISSUE_STATUS_AR[s]}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => saveRow(row)}
                        disabled={busyId === row.id || !dirty}
                        className="flex items-center gap-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-[11px] font-bold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-40"
                      >
                        <CheckCircle size={13} weight="fill" />
                        {busyId === row.id ? "جارٍ الحفظ..." : "حفظ"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
