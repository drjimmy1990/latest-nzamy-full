"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Archive, ArrowClockwise, CalendarCheck, CheckSquare, Clock, FileText, Gavel, Spinner, Warning } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { apiGet } from "@/lib/services/api";
import type { ActivityBadge } from "@/lib/events";

/**
 * Was a five-row literal array (`EVENTS`) — fabricated actors («الشريك
 * المدير», «مدير القسم»...), fabricated relative times («منذ 12 دقيقة»),
 * with its own toast admitting it: "هذه أحداث mock/local فقط حتى ربط
 * AdminAuditEvent وFirmAuditEvent". `activity_events` (Phase 1) is that
 * table now — GET /api/v1/firm/activity reads it, scoped by this firm.
 *
 * No fabricated actor here either: recordActivity() (src/lib/events.ts) is
 * not currently passed an actor display name at any of its call sites (the
 * hearings/tasks routes pass only the id), so `actorName` comes back null
 * for everything written so far. Showing nothing is more honest than the
 * specific-sounding roles the mock invented — a real name needs a join this
 * route does not attempt yet.
 */

interface FirmActivityItem {
  id: number;
  badge: ActivityBadge;
  title: string;
  actorName: string | null;
  caseHref: string | null;
  createdAt: string;
}

const BADGE_ICON: Record<ActivityBadge, React.ElementType> = {
  order: FileText,
  delivery: CheckSquare,
  cancelled: Warning,
  notice: Archive,
  task: CheckSquare,
  contract: FileText,
  hearing: Gavel,
  client: FileText,
};

function relativeTimeAr(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

export default function FirmActivityPage() {
  const { isDark } = useTheme();
  const [items, setItems] = useState<FirmActivityItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");

  const load = useCallback(async () => {
    try {
      const res = await apiGet<{ items: FirmActivityItem[] }>("/api/v1/firm/activity");
      setItems(res.items ?? []);
      setLoadState("ready");
    } catch (err) {
      console.error("[firm/activity] failed to load:", err);
      setLoadState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  return (
    <div className="max-w-5xl mx-auto space-y-5" dir="rtl">
      <div>
        <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>سجل نشاط المكتب</h1>
        <p className={`mt-1 text-sm ${muted}`}>الجلسات والمهام المضافة عبر حسابات المكتب — الأحدث أولاً.</p>
      </div>

      {loadState === "loading" ? (
        <div className={`${card} p-10 flex items-center justify-center gap-2`}>
          <Spinner size={20} className="text-royal animate-spin" />
          <span className={`text-[12px] ${muted}`}>جارٍ تحميل سجل النشاط...</span>
        </div>
      ) : loadState === "error" ? (
        <div className={`${card} p-10 flex flex-col items-center justify-center gap-3`}>
          <Warning size={28} weight="duotone" className="text-red-500" />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>تعذّرت قراءة سجل النشاط</p>
          <p className={`text-[11px] text-center ${muted}`}>هذه ليست قائمة فارغة — قد يكون للمكتب نشاط لم يُقرأ.</p>
          <button onClick={() => { setLoadState("loading"); void load(); }}
            className="flex items-center gap-1.5 text-[12px] font-bold text-royal hover:underline">
            <ArrowClockwise size={13} /> إعادة المحاولة
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className={`${card} p-10 flex flex-col items-center justify-center gap-2`}>
          <CalendarCheck size={28} className={muted} />
          <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>لا يوجد نشاط مسجَّل بعد</p>
          <p className={`text-[11px] ${muted}`}>يظهر هنا كل جلسة أو مهمة تُضاف من حسابات المكتب.</p>
        </div>
      ) : (
        <div className={`${card} p-4`}>
          <div className="space-y-3">
            {items.map((item, index) => {
              const Icon = BADGE_ICON[item.badge] ?? Archive;
              const Row = item.caseHref ? "a" : "div";
              return (
                <motion.div key={item.id}
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.03 }}>
                  <Row
                    {...(item.caseHref ? { href: item.caseHref } : {})}
                    className={`flex items-start gap-3 rounded-xl border p-4 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"} ${item.caseHref ? "hover:border-royal/30 transition-colors" : ""}`}
                  >
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B3D2E]/15 text-[#C8A762]">
                      <Icon size={18} weight="duotone" />
                    </span>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 text-[11px] ${muted}`}><Clock size={11} />{relativeTimeAr(item.createdAt)}</span>
                      </div>
                      <p className={`mt-2 text-sm font-black ${isDark ? "text-white" : "text-slate-800"}`}>{item.title}</p>
                      {item.actorName && <p className={`mt-1 text-xs ${muted}`}>الفاعل: {item.actorName}</p>}
                    </div>
                  </Row>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
