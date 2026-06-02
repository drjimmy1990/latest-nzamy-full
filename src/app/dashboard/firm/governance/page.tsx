"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Plus, Trash, PencilSimple, Clock,
  Bell, Info, Money, FileText, ListChecks,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { RoleGuard } from "@/components/dashboard/RoleGuard";

// ─── Types & Mock Data ────────────────────────────────────────────────────────

type ContractType = "تجاري" | "عمالي" | "إيجار" | "خدمات" | "شراكة" | "سرية";
type EscalationAction = "الشريك المسؤول" | "مجلس الشركاء" | "رئيس القسم" | "رئيس المكتب";

interface ApprovalRule {
  id: string;
  contractType: ContractType;
  minValue: number;
  maxValue: number | null;
  requiredApprovers: EscalationAction[];
  reviewDays: number;
  mandatoryDepts: string[];
  active: boolean;
}

const CONTRACT_TYPES: ContractType[] = ["تجاري", "عمالي", "إيجار", "خدمات", "شراكة", "سرية"];
const APPROVER_OPTIONS: EscalationAction[] = ["الشريك المسؤول", "مجلس الشركاء", "رئيس القسم", "رئيس المكتب"];
const DEPT_OPTIONS = ["قسم الخصومات", "قسم العقود", "قسم الامتثال", "الإدارة العامة", "المحاسبة"];

const MOCK_RULES: ApprovalRule[] = [
  {
    id: "r1", contractType: "تجاري", minValue: 0, maxValue: 500000,
    requiredApprovers: ["الشريك المسؤول"], reviewDays: 5,
    mandatoryDepts: ["قسم العقود"], active: true,
  },
  {
    id: "r2", contractType: "تجاري", minValue: 500000, maxValue: 5000000,
    requiredApprovers: ["الشريك المسؤول", "مجلس الشركاء"], reviewDays: 10,
    mandatoryDepts: ["قسم العقود", "قسم الامتثال"], active: true,
  },
  {
    id: "r3", contractType: "تجاري", minValue: 5000000, maxValue: null,
    requiredApprovers: ["رئيس المكتب", "مجلس الشركاء"], reviewDays: 14,
    mandatoryDepts: ["قسم العقود", "قسم الامتثال", "الإدارة العامة"], active: true,
  },
  {
    id: "r4", contractType: "عمالي", minValue: 0, maxValue: null,
    requiredApprovers: ["رئيس القسم", "الشريك المسؤول"], reviewDays: 7,
    mandatoryDepts: ["الإدارة العامة", "المحاسبة"], active: true,
  },
  {
    id: "r5", contractType: "إيجار", minValue: 1000000, maxValue: null,
    requiredApprovers: ["رئيس المكتب"], reviewDays: 10,
    mandatoryDepts: ["المحاسبة", "قسم الامتثال"], active: false,
  },
];

function fmtValue(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M ﷼`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k ﷼`;
  return `${n} ﷼`;
}

const APPROVER_COLORS: Record<EscalationAction, string> = {
  "الشريك المسؤول": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  "مجلس الشركاء":   "bg-purple-500/10 text-purple-500 border-purple-500/20",
  "رئيس القسم":     "bg-amber-500/10 text-amber-500 border-amber-500/20",
  "رئيس المكتب":    "bg-red-500/10 text-red-500 border-red-500/20",
};

// ─── Rule Card ────────────────────────────────────────────────────────────────

function RuleCard({ rule, isDark, card }: { rule: ApprovalRule; isDark: boolean; card: string }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`${card} p-5 transition-opacity ${!rule.active ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${isDark ? "bg-white/[0.06] border-white/[0.1] text-zinc-300" : "bg-zinc-100 border-zinc-200 text-zinc-600"}`}>
            {rule.contractType}
          </span>
          <span className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
            {fmtValue(rule.minValue)}
            {rule.maxValue ? ` — ${fmtValue(rule.maxValue)}` : " فأكثر"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {!rule.active && (
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"}`}>
              معطّل
            </span>
          )}
          <button className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"}`}>
            <PencilSimple size={14} />
          </button>
          <button className={`p-1.5 rounded-lg transition-colors ${isDark ? "text-zinc-500 hover:bg-red-500/10 hover:text-red-400" : "text-zinc-400 hover:bg-red-50 hover:text-red-500"}`}>
            <Trash size={14} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            المعتمدون المطلوبون
          </p>
          <div className="flex flex-wrap gap-1">
            {rule.requiredApprovers.map(a => (
              <span key={a} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${APPROVER_COLORS[a]}`}>{a}</span>
            ))}
          </div>
        </div>
        <div>
          <p className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            الأقسام الإلزامية
          </p>
          <div className="flex flex-wrap gap-1">
            {rule.mandatoryDepts.map(d => (
              <span key={d} className={`text-[9px] px-1.5 py-0.5 rounded border ${isDark ? "bg-white/[0.04] border-white/[0.08] text-zinc-400" : "bg-zinc-50 border-zinc-200 text-zinc-500"}`}>
                {d}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
            مهلة المراجعة
          </p>
          <div className="flex items-center gap-1">
            <Clock size={12} className={isDark ? "text-zinc-500" : "text-slate-400"} />
            <span className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-600"}`}>{rule.reviewDays} أيام</span>
          </div>
          <p className={`text-[9px] mt-0.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>ثم تصعيد تلقائي</p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Inner Component ──────────────────────────────────────────────────────────

function FirmGovernanceInner() {
  const { isDark } = useTheme();
  const searchParams = useSearchParams();
  const [rules] = useState<ApprovalRule[]>(MOCK_RULES);
  const [filterType, setFilterType] = useState<ContractType | "all">("all");
  const [activeTab, setActiveTab] = useState<"rules" | "matrix">("rules");
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    if (searchParams.get("tab") === "matrix") setActiveTab("matrix");
  }, [searchParams]);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const filtered = filterType === "all" ? rules : rules.filter(r => r.contractType === filterType);

  return (
    <div className="max-w-[1100px] mx-auto space-y-5" dir="rtl">

      {/* Add Rule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className={`rounded-2xl border p-6 w-full max-w-md mx-4 ${isDark ? "bg-zinc-900 border-white/[0.08]" : "bg-white border-zinc-200"}`} onClick={e => e.stopPropagation()}>
            <h3 className={`text-base font-bold mb-4 ${isDark ? "text-white" : "text-slate-800"}`}>إضافة قاعدة حوكمة جديدة</h3>
            <p className={`text-sm mb-6 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>ستُتاح هذه الخاصية قريباً مع ربط قاعدة البيانات.</p>
            <button onClick={() => setShowAddModal(false)} className="w-full py-2.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-sm font-bold">تفهمت</button>
          </div>
        </div>
      )}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className={`text-xl font-bold mb-0.5 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}
            style={{ fontFamily: "var(--font-brand)" }}>
            <ShieldCheck className="text-royal" weight="duotone" />
            حوكمة المكتب القانونية
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            حدّد قواعد الموافقة الداخلية — من يوقّع على ماذا حسب نوع العقد وقيمته
          </p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-semibold bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0a3328] transition-colors shrink-0">
          <Plus size={14} weight="bold" /> إضافة قاعدة
        </button>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2">
        {(["rules", "matrix"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold transition-colors ${
              activeTab === tab ? "bg-[#0B3D2E] text-white" : isDark ? "bg-zinc-800 text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
            }`}>
            {tab === "rules" ? "القواعد" : "المصفوفة البصرية"}
          </button>
        ))}
      </div>

      {/* Info Banner */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className={`${card} p-4 flex items-start gap-3`}>
        <Info size={15} className="text-royal flex-shrink-0 mt-0.5" weight="duotone" />
        <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
          <strong className={isDark ? "text-zinc-200" : "text-slate-700"}>كيف تعمل لوحة الحوكمة؟ </strong>
          عند إرسال أي مستند أو عقد للمراجعة الداخلية، يتحقق النظام من نوعه وقيمته ويُطبّق قواعد الموافقة — من يُشعَر؟ من يجب أن يوافق؟ وكم يوماً قبل التصعيد؟
        </p>
      </motion.div>

      {/* Stats — rules tab only */}
      {activeTab === "rules" && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "قواعد نشطة", value: rules.filter(r => r.active).length.toString(), icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-500/8" },
            { label: "أنواع عقود مغطاة", value: [...new Set(rules.map(r => r.contractType))].length.toString(), icon: FileText, color: "text-blue-500", bg: "bg-blue-500/8" },
            { label: "أعلى عتبة مالية", value: "٥M+ ﷼", icon: Money, color: "text-[#C8A762]", bg: "bg-[#C8A762]/8" },
            { label: "متوسط مدة المراجعة", value: `${Math.round(rules.reduce((s, r) => s + r.reviewDays, 0) / rules.length)} أيام`, icon: Clock, color: "text-purple-500", bg: "bg-purple-500/8" },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className={`${card} p-4`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${s.bg}`}>
                  <Icon size={18} weight="duotone" className={s.color} />
                </div>
                <p className={`text-lg font-bold font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{s.value}</p>
                <p className={`text-[10px] mt-0.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{s.label}</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Governance Matrix */}
      {activeTab === "matrix" && (
        <div className={`${card} p-5`}>
          <h2 className={`text-sm font-bold mb-4 flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
            <ListChecks size={16} className="text-royal" />
            مصفوفة الحوكمة القانونية (بصرياً)
          </h2>
          <div className="space-y-3">
            {[
              { range: "أقل من ٥٠٠,٠٠٠ ﷼", pct: 20, label: "الشريك المسؤول", days: 5, color: "bg-blue-500" },
              { range: "٥٠٠,٠٠٠ — ٥,٠٠٠,٠٠٠ ﷼", pct: 60, label: "الشريك + مجلس الشركاء", days: 10, color: "bg-amber-500" },
              { range: "أكثر من ٥,٠٠٠,٠٠٠ ﷼", pct: 100, label: "رئيس المكتب + مجلس الشركاء", days: 14, color: "bg-red-500" },
            ].map((row, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-52 shrink-0 text-[11px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{row.range}</div>
                <div className={`flex-1 h-7 rounded-xl overflow-hidden ${isDark ? "bg-white/[0.04]" : "bg-slate-100"}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${row.pct}%` }}
                    transition={{ duration: 0.7, delay: 0.2 + i * 0.15 }}
                    className={`h-full rounded-xl flex items-center ps-3 text-[10px] font-bold text-white ${row.color}`}
                  >
                    {row.label}
                  </motion.div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Clock size={11} className={isDark ? "text-zinc-600" : "text-slate-400"} />
                  <span className={`text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{row.days}د</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rules List */}
      {activeTab === "rules" && (<>
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-[11px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>تصفية:</p>
          {(["all", ...CONTRACT_TYPES] as const).map(type => (
            <button key={type} onClick={() => setFilterType(type as ContractType | "all")}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-colors ${
                filterType === type
                  ? "bg-[#0B3D2E] text-white shadow-sm"
                  : isDark ? "bg-zinc-800 text-zinc-400 hover:text-zinc-200" : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
              }`}>
              {type === "all" ? "الكل" : type}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <AnimatePresence>
            {filtered.map(rule => (
              <RuleCard key={rule.id} rule={rule} isDark={isDark} card={card} />
            ))}
          </AnimatePresence>
          {filtered.length === 0 && (
            <div className={`${card} p-10 text-center`}>
              <p className={`text-[13px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>لا توجد قواعد من هذا النوع بعد.</p>
            </div>
          )}
        </div>
      </>)}

      {/* Escalation Notice */}
      <div className={`${card} p-4 flex items-start gap-3`}>
        <Bell size={15} className="text-amber-500 flex-shrink-0 mt-0.5" weight="duotone" />
        <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
          <strong className={isDark ? "text-zinc-200" : "text-slate-700"}>التصعيد التلقائي: </strong>
          إذا لم يُكمل المعتمدون مراجعتهم خلال المدة المحددة، يُرسل النظام تلقائياً إشعار واتساب وبريد إلكتروني للمستوى التالي.
        </p>
      </div>
    </div>
  );
}

// ─── Page Shell ───────────────────────────────────────────────────────────────

export default function FirmGovernancePage() {
  return (
    <RoleGuard allowedRoles={["managing_partner", "partner", "senior_lawyer", "compliance_manager"]}>
      <Suspense fallback={<div className="p-8 text-center opacity-40 text-sm">جارٍ التحميل...</div>}>
        <FirmGovernanceInner />
      </Suspense>
    </RoleGuard>
  );
}
