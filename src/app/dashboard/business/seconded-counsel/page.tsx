"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  UserCircle, Briefcase, Calendar, FileText, ChatCircle,
  CheckCircle, Clock, Warning, Plus, ArrowLeft, Phone,
  Scales, ShieldCheck, Buildings, Star, MagnifyingGlass,
  ArrowRight, Dot,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

// ─── Mock Data ───────────────────────────────────────────────────────────────

const COUNSEL = {
  name: "أ. محمود السيد",
  specialty: "قانون تجاري ومنازعات",
  rating: 4.9,
  reviews: 38,
  since: "مارس 2025",
  avatar: null,
  status: "نشط",
  nextSession: "الثلاثاء 29 أبريل — 10:00 ص",
  hoursUsed: 18,
  hoursTotal: 40,
  tier: "corp",
};

type TaskStatus = "pending" | "in-review" | "done";

interface CounselTask {
  id: number;
  title: string;
  type: string;
  status: TaskStatus;
  due: string;
  priority: "high" | "medium" | "low";
}

const TASKS: CounselTask[] = [
  { id: 1, title: "مراجعة عقد التوريد مع شركة الخليج", type: "مراجعة عقد", status: "in-review", due: "29 أبريل", priority: "high" },
  { id: 2, title: "إعداد رأي قانوني — نزاع ملكية فكرية", type: "رأي قانوني", status: "pending", due: "2 مايو", priority: "high" },
  { id: 3, title: "مراجعة لوائح الحوكمة الداخلية", type: "حوكمة", status: "done", due: "20 أبريل", priority: "medium" },
  { id: 4, title: "صياغة اتفاقية السرية مع المستثمر", type: "صياغة عقد", status: "done", due: "15 أبريل", priority: "medium" },
  { id: 5, title: "تقييم مخاطر عقد الإيجار التجاري", type: "مراجعة عقد", status: "pending", due: "5 مايو", priority: "low" },
];

const STATUS_CFG: Record<TaskStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending:   { label: "قيد الانتظار", color: "text-amber-500",   bg: "bg-amber-500/10",   icon: <Clock size={11} weight="fill" /> },
  "in-review": { label: "قيد المراجعة", color: "text-blue-500",    bg: "bg-blue-500/10",    icon: <MagnifyingGlass size={11} /> },
  done:      { label: "مكتمل",        color: "text-emerald-500", bg: "bg-emerald-500/10", icon: <CheckCircle size={11} weight="fill" /> },
};

const PRIORITY_CFG = {
  high:   { label: "عاجل",  dot: "bg-red-500" },
  medium: { label: "متوسط", dot: "bg-amber-500" },
  low:    { label: "منخفض", dot: "bg-emerald-500" },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, color, bg }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string; bg: string;
}) {
  const { isDark } = useTheme();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-4 flex items-center gap-3 ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-sm"}`}
    >
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${bg}`}>
        <Icon size={20} weight="duotone" className={color} />
      </div>
      <div>
        <p className={`text-xl font-black ${isDark ? "text-white" : "text-slate-800"}`}>{value}</p>
        <p className={`text-xs ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{label}</p>
        {sub && <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-300"}`}>{sub}</p>}
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";
import { RoleGuard } from "@/components/dashboard/RoleGuard";

export default function SecondedCounselPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [showNewTask, setShowNewTask] = useState(false);

  const card = `rounded-2xl border ${isDark ? "bg-zinc-900/60 border-white/[0.06]" : "bg-white border-slate-100 shadow-sm"}`;
  const muted = isDark ? "text-zinc-500" : "text-slate-400";

  const filtered = filter === "all" ? TASKS : TASKS.filter(t => t.status === filter);
  const pct = Math.round((COUNSEL.hoursUsed / COUNSEL.hoursTotal) * 100);

  return (
    <RoleGuard allowedRoles={["owner", "legal_manager"]}>
    <SubscriptionGuard featureKey="seconded-counsel">
    <div className={`min-h-full ${isDark ? "bg-[#0c0f12]" : "bg-slate-50"}`} dir="rtl">
      <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className={`text-2xl font-black flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
              style={{ fontFamily: "var(--font-brand)" }}>
              <UserCircle className="text-[#C8A762]" weight="duotone" />
              المستشار القانوني المنتدب
            </h1>
            <p className={`text-sm mt-1 ${muted}`}>مستشارك القانوني الداخلي من نظامي — جاهز لخدمة شركتك</p>
          </div>
          <div className="flex gap-2">
            <Link href="/ai/consult"
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <ChatCircle size={15} weight="duotone" />
              استشارة سريعة
            </Link>
            <button onClick={() => setShowNewTask(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition">
              <Plus size={15} weight="bold" />
              مهمة جديدة
            </button>
          </div>
        </motion.div>

        {/* Counsel Profile Card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={`${card} p-5`}>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0B3D2E] to-[#1a6b4e] flex items-center justify-center shrink-0">
              <UserCircle size={36} weight="duotone" className="text-[#C8A762]" />
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h2 className={`text-lg font-black ${isDark ? "text-white" : "text-slate-800"}`}>{COUNSEL.name}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 flex items-center gap-1">
                  <Dot size={12} weight="fill" className="animate-pulse" />
                  {COUNSEL.status}
                </span>
              </div>
              <p className={`text-sm mb-2 ${muted}`}>{COUNSEL.specialty} · عضو منذ {COUNSEL.since}</p>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1 text-xs">
                  <Star size={12} weight="fill" className="text-[#C8A762]" />
                  <span className={`font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{COUNSEL.rating}</span>
                  <span className={muted}>({COUNSEL.reviews} تقييم)</span>
                </span>
                <span className={`flex items-center gap-1 text-xs ${muted}`}>
                  <Calendar size={12} />
                  الجلسة القادمة: <strong className={isDark ? "text-zinc-300" : "text-slate-600"}>{COUNSEL.nextSession}</strong>
                </span>
              </div>
            </div>
            {/* Hours gauge */}
            <div className={`shrink-0 rounded-xl p-4 min-w-[140px] ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${muted}`}>ساعات الاستشارة</p>
              <div className={`h-2 rounded-full mb-2 ${isDark ? "bg-white/10" : "bg-slate-200"}`}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                  className="h-full rounded-full bg-gradient-to-r from-[#0B3D2E] to-[#C8A762]" />
              </div>
              <p className={`text-xs font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                {COUNSEL.hoursUsed} / {COUNSEL.hoursTotal} ساعة
              </p>
              <p className={`text-[10px] mt-0.5 ${muted}`}>{pct}% مستخدم هذا الشهر</p>
            </div>
          </div>
          {/* Quick actions */}
          <div className={`mt-4 pt-4 border-t flex flex-wrap gap-2 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            {[
              { label: "حجز جلسة", icon: Calendar, href: "#" },
              { label: "مراسلة المستشار", icon: ChatCircle, href: "#" },
              { label: "بروفايل كامل", icon: UserCircle, href: "#" },
              { label: "التقرير الشهري", icon: FileText, href: "#" },
            ].map(a => {
              const Icon = a.icon;
              return (
                <Link key={a.label} href={a.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition ${isDark ? "bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  <Icon size={13} weight="duotone" />
                  {a.label}
                </Link>
              );
            })}
          </div>
        </motion.div>

        {/* KPI Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="مهام نشطة"     value={TASKS.filter(t => t.status !== "done").length} icon={Briefcase}   color="text-[#C8A762]"    bg="bg-[#C8A762]/10" />
          <StatCard label="مكتملة هذا الشهر" value={TASKS.filter(t => t.status === "done").length} icon={CheckCircle} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="عاجلة"          value={TASKS.filter(t => t.priority === "high" && t.status !== "done").length} icon={Warning} color="text-red-400"     bg="bg-red-400/10" />
          <StatCard label="تقييم المستشار" value={`${COUNSEL.rating}★`} icon={Star}       color="text-amber-500"  bg="bg-amber-500/10" />
        </div>

        {/* Tasks section */}
        <div className={card}>
          <div className="p-5 pb-0">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>المهام الموكلة للمستشار</h2>
              <div className="flex gap-1.5 flex-wrap">
                {(["all", "pending", "in-review", "done"] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition ${filter === f ? "bg-[#0B3D2E] text-white" : isDark ? "bg-white/[0.04] text-zinc-400 hover:text-zinc-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                    {f === "all" ? "الكل" : STATUS_CFG[f].label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-5 pb-5 space-y-2">
            <AnimatePresence>
              {filtered.map((task, i) => {
                const s = STATUS_CFG[task.status];
                const p = PRIORITY_CFG[task.priority];
                return (
                  <motion.div key={task.id}
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }} transition={{ delay: i * 0.05 }}
                    className={`flex items-center gap-4 p-4 rounded-xl ${isDark ? "bg-white/[0.03] hover:bg-white/[0.06]" : "bg-slate-50 hover:bg-slate-100"} transition cursor-pointer`}>
                    {/* Priority dot */}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${p.dot}`} title={p.label} />
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${isDark ? "bg-white/[0.04] border-white/[0.08] text-zinc-500" : "bg-white border-slate-200 text-slate-400"}`}>
                          {task.type}
                        </span>
                        <span className={`text-[10px] ${muted} flex items-center gap-0.5`}>
                          <Clock size={10} />
                          {task.due}
                        </span>
                      </div>
                    </div>
                    {/* Status */}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${s.bg} ${s.color}`}>
                      {s.icon} {s.label}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {filtered.length === 0 && (
              <div className={`py-8 text-center ${muted}`}>
                <Briefcase size={32} className="mx-auto mb-2 opacity-20" />
                <p className="text-sm">لا توجد مهام في هذه الفئة</p>
              </div>
            )}
          </div>
        </div>

        {/* Services panel */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className={card}>
          <div className="p-5">
            <h2 className={`text-sm font-bold mb-4 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>خدمات المستشار المنتدب</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { title: "مراجعة العقود",       desc: "فحص وتحليل عقودك التجارية قبل التوقيع",           icon: FileText,    href: "/ai/draft?mode=review",        color: "text-blue-500",    bg: "bg-blue-500/10" },
                { title: "الرأي القانوني",       desc: "رأي قانوني مكتوب وموثق في أي مسألة تجارية",       icon: Scales,      href: "/ai/draft?mode=legal-opinion",  color: "text-purple-500",  bg: "bg-purple-500/10" },
                { title: "الامتثال والحوكمة",   desc: "مراجعة مدى التزام شركتك بالأنظمة واللوائح",       icon: ShieldCheck, href: "/dashboard/business/governance",color: "text-emerald-500", bg: "bg-emerald-500/10" },
                { title: "تمثيل في النزاعات",   desc: "الإشراف على قضايا شركتك أمام الجهات القضائية",   icon: Buildings,   href: "/dashboard/business/cases",    color: "text-[#C8A762]",   bg: "bg-[#C8A762]/10" },
              ].map(s => {
                const Icon = s.icon;
                return (
                  <Link key={s.title} href={s.href}
                    className={`flex items-start gap-3 p-4 rounded-xl group transition ${isDark ? "bg-white/[0.03] hover:bg-white/[0.06]" : "bg-slate-50 hover:bg-slate-100"}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.bg}`}>
                      <Icon size={18} weight="duotone" className={s.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{s.title}</p>
                      <p className={`text-xs leading-relaxed ${muted}`}>{s.desc}</p>
                    </div>
                    <ArrowLeft size={14} className={`shrink-0 mt-1 ${muted} group-hover:text-[#C8A762] transition`} />
                  </Link>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Upgrade / Change counsel CTA */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`${card} p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}>
          <div className="flex items-start gap-3">
            <Phone size={18} weight="duotone" className="text-[#C8A762] mt-0.5 shrink-0" />
            <div>
              <p className={`text-sm font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>تريد تغيير المستشار أو ترقية الباقة؟</p>
              <p className={`text-xs mt-0.5 ${muted}`}>تواصل مع فريق نظامي لتعديل اتفاقية الانتداب أو رفع عدد الساعات</p>
            </div>
          </div>
          <Link href="/marketplace?category=seconded"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-sm font-bold hover:bg-[#0a3328] transition shrink-0">
            تصفح المستشارين
            <ArrowRight size={14} />
          </Link>
        </motion.div>

      </div>

      {/* New Task Modal */}
      <AnimatePresence>
        {showNewTask && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowNewTask(false)}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`rounded-2xl border p-6 w-full max-w-md ${isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-slate-200"}`}
              onClick={e => e.stopPropagation()}>
              <h3 className={`text-base font-black mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>إسناد مهمة جديدة</h3>
              <p className={`text-xs mb-5 ${muted}`}>أرسل المهمة للمستشار المنتدب لمراجعتها وإعداد ردٍّ قانوني</p>
              <div className="space-y-3">
                <input placeholder="عنوان المهمة / الطلب القانوني"
                  className={`w-full px-4 py-3 rounded-xl text-sm border outline-none ${isDark ? "bg-zinc-800 border-white/[0.08] text-white placeholder:text-zinc-600" : "bg-slate-50 border-slate-200 text-slate-800"}`} />
                <select className={`w-full px-4 py-3 rounded-xl text-sm border outline-none ${isDark ? "bg-zinc-800 border-white/[0.08] text-zinc-300" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
                  <option value="">نوع المهمة</option>
                  <option>مراجعة عقد</option>
                  <option>رأي قانوني</option>
                  <option>صياغة مستند</option>
                  <option>حوكمة وامتثال</option>
                </select>
                <textarea rows={3} placeholder="تفاصيل إضافية (اختياري)"
                  className={`w-full px-4 py-3 rounded-xl text-sm border outline-none resize-none ${isDark ? "bg-zinc-800 border-white/[0.08] text-white placeholder:text-zinc-600" : "bg-slate-50 border-slate-200 text-slate-800"}`} />
              </div>
              <div className="flex gap-3 mt-5">
                <button className="flex-1 py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-sm font-bold hover:bg-[#0a3328] transition"
                  onClick={() => setShowNewTask(false)}>
                  إرسال للمستشار
                </button>
                <button className={`flex-1 py-2.5 rounded-xl border text-sm font-bold transition ${isDark ? "border-white/10 text-zinc-400 hover:text-zinc-200" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}
                  onClick={() => setShowNewTask(false)}>
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </SubscriptionGuard>
    </RoleGuard>
  );
}
