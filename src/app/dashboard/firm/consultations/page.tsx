"use client";

/**
 * Firm consultations list — rewritten 2026-09-04 (item firm-consult-ai).
 *
 * ── WHAT THIS PAGE READS ────────────────────────────────────────────────────
 * `getLawyerConsultations({ status: "all", limit: 200 })` — no extra filter.
 * The service's RLS already scopes the result to what the signed-in firm
 * account can read (its own rows plus every consultation tied to the firm's
 * active members), the same "no receiver filter, let RLS decide" rule the
 * firm cases list documents (src/app/dashboard/firm/cases/page.tsx).
 *
 * ── WHAT WAS REMOVED ─────────────────────────────────────────────────────────
 * MOCK_CONSULTS — five invented rows (fictional clients, assignees, dates) —
 * and the «استشارة جديدة» button, which opened nothing. A firm books a
 * consultation from the lawyer's own consultations page, never here; this
 * screen is read + act only, which the note under the header now says
 * outright instead of dangling a dead "new" button.
 *
 * ── ROW QUICK ACTIONS ────────────────────────────────────────────────────────
 * Reuses ConsultationActionModal from the lawyer dashboard's own
 * _components/consultations/ (same component the lawyer consultation detail
 * page uses) rather than a second copy — one status vocabulary
 * (consultationVocabulary.ts), one mutation surface
 * (lawyerConsultationsService.ts), imported here by the same relative path
 * src/app/dashboard/firm/cases/[id]/page.tsx already uses to reach the
 * lawyer dashboard's shared components.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChatDots, CaretLeft, Clock, Warning, Info,
  CalendarCheck, CheckCircle, XCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { getLawyerConsultations, type LawyerConsultation } from "@/lib/services/lawyerConsultationsService";
import {
  CONSULTATION_STATUSES, CONSULTATION_STATUS_AR, CONSULTATION_MODE_AR,
  canTransitionConsultation, type ConsultationStatus,
} from "@/lib/services/consultationVocabulary";
import { listViewState, itemsOf, truncationNoticeAr, type ListRead } from "@/lib/services/listRead";
import { toArabicDigits } from "@/lib/services/arabicCount";
import { describeDateAr } from "@/lib/services/hijri";
import EmptyState from "@/components/ui/EmptyState";
import ConsultationActionModal, { type ConsultationAction } from "../../lawyer/_components/consultations/ConsultationActionModal";

const LIST_LIMIT = 200;

const STATUS_CHIP_CLS: Record<ConsultationStatus, { light: string; dark: string }> = {
  requested: { light: "bg-amber-50 text-amber-700 border-amber-200", dark: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  scheduled: { light: "bg-blue-50 text-blue-600 border-blue-200", dark: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  completed: { light: "bg-emerald-50 text-emerald-700 border-emerald-200", dark: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
  cancelled: { light: "bg-slate-100 text-slate-500 border-slate-200", dark: "bg-white/[0.06] text-zinc-400 border-white/[0.08]" },
  no_show: { light: "bg-red-50 text-red-600 border-red-200", dark: "bg-red-500/10 text-red-400 border-red-500/20" },
};

const STATUS_DOT: Record<ConsultationStatus, string> = {
  requested: "bg-amber-500",
  scheduled: "bg-blue-500",
  completed: "bg-emerald-500",
  cancelled: "bg-slate-400",
  no_show: "bg-red-500",
};

// Mirrors ConsultationDetail.tsx's own formatDateTimeAr — not exported from
// there, so kept here as a small duplicate rather than reaching into a
// client component's private scope.
function formatDateTimeAr(iso: string | null): string | null {
  if (!iso) return null;
  const described = describeDateAr(iso.slice(0, 10));
  if (!described) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return described;
  const time = d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  return `${described} · ${time}`;
}

/** The next-status actions a row can offer, trimmed from ConsultationDetail's full six to the three that fit a compact row. */
function quickActionsFor(c: LawyerConsultation): ConsultationAction[] {
  const actions: ConsultationAction[] = [];
  if (canTransitionConsultation(c.status, "scheduled")) actions.push("schedule");
  if (canTransitionConsultation(c.status, "completed")) actions.push("complete");
  if (canTransitionConsultation(c.status, "cancelled")) actions.push("cancel");
  return actions;
}

const QUICK_ACTION_ICON = {
  schedule: CalendarCheck,
  complete: CheckCircle,
  cancel: XCircle,
  no_show: XCircle,
  opinion: CheckCircle,
  convert: CheckCircle,
};
const QUICK_ACTION_LABEL: Record<ConsultationAction, string> = {
  schedule: "جدولة",
  complete: "إتمام",
  cancel: "إلغاء",
  no_show: "عدم حضور",
  opinion: "تسليم الرأي",
  convert: "تحويل لقضية",
};

const STATUS_TABS: (ConsultationStatus | "all")[] = ["all", ...CONSULTATION_STATUSES];

export default function FirmConsultationsPage() {
  const { isDark } = useTheme();

  const [loading, setLoading] = useState(true);
  const [read, setRead] = useState<ListRead<LawyerConsultation> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<ConsultationStatus | "all">("all");
  const [quickAction, setQuickAction] = useState<{ consultation: LawyerConsultation; action: ConsultationAction } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLawyerConsultations({ status: "all", limit: LIST_LIMIT })
      .then((r) => { if (!cancelled) setRead(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const viewState = listViewState(loading, read);
  const items = itemsOf(read);
  const retryLoad = useCallback(() => setReloadKey((k) => k + 1), []);

  const counts = useMemo(() => {
    const c: Record<ConsultationStatus | "all", number> = {
      all: items.length, requested: 0, scheduled: 0, completed: 0, cancelled: 0, no_show: 0,
    };
    for (const it of items) c[it.status]++;
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (statusFilter === "all" ? items : items.filter((c) => c.status === statusFilter)),
    [items, statusFilter],
  );

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  function handleQuickDone(updated: LawyerConsultation) {
    setRead((prev) => (prev && prev.ok ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) } : prev));
    setQuickAction(null);
  }

  const truncationNotice = truncationNoticeAr(read);

  return (
    <div className="max-w-[1000px] mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            الاستشارات
          </h1>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {viewState === "loading"
              ? "جاري تحميل الاستشارات…"
              : viewState === "unreadable"
                ? <span className="text-red-500 font-semibold">تعذّر تحميل الاستشارات</span>
                : <>{toArabicDigits(counts.all)} استشارة · <span className="text-blue-500 font-semibold">{toArabicDigits(counts.scheduled)} مجدولة</span></>}
          </p>
        </div>
      </motion.div>

      {/* Booking happens on the lawyer's own page — this list reads + acts only */}
      <div className={`flex items-start gap-2.5 rounded-2xl border p-3.5 text-[12px] leading-relaxed ${isDark ? "border-white/[0.08] bg-white/[0.02] text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
        <Info size={15} className="mt-0.5 shrink-0 text-royal" />
        الحجز يتم من صفحة استشارات المحامي؛ هنا كل استشارات أعضاء المكتب.
      </div>

      {/* Status tabs */}
      {(viewState === "ready" || viewState === "empty") && (
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_TABS.map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold transition-all ${
                statusFilter === s ? "bg-royal text-white border-royal" : isDark ? "border-white/[0.06] text-zinc-500 hover:text-zinc-300" : "border-slate-100 text-slate-500 hover:border-royal/20 hover:text-royal"
              }`}>
              {s !== "all" && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />}
              {s === "all" ? "الكل" : CONSULTATION_STATUS_AR[s]}
              <span className={`text-[9px] rounded-full px-1.5 ${statusFilter === s ? "bg-white/20" : isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
                {toArabicDigits(counts[s])}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Body — four states kept apart: loading, unreadable, empty, ready */}
      {viewState === "loading" ? (
        <div className={`${card} p-4 space-y-2`}>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`h-16 rounded-2xl animate-pulse ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`} />
          ))}
          <p className={`text-[12px] text-center pt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>جاري تحميل الاستشارات…</p>
        </div>
      ) : viewState === "unreadable" ? (
        <div className={`${card} p-6 text-center space-y-3`}>
          <Warning size={26} weight="duotone" className="mx-auto text-red-500" />
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تعذّرت قراءة استشارات المكتب</p>
          <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            هذه ليست قائمة فارغة — قد توجد استشارات لم تُقرأ بعد.
          </p>
          <button onClick={retryLoad}
            className="px-4 py-2 rounded-xl text-[12px] font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors">
            إعادة المحاولة
          </button>
        </div>
      ) : viewState === "empty" ? (
        <EmptyState
          icon={<ChatDots />}
          title="لا توجد استشارات بعد"
          description="استشارات أعضاء المكتب ستظهر هنا فور حجزها من صفحة استشارات المحامي."
        />
      ) : (
        <>
          {truncationNotice && (
            <div className={`rounded-2xl border p-3 text-[12px] font-semibold ${isDark ? "border-white/[0.08] bg-white/[0.03] text-zinc-400" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
              {truncationNotice}
            </div>
          )}
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ChatDots />}
              title="لا توجد استشارات مطابقة"
              description="لا توجد استشارات بهذه الحالة."
              action={{ label: "عرض الكل", onClick: () => setStatusFilter("all") }}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((c, i) => {
                const chip = STATUS_CHIP_CLS[c.status];
                const dt = formatDateTimeAr(c.scheduledAt) ?? formatDateTimeAr(c.createdAt);
                return (
                  <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    className={`${card} p-4 flex items-center gap-3`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
                      <ChatDots size={18} weight="duotone" className="text-royal" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{c.title}</p>
                        <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${isDark ? chip.dark : chip.light}`}>
                          {CONSULTATION_STATUS_AR[c.status]}
                        </span>
                      </div>
                      <div className={`flex items-center gap-2 text-[11px] flex-wrap ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                        <span>{c.clientName}</span>
                        <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>{CONSULTATION_MODE_AR[c.mode]}</span>
                        {dt && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-current opacity-40" />
                            <span className="flex items-center gap-1"><Clock size={10} />{dt}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                      {quickActionsFor(c).map((a) => {
                        const Icon = QUICK_ACTION_ICON[a];
                        return (
                          <button key={a} onClick={() => setQuickAction({ consultation: c, action: a })} title={QUICK_ACTION_LABEL[a]}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${isDark ? "bg-white/[0.05] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.1]" : "bg-slate-50 text-slate-500 hover:text-royal hover:bg-slate-100"}`}>
                            <Icon size={14} />
                          </button>
                        );
                      })}
                    </div>
                    <Link href={`/dashboard/firm/consultations/${c.id}`}
                      className={`flex-shrink-0 flex items-center gap-1 text-[11px] font-bold px-3 py-2 rounded-xl transition-colors ${isDark ? "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.1]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      فتح <CaretLeft size={11} />
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {quickAction && (
          <ConsultationActionModal
            consultation={quickAction.consultation}
            action={quickAction.action}
            isDark={isDark}
            onClose={() => setQuickAction(null)}
            onDone={handleQuickDone}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
