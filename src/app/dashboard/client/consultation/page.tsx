"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CalendarBlank, Clock, ChatCircle, Star, SealCheck,
  Plus, VideoCamera, Phone, Robot, CaretRight,
  FilePdf, Download, Check, Warning, ArrowSquareOut,
  MagnifyingGlass, Funnel, Sparkle, X, ArrowLeft,
  Gavel, Brain, Users, CreditCard, Package,
} from "@phosphor-icons/react";
import Link from "next/link";
import { listClientWorkflowRequests } from "@/lib/clientWorkflowRepository";
import type { WorkflowRequest } from "@/lib/workflowStore";
import { getConsultations } from "@/lib/services";
import { SkeletonList } from "../_components/DashboardSkeleton";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";

// ─── Types & Mock Data ────────────────────────────────────────────────────────

type ConsultStatus = "upcoming" | "active" | "completed" | "cancelled";
type ConsultType   = "in-person" | "video" | "ai";

interface Consultation {
  id: string;
  type: ConsultType;
  status: ConsultStatus;
  lawyerName: string;
  lawyerSpecialty: string;
  lawyerInitial: string;
  lawyerColor: string;
  topic: string;
  date: string;
  time: string;
  duration: string;
  price: number;
  rating?: number;
  hasPdf?: boolean;
  pdfName?: string;
  caseId?: string;
  notes?: string;
}



// ─── Config ───────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ConsultType, { icon: React.ElementType; label: string; color: string }> = {
  "in-person": { icon: SealCheck,   label: "حضورية",    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400" },
  "video":     { icon: VideoCamera, label: "مرئية",      color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400" },
  "ai":        { icon: Robot,       label: "نظامي AI",   color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400" },
};

const STATUS_CONFIG: Record<ConsultStatus, { label: string; dot: string; badge: string }> = {
  upcoming:  { label: "قادمة",    dot: "bg-blue-500",    badge: "text-blue-700 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-700/30" },
  active:    { label: "جارية الآن", dot: "bg-emerald-500 animate-pulse", badge: "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/30" },
  completed: { label: "مكتملة",   dot: "bg-gray-400",    badge: "text-gray-600 bg-gray-50 dark:bg-white/5 dark:text-gray-400 border-gray-200 dark:border-white/8" },
  cancelled: { label: "ملغية",    dot: "bg-red-400",     badge: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-700/30" },
};

// ─── Rating Modal ─────────────────────────────────────────────────────────────

function RatingModal({ consultation, onClose }: { consultation: Consultation; onClose: () => void }) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [clarity,  setClarity]  = useState(0);
  const [benefit,  setBenefit]  = useState(0);
  const [punctual, setPunctual] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const axes = [
    { label: "وضوح الشرح القانوني",     value: clarity,  set: setClarity },
    { label: "الفائدة العملية للاستشارة", value: benefit,  set: setBenefit },
    { label: "الالتزام بالوقت",           value: punctual, set: setPunctual },
  ];

  if (submitted) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" dir="rtl">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-[#1e2530] rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-4">
          <Check size={28} className="text-emerald-600" weight="bold" />
        </div>
        <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-2">شكراً على تقييمك!</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">تقييمك يساعدنا على تحسين جودة الخدمة للجميع.</p>
        <button onClick={onClose} className="w-full py-2.5 bg-[#0B3D2E] text-white rounded-xl font-bold text-sm hover:bg-[#0a3328] transition-colors">
          إغلاق
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" dir="rtl">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white dark:bg-[#1e2530] rounded-2xl p-6 max-w-md w-full shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">قيّم هذه الاستشارة</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">مع {consultation.lawyerName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5">
            <Warning size={16} />
          </button>
        </div>

        {/* Overall stars */}
        <div className="flex justify-center gap-2 mb-5">
          {[1,2,3,4,5].map(n => (
            <motion.button key={n} whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
              onClick={() => setStars(n)}
            >
              <Star size={32} weight={(hover || stars) >= n ? "fill" : "regular"}
                className={(hover || stars) >= n ? "text-[#C8A762]" : "text-gray-200 dark:text-white/10"} />
            </motion.button>
          ))}
        </div>

        {/* Axis ratings */}
        <div className="space-y-3 mb-5">
          {axes.map(({ label, value, set }) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => set(n)}>
                      <Star size={14} weight={value >= n ? "fill" : "regular"}
                        className={value >= n ? "text-[#C8A762]" : "text-gray-200 dark:text-white/10"} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Comment */}
        <textarea
          value={comment} onChange={e => setComment(e.target.value)}
          placeholder="أضف تعليقاً أو ملاحظة (اختياري)..."
          rows={3}
          className="w-full rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/5 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-[#0B3D2E]/20 resize-none mb-4"
        />

        <button
          onClick={() => setSubmitted(true)}
          disabled={stars === 0}
          className="w-full py-2.5 bg-[#0B3D2E] text-white rounded-xl font-bold text-sm hover:bg-[#0a3328] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          إرسال التقييم
        </button>
      </motion.div>
    </div>
  );
}

// ─── Session Timer (video only) ─────────────────────────────────────────────────────────────────────
// NOTE: لا نعرضها للحضورية — فيها المحامي حاضر فعلياً ويدير الوقت بنفسه

/** Convert Arabic-Indic numerals in a string to Western digits then parseInt */
function arabicToInt(str: string): number {
  const western = str.replace(/[٠١٢٣٤٥٦٧٨٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  return parseInt(western, 10) || 60;
}

function SessionTimer({ durationMinutes }: { durationMinutes: number }) {
  const totalSec = durationMinutes * 60;
  const [elapsed, setElapsed] = useState(0);
  const remaining = Math.max(totalSec - elapsed, 0);
  const pct = Math.min((elapsed / totalSec) * 100, 100);

  useEffect(() => {
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const isLow = remaining < 300; // less than 5 min
  const isDone = remaining === 0;

  // SVG ring
  const R = 20; const C = 2 * Math.PI * R;
  const dash = C - (pct / 100) * C;

  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-[#C8A762]/30 bg-[#C8A762]/5 dark:bg-[#C8A762]/8">
      {/* Nzamy golden logo with progress arc */}
      <div className="relative w-11 h-11 flex-shrink-0">
        <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90 absolute inset-0">
          <circle cx="22" cy="22" r={R} fill="none" strokeWidth="2.5"
            stroke={isDone ? "#ef4444" : isLow ? "#f59e0b" : "#C8A762"}
            strokeOpacity="0.2" />
          <circle cx="22" cy="22" r={R} fill="none"
            stroke={isDone ? "#ef4444" : isLow ? "#f59e0b" : "#C8A762"}
            strokeWidth="2.5" strokeDasharray={C} strokeDashoffset={dash}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s linear, stroke 0.5s ease" }} />
        </svg>
        {/* Nzamy brand mark in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-bold text-base leading-none select-none ${
            isDone ? "text-red-500" : isLow ? "text-amber-500" : "text-[#C8A762]"
          }`} style={{ fontFamily: "var(--font-brand, serif)" }}>ن</span>
        </div>
      </div>
      <div>
        <p className={`text-base font-black tabular-nums leading-tight ${
          isDone ? "text-red-500" : isLow ? "text-amber-500" : "text-[#C8A762]"
        }`}>
          {isDone ? "انتهت الجلسة" : `${mm}:${ss}`}
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">وقت متبقي</p>
      </div>
    </div>
  );
}

// ─── Consultation Card ─────────────────────────────────────────────────────────

function ConsultCard({ c, onRate, isDark }: { c: Consultation; onRate: (c: Consultation) => void; isDark: boolean }) {
  const type   = TYPE_CONFIG[c.type];
  const status = STATUS_CONFIG[c.status];
  const TypeIcon = type.icon;

  return (
    <motion.div
      layoutId={`consult-${c.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className={`relative rounded-[2rem] border overflow-hidden transition-all duration-300 ${
        isDark 
          ? "bg-zinc-900/50 border-white/10 hover:bg-zinc-800/80 hover:border-[#C8A762]/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" 
          : "bg-white border-zinc-200 hover:border-[#0B3D2E]/20 hover:shadow-lg hover:shadow-[#0B3D2E]/5"
      }`}
    >
      {/* Clickable Card Body Wrapper */}
      <Link href={`/dashboard/client/consultation/${c.id}`} className="block p-6">
        <div className="flex items-start gap-4">
          {/* Avatar / Brand Icon */}
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md ${
            c.type === "ai" ? "bg-[#0B3D2E]" : c.lawyerColor
          }`}>
            {c.type === "ai" ? (
              <Robot size={24} weight="duotone" className="text-[#C8A762]" />
            ) : (
              <span className="text-white font-extrabold text-sm">{c.lawyerInitial}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {/* Header: Title, Specialization & Status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-sm text-gray-900 dark:text-white" style={{ fontFamily: 'var(--font-brand)' }}>
                    {c.lawyerName}
                  </span>
                  {c.type !== "ai" && <SealCheck size={14} weight="fill" className="text-[#C8A762]" />}
                  <span className={`inline-flex items-center gap-1 text-[9px] font-black px-2.5 py-0.5 rounded-full border ${status.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    {status.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5 font-medium">{c.lawyerSpecialty}</p>
              </div>

              {/* Type Badge */}
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-3 py-1 rounded-xl w-max ${type.color}`}>
                <TypeIcon size={12} weight="fill" />
                {type.label}
              </span>
            </div>

            {/* Topic Description */}
            <p className="text-[13px] text-gray-700 dark:text-zinc-300 leading-relaxed font-medium mb-3 line-clamp-2">
              {c.topic}
            </p>

            {/* Meta row: Date, Time, Price */}
            <div className="flex items-center gap-4 text-xs text-gray-400 dark:text-zinc-500 flex-wrap font-semibold">
              <span className="flex items-center gap-1.5">
                <CalendarBlank size={14} />
                {c.date}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock size={14} />
                {c.time} · {c.duration}
              </span>
              <span className="text-gray-800 dark:text-zinc-200 font-bold bg-[#C8A762]/10 px-2 py-0.5 rounded-lg border border-[#C8A762]/10">
                {c.price.toLocaleString("ar-SA")} ر.س
              </span>
            </div>

            {/* Notes if available */}
            {c.notes && (
              <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/5 dark:bg-amber-950/20 rounded-xl px-4 py-2.5 mt-3 border border-amber-500/10">
                <Warning size={14} className="mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed font-medium">{c.notes}</span>
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* Dynamic Actions Row (Separated to allow direct clicks) */}
      <div className={`px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 ${
        isDark ? "border-white/5 bg-white/[0.01]" : "border-zinc-100 bg-zinc-50/50"
      }`}>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          {c.status === "active" && (
            <>
              <Link href={`/dashboard/client/consultation/${c.id}`} className="z-10">
                <motion.button whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#0B3D2E] hover:bg-[#0a3328] text-white text-xs font-bold rounded-xl shadow-md border border-[#C8A762]/20">
                  <Sparkle size={13} weight="fill" className="text-[#C8A762]" />
                  <span>{c.type === "in-person" ? "دخول الجلسة" : "دخول الجلسة الآن"}</span>
                </motion.button>
              </Link>
              {c.type !== "in-person" && (
                <SessionTimer durationMinutes={arabicToInt(c.duration)} />
              )}
            </>
          )}

          {c.status === "upcoming" && (
            <Link href={`/dashboard/client/consultation/${c.id}`} className="z-10">
              <motion.button whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm">
                <VideoCamera size={13} weight="fill" />
                <span>الانضمام للجلسة</span>
              </motion.button>
            </Link>
          )}

          {c.hasPdf && c.pdfName && (
            <button className={`z-10 flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-colors ${
              isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}>
              <FilePdf size={14} className="text-red-500" weight="fill" />
              <span>تحميل ملخص PDF</span>
              <Download size={11} className="text-zinc-500 mr-0.5" />
            </button>
          )}

          {c.status === "completed" && !c.rating && (
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={() => onRate(c)}
              className="z-10 flex items-center gap-1.5 px-3 py-2 bg-[#C8A762]/10 hover:bg-[#C8A762]/20 text-[#C8A762] text-xs font-bold rounded-xl border border-[#C8A762]/20 transition-colors">
              <Star size={13} weight="fill" />
              <span>قيّم الاستشارة</span>
            </motion.button>
          )}
        </div>

        {/* Trailing details: Ratings or Independent status */}
        <div className="flex items-center gap-3 w-full sm:w-auto justify-end text-xs">
          {c.status === "completed" && c.rating && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-gray-400">تقييمك</span>
              <div className="flex gap-0.5">
                {[1,2,3,4,5].map(n => (
                  <Star key={n} size={12} weight={c.rating! >= n ? "fill" : "regular"}
                    className={c.rating! >= n ? "text-[#C8A762]" : "text-gray-200 dark:text-white/10"} />
                ))}
              </div>
            </div>
          )}

          {c.caseId ? (
            <Link href={`/dashboard/client/cases?id=${c.caseId}`} className="z-10 flex items-center gap-1 text-[11px] font-bold text-[#0B3D2E] dark:text-emerald-400 hover:underline">
              <ArrowSquareOut size={13} weight="bold" />
              <span>ملف القضية {c.caseId}</span>
            </Link>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 px-2 py-0.5 rounded-lg bg-gray-50 dark:bg-white/5 border border-zinc-200/50 dark:border-white/5 font-semibold">
              • استشارة مستقلة
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type FilterStatus = "all" | ConsultStatus;

export default function ConsultationListPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [filter, setFilter]     = useState<FilterStatus>("all");
  const [search, setSearch]     = useState("");
  const [ratingTarget, setRatingTarget] = useState<Consultation | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const toConsultation = (request: WorkflowRequest): Consultation => ({
      id: request.id,
      type: request.receiver === "ai_workspace" ? "ai" : (request.metadata?.mode as ConsultType) || "video",
      status: request.status === "completed" ? "completed" : request.status === "pending_payment" ? "upcoming" : "upcoming",
      lawyerName: request.receiver === "ai_workspace" ? "نظامي AI" : String(request.metadata?.lawyer ?? "بانتظار تأكيد المحامي"),
      lawyerSpecialty: String(request.metadata?.specialty ?? "استشارة قانونية"),
      lawyerInitial: request.receiver === "ai_workspace" ? "AI" : "ن",
      lawyerColor: request.receiver === "ai_workspace" ? "bg-[#0B3D2E]" : "bg-emerald-600",
      topic: request.description,
      date: String(request.metadata?.day ?? "محفوظ الآن"),
      time: String(request.metadata?.time ?? "قيد الجدولة"),
      duration: request.receiver === "ai_workspace" ? "فوري" : "60 دق",
      price: request.payment.amount,
      notes: `رقم الطلب: ${request.id}`,
    });

    Promise.all([
      getConsultations().catch(() => []),
      listClientWorkflowRequests({ requesterUserId: user.userId }).catch(() => []),
    ])
      .then(([serviceConsultations, workflowRequests]) => {
        // Map service consultations to page shape
        const fromService: Consultation[] = serviceConsultations.map(sc => ({
          id: sc.id,
          type: (sc.type as ConsultType) || "video",
          status: sc.status === "scheduled" ? "upcoming" : sc.status === "completed" ? "completed" : sc.status === "cancelled" ? "cancelled" : "upcoming",
          lawyerName: sc.lawyer_id || "بانتظار التعيين",
          lawyerSpecialty: "استشارة قانونية",
          lawyerInitial: "ن",
          lawyerColor: "bg-emerald-600",
          topic: sc.topic || sc.description,
          date: sc.scheduled_at || sc.created_at,
          time: "",
          duration: "60 دق",
          price: 0,
          notes: sc.notes,
        }));

        // Map workflow requests to page shape
        const fromWorkflow = workflowRequests
          .filter((r: WorkflowRequest) => r.type === "consultation")
          .map(toConsultation);

        // Merge both sources, workflow requests first
        const merged = [...fromWorkflow, ...fromService];
        // Deduplicate by id
        const seen = new Set<string>();
        const unique = merged.filter(c => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
        setConsultations(unique);
      })
      .finally(() => setLoading(false));
  }, [user.userId]);

  const filtered = consultations.filter(c => {
    if (filter !== "all" && c.status !== filter) return false;
    if (search && !c.topic.includes(search) && !c.lawyerName.includes(search)) return false;
    return true;
  });

  const counts = {
    all:       consultations.length,
    active:    consultations.filter(c => c.status === "active").length,
    upcoming:  consultations.filter(c => c.status === "upcoming").length,
    completed: consultations.filter(c => c.status === "completed").length,
    cancelled: consultations.filter(c => c.status === "cancelled").length,
  };

  const FILTERS: { key: FilterStatus; label: string; count: number }[] = [
    { key: "all",       label: "الكل",     count: counts.all },
    { key: "active",    label: "جارية",    count: counts.active },
    { key: "upcoming",  label: "قادمة",    count: counts.upcoming },
    { key: "completed", label: "مكتملة",   count: counts.completed },
    { key: "cancelled", label: "ملغية",    count: counts.cancelled },
  ];

  return (
    <>
      <AnimatePresence>
        {ratingTarget && <RatingModal consultation={ratingTarget} onClose={() => setRatingTarget(null)} />}
      </AnimatePresence>

      <div className={`p-6 md:p-8 max-w-[1000px] mx-auto ${isDark ? "text-white" : "text-zinc-900"}`} dir="rtl" suppressHydrationWarning>

        {loading ? (
          <div className="mt-8"><SkeletonList count={4} /></div>
        ) : (
        <>
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-brand)' }}>استشاراتي</h1>
            <p className={`text-sm mt-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
              متابعة جميع استشاراتك القانونية في مكان واحد
            </p>
          </div>
          <Link href="/dashboard/client/consultation/new">
            <motion.button
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white text-sm font-bold rounded-xl shadow-md hover:bg-[#0a3328] transition-colors self-start md:self-auto"
            >
              <Plus size={16} weight="bold" />
              استشارة جديدة
            </motion.button>
          </Link>
        </div>

        {/* Active session alert */}
        {counts.active > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mb-8 rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-5 flex items-center justify-between gap-4 shadow-[0_0_40px_-10px_rgba(16,185,129,0.2)]">
            <div className="flex items-center gap-4">
              <div className="relative flex-shrink-0 w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.5)]">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-50" />
                <VideoCamera size={20} weight="fill" className="text-white relative z-10" />
              </div>
              <div>
                <p className={`text-sm font-black ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>جلسة نشطة الآن!</p>
                <p className={`text-xs mt-0.5 ${isDark ? "text-emerald-400/80" : "text-emerald-700/80"}`}>استشارتك مع أ. أحمد الغامدي جارية الآن</p>
              </div>
            </div>
            <Link href={`/dashboard/client/consultation/c-002`}>
              <button className="flex items-center gap-1.5 text-xs font-bold text-[#0B3D2E] bg-emerald-400 hover:bg-emerald-300 px-4 py-2.5 rounded-xl transition-colors shadow-sm">
                دخول الجلسة
                <CaretRight size={14} weight="bold" />
              </button>
            </Link>
          </motion.div>
        )}

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mb-8">
          <div className="relative flex-1 max-w-md">
            <MagnifyingGlass size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="ابحث باسم المحامي أو موضوع الاستشارة..."
              className={`w-full pr-10 pl-4 py-3 text-sm rounded-2xl border outline-none transition-all ${
                isDark 
                  ? "bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-[#0B3D2E] focus:bg-zinc-900" 
                  : "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/5"
              }`}
            />
          </div>

          <div className={`flex items-center gap-1.5 p-1.5 rounded-2xl overflow-x-auto ${isDark ? "bg-white/5" : "bg-zinc-100"}`}>
            {FILTERS.map(f => {
              const isActive = filter === f.key;
              return (
                <button key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
                    isActive 
                      ? isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-white text-zinc-900 shadow-sm" 
                      : isDark ? "text-zinc-400 hover:text-white hover:bg-white/5" : "text-zinc-500 hover:text-zinc-900 hover:bg-white/50"
                  }`}
                >
                  {isActive && <motion.div layoutId="consultTabActive" className={`absolute inset-0 rounded-xl ${isDark ? "bg-zinc-800" : "bg-white"} shadow-sm -z-10`} />}
                  {f.label}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isActive ? "bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-emerald-500/20 dark:text-emerald-400" : isDark ? "bg-white/10 text-zinc-400" : "bg-zinc-200 text-zinc-500"
                  }`}>
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filtered.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                className={`text-center py-24 rounded-[2.5rem] border border-dashed ${isDark ? "border-white/10 bg-white/[0.02]" : "border-zinc-200 bg-zinc-50/50"}`}>
                <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5 shadow-inner ${isDark ? "bg-white/5 text-zinc-600" : "bg-white border border-zinc-100 text-zinc-300"}`}>
                  <ChatCircle size={36} weight="duotone" />
                </div>
                <p className={`text-lg font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>لا توجد استشارات</p>
                <p className={`text-sm mb-6 ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>لا توجد استشارات تطابق بحثك المحدّد أو هذا الفلتر.</p>
                <Link href="/dashboard/client/consultation/new">
                  <motion.button whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#0a3328] transition-colors"
                  >
                    <Plus size={16} weight="bold" /> احجز استشارتك الأولى
                  </motion.button>
                </Link>
              </motion.div>
            ) : (
              filtered.map(c => <ConsultCard key={c.id} c={c} onRate={setRatingTarget} isDark={isDark} />)
            )}
          </AnimatePresence>
        </div>

        </>
        )}
      </div>
    </>
  );
}
