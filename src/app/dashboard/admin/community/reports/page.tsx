"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Flag, CheckCircle, XCircle, ArrowClockwise, ArrowSquareOut, User, Warning, ChatCircle,
} from "@phosphor-icons/react";
import {
  adminListCommunityReports,
  adminUpdateCommunityReportStatus,
  type CommunityReport,
} from "@/lib/services/communityReportsService";
import type { CommunityReportStatus } from "@/lib/services/communityReportsInput";
import { isSupabaseMode } from "@/lib/services/api";
import { listViewState, itemsOf, type ListRead } from "@/lib/services/listRead";
import { toArabicDigits } from "@/lib/services/arabicCount";

/**
 * Admin → «بلاغات المجتمع» (owner item ٦٩ remainder).
 * GET /api/v1/admin/community/reports?status=  (newest first),
 * PATCH /api/v1/admin/community/reports/[id] { status }.
 *
 * No status-label vocabulary exists for this table outside this page (unlike
 * `ISSUE_STATUS_AR` for library issue reports) — `communityReportsInput.ts`
 * only exports reason labels, so the four status labels are defined locally.
 * Reason labels are NOT re-mapped here: `report.reasonLabel` is already
 * server-computed from `COMMUNITY_REPORT_REASON_LABELS_AR` and always present.
 *
 * A report on an "answer" cannot be linked to its post: the admin GET route
 * only hydrates `community_answers.id, body` for the snippet, never
 * `post_id`, so this page has no post id to link to and does not fabricate
 * one — see the unlinked marker below and the caller's `blocked` note.
 */

const STATUS_LABEL_AR: Record<CommunityReportStatus, string> = {
  new: "جديد",
  reviewed: "تمت المراجعة",
  dismissed: "مرفوض",
  actioned: "تم اتخاذ إجراء",
};

const STATUS_BADGE_CLS: Record<CommunityReportStatus, string> = {
  new: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  reviewed: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  dismissed: "bg-white/5 text-zinc-400 border-white/10",
  actioned: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
};

const STATUS_TABS: Array<{ key: CommunityReportStatus | "all"; label: string }> = [
  { key: "all", label: "الكل" },
  { key: "new", label: STATUS_LABEL_AR.new },
  { key: "reviewed", label: STATUS_LABEL_AR.reviewed },
  { key: "dismissed", label: STATUS_LABEL_AR.dismissed },
  { key: "actioned", label: STATUS_LABEL_AR.actioned },
];

// The three triage actions this page exposes. `new` is what a report is born
// as — there is no "reopen" button here (out of the task's named actions).
const ACTIONS: Array<{ status: CommunityReportStatus; label: string; icon: typeof CheckCircle }> = [
  { status: "reviewed", label: "تمت المراجعة", icon: CheckCircle },
  { status: "dismissed", label: "رفض البلاغ", icon: XCircle },
  { status: "actioned", label: "اتُّخذ إجراء", icon: Warning },
];

/** `/community/<postId>` for a post target; for an answer, its parent post when the admin route resolved it. */
function targetHref(report: CommunityReport): string | null {
  if (report.targetType === "post") return `/community/${report.targetId}`;
  return report.answerPostId ? `/community/${report.answerPostId}` : null;
}

export default function AdminCommunityReportsPage() {
  const [filter, setFilter] = useState<CommunityReportStatus | "all">("all");
  const [read, setRead] = useState<ListRead<CommunityReport> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRead(await adminListCommunityReports(filter));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(report: CommunityReport, status: CommunityReportStatus) {
    if (report.status === status) return;
    setBusyId(report.id);
    setToast(null);
    try {
      await adminUpdateCommunityReportStatus(report.id, status);
      setToast({ ok: true, msg: `تم تحديث حالة البلاغ إلى "${STATUS_LABEL_AR[status]}"` });
      await load();
    } catch (err) {
      setToast({ ok: false, msg: err instanceof Error ? err.message : "تعذّر تحديث حالة البلاغ" });
    } finally {
      setBusyId(null);
    }
  }

  const state = listViewState(loading, read);
  const rows = itemsOf(read);
  // Only the currently-active chip's count comes from a real server answer
  // (the route applies the status filter in SQL before `count: "exact"`) —
  // every other chip is a bare label, never a guessed number.
  const activeTotal = read && read.ok && read.total !== null ? toArabicDigits(read.total) : null;

  return (
    <div className="min-h-full p-6 md:p-8" dir="rtl">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#C8A762]/10 border border-[#C8A762]/20">
          <Flag size={22} weight="duotone" className="text-[#C8A762]" />
        </div>
        <div>
          <h1 className="text-xl font-black text-white">بلاغات المجتمع</h1>
          <p className="text-[12px] text-zinc-500">بلاغات «زر الإبلاغ عن المحتوى» على أسئلة وإجابات المجتمع — راجعها وحدّث حالتها.</p>
        </div>
      </div>

      {!isSupabaseMode && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-[13px] font-semibold text-blue-200">
          <Warning size={16} weight="fill" className="flex-shrink-0" />
          لوحة بلاغات المجتمع غير متاحة في وضع العرض التجريبي — هذه الصفحة تتطلب اتصالاً حقيقياً بقاعدة البيانات.
        </div>
      )}

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
        {STATUS_TABS.map((s) => {
          const active = filter === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setFilter(s.key)}
              className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[12px] font-bold transition-all border ${
                active
                  ? "bg-[#0B3D2E]/40 border-[#0B3D2E]/60 text-emerald-300"
                  : "bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {s.label}
              {active && activeTotal !== null && (
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-mono">{activeTotal}</span>
              )}
            </button>
          );
        })}
      </div>

      {state === "loading" && <p className="text-center text-[12px] text-zinc-600 py-10">جارٍ التحميل…</p>}

      {state === "unreadable" && (
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <p className="text-[13px] text-red-400">تعذّر تحميل بلاغات المجتمع</p>
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
          {rows.map((report) => {
            const href = targetHref(report);
            return (
              <div key={report.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE_CLS[report.status]}`}>
                        {STATUS_LABEL_AR[report.status]}
                      </span>
                      <span className="rounded-md bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold text-[#C8A762]">{report.reasonLabel}</span>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-500">
                        <ChatCircle size={11} />
                        {report.targetType === "post" ? "منشور" : "إجابة"}
                      </span>
                    </div>

                    {report.targetSnippet && (
                      <div className="mt-2 rounded-lg bg-white/[0.03] border border-white/[0.05] p-2.5">
                        <p className="text-[12px] text-zinc-400 whitespace-pre-wrap">{report.targetSnippet}</p>
                        {href ? (
                          <Link href={href} target="_blank" className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold text-[#C8A762] hover:underline">
                            <ArrowSquareOut size={12} />
                            فتح المنشور
                          </Link>
                        ) : (
                          <p className="mt-1.5 text-[10px] text-zinc-600">لا يمكن الربط بالمنشور الأصلي لهذه الإجابة.</p>
                        )}
                      </div>
                    )}

                    {report.details && (
                      <p className="mt-2 text-[12px] text-zinc-400 whitespace-pre-wrap">{report.details}</p>
                    )}

                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-zinc-600">
                      <User size={11} />
                      {report.reporterName ?? "مستخدم محذوف"}
                      <span className="mx-1">·</span>
                      {new Date(report.createdAt).toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" })}
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {ACTIONS.map((action) => {
                        const isCurrent = report.status === action.status;
                        return (
                          <button
                            key={action.status}
                            onClick={() => updateStatus(report, action.status)}
                            disabled={busyId === report.id || isCurrent}
                            className="flex items-center gap-1 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-1.5 text-[11px] font-bold text-zinc-300 hover:bg-white/[0.08] disabled:opacity-40"
                          >
                            <action.icon size={13} />
                            {busyId === report.id ? "جارٍ الحفظ..." : action.label}
                          </button>
                        );
                      })}
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
