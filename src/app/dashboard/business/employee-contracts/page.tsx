"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Warning, CheckCircle, Clock, Plus, Bell,
  MagnifyingGlass, Funnel, ArrowRight, SealCheck, UserCircle,
  Scales, Robot, DownloadSimple, Eye, PencilSimple, X,
  CalendarBlank, CaretDown, Swap,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// ─── Types ─────────────────────────────────────────────────────────────────
type Status = "active" | "expiring_30" | "expiring_90" | "expired" | "flagged";
type RiskLevel = "low" | "medium" | "high";

interface EmployeeContract {
  id: string;
  employee: string; employeeEn: string;
  dept: string; deptEn: string;
  position: string; positionEn: string;
  type: string; typeEn: string;
  startDate: string; endDate: string;
  daysLeft: number | null;
  status: Status;
  risk: RiskLevel;
  issues: string[]; issuesEn: string[];
  salary: number;
  nationality: string;
}

// ─── Mock Data ──────────────────────────────────────────────────────────────
const CONTRACTS: EmployeeContract[] = [
  {
    id: "EC-001", employee: "محمد العنزي", employeeEn: "Mohammed Al-Anzi",
    dept: "التسويق", deptEn: "Marketing", position: "مدير تسويق", positionEn: "Marketing Manager",
    type: "محدد المدة", typeEn: "Fixed-Term",
    startDate: "2024/01/01", endDate: "2026/04/15", daysLeft: 12,
    status: "expiring_30", risk: "high",
    issues: ["لم يُرسَل إشعار التجديد", "بند عدم المنافسة يحتاج مراجعة"],
    issuesEn: ["Renewal notice not sent", "Non-compete clause needs review"],
    salary: 18000, nationality: "سعودي",
  },
  {
    id: "EC-002", employee: "فاطمة الرشيدي", employeeEn: "Fatima Al-Rashidi",
    dept: "الموارد البشرية", deptEn: "HR", position: "أخصائية موارد بشرية", positionEn: "HR Specialist",
    type: "غير محدد المدة", typeEn: "Open-Ended",
    startDate: "2022/03/15", endDate: "—", daysLeft: null,
    status: "active", risk: "low",
    issues: [], issuesEn: [],
    salary: 12000, nationality: "سعودية",
  },
  {
    id: "EC-003", employee: "خالد المطيري", employeeEn: "Khalid Al-Mutairi",
    dept: "تقنية المعلومات", deptEn: "IT", position: "مطور برمجيات", positionEn: "Software Developer",
    type: "محدد المدة", typeEn: "Fixed-Term",
    startDate: "2023/05/01", endDate: "2026/06/30", daysLeft: 88,
    status: "expiring_90", risk: "medium",
    issues: ["مكافأة نهاية الخدمة غير محسوبة في العقد"],
    issuesEn: ["End-of-service gratuity not calculated in contract"],
    salary: 22000, nationality: "سعودي",
  },
  {
    id: "EC-004", employee: "نورة القحطاني", employeeEn: "Noura Al-Qahtani",
    dept: "المالية", deptEn: "Finance", position: "محاسبة قانونية", positionEn: "Legal Accountant",
    type: "محدد المدة", typeEn: "Fixed-Term",
    startDate: "2022/01/01", endDate: "2026/01/31", daysLeft: -62,
    status: "expired", risk: "high",
    issues: ["العقد منتهٍ ولم يُجدَّد", "الاستمرار في العمل دون عقد سري قانونياً"],
    issuesEn: ["Contract expired without renewal", "Continuing work without contract — legal risk"],
    salary: 14000, nationality: "سعودية",
  },
  {
    id: "EC-005", employee: "عمرو السيد", employeeEn: "Amr Al-Sayed",
    dept: "المبيعات", deptEn: "Sales", position: "مندوب مبيعات", positionEn: "Sales Representative",
    type: "محدد المدة", typeEn: "Fixed-Term",
    startDate: "2025/01/01", endDate: "2026/12/31", daysLeft: 272,
    status: "flagged", risk: "high",
    issues: [
      "بند المكافأة مخالف للمادة ٧٤ من نظام العمل",
      "فترة الاختبار تجاوزت ١٨٠ يوماً المسموح بها",
    ],
    issuesEn: [
      "Bonus clause violates Labor Law Article 74",
      "Probation period exceeds the allowed 180 days",
    ],
    salary: 8500, nationality: "مصري",
  },
  {
    id: "EC-006", employee: "سارة العتيبي", employeeEn: "Sara Al-Otaibi",
    dept: "العمليات", deptEn: "Operations", position: "مشرفة عمليات", positionEn: "Operations Supervisor",
    type: "غير محدد المدة", typeEn: "Open-Ended",
    startDate: "2020/09/01", endDate: "—", daysLeft: null,
    status: "active", risk: "low",
    issues: [], issuesEn: [],
    salary: 16500, nationality: "سعودية",
  },
];

// ─── Status Config ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<Status, { ar: string; en: string; color: string; bg: string; borderColor: string }> = {
  active:       { ar: "سارٍ",            en: "Active",       color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10", borderColor: "border-emerald-500/20" },
  expiring_30:  { ar: "ينتهي خلال ٣٠ي", en: "Exp. in 30d",  color: "text-red-600 dark:text-red-400",     bg: "bg-red-500/10",     borderColor: "border-red-500/20" },
  expiring_90:  { ar: "ينتهي خلال ٩٠ي", en: "Exp. in 90d",  color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10",   borderColor: "border-amber-500/20" },
  expired:      { ar: "منتهٍ",           en: "Expired",      color: "text-red-700 dark:text-red-500",     bg: "bg-red-500/15",     borderColor: "border-red-500/30" },
  flagged:      { ar: "مُشكَل قانوني",   en: "Legal Issue",  color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10", borderColor: "border-purple-500/20" },
};

const RISK_CONFIG: Record<RiskLevel, { ar: string; en: string; dot: string }> = {
  low:    { ar: "منخفض",  en: "Low",    dot: "bg-emerald-500" },
  medium: { ar: "متوسط",  en: "Medium", dot: "bg-amber-500" },
  high:   { ar: "مرتفع",  en: "High",   dot: "bg-red-500" },
};

// ─── Contract Detail Drawer ─────────────────────────────────────────────────
function ContractDrawer({ contract, onClose, isRTL, isDark }: {
  contract: EmployeeContract; onClose: () => void; isRTL: boolean; isDark: boolean;
}) {
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const statusCfg = STATUS_CONFIG[contract.status];
  const riskCfg = RISK_CONFIG[contract.risk];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
    >
      <motion.aside
        initial={{ x: isRTL ? -400 : 400 }} animate={{ x: 0 }} exit={{ x: isRTL ? -400 : 400 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={e => e.stopPropagation()}
        className={`absolute top-0 ${isRTL ? "left-0" : "right-0"} h-full w-full max-w-md overflow-y-auto shadow-2xl ${isDark ? "bg-zinc-900/90 border-l border-white/[0.06] shadow-[-8px_0_32px_rgba(0,0,0,0.5)]" : "bg-white border-l border-zinc-200"}`}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 p-5 border-b border-current/10 bg-inherit">
          <div>
            <p className={`text-sm font-black ${isDark ? "text-white" : "text-gray-900"}`}>{isRTL ? contract.employee : contract.employeeEn}</p>
            <p className={`text-xs ${muted}`}>{isRTL ? contract.position : contract.positionEn} · {isRTL ? contract.dept : contract.deptEn}</p>
          </div>
          <button onClick={onClose} className={`w-8 h-8 rounded-xl flex items-center justify-center transition ${isDark ? "hover:bg-white/10" : "hover:bg-gray-100"}`}>
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status + Risk */}
          <div className="flex gap-3">
            <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${statusCfg.color} ${statusCfg.bg} ${statusCfg.borderColor}`}>
              {isRTL ? statusCfg.ar : statusCfg.en}
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-current/10">
              <span className={`w-2 h-2 rounded-full ${riskCfg.dot}`} />
              {isRTL ? `خطر ${riskCfg.ar}` : `${riskCfg.en} Risk`}
            </span>
          </div>

          {/* Info grid */}
          <div className={`grid grid-cols-2 gap-3 rounded-2xl border p-4 ${isDark ? "border-[#2d3748] bg-[#161b22]" : "border-gray-200 bg-gray-50"}`}>
            {[
              { label: isRTL ? "رقم العقد" : "Contract ID", val: contract.id },
              { label: isRTL ? "نوع العقد" : "Type", val: isRTL ? contract.type : contract.typeEn },
              { label: isRTL ? "تاريخ البداية" : "Start Date", val: contract.startDate },
              { label: isRTL ? "تاريخ الانتهاء" : "End Date", val: contract.endDate },
              { label: isRTL ? "الراتب" : "Salary", val: `${contract.salary.toLocaleString()} ر.س` },
              { label: isRTL ? "الجنسية" : "Nationality", val: contract.nationality },
            ].map((item, i) => (
              <div key={i}>
                <p className={`text-xs ${muted} mb-0.5`}>{item.label}</p>
                <p className={`text-sm font-bold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{item.val}</p>
              </div>
            ))}
          </div>

          {/* Days left countdown */}
          {contract.daysLeft !== null && (
            <div className={`rounded-2xl border p-4 flex items-center gap-4 ${
              contract.daysLeft < 0
                ? isDark ? "border-red-500/30 bg-red-500/10" : "border-red-200 bg-red-50"
                : contract.daysLeft <= 30
                ? isDark ? "border-red-500/20 bg-red-500/5" : "border-red-100 bg-red-50/50"
                : isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-100 bg-amber-50/50"
            }`}>
              <Clock size={32} color={contract.daysLeft < 0 ? "#ef4444" : "#f59e0b"} weight="duotone" />
              <div>
                <p className={`text-xl font-black ${contract.daysLeft < 0 ? "text-red-500" : "text-amber-600 dark:text-amber-400"}`}>
                  {contract.daysLeft < 0
                    ? isRTL ? `انتهى منذ ${Math.abs(contract.daysLeft)} يوم` : `Expired ${Math.abs(contract.daysLeft)} days ago`
                    : isRTL ? `${contract.daysLeft} يوم متبقٍ` : `${contract.daysLeft} days left`
                  }
                </p>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  {isRTL ? `نهاية العقد: ${contract.endDate}` : `Contract ends: ${contract.endDate}`}
                </p>
              </div>
            </div>
          )}

          {/* Issues */}
          {contract.issues.length > 0 && (
            <div>
              <p className="text-sm font-bold text-red-500 mb-3 flex items-center gap-2">
                <Warning size={14} weight="fill" />
                {isRTL ? "مشاكل قانونية تحتاج معالجة" : "Legal Issues Requiring Action"}
              </p>
              <ul className="space-y-2">
                {(isRTL ? contract.issues : contract.issuesEn).map((issue, i) => (
                  <li key={i} className={`flex items-start gap-2.5 p-3 rounded-xl border ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-100 bg-red-50/60"}`}>
                    <Warning size={14} color="#ef4444" weight="fill" className="mt-0.5 flex-shrink-0" />
                    <p className={`text-xs leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>{issue}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Analysis */}
          <div className={`rounded-2xl border p-4 ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
            <p className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 mb-2">
              <Robot size={14} weight="fill" />
              {isRTL ? "تحليل نظامي AI:" : "Nzamy AI Analysis:"}
            </p>
            <p className={`text-xs leading-relaxed ${isDark ? "text-gray-300" : "text-gray-700"}`}>
              {contract.issues.length > 0
                ? isRTL
                  ? `هذا العقد يحمل ${contract.issues.length} مشكلة قانونية تستوجب التسوية العاجلة. يُنصح بالتواصل مع محامٍ متخصص في نظام العمل خلال ٧ أيام.`
                  : `This contract has ${contract.issues.length} legal issue(s) requiring urgent resolution. Recommend contacting a labor law specialist within 7 days.`
                : isRTL
                  ? "العقد سليم من الناحية القانونية. لا توجد مشاكل محددة في الوقت الراهن."
                  : "Contract is legally sound. No specific issues identified at this time."
              }
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            <Link
              href="/dashboard/business/consultations"
              className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0B3D2E] text-white text-sm font-bold rounded-2xl hover:bg-[#0a3328] transition"
            >
              <SealCheck size={16} weight="fill" />
              {isRTL ? "استشر محامٍ متخصص" : "Consult a Specialist Lawyer"}
            </Link>
            <div className="flex gap-2">
              <button className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl border transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                <DownloadSimple size={14} />{isRTL ? "تنزيل العقد" : "Download"}
              </button>
              <button className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold rounded-xl border transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-white/5" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                <PencilSimple size={14} />{isRTL ? "تعديل" : "Edit"}
              </button>
            </div>
          </div>
        </div>
      </motion.aside>
    </motion.div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
import { RoleGuard } from "@/components/dashboard/RoleGuard";
import { SubscriptionGuard } from "@/components/dashboard/SubscriptionGuard";

export default function EmployeeContractsPage() {
  const { isRTL, isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Status | "all">("all");
  const [filterRisk, setFilterRisk] = useState<RiskLevel | "all">("all");
  const [selectedContract, setSelectedContract] = useState<EmployeeContract | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showRiskFilter, setShowRiskFilter] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900/80 border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]" : "bg-white border-zinc-200/70 shadow-[inset_0_1px_0_rgba(255,255,255,1)]"}`;

  // Stats
  const totalExpiring30 = CONTRACTS.filter(c => c.status === "expiring_30").length;
  const totalExpired = CONTRACTS.filter(c => c.status === "expired").length;
  const totalFlagged = CONTRACTS.filter(c => c.status === "flagged" || c.risk === "high").length;
  const totalActive = CONTRACTS.filter(c => c.status === "active").length;

  // Filter
  const filtered = CONTRACTS.filter(c => {
    const q = search.toLowerCase();
    const nameMatch = (isRTL ? c.employee : c.employeeEn).toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    return nameMatch &&
      (filterStatus === "all" || c.status === filterStatus) &&
      (filterRisk === "all" || c.risk === filterRisk);
  });

  const ALERTS = [
    ...(totalExpired > 0 ? [{ icon: Warning, color: "red", text: isRTL ? `${totalExpired} عقد منتهٍ — العمل بدون عقد يُعرّض الشركة لمسؤولية قانونية` : `${totalExpired} expired contract — working without contract risks legal liability` }] : []),
    ...(totalExpiring30 > 0 ? [{ icon: Bell, color: "amber", text: isRTL ? `${totalExpiring30} عقد ينتهي خلال ٣٠ يوماً — ابدأ إجراءات التجديد فوراً` : `${totalExpiring30} contract expiring in 30 days — start renewal procedures now` }] : []),
    ...(totalFlagged > 0 ? [{ icon: Scales, color: "purple", text: isRTL ? `${totalFlagged} عقد يحمل مخاطر قانونية — يُنصح بمراجعة المحامي` : `${totalFlagged} contracts with legal risks — lawyer review recommended` }] : []),
  ];

  return (
    <RoleGuard allowedRoles={["owner", "hr_manager", "legal_manager"]}>
    <SubscriptionGuard featureKey="hr-contracts">
    <div className={`min-h-screen ${isDark ? "bg-[#0c0f12] text-white" : "bg-gray-50 text-gray-900"}`} dir={isRTL ? "rtl" : "ltr"}>

      {/* Breadcrumb */}
      <div className={`flex items-center gap-2 text-xs mb-5 ${muted}`}>
        <Link href="/dashboard/business" className="hover:text-[#0B3D2E] dark:hover:text-[#C8A762] transition">
          {isRTL ? "لوحة التحكم" : "Dashboard"}
        </Link>
        <ArrowRight size={10} className={isRTL ? "rotate-180" : ""} />
        <span className={`font-medium ${isDark ? "text-white" : "text-gray-800"}`}>
          {isRTL ? "عقود الموظفين" : "Employee Contracts"}
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="flex-1">
          <h1 className={`text-2xl font-black ${isDark ? "text-white" : "text-gray-900"}`}>
            {isRTL ? "مدير عقود الموظفين" : "Employee Contract Manager"}
          </h1>
          <p className={`text-sm mt-1 ${muted}`}>
            {isRTL ? "مراجعة دورية — تنبيهات تلقائية — تحليل قانوني بالذكاء الاصطناعي" : "Periodic review — auto alerts — AI legal analysis"}
          </p>
        </div>
        <button className="flex items-center gap-2 px-5 py-3 bg-[#0B3D2E] text-white text-sm font-bold rounded-2xl hover:bg-[#0a3328] transition">
          <Plus size={16} weight="bold" />
          {isRTL ? "إضافة عقد" : "Add Contract"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { n: CONTRACTS.length, label: isRTL ? "إجمالي العقود" : "Total Contracts", color: "#0B3D2E", status: "all" as any },
          { n: totalActive, label: isRTL ? "سارية" : "Active", color: "#22c55e", status: "active" as Status },
          { n: totalExpiring30, label: isRTL ? "تنتهي قريباً" : "Expiring Soon", color: "#f59e0b", status: "expiring_30" as Status },
          { n: totalExpired + (CONTRACTS.filter(c=>c.status==="flagged").length), label: isRTL ? "تحتاج معالجة" : "Need Action", color: "#ef4444", status: "expired" as Status },
        ].map((s, i) => (
          <motion.button key={i} onClick={() => setFilterStatus(s.status === "all" ? "all" : s.status)}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            className={`${card} p-4 text-start flex flex-col gap-1 transition-all ${filterStatus === s.status ? "ring-2 ring-[#0B3D2E]/30" : ""}`}>
            <p className={`text-3xl font-black`} style={{ color: s.color }}>{s.n}</p>
            <p className={`text-xs ${muted}`}>{s.label}</p>
          </motion.button>
        ))}
      </div>

      {/* Alerts */}
      {ALERTS.length > 0 && (
        <div className="space-y-2 mb-5">
          {ALERTS.map((a, i) => {
            const Icon = a.icon;
            const colors = {
              red: isDark ? "bg-red-900/20 border-red-500/30 text-red-400" : "bg-red-50 border-red-200 text-red-700",
              amber: isDark ? "bg-amber-900/20 border-amber-500/30 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700",
              purple: isDark ? "bg-purple-900/20 border-purple-500/30 text-purple-400" : "bg-purple-50 border-purple-200 text-purple-700",
            };
            return (
              <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${colors[a.color as keyof typeof colors]}`}>
                <Icon size={16} weight="fill" className="flex-shrink-0" />
                {a.text}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className={`flex-1 flex items-center gap-2 rounded-xl border px-3 ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`}>
          <MagnifyingGlass size={15} color={isDark ? "#6b7280" : "#9ca3af"} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isRTL ? "ابحث بالاسم أو رقم العقد..." : "Search by name or contract ID..."}
            className={`flex-1 py-2.5 text-sm bg-transparent outline-none ${isDark ? "placeholder-gray-600" : "placeholder-gray-400"}`} />
        </div>
        {/* Status filter pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {(["all", "active", "expiring_30", "expiring_90", "expired", "flagged"] as const).map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold border transition ${filterStatus === s ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "border-[#2d3748] text-gray-400" : "border-gray-200 text-gray-500"}`}>
              {s === "all" ? (isRTL ? "الكل" : "All") : (isRTL ? STATUS_CONFIG[s].ar : STATUS_CONFIG[s].en)}
            </button>
          ))}
        </div>
      </div>

      {/* Contracts list */}
      <div className="space-y-3">
        {filtered.map((contract, i) => {
          const statusCfg = STATUS_CONFIG[contract.status];
          const riskCfg = RISK_CONFIG[contract.risk];
          return (
            <motion.div key={contract.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              onClick={() => setSelectedContract(contract)}
              className={`${card} p-4 cursor-pointer hover:border-[#0B3D2E]/30 transition-all group`}
            >
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0 ${isDark ? "bg-white/10 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                  {(isRTL ? contract.employee : contract.employeeEn).charAt(0)}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={`text-sm font-bold ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                      {isRTL ? contract.employee : contract.employeeEn}
                    </p>
                    {contract.issues.length > 0 && (
                      <Warning size={13} color="#ef4444" weight="fill" />
                    )}
                  </div>
                  <p className={`text-xs ${muted}`}>
                    {isRTL ? contract.position : contract.positionEn} · {isRTL ? contract.dept : contract.deptEn}
                  </p>
                </div>

                {/* Status badge */}
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${statusCfg.color} ${statusCfg.bg} ${statusCfg.borderColor}`}>
                  {isRTL ? statusCfg.ar : statusCfg.en}
                </span>

                {/* Risk dot */}
                <div className="hidden sm:flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${riskCfg.dot}`} />
                  <span className={`text-xs ${muted}`}>{isRTL ? riskCfg.ar : riskCfg.en}</span>
                </div>

                {/* Days left */}
                {contract.daysLeft !== null && (
                  <div className="hidden md:flex items-center gap-1 text-xs">
                    <Clock size={12} color={contract.daysLeft < 0 ? "#ef4444" : "#f59e0b"} />
                    <span className={contract.daysLeft < 0 ? "text-red-500 font-bold" : "text-amber-500 font-bold"}>
                      {contract.daysLeft < 0
                        ? (isRTL ? `منذ ${Math.abs(contract.daysLeft)}ي` : `-${Math.abs(contract.daysLeft)}d`)
                        : (isRTL ? `${contract.daysLeft} يوم` : `${contract.daysLeft}d`)}
                    </span>
                  </div>
                )}

                <ArrowRight size={14} color={isDark ? "#4b5563" : "#9ca3af"} className={`flex-shrink-0 group-hover:translate-x-1 transition ${isRTL ? "rotate-180" : ""}`} />
              </div>

              {/* Issues preview */}
              {contract.issues.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {(isRTL ? contract.issues : contract.issuesEn).slice(0, 2).map((issue, j) => (
                    <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/15">
                      ⚠ {issue.length > 40 ? issue.slice(0, 40) + "..." : issue}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}

        {filtered.length === 0 && (
          <div className={`${card} p-12 text-center`}>
            <FileText size={40} weight="duotone" className="mx-auto mb-3 opacity-30" />
            <p className={`text-sm ${muted}`}>{isRTL ? "لا توجد عقود مطابقة" : "No matching contracts"}</p>
          </div>
        )}
      </div>

      {/* Periodic Review Banner */}
      <div className={`mt-6 rounded-2xl border p-5 flex flex-col sm:flex-row items-center gap-4 ${isDark ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30" : "bg-[#0B3D2E]/5 border-[#0B3D2E]/20"}`}>
        <div className="flex items-center gap-3 flex-1">
          <Robot size={32} color="#C8A762" weight="duotone" />
          <div>
            <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "🔄 مراجعة دورية تلقائية بالذكاء الاصطناعي" : "🔄 Auto AI Periodic Review"}
            </p>
            <p className={`text-xs ${muted}`}>
              {isRTL
                ? "كل ٣٠ يوماً يُحلَّل كل عقد تلقائياً — تنبيهات فورية عند اكتشاف مشاكل أو اقتراب الانتهاء"
                : "Every 30 days, all contracts are automatically analyzed — instant alerts when issues or expirations are detected"}
            </p>
          </div>
        </div>
        <Link href="/dashboard/business"
          className="flex-shrink-0 px-5 py-2.5 bg-[#0B3D2E] text-white text-xs font-bold rounded-xl hover:bg-[#0a3328] transition">
          {isRTL ? "إعداد التنبيهات" : "Configure Alerts"}
        </Link>
      </div>

      {/* Drawer */}
      <AnimatePresence>
        {selectedContract && (
          <ContractDrawer
            contract={selectedContract}
            onClose={() => setSelectedContract(null)}
            isRTL={isRTL}
            isDark={isDark}
          />
        )}
      </AnimatePresence>
    </div>
    </SubscriptionGuard>
    </RoleGuard>
  );
}
