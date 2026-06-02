"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Buildings,
  Users,
  CurrencyDollar,
  Clock,
  Plus,
  Scales,
  CheckCircle,
  CircleDashed,
  Play,
  Warning,
  PencilSimple,
  Trash,
  UserPlus,
  EnvelopeSimple,
  Star,
  ChartLineUp,
  Sparkle,
  FileText,
  ChatsCircle,
  TrendUp,
  Robot,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DeptMember {
  nameAr: string;
  role: string;
  isRep: boolean;
}

interface Consultation {
  id: string;
  titleAr: string;
  lawyerAr: string;
  status: "pending" | "active" | "done";
  dateAr: string;
  cost: number;
  priority: "high" | "medium" | "low";
}

interface Department {
  id: string;
  nameAr: string;
  nameEn: string;
  rep: string | null;
  repEmail: string | null;
  requestsMonth: number;
  costMonth: number;
  services: string[];
  aiAlert?: string | null;
  totalConsultations: number;
  avgResponseHours: number;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const DEPTS: Record<string, Department> = {
  hr: {
    id: "hr", nameAr: "الموارد البشرية", nameEn: "Human Resources",
    rep: "سلمى الأحمدي", repEmail: "salma@company.com",
    requestsMonth: 8, costMonth: 1200,
    services: ["استشارات", "توثيق"],
    aiAlert: "إدارة الموارد البشرية تستهلك 8+ استشارات/شهر — هل تريد تعيين مستشار دائم؟",
    totalConsultations: 47, avgResponseHours: 3.2,
  },
  legal: {
    id: "legal", nameAr: "الشؤون القانونية", nameEn: "Legal Affairs",
    rep: "نواف المطيري", repEmail: "nawaf@company.com",
    requestsMonth: 5, costMonth: 3200,
    services: ["قضايا", "عقود", "تحكيم"],
    aiAlert: null,
    totalConsultations: 28, avgResponseHours: 2.1,
  },
  procurement: {
    id: "procurement", nameAr: "المشتريات", nameEn: "Procurement",
    rep: "ريم الشهري", repEmail: "reem@company.com",
    requestsMonth: 3, costMonth: 750,
    services: ["عقود", "استشارات"],
    aiAlert: null,
    totalConsultations: 19, avgResponseHours: 4.5,
  },
  compliance: {
    id: "compliance", nameAr: "الامتثال", nameEn: "Compliance",
    rep: null, repEmail: null,
    requestsMonth: 0, costMonth: 0,
    services: [],
    aiAlert: null,
    totalConsultations: 0, avgResponseHours: 0,
  },
};

const MEMBERS_BY_DEPT: Record<string, DeptMember[]> = {
  hr: [
    { nameAr: "سلمى الأحمدي",   role: "ممثل القسم",     isRep: true },
    { nameAr: "عبدالرحمن فارس", role: "مدير الموارد البشرية", isRep: false },
    { nameAr: "نجود القرني",    role: "أخصائي تدريب",   isRep: false },
  ],
  legal: [
    { nameAr: "نواف المطيري",   role: "ممثل القسم",     isRep: true },
    { nameAr: "منى الشهري",     role: "محلل قانوني",    isRep: false },
  ],
  procurement: [
    { nameAr: "ريم الشهري",     role: "ممثل القسم",    isRep: true },
    { nameAr: "خالد العنزي",    role: "مدير مشتريات",  isRep: false },
    { nameAr: "ابتسام الدوسري", role: "محلل عقود",     isRep: false },
  ],
  compliance: [],
};

const CONSULTS_BY_DEPT: Record<string, Consultation[]> = {
  hr: [
    { id: "CON-441", titleAr: "مراجعة لوائح التعيين والإنهاء",  lawyerAr: "د. نورة الزهراني",  status: "done",    dateAr: "٢٥ مارس", cost: 499, priority: "medium" },
    { id: "CON-462", titleAr: "استشارة عقد العمل متعدد الأدوار", lawyerAr: "أ. فهد السبيعي",    status: "active",  dateAr: "٢٩ مارس", cost: 299, priority: "high"   },
    { id: "CON-477", titleAr: "مراجعة بنود الفصل التعسفي",      lawyerAr: "—",                  status: "pending", dateAr: "٣١ مارس", cost: 0,   priority: "low"    },
  ],
  legal: [
    { id: "CON-388", titleAr: "تحكيم تجاري — نزاع مع شريك",    lawyerAr: "د. نورة الزهراني",  status: "active",  dateAr: "١٢ أبريل", cost: 1200, priority: "high" },
    { id: "CON-391", titleAr: "صياغة عقد شراكة استراتيجية",     lawyerAr: "أ. فهد السبيعي",    status: "done",    dateAr: "٥ مارس",   cost: 650,  priority: "medium" },
  ],
  procurement: [
    { id: "CON-410", titleAr: "مراجعة عقد توريد مكائن مكتبية", lawyerAr: "أ. طارق العسيري",   status: "done",    dateAr: "٢٥ مارس", cost: 499, priority: "medium" },
    { id: "CON-425", titleAr: "الاستشارة حول شروط العقد الجديد", lawyerAr: "أ. فهد السبيعي",  status: "active",  dateAr: "٢٩ مارس", cost: 299, priority: "high" },
    { id: "CON-433", titleAr: "مراجعة بنود الفسخ في عقد الخدمات", lawyerAr: "—",              status: "pending", dateAr: "٣١ مارس", cost: 0,   priority: "low"  },
  ],
  compliance: [],
};

// ─── Config Maps ───────────────────────────────────────────────────────────────

const STATUS_MAP = {
  pending: { ar: "قيد الانتظار", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/25 dark:text-amber-400",   icon: CircleDashed },
  active:  { ar: "جارية",        cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/25 dark:text-blue-400",       icon: Play },
  done:    { ar: "منتهية",       cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400", icon: CheckCircle },
};

const PRIORITY_MAP = {
  high:   { ar: "عالية",   cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  medium: { ar: "متوسطة",  cls: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" },
  low:    { ar: "منخفضة",  cls: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
};

const SERVICE_COLORS: Record<string, string> = {
  استشارات: "bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-emerald-900/20 dark:text-emerald-400",
  توثيق:    "bg-[#C8A762]/10 text-[#C8A762]",
  قضايا:    "bg-red-500/10 text-red-600 dark:text-red-400",
  عقود:     "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  تحكيم:    "bg-purple-500/10 text-purple-600 dark:text-purple-400",
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function DepartmentDetailPage() {
  const { isDark, isRTL } = useTheme();
  const params = useParams();
  const deptId = String(params.id || "hr");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const dept = DEPTS[deptId] ?? DEPTS["hr"];
  const members = MEMBERS_BY_DEPT[deptId] ?? [];
  const consults = CONSULTS_BY_DEPT[deptId] ?? [];

  const [activeTab, setActiveTab] = useState<"consult" | "members" | "stats">("consult");

  if (!mounted) return null;

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  const surface = isDark ? "bg-[#161b22] border-white/10" : "bg-white border-slate-200";

  const tabs = [
    { id: "consult" as const,  label: "الاستشارات والقضايا", count: consults.length   },
    { id: "members" as const,  label: "الأعضاء",              count: members.length    },
    { id: "stats"   as const,  label: "الإحصائيات",           count: null              },
  ];

  const activeCount  = consults.filter(c => c.status === "active").length;
  const doneCount    = consults.filter(c => c.status === "done").length;
  const pendingCount = consults.filter(c => c.status === "pending").length;

  return (
    <div
      className={`min-h-screen ${isDark ? "bg-zinc-950" : "bg-zinc-50/50"}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="mx-auto max-w-5xl px-5 py-8 space-y-6">

        {/* ── Breadcrumb ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/dashboard/business" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
            لوحة التحكم
          </Link>
          <ArrowRight size={13} className={isDark ? "text-zinc-700" : "text-zinc-300"} />
          <Link href="/dashboard/business/departments" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"}`}>
            إدارة الأقسام
          </Link>
          <ArrowRight size={13} className={isDark ? "text-zinc-700" : "text-zinc-300"} />
          <span className={isDark ? "text-zinc-200" : "text-zinc-800"}>{dept.nameAr}</span>
        </div>

        {/* ── Hero Header ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.38 }}
          className={`${card} overflow-hidden shadow-sm`}
        >
          {/* Accent bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50]" />

          <div className="p-6">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              {/* Icon */}
              <div className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl shadow-lg ${isDark ? "bg-emerald-900/30 border border-emerald-700/30" : "bg-[#0B3D2E]/8 border border-[#0B3D2E]/15"}`}>
                <Buildings size={28} weight="duotone" className={isDark ? "text-emerald-400" : "text-[#0B3D2E]"} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
                    {dept.nameAr}
                  </h1>
                  {dept.services.map(s => (
                    <span key={s} className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${SERVICE_COLORS[s] ?? "bg-zinc-100 text-zinc-500"}`}>
                      {s}
                    </span>
                  ))}
                </div>

                {dept.rep ? (
                  <div className={`flex items-center gap-3 mt-2 text-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    <span className="flex items-center gap-1.5">
                      <Users size={13} /> ممثل القسم: <strong className={isDark ? "text-zinc-200" : "text-zinc-700"}>{dept.rep}</strong>
                    </span>
                    {dept.repEmail && (
                      <a href={`mailto:${dept.repEmail}`} className="flex items-center gap-1 text-[#C8A762] hover:underline text-xs">
                        <EnvelopeSimple size={12} /> {dept.repEmail}
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-1.5 text-sm text-amber-500">
                    <Warning size={14} />
                    <span>لا يوجد ممثل معيّن — الطلبات تروح لصاحب الحساب مباشرة</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0">
                <button className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition-colors ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"}`}>
                  <PencilSimple size={13} /> تعديل البيانات
                </button>
                {!dept.rep && (
                  <button className="flex items-center gap-2 rounded-xl bg-[#0B3D2E] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#0d4c38] transition-colors">
                    <UserPlus size={13} /> تعيين ممثل
                  </button>
                )}
              </div>
            </div>

            {/* AI Alert */}
            {dept.aiAlert && (
              <div className={`mt-4 flex items-start gap-3 rounded-xl border p-3.5 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
                <Robot size={16} weight="duotone" className="shrink-0 mt-0.5 text-[#C8A762]" />
                <p className={`flex-1 text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{dept.aiAlert}</p>
                <button className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold transition-colors ${isDark ? "bg-[#C8A762]/15 text-[#C8A762] hover:bg-[#C8A762]/25" : "bg-amber-200 text-amber-800 hover:bg-amber-300"}`}>
                  عيّن مستشاراً
                </button>
              </div>
            )}
          </div>
        </motion.div>

        {/* ── KPI Stats Row ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: ChatsCircle,   label: "استشارات نشطة",     value: activeCount,                        color: "text-blue-500",    bg: isDark ? "bg-blue-500/10" : "bg-blue-50" },
            { icon: CheckCircle,   label: "منجزة هذا الشهر",    value: doneCount,                          color: "text-emerald-500", bg: isDark ? "bg-emerald-500/10" : "bg-emerald-50" },
            { icon: CurrencyDollar, label: "إنفاق الشهر (ر.س)", value: dept.costMonth ? dept.costMonth.toLocaleString("ar-SA") : "—", color: "text-[#C8A762]", bg: isDark ? "bg-[#C8A762]/10" : "bg-amber-50" },
            { icon: Clock,          label: "متوسط وقت الرد (س)", value: dept.avgResponseHours ? `${dept.avgResponseHours}` : "—",   color: "text-purple-500", bg: isDark ? "bg-purple-500/10" : "bg-purple-50" },
          ].map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.07, duration: 0.35 }}
                className={`${card} p-4 shadow-sm flex items-center gap-3`}
              >
                <div className={`${kpi.bg} p-2.5 rounded-xl flex-shrink-0`}>
                  <Icon size={18} className={kpi.color} weight="duotone" />
                </div>
                <div>
                  <p className={`font-mono text-lg font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{kpi.value}</p>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{kpi.label}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <div className={`flex items-center gap-1 border-b ${isDark ? "border-white/[0.05]" : "border-zinc-200"}`}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-all ${
                activeTab === tab.id
                  ? `border-[#0B3D2E] ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`
                  : `border-transparent ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-500 hover:text-zinc-700"}`
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === tab.id ? "bg-[#0B3D2E] text-white" : isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ─────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">

          {/* Consultations Tab */}
          {activeTab === "consult" && (
            <motion.div
              key="consult"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>الاستشارات والقضايا</h2>
                <a
                  href="/book/consultation"
                  className="flex items-center gap-1.5 rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0d4c38] transition-colors"
                >
                  <Plus size={13} weight="bold" /> احجز استشارة
                </a>
              </div>

              {consults.length === 0 ? (
                <div className={`${card} p-12 text-center`}>
                  <Scales size={40} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
                  <p className={`text-sm font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد استشارات مسجّلة لهذا القسم</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {consults.map((c, i) => {
                    const statusCfg  = STATUS_MAP[c.status];
                    const priorityCfg = PRIORITY_MAP[c.priority];
                    const StatusIcon = statusCfg.icon;

                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className={`${card} p-5 shadow-sm flex items-start gap-4`}
                      >
                        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl mt-0.5 ${c.status === "done" ? (isDark ? "bg-emerald-900/20" : "bg-emerald-50") : c.status === "active" ? (isDark ? "bg-blue-900/20" : "bg-blue-50") : (isDark ? "bg-amber-900/20" : "bg-amber-50")}`}>
                          <StatusIcon size={17} className={c.status === "done" ? "text-emerald-500" : c.status === "active" ? "text-blue-500" : "text-amber-500"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className={`font-mono text-[11px] font-bold ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>{c.id}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${priorityCfg.cls}`}>{priorityCfg.ar}</span>
                          </div>
                          <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{c.titleAr}</p>
                          <div className={`flex items-center gap-4 mt-2 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            <span className="flex items-center gap-1"><Star size={11} /> {c.lawyerAr}</span>
                            <span className="flex items-center gap-1"><Clock size={11} /> {c.dateAr}</span>
                            {c.cost > 0 && <span className="flex items-center gap-1"><CurrencyDollar size={11} /> {c.cost} ر.س</span>}
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusCfg.cls}`}>{statusCfg.ar}</span>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* Members Tab */}
          {activeTab === "members" && (
            <motion.div
              key="members"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>أعضاء القسم</h2>
                <button className={`flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-medium transition-all ${isDark ? "border-white/[0.08] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"}`}>
                  <UserPlus size={13} /> إضافة عضو
                </button>
              </div>

              {members.length === 0 ? (
                <div className={`${card} p-12 text-center`}>
                  <Users size={40} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
                  <p className={`text-sm font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا يوجد أعضاء مضافون لهذا القسم</p>
                  <button className="mt-4 flex items-center gap-2 mx-auto rounded-xl bg-[#0B3D2E] px-4 py-2 text-xs font-bold text-white">
                    <UserPlus size={13} /> إضافة أول عضو
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {members.map((m, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className={`${card} flex items-center gap-4 p-4 shadow-sm`}
                    >
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-sm ${isDark ? "bg-[#0B3D2E]/30 text-emerald-400" : "bg-[#0B3D2E]/10 text-[#0B3D2E]"}`}>
                        {m.nameAr.charAt(0)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-[13px] font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{m.nameAr}</span>
                          {m.isRep && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isDark ? "bg-[#C8A762]/15 text-[#C8A762]" : "bg-[#C8A762]/10 text-[#b09153]"}`}>ممثل</span>
                          )}
                        </div>
                        <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{m.role}</p>
                      </div>
                      {!m.isRep && (
                        <button className={`transition-colors ${isDark ? "text-zinc-700 hover:text-red-400" : "text-zinc-300 hover:text-red-500"}`}>
                          <Trash size={15} />
                        </button>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Stats Tab */}
          {activeTab === "stats" && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Summary stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { icon: TrendUp,      label: "إجمالي الاستشارات المنجزة", value: dept.totalConsultations, color: "text-emerald-500" },
                  { icon: FileText,     label: "طلبات هذا الشهر",            value: dept.requestsMonth,       color: "text-blue-500" },
                  { icon: ChartLineUp,  label: "متوسط الاستهلاك الشهري",     value: `${dept.costMonth ? dept.costMonth.toLocaleString() : "0"} ر.س`, color: "text-[#C8A762]" },
                ].map((s, i) => {
                  const Icon = s.icon;
                  return (
                    <div key={i} className={`${card} p-5 shadow-sm text-center`}>
                      <Icon size={24} weight="duotone" className={`${s.color} mx-auto mb-2`} />
                      <p className={`font-mono text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>{s.value}</p>
                      <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.label}</p>
                    </div>
                  );
                })}
              </div>

              {/* Status breakdown */}
              <div className={`${card} p-6 shadow-sm`}>
                <h3 className={`text-[14px] font-bold mb-4 ${isDark ? "text-white" : "text-zinc-900"}`}>توزيع حالات الاستشارات</h3>
                <div className="space-y-3">
                  {[
                    { label: "نشطة",         count: activeCount,  total: consults.length, color: "bg-blue-500" },
                    { label: "قيد الانتظار", count: pendingCount, total: consults.length, color: "bg-amber-500" },
                    { label: "منجزة",         count: doneCount,   total: consults.length, color: "bg-emerald-500" },
                  ].map(bar => {
                    const pct = consults.length > 0 ? Math.round((bar.count / consults.length) * 100) : 0;
                    return (
                      <div key={bar.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{bar.label}</span>
                          <span className={`font-mono text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>{bar.count} ({pct}٪)</span>
                        </div>
                        <div className={`h-2 w-full rounded-full ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ delay: 0.3, duration: 0.7, ease: "easeOut" }}
                            className={`h-full rounded-full ${bar.color}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* AI insight placeholder */}
              <div className={`${card} p-6 shadow-sm flex items-start gap-4`}>
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${isDark ? "bg-[#C8A762]/10" : "bg-amber-50"}`}>
                  <Sparkle size={18} weight="duotone" className="text-[#C8A762]" />
                </div>
                <div>
                  <p className={`text-[13px] font-bold mb-1 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>تحليل نظامي AI للقسم</p>
                  <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                    سيتوفر هنا تقرير ذكاء اصطناعي شهري يحلّل نمط الطلبات ويقدّر التكاليف القادمة ويقترح أفضل إستراتيجية توظيف للمستشار القانوني داخل هذا القسم.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* ── Footer Note ─────────────────────────────────────────────── */}
        <div className={`rounded-2xl border p-4 ${isDark ? "border-white/[0.05] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
          <p className={`text-xs leading-relaxed ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            💡 الممثل يستطيع طلب الخدمات فقط دون إدارة الحساب. الخدمات مشتركة من باقة الشركة.
          </p>
        </div>

      </div>
    </div>
  );
}
