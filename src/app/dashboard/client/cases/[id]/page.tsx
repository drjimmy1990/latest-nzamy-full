"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, CalendarCheck, CheckCircle, Clock,
  Warning, FileText, ChatDots, Phone, Sparkle,
  Scales, ClipboardText, FolderOpen, CaretDown,
  MapPin, Receipt, Users, ListChecks, Eye, Lock,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import {
  getServiceRequestDetail,
  type ServiceRequestDetail,
} from "@/lib/services/casesService";
// The same short reference the cards on ../page.tsx already print (they get it
// from clientDashboardCards, which calls this helper). This screen printed the
// raw UUID, so «رقم القضية» read differently in the list and in the file it
// opens — the client could not tell they were the same row. The UUID is still
// the identifier and is still in the URL; only the display shortens.
import { orderReference } from "@/lib/services/orderReference";

type CaseStage = "filed" | "pending" | "session" | "judgment" | "closed";

interface TimelineEvent {
  date: string; title: string; desc?: string;
  type: "session" | "document" | "update" | "milestone" | "message";
  done: boolean;
}

interface CaseData {
  id: string; title: string; caseNo: string; court: string;
  stage: CaseStage; progress: number; urgent: boolean;
  lawyer: { name: string; type: string; phone: string; rating: number };
  nextSession?: { date: string; time: string; location: string };
  fee: { total: number; paid: number };
  timeline: TimelineEvent[];
  documents: { name: string; date: string; type: string }[];
  aiInsight?: string;
  sharedTasks?: { title: string; status: "todo" | "doing" | "done"; visibleToClient: true }[];
  team?: { name: string; role: string; initials: string }[];
  lawyerNoteForClient?: string;
}

const STAGES: { key: CaseStage; label: string }[] = [
  { key: "filed",    label: "مرفوعة" },
  { key: "pending",  label: "قيد التداول" },
  { key: "session",  label: "جلسات" },
  { key: "judgment", label: "حكم" },
  { key: "closed",   label: "مغلقة" },
];

const EVENT_ICON: Record<TimelineEvent["type"], React.ElementType> = {
  session: CalendarCheck, document: FileText, update: ClipboardText,
  milestone: MapPin, message: ChatDots,
};
const EVENT_COLOR: Record<TimelineEvent["type"], string> = {
  session: "text-blue-500", document: "text-violet-500", update: "text-amber-500",
  milestone: "text-[#C8A762]", message: "text-emerald-500",
};

const EVENT_LABELS: Record<string, string> = {
  "service_request.created":       "إنشاء القضية",
  "service_request.status_changed":"تغيير الحالة",
  "service_request.updated":       "تحديث القضية",
  "service_request.assigned":      "تعيين المحامي",
  "service_request.completed":     "إتمام القضية",
  "service_request.cancelled":     "إلغاء القضية",
  "service_request.note_added":    "إضافة ملاحظة",
  "service_request.hearing_added": "إضافة جلسة",
  "case.note_added":               "إضافة ملاحظة",
  "case.hearing_added":            "إضافة جلسة",
  "created":        "إنشاء القضية",
  "status_change":  "تغيير الحالة",
  "updated":        "تحديث القضية",
  "assigned":       "تعيين المحامي",
  "completed":      "إتمام القضية",
  "cancelled":      "إلغاء القضية",
  "note_added":     "إضافة ملاحظة",
  "hearing_added":  "إضافة جلسة",
};

function eventLabel(ev: string): string {
  return EVENT_LABELS[ev] ?? ev;
}

function eventTimelineType(ev: string): TimelineEvent["type"] {
  const e = ev.toLowerCase();
  if (e.includes("hearing") || e.includes("session")) return "session";
  if (e.includes("note") || e.includes("message")) return "message";
  if (e.includes("document") || e.includes("file")) return "document";
  if (e.includes("completed") || e.includes("cancelled") || e.includes("created")) return "milestone";
  return "update";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(iso);
  }
}

function mapStage(status: string | undefined): CaseStage {
  switch (status) {
    case "draft":
      return "filed";
    case "pending_payment":
    case "pending_assignment":
      return "pending";
    case "assigned":
    case "in_review":
      return "session";
    case "completed":
    case "cancelled":
      return "closed";
    default:
      return "pending";
  }
}

/** Map a ServiceRequestDetail to the CaseData shape used by this page. */
function toCaseData(r: ServiceRequestDetail): CaseData {
  const meta = (r.metadata ?? {}) as Record<string, any>;
  const now = Date.now();

  // Hearings
  const rawHearings = Array.isArray(meta.hearings) ? meta.hearings : [];
  const upcoming = rawHearings
    .map((h: any) => ({ h, ts: h.date ? new Date(h.date).getTime() : NaN }))
    .filter((x: any) => !isNaN(x.ts) && x.ts >= now)
    .sort((a: any, b: any) => a.ts - b.ts)[0];

  const nextSession = upcoming
    ? {
        date: formatDate(upcoming.h.date),
        time: String(upcoming.h.time ?? "—"),
        location: String(upcoming.h.location ?? "—"),
      }
    : undefined;

  // Timeline from events
  const timeline: TimelineEvent[] = (r.events ?? [])
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((e) => ({
      date: formatDate(e.created_at),
      title: eventLabel(e.event),
      type: eventTimelineType(e.event),
      done: true,
    }));

  // Documents from attachments
  const documents = (r.attachments ?? []).map((a) => ({
    name: a.name,
    date: formatDate(a.created_at),
    type: (a.mime_type ?? "").includes("pdf") ? "PDF" : "ملف",
  }));

  // Payment
  const amount = Number(r.payment?.amount ?? 0);
  const paid =
    r.payment?.status === "paid" || r.status === "completed" ? amount : 0;

  const urgent =
    String(meta.priority ?? "").toLowerCase() === "high" ||
    String(meta.priority ?? "").toLowerCase() === "urgent" ||
    String(meta.urgency ?? "").toLowerCase() === "high";

  return {
    id: r.id,
    title: r.title || "قضية",
    // `|| r.id` rather than a bare call: orderReference() returns "" for an
    // id it cannot shorten, and «رقم القضية: » with nothing after it is worse
    // than a long number.
    caseNo: orderReference(r.id) || r.id,
    court: String(meta.court ?? "—"),
    stage: mapStage(r.status),
    progress: 0,
    urgent,
    lawyer: {
      name: r.assignedTo ?? "—",
      type: "—",
      phone: "",
      rating: 0,
    },
    nextSession,
    fee: { total: amount, paid },
    timeline,
    documents,
    // aiInsight intentionally omitted — no fabricated AI analysis.
    // sharedTasks / team / lawyerNoteForClient not surfaced to client yet.
  };
}

export default function ClientCaseDetailPage({ params }: { params: { id: string } }) {
  const { isDark } = useTheme();
  const [liveCase, setLiveCase] = useState<CaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    getServiceRequestDetail(params.id)
      .then((r) => {
        if (cancelled) return;
        if (r) {
          setLiveCase(toCaseData(r));
        } else {
          setLiveCase(null);
          setFetchError("لم يتم العثور على القضية.");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("[client case detail] fetch failed:", e);
        setFetchError("تعذّر تحميل بيانات القضية.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [params.id]);

  const data = liveCase;
  const [showDocs, setShowDocs] = useState(false);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center" dir="rtl">
        <div className="inline-block w-8 h-8 rounded-full border-2 border-[#0B3D2E]/30 border-t-[#0B3D2E] animate-spin" />
      </div>
    );
  }

  if (fetchError || !data) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center" dir="rtl">
        <div className={`inline-flex flex-col items-center gap-3 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
          <Warning size={40} className={isDark ? "text-zinc-700" : "text-slate-300"} />
          <p className="text-lg font-bold">{fetchError ?? "القضية غير موجودة"}</p>
          <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لم يتم العثور على قضية بهذا المعرف، أو قد تكون محذوفة.</p>
          <Link href="/dashboard/client/cases" className="mt-2 text-sm text-[#0B3D2E] hover:underline">← العودة لقضاياي</Link>
        </div>
      </div>
    );
  }

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/70"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";
  const sm = isDark ? "text-zinc-500" : "text-slate-400";

  const stageIdx = STAGES.findIndex(s => s.key === data.stage);
  const paidPct  = data.fee.total > 0 ? Math.round((data.fee.paid / data.fee.total) * 100) : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4" dir="rtl">

      {/* Back */}
      <Link href="/dashboard/client/cases"
        className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${sm} hover:text-[#0B3D2E] transition-colors`}>
        <ArrowRight size={13} /> قضاياي
      </Link>

      {/* Header card */}
      <motion.div initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} className={`${card} overflow-hidden`}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex-1">
              {data.urgent && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-0.5 rounded-full mb-2">
                  <Warning size={9} weight="fill" /> عاجل
                </span>
              )}
              <h1 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>{data.title}</h1>
              {/* `title` keeps the full id one hover away — it is what a
                  support thread or a URL needs. `dir="ltr"` on the reference:
                  «ORD-8F14E4» is a Latin run between two Arabic ones. */}
              <p className={`text-[11px] ${sm}`} title={data.id}>{data.court} · رقم القضية: <span dir="ltr">{data.caseNo}</span></p>
            </div>
            <div className={`flex-shrink-0 rounded-xl border px-3 py-2 text-center ${isDark ? "border-white/[0.06] bg-white/[0.03]" : "border-slate-100 bg-slate-50"}`}>
              <p className={`text-[10px] ${sm} mb-0.5`}>الأتعاب</p>
              <p className={`text-[16px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{data.fee.total.toLocaleString()}</p>
              <p className="text-[9px] text-emerald-500 font-bold">مدفوع: {data.fee.paid.toLocaleString()}</p>
            </div>
          </div>

          {/* Stage pipeline */}
          <div className="flex items-center gap-1 mb-2">
            {STAGES.map((s, i) => {
              const done = i < stageIdx;
              const current = i === stageIdx;
              return (
                <div key={s.key} className="flex items-center flex-1">
                  <div className={`flex-1 text-center text-[9px] font-bold py-1.5 rounded-lg transition-all ${
                    current
                      ? "bg-[#0B3D2E] text-white"
                      : done
                        ? isDark ? "bg-emerald-500/15 text-emerald-400" : "bg-emerald-50 text-emerald-600"
                        : isDark ? "bg-white/[0.03] text-zinc-600" : "bg-slate-50 text-slate-400"
                  }`}>{done ? "✓ " : ""}{s.label}</div>
                  {i < STAGES.length - 1 && (
                    <div className={`w-3 h-px mx-0.5 ${done ? "bg-emerald-400/60" : isDark ? "bg-white/[0.06]" : "bg-slate-200"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar — progress not yet available from backend (0%) */}
          <div className={`h-1.5 rounded-full overflow-hidden mb-1 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
            <motion.div className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-[#0B3D2E]"
              initial={{ width:0 }} animate={{ width: `${data.progress}%` }}
              transition={{ duration:0.9, ease:"easeOut", delay:0.2 }} />
          </div>
          <p className={`text-[9px] text-left ${sm}`}>{data.progress}% مكتمل</p>

          {/* Lawyer */}
          <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 mt-3 ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#0B3D2E] flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0">
                {data.lawyer.name.charAt(0)}
              </div>
              <div>
                <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{data.lawyer.name}</p>
                <p className={`text-[10px] flex items-center gap-1 ${sm}`}>
                  {data.lawyer.type}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/dashboard/client/messages"
                className={`w-8 h-8 rounded-xl flex items-center justify-center border ${isDark ? "border-white/[0.06] text-zinc-400 hover:text-blue-400" : "border-slate-200 text-slate-500 hover:text-blue-500"} transition-colors`}>
                <ChatDots size={13} />
              </Link>
            </div>
          </div>
        </div>

        {/* Next session banner */}
        {data.nextSession && (
          <div className={`px-5 py-3 border-t flex items-center gap-3 ${isDark ? "border-white/[0.06] bg-amber-500/5" : "border-amber-100 bg-amber-50/60"}`}>
            <CalendarCheck size={14} className="text-amber-500 flex-shrink-0" />
            <div className="flex-1">
              <p className={`text-[12px] font-bold ${isDark ? "text-amber-400" : "text-amber-700"}`}>الجلسة القادمة</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-amber-600/80"}`}>
                {data.nextSession.date} — {data.nextSession.time} · {data.nextSession.location}
              </p>
            </div>
            <span className="text-[9px] font-bold bg-amber-400/20 text-amber-600 dark:text-amber-300 px-2 py-0.5 rounded-full">تذكير مُفعّل</span>
          </div>
        )}
      </motion.div>

      {/* Timeline */}
      <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.08 }}
        className={`${card} p-4`}>
        <div className="flex items-center gap-2 mb-4">
          <Scales size={14} className="text-[#0B3D2E]" />
          <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>مسار القضية</h2>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isDark ? "bg-white/[0.05] text-zinc-500" : "bg-slate-100 text-slate-500"}`}>
            {data.timeline.filter(e => e.done).length}/{data.timeline.length} مراحل
          </span>
        </div>

        {data.timeline.length === 0 ? (
          <div className="text-center py-8">
            <Scales size={28} className={`mx-auto mb-2 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            <p className={`text-[12px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد أحداث مسجّلة بعد</p>
          </div>
        ) : (
          <div className="relative">
            <div className={`absolute start-[18px] top-3 bottom-3 w-px ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`} />
            <div className="space-y-1">
              {data.timeline.map((ev, i) => {
                const EvIcon = EVENT_ICON[ev.type];
                const evColor = EVENT_COLOR[ev.type];
                return (
                  <motion.div key={i}
                    initial={{ opacity:0, x:-6 }} animate={{ opacity:1, x:0 }} transition={{ delay: i * 0.04 }}
                    className={`flex items-start gap-3 py-2 px-2 rounded-xl ${ev.done ? "" : "opacity-45"}`}>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative z-10 border ${
                      ev.done
                        ? isDark ? "bg-emerald-500/15 border-emerald-500/30" : "bg-emerald-50 border-emerald-200"
                        : isDark ? "bg-zinc-800 border-white/[0.06]" : "bg-slate-50 border-slate-200"
                    }`}>
                      {ev.done
                        ? <CheckCircle size={16} weight="fill" className="text-emerald-500" />
                        : <EvIcon size={14} className={evColor} />}
                    </div>
                    <div className="flex-1 pt-1.5">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{ev.title}</p>
                        {ev.date !== "—" && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isDark ? "bg-white/[0.04] text-zinc-600" : "bg-slate-100 text-slate-500"}`}>{ev.date}</span>
                        )}
                      </div>
                      {ev.desc && <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-600" : "text-slate-500"}`}>{ev.desc}</p>}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>

      {/* ─── Cross-Role: ما شاركه المحامي مع العميل ─── */}
      {(data.sharedTasks?.length || data.team?.length || data.lawyerNoteForClient) && (
        <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.09 }}
          className={`${card} p-4 space-y-4`}>
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-[#0B3D2E]" />
            <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>ما شاركه معك محاميك</h2>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${isDark ? "bg-[#0B3D2E]/30 text-emerald-400" : "bg-emerald-50 text-emerald-700"}`}>
              مرئي لك فقط
            </span>
          </div>

          {data.lawyerNoteForClient && (
            <div className={`rounded-xl p-3 border-r-2 border-[#0B3D2E] ${isDark ? "bg-[#0B3D2E]/10" : "bg-emerald-50"}`}>
              <p className={`text-[10px] font-bold mb-1 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>رسالة من محاميك</p>
              <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{data.lawyerNoteForClient}</p>
            </div>
          )}

          {data.sharedTasks && data.sharedTasks.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <ListChecks size={12} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <p className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المهام الجارية على قضيتك</p>
              </div>
              <div className="space-y-1.5">
                {data.sharedTasks.map((task, i) => (
                  <div key={i} className={`flex items-center gap-2.5 px-3 py-2 rounded-xl ${isDark ? "bg-white/[0.03]" : "bg-slate-50"}`}>
                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 text-[8px] font-black ${
                      task.status === "done"  ? "bg-emerald-500/15 text-emerald-500" :
                      task.status === "doing" ? "bg-blue-500/15 text-blue-500" :
                                                isDark ? "bg-white/[0.05] text-zinc-600" : "bg-slate-200 text-slate-400"
                    }`}>
                      {task.status === "done" ? "✓" : task.status === "doing" ? "●" : "○"}
                    </div>
                    <p className={`text-[12px] flex-1 ${
                      task.status === "done"
                        ? isDark ? "text-zinc-600 line-through" : "text-slate-400 line-through"
                        : isDark ? "text-zinc-300" : "text-slate-700"
                    }`}>{task.title}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                      task.status === "done"  ? isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600" :
                      task.status === "doing" ? isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600" :
                                                isDark ? "bg-white/[0.05] text-zinc-600" : "bg-slate-100 text-slate-500"
                    }`}>
                      {task.status === "done" ? "منجز" : task.status === "doing" ? "جارٍ" : "قادم"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.team && data.team.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Users size={12} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                <p className={`text-[11px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>الفريق العامل على قضيتك</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {data.team.map((m, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                    <div className="w-6 h-6 rounded-full bg-[#0B3D2E] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                      {m.initials}
                    </div>
                    <div>
                      <p className={`text-[11px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{m.name}</p>
                      <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={`flex items-center gap-1.5 text-[9px] ${isDark ? "text-zinc-700" : "text-slate-400"}`}>
            <Lock size={9} />
            <span>يتحكم محاميك في ما تراه — بعض التفاصيل محجوبة للحفاظ على سرية العمل القانوني</span>
          </div>
        </motion.div>
      )}

      {/* Documents collapsible */}
      <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.10 }} className={card}>
        <button onClick={() => setShowDocs(v => !v)}
          className={`w-full flex items-center justify-between px-4 py-3.5 transition-colors ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50"} rounded-2xl`}>
          <div className="flex items-center gap-2">
            <FolderOpen size={14} className="text-blue-500" />
            <span className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>المستندات</span>
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDark ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600"}`}>{data.documents.length}</span>
          </div>
          <motion.span animate={{ rotate: showDocs ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <CaretDown size={12} className={sm} />
          </motion.span>
        </button>
        <AnimatePresence>
          {showDocs && (
            <motion.div initial={{ height:0, opacity:0 }} animate={{ height:"auto", opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.2 }} className="overflow-hidden">
              <div className={`border-t ${isDark ? "border-white/[0.06]" : "border-slate-100"} p-3 space-y-1`}>
                {data.documents.length === 0 ? (
                  <p className={`text-center text-[11px] py-4 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>لا توجد مستندات</p>
                ) : (
                  data.documents.map((doc, i) => (
                    <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors ${isDark ? "hover:bg-white/[0.03]" : "hover:bg-slate-50"}`}>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-black flex-shrink-0 ${doc.type === "PDF" ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"}`}>{doc.type}</div>
                      <div className="flex-1">
                        <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{doc.name}</p>
                        <p className={`text-[10px] ${sm}`}>{doc.date}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Fee */}
      <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.12 }} className={`${card} p-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Receipt size={14} className="text-emerald-500" />
          <h2 className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>الأتعاب والمدفوعات</h2>
        </div>
        <div className={`flex justify-between text-[12px] mb-2 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
          <span>إجمالي الأتعاب</span>
          <span className="font-black font-mono">{data.fee.total.toLocaleString()} ريال</span>
        </div>
        <div className={`h-2 rounded-full overflow-hidden mb-1 ${isDark ? "bg-zinc-800" : "bg-slate-100"}`}>
          <motion.div className="h-full rounded-full bg-emerald-500"
            initial={{ width:0 }} animate={{ width: `${paidPct}%` }}
            transition={{ duration:0.9, ease:"easeOut", delay:0.3 }} />
        </div>
        <div className={`flex justify-between text-[10px] ${sm}`}>
          <span>مدفوع: <strong className="text-emerald-500">{data.fee.paid.toLocaleString()}</strong></span>
          <span>متبقي: <strong className="text-amber-500">{(data.fee.total - data.fee.paid).toLocaleString()}</strong></span>
        </div>
      </motion.div>

    </div>
  );
}