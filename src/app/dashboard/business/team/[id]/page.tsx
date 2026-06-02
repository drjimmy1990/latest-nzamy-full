"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CheckCircle,
  Clock,
  Crown,
  EnvelopeSimple,
  Phone,
  Scales,
  SealCheck,
  ShieldCheck,
  UsersThree,
  ChartBar,
  CalendarBlank,
  DotsThree,
  ChatCircle,
  Warning,
  TrendUp,
  Star,
  FileText,
  CircleDashed,
  Play,
  Check,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberRole = "lead" | "lawyer" | "consultant" | "intern" | "admin";
type MemberStatus = "active" | "busy" | "offline";
type CaseStatus = "active" | "pending" | "done";
type CasePriority = "high" | "medium" | "low";

interface TeamMember {
  id: string;
  nameAr: string;
  role: MemberRole;
  dept: string;
  status: MemberStatus;
  cases: number;
  completedCases: number;
  joinDate: string;
  email: string;
  phone: string;
  initials: string;
  gradient: string;
  verified: boolean;
  hasLawyerPowers?: boolean;
  bio: string;
  specializations: string[];
  thisMonthFees: number;
  avgResolutionDays: number;
}

interface Case {
  id: string;
  title: string;
  dept: string;
  status: CaseStatus;
  priority: CasePriority;
  dueDate: string;
  isExpiring: boolean;
}

// ─── Mock Data ─────────────────────────────────────────────────────────────────

const MEMBERS_BY_ID: Record<string, TeamMember> = {
  "1": {
    id: "1", nameAr: "نورة الزهراني", role: "lead", dept: "الشؤون القانونية",
    status: "active", cases: 7, completedCases: 42, joinDate: "يناير ٢٠٢٤",
    email: "n.zahrani@example.sa", phone: "+966 5x xxx xxx1",
    initials: "نز", gradient: "from-[#0B3D2E] to-[#1a6b50]", verified: true, hasLawyerPowers: true,
    bio: "محامية رئيسية بخبرة تزيد على ١٢ عاماً في الشؤون التجارية وعقود العمل والمنازعات التجارية. حاصلة على ماجستير القانون التجاري من جامعة الملك عبدالعزيز.",
    specializations: ["العقود التجارية", "قانون العمل", "التحكيم", "الامتثال"],
    thisMonthFees: 18400,
    avgResolutionDays: 21,
  },
  "2": {
    id: "2", nameAr: "فهد السبيعي", role: "lawyer", dept: "المشتريات",
    status: "busy", cases: 5, completedCases: 28, joinDate: "مارس ٢٠٢٤",
    email: "f.subaie@example.sa", phone: "+966 5x xxx xxx2",
    initials: "فس", gradient: "from-blue-700 to-blue-500", verified: true, hasLawyerPowers: false,
    bio: "مستشار قانوني متخصص في عقود التوريد والمناقصات الحكومية. عمل سابقاً في هيئة المنافسة السعودية.",
    specializations: ["عقود التوريد", "المنافسة", "المشتريات الحكومية"],
    thisMonthFees: 12200,
    avgResolutionDays: 18,
  },
  "3": {
    id: "3", nameAr: "ريم القحطاني", role: "intern", dept: "الموارد البشرية",
    status: "active", cases: 2, completedCases: 8, joinDate: "نوفمبر ٢٠٢٥",
    email: "r.qahtani@example.sa", phone: "+966 5x xxx xxx3",
    initials: "رق", gradient: "from-purple-600 to-purple-400", verified: false,
    bio: "محامية متدربة خريجة كلية الحقوق بجامعة الملك سعود. تتخصص في قانون الموارد البشرية ولوائح العمل.",
    specializations: ["لوائح العمل", "الموارد البشرية"],
    thisMonthFees: 3800,
    avgResolutionDays: 30,
  },
  "4": {
    id: "4", nameAr: "سلمى الدوسري", role: "consultant", dept: "المالية",
    status: "offline", cases: 0, completedCases: 15, joinDate: "يونيو ٢٠٢٤",
    email: "s.dosari@example.sa", phone: "+966 5x xxx xxx4",
    initials: "سد", gradient: "from-amber-600 to-amber-400", verified: true, hasLawyerPowers: false,
    bio: "مستشارة قانونية في الشؤون المالية والضريبية. متخصصة في متطلبات هيئة Zakat والمالية وضريبة القيمة المضافة.",
    specializations: ["الضرائب", "الزكاة", "القانون المالي"],
    thisMonthFees: 7600,
    avgResolutionDays: 25,
  },
};

const CASES_BY_MEMBER: Record<string, Case[]> = {
  "1": [
    { id: "NZ-041", title: "نزاع عمالي — المستودعات", dept: "الموارد البشرية", status: "active", priority: "high", dueDate: "١٥ أبريل", isExpiring: true },
    { id: "NZ-039", title: "مراجعة عقد التوريد الياباني", dept: "المشتريات", status: "active", priority: "medium", dueDate: "٢٢ أبريل", isExpiring: false },
    { id: "NZ-036", title: "تحديث سياسة PDPL", dept: "تقنية المعلومات", status: "done", priority: "low", dueDate: "١ مارس", isExpiring: false },
  ],
  "2": [
    { id: "NZ-034", title: "مراجعة عقد توريد مكائن المكتب", dept: "المشتريات", status: "active", priority: "medium", dueDate: "١٨ أبريل", isExpiring: false },
    { id: "NZ-031", title: "شكوى عميل — منتج معطوب", dept: "خدمة العملاء", status: "pending", priority: "high", dueDate: "١٠ أبريل", isExpiring: true },
  ],
  "3": [
    { id: "NZ-044", title: "صياغة لائحة تأديبية محدّثة", dept: "الموارد البشرية", status: "active", priority: "medium", dueDate: "٣٠ أبريل", isExpiring: false },
  ],
  "4": [],
};

const ACTIVITY = [
  { time: "منذ ساعتين",       text: "أضافت تعليقاً على ملف NZ-041",   type: "comment" },
  { time: "أمس",              text: "رفعت مذكرة الدفع في قضية NZ-039",  type: "upload" },
  { time: "٢ أبريل",          text: "أنهت مراجعة سياسة PDPL بنجاح",   type: "done" },
  { time: "١ أبريل",          text: "انضمت لاجتماع فريق الشؤون القانونية", type: "meeting" },
];

// ─── Config Maps ───────────────────────────────────────────────────────────────

const ROLE_AR: Record<MemberRole, string> = {
  lead: "شريك مسجّل",
  lawyer: "محامي",
  consultant: "مستشار",
  intern: "متدرب",
  admin: "إداري",
};

const STATUS_CONFIG: Record<MemberStatus, { dot: string; label: string }> = {
  active:  { dot: "bg-emerald-500", label: "نشط" },
  busy:    { dot: "bg-amber-500",   label: "مشغول" },
  offline: { dot: "bg-zinc-400",    label: "غائب" },
};

const CASE_STATUS_CONFIG: Record<CaseStatus, { label: string; cls: string; icon: React.ElementType }> = {
  active:  { label: "نشط",         cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400",    icon: Play },
  pending: { label: "قيد الانتظار", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400", icon: CircleDashed },
  done:    { label: "منتهي",        cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400", icon: Check },
};

const PRIORITY_CONFIG: Record<CasePriority, { label: string; cls: string }> = {
  high:   { label: "عالية",    cls: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
  medium: { label: "متوسطة",   cls: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" },
  low:    { label: "منخفضة",   cls: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TeamMemberPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const params = useParams();
  const memberId = String(params.id || "1");
  
  const member = MEMBERS_BY_ID[memberId] ?? MEMBERS_BY_ID["1"];
  const memberCases = CASES_BY_MEMBER[memberId] ?? [];
  
  const [activeTab, setActiveTab] = useState<"cases" | "activity" | "info">("cases");

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  const statusStyle = STATUS_CONFIG[member.status];
  const completionRate = Math.round(
    (member.completedCases / (member.completedCases + member.cases + 1)) * 100
  );

  const activeCasesCount = memberCases.filter(c => c.status === "active").length;
  const doneCasesCount = memberCases.filter(c => c.status === "done").length;
  const urgentCasesCount = memberCases.filter(c => c.isExpiring).length;

  const tabs = [
    { id: "cases" as const,    label: "القضايا والملفات", count: memberCases.length },
    { id: "activity" as const, label: "آخر النشاطات",    count: null },
    { id: "info" as const,     label: "البيانات التفصيلية", count: null },
  ];

  return (
    <div className={`min-h-screen ${isDark ? "bg-zinc-950" : "bg-zinc-50/50"}`} dir="rtl">
      <div className="mx-auto max-w-5xl px-5 py-8 space-y-6">

        {/* ── Breadcrumb ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/dashboard/business" className={`${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"} transition-colors`}>
            لوحة التحكم
          </Link>
          <ArrowRight size={13} className={isDark ? "text-zinc-700" : "text-zinc-300"} />
          <Link href="/dashboard/business/team" className={`${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-600"} transition-colors`}>
            إدارة الفريق
          </Link>
          <ArrowRight size={13} className={isDark ? "text-zinc-700" : "text-zinc-300"} />
          <span className={isDark ? "text-zinc-200" : "text-zinc-800"}>{member.nameAr}</span>
        </div>

        {/* ── Profile Hero ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={`${card} overflow-hidden shadow-sm`}
        >
          {/* Gradient strip */}
          <div className={`h-2 w-full bg-gradient-to-r ${member.gradient}`} />

          <div className="p-6">
            <div className="flex flex-col sm:flex-row items-start gap-5">
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <div className={`h-20 w-20 rounded-3xl bg-gradient-to-br ${member.gradient} flex items-center justify-center shadow-lg`}>
                  <span className="text-white font-bold text-2xl">{member.initials}</span>
                </div>
                <span className={`absolute -bottom-1 -end-1 h-4 w-4 rounded-full border-2 ${isDark ? "border-zinc-900" : "border-white"} ${statusStyle.dot}`} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className={`text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-zinc-900"}`}>
                    {member.nameAr}
                  </h1>
                  {member.verified && (
                    <span title="موثق">
                      <SealCheck size={20} weight="fill" className="text-[#C8A762]" />
                    </span>
                  )}
                  {member.hasLawyerPowers && (
                    <span title="صلاحيات محامي مفعّلة">
                      <ShieldCheck size={20} weight="fill" className="text-blue-500" />
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={`text-sm font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    {ROLE_AR[member.role]} · {member.dept}
                  </span>
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${statusStyle.dot === "bg-emerald-500" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400" : statusStyle.dot === "bg-amber-500" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusStyle.dot}`} />
                    {statusStyle.label}
                  </span>
                </div>

                <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  {member.bio}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0">
                <a href={`mailto:${member.email}`}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition-colors ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"}`}
                >
                  <EnvelopeSimple size={14} /> إرسال إيميل
                </a>
                <button className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-semibold transition-colors ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-300 hover:bg-zinc-700" : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"}`}>
                  <DotsThree size={14} weight="bold" /> إجراءات
                </button>
              </div>
            </div>

            {/* Specializations */}
            <div className="mt-4 pt-4 border-t flex flex-wrap gap-1.5" style={{ borderColor: isDark ? "rgba(255,255,255,0.05)" : "#f1f5f9" }}>
              <span className={`text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>التخصصات:</span>
              {member.specializations.map(s => (
                <span key={s} className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${isDark ? "bg-white/[0.05] text-zinc-300 border border-white/[0.06]" : "bg-zinc-100 text-zinc-600 border border-zinc-200"}`}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── KPI Stats Row ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Briefcase,      label: "قضايا نشطة",     value: member.cases,              color: "text-blue-500",    bg: isDark ? "bg-blue-500/10" : "bg-blue-50" },
            { icon: CheckCircle,    label: "قضايا منجزة",    value: member.completedCases,     color: "text-emerald-500", bg: isDark ? "bg-emerald-500/10" : "bg-emerald-50" },
            { icon: Star,           label: "أتعاب الشهر (ر.س)", value: member.thisMonthFees.toLocaleString("ar-SA"), color: "text-[#C8A762]", bg: isDark ? "bg-[#C8A762]/10" : "bg-amber-50" },
            { icon: Clock,          label: "متوسط الإنجاز",  value: `${member.avgResolutionDays} يوم`, color: "text-purple-500", bg: isDark ? "bg-purple-500/10" : "bg-purple-50" },
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

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={`${card} p-5 shadow-sm`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[13px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>معدل الإنجاز الكلي</span>
            <span className={`font-mono text-sm font-bold ${completionRate > 70 ? "text-amber-500" : "text-emerald-500"}`}>{completionRate}٪</span>
          </div>
          <div className={`h-2 w-full rounded-full ${isDark ? "bg-white/[0.06]" : "bg-zinc-100"}`}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${completionRate}%` }}
              transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
              className={`h-full rounded-full bg-gradient-to-r ${member.gradient}`}
            />
          </div>
          <div className={`flex justify-between mt-2 text-[11px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
            <span>{activeCasesCount} نشطة · {doneCasesCount} منجزة</span>
            {urgentCasesCount > 0 && (
              <span className="text-red-500 flex items-center gap-1">
                <Warning size={10} weight="bold" /> {urgentCasesCount} تنتهي قريباً
              </span>
            )}
          </div>
        </motion.div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
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

        {/* ── Tab Content ─────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {/* Cases Tab */}
          {activeTab === "cases" && (
            <motion.div
              key="cases"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              {memberCases.length === 0 ? (
                <div className={`${card} p-12 text-center`}>
                  <Scales size={40} className={`mx-auto mb-3 ${isDark ? "text-zinc-700" : "text-zinc-300"}`} />
                  <p className={`text-sm font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>لا توجد قضايا مسنَدة حالياً</p>
                </div>
              ) : (
                memberCases.map((caseItem, i) => {
                  const statusCfg = CASE_STATUS_CONFIG[caseItem.status];
                  const priorityCfg = PRIORITY_CONFIG[caseItem.priority];
                  const StatusIcon = statusCfg.icon;

                  return (
                    <motion.div
                      key={caseItem.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                    >
                      <Link
                        href={`/dashboard/business/cases/${caseItem.id}`}
                        className={`${card} p-5 shadow-sm flex items-center gap-4 group transition-all hover:shadow-md ${isDark ? "hover:border-white/10" : "hover:border-zinc-300"} block`}
                      >
                        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.04] group-hover:bg-white/[0.08]" : "bg-zinc-50 group-hover:bg-zinc-100"} transition-colors`}>
                          <StatusIcon size={18} className={caseItem.status === "done" ? "text-emerald-500" : caseItem.status === "active" ? "text-blue-500" : "text-amber-500"} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`font-mono text-[11px] font-bold ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>{caseItem.id}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${priorityCfg.cls}`}>{priorityCfg.label}</span>
                            {caseItem.isExpiring && (
                              <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">
                                <Warning size={9} weight="bold" /> تنتهي قريباً
                              </span>
                            )}
                          </div>
                          <p className={`text-[13px] font-semibold truncate ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{caseItem.title}</p>
                          <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                            {caseItem.dept} · استحقاق {caseItem.dueDate}
                          </p>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold flex-shrink-0 ${statusCfg.cls}`}>{statusCfg.label}</span>
                      </Link>
                    </motion.div>
                  );
                })
              )}
            </motion.div>
          )}

          {/* Activity Tab */}
          {activeTab === "activity" && (
            <motion.div
              key="activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className={`${card} overflow-hidden shadow-sm`}
            >
              {ACTIVITY.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-4 px-5 py-4 border-b last:border-b-0 ${isDark ? "border-white/[0.04]" : "border-zinc-50"}`}
                >
                  <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.04]" : "bg-zinc-50"}`}>
                    {item.type === "comment" && <ChatCircle size={15} className={isDark ? "text-zinc-400" : "text-zinc-500"} />}
                    {item.type === "upload" && <FileText size={15} className="text-blue-500" />}
                    {item.type === "done" && <CheckCircle size={15} className="text-emerald-500" />}
                    {item.type === "meeting" && <UsersThree size={15} className="text-purple-500" />}
                  </div>
                  <div className="flex-1">
                    <p className={`text-[13px] ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{item.text}</p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{item.time}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Info Tab */}
          {activeTab === "info" && (
            <motion.div
              key="info"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className={`${card} p-6 shadow-sm space-y-5`}
            >
              {[
                { icon: EnvelopeSimple, label: "البريد الإلكتروني", value: member.email },
                { icon: Phone,          label: "رقم الجوال",         value: member.phone },
                { icon: Briefcase,      label: "القسم",              value: member.dept },
                { icon: CalendarBlank,  label: "تاريخ الانضمام",     value: member.joinDate },
                { icon: Crown,          label: "الدور الوظيفي",      value: ROLE_AR[member.role] },
                { icon: TrendUp,        label: "معدل الإنجاز",       value: `${completionRate}٪` },
                { icon: ChartBar,       label: "إجمالي القضايا المنجزة", value: member.completedCases.toString() },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className={`flex items-center gap-4 border-b pb-4 last:border-b-0 last:pb-0 ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${isDark ? "bg-white/[0.04]" : "bg-zinc-50"}`}>
                    <Icon size={16} className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                  </div>
                  <div className="flex-1">
                    <p className={`text-[11px] mb-0.5 ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>{label}</p>
                    <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{value}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
