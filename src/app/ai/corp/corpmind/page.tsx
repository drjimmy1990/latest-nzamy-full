"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Robot, CaretLeft, CheckCircle, ArrowRight, Sparkle,
  FileText, Clock, Warning, ShieldCheck, Eye,
  Download, ArrowCounterClockwise, Upload, ChartLine,
  Buildings, GitBranch, CalendarCheck, Money, Gear,
  Scales, ArrowLeft,
} from "@phosphor-icons/react";
import Link from "next/link";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentPurpose = "contract_analysis" | "policy_review" | "compliance" | "clm";

interface Contract {
  id: string;
  name: string;
  counterparty: string;
  value: string;
  startDate: string;
  endDate: string;
  status: "active" | "expiring" | "expired" | "draft";
  category: string;
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const MOCK_CONTRACTS: Contract[] = [
  { id: "c1", name: "عقد توريد مواد خام", counterparty: "شركة النجم", value: "850,000", startDate: "01/01/2025", endDate: "31/12/2025", status: "active", category: "توريد" },
  { id: "c2", name: "عقد صيانة أجهزة التكييف", counterparty: "مؤسسة الخليج", value: "120,000", startDate: "15/02/2025", endDate: "15/05/2025", status: "expiring", category: "صيانة" },
  { id: "c3", name: "عقد استشارات قانونية", counterparty: "مكتب العامر للمحاماة", value: "45,000", startDate: "01/03/2024", endDate: "28/02/2025", status: "expired", category: "استشارات" },
  { id: "c4", name: "عقد تطوير نظام ERP", counterparty: "شركة تقنيات المستقبل", value: "320,000", startDate: "01/06/2025", endDate: "30/11/2025", status: "draft", category: "تقنية" },
];

const MOCK_ANALYSIS = {
  contractName: "عقد توريد مع شركة النجم للمقاولات",
  score: 72,
  risks: [
    { level: "high",   text: "بند التعويض (م.١٥) لا يُحدد سقفاً للمسؤولية — يُجيز مطالبات غير محدودة" },
    { level: "high",   text: "غياب بند تسوية النزاعات: لم تُحدَّد المحكمة المختصة" },
    { level: "medium", text: "مدة الضمان (م.٩) غير منسجمة مع نظام المقاولات السعودي" },
    { level: "low",    text: "الصياغة الخاصة بتحديد الكميات مبهمة في الملحق (أ)" },
  ],
  suggestions: [
    "أضف حداً أقصى للمسؤولية لا يتجاوز قيمة العقد",
    "حدِّد المحكمة التجارية بالرياض كمحكمة اختصاص",
    "عدِّل بند الضمان ليتوافق مع م.٦٦٢ نظام التجارة",
  ],
};

function formatCorpMindAnalysis() {
  return [
    "CorpMind Contract Analysis",
    `Contract: ${MOCK_ANALYSIS.contractName}`,
    `Score: ${MOCK_ANALYSIS.score}/100`,
    "",
    "Risks:",
    ...MOCK_ANALYSIS.risks.map((risk) => `- [${risk.level}] ${risk.text}`),
    "",
    "Suggestions:",
    ...MOCK_ANALYSIS.suggestions.map((suggestion) => `- ${suggestion}`),
  ].join("\n");
}

const RISK_COLORS = {
  high:   { text: "text-red-500",    bg: "bg-red-500/10 border-red-500/20",    label: "خطر عالٍ" },
  medium: { text: "text-amber-500",  bg: "bg-amber-500/10 border-amber-500/20", label: "خطر متوسط" },
  low:    { text: "text-blue-500",   bg: "bg-blue-500/10 border-blue-500/20",   label: "ملاحظة" },
};

const STATUS_CONFIG = {
  active:   { label: "نشط",       color: "text-emerald-500", bg: "bg-emerald-500/10 border-emerald-500/30" },
  expiring: { label: "ينتهي قريباً", color: "text-amber-500", bg: "bg-amber-500/10 border-amber-500/30" },
  expired:  { label: "منتهي",     color: "text-red-500",     bg: "bg-red-500/10 border-red-500/30" },
  draft:    { label: "مسودة",     color: "text-blue-500",    bg: "bg-blue-500/10 border-blue-500/30" },
};

// ─── Onboarding Step ──────────────────────────────────────────────────────────

function OnboardingView({ isDark, onComplete }: { isDark: boolean; onComplete: (p: AgentPurpose) => void }) {
  const [selected, setSelected] = useState<AgentPurpose | null>(null);

  const options: { id: AgentPurpose; icon: React.ElementType; label: string; desc: string; color: string; bg: string }[] = [
    { id: "contract_analysis", icon: Eye,        label: "تحليل العقود",         desc: "تحليل عميق لبنود العقود، كشف المخاطر، واقتراح التحسينات — لكل عقد على حدة.", color: "text-blue-500",    bg: "bg-blue-500/10" },
    { id: "clm",               icon: GitBranch,  label: "إدارة محفظة العقود (CLM)", desc: "لوحة شاملة لعقود الشركة: التتبع، التجديد، التنبيهات، وإدارة دورة الحياة.", color: "text-purple-500",  bg: "bg-purple-500/10" },
    { id: "policy_review",     icon: FileText,   label: "مراجعة السياسات الداخلية", desc: "تدقيق لوائح الشركة وسياساتها مقارنةً بأحدث التشريعات السعودية.", color: "text-[#C8A762]",   bg: "bg-[#C8A762]/10" },
    { id: "compliance",        icon: ShieldCheck, label: "مراقبة الامتثال التنظيمي", desc: "متابعة امتثال الشركة للأنظمة الخمسة (شركات، UBO، PDPL، نطاقات، ZATCA).", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className={`p-6 rounded-2xl border ${isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-[#C8A762]/20 flex items-center justify-center flex-shrink-0">
            <Robot size={28} weight="duotone" className="text-[#C8A762]" />
          </div>
          <div>
            <h2 className={`text-[18px] font-bold mb-1 ${isDark ? "text-zinc-100" : "text-slate-800"}`}>أهلاً بك في CorpMind</h2>
            <p className={`text-[13px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
              CorpMind هو وكيل الذكاء الاصطناعي الخاص بشركتك. لكي يعمل بأعلى كفاءة، أخبرنا بالغرض الأساسي الذي تريده للوكيل.
              <span className="font-bold"> يمكنك تغيير هذا لاحقاً من الإعدادات.</span>
            </p>
          </div>
        </div>
      </div>

      <h3 className={`text-[14px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>ما الهدف الأساسي لوكيل شركتك؟</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {options.map(opt => {
          const Icon = opt.icon;
          const isSelected = selected === opt.id;
          return (
            <motion.button key={opt.id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              onClick={() => setSelected(opt.id)}
              className={`w-full text-right p-5 rounded-2xl border-2 transition-all ${isSelected
                ? isDark ? "border-[#C8A762]/60 bg-[#C8A762]/10" : "border-amber-400 bg-amber-50"
                : isDark ? "border-white/[0.06] bg-zinc-900/60 hover:border-white/10" : "border-slate-200 bg-white shadow-sm hover:border-slate-300"}`}>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${opt.bg}`}>
                <Icon size={22} weight="duotone" className={opt.color} />
              </div>
              <p className={`text-[14px] font-bold mb-1 ${isSelected ? "text-[#C8A762]" : isDark ? "text-zinc-200" : "text-slate-800"}`}>{opt.label}</p>
              <p className={`text-[11px] leading-relaxed ${isDark ? "text-zinc-500" : "text-slate-500"}`}>{opt.desc}</p>
              {isSelected && <div className="mt-3 flex items-center gap-1.5"><CheckCircle size={14} className="text-[#C8A762]" weight="fill" /><span className="text-[11px] font-bold text-[#C8A762]">تم الاختيار</span></div>}
            </motion.button>
          );
        })}
      </div>

      <div className="flex justify-end pt-2">
        <button onClick={() => selected && onComplete(selected)} disabled={!selected}
          className={`flex items-center gap-2 px-8 py-3 rounded-xl text-[14px] font-bold transition-all ${selected ? "bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] text-white shadow-lg hover:shadow-xl" : isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
          ابدأ مع CorpMind <ArrowRight size={16} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── CLM View ─────────────────────────────────────────────────────────────────

function CLMView({ isDark, card }: { isDark: boolean; card: string }) {
  const [filter, setFilter] = useState<"all" | Contract["status"]>("all");

  const filtered = filter === "all" ? MOCK_CONTRACTS : MOCK_CONTRACTS.filter(c => c.status === filter);
  const expiringCount = MOCK_CONTRACTS.filter(c => c.status === "expiring").length;
  const activeCount = MOCK_CONTRACTS.filter(c => c.status === "active").length;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "عقود نشطة", value: activeCount, icon: CheckCircle, color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "تنتهي قريباً", value: expiringCount, icon: Warning, color: "text-amber-500", bg: "bg-amber-500/10" },
          { label: "إجمالي العقود", value: MOCK_CONTRACTS.length, icon: FileText, color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "قيمة المحفظة", value: "1.3M ر.س", icon: Money, color: "text-[#C8A762]", bg: "bg-[#C8A762]/10" },
        ].map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className={`${card} p-4`}>
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${kpi.bg}`}><Icon size={18} weight="duotone" className={kpi.color} /></div>
              <p className={`text-[20px] font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{kpi.value}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{kpi.label}</p>
            </div>
          );
        })}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "active", "expiring", "expired", "draft"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${filter === f ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "border-white/[0.06] text-zinc-400 hover:border-white/10" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
            {{ all: "الكل", active: "نشط", expiring: "ينتهي قريباً", expired: "منتهي", draft: "مسودة" }[f]}
          </button>
        ))}
        <button className={`mr-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${isDark ? "border-white/[0.06] text-zinc-400 hover:bg-zinc-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
          <Sparkle size={12} /> + عقد جديد
        </button>
      </div>

      {/* Contracts Table */}
      <div className={`${card} overflow-hidden`}>
        <div className={`px-5 py-3 border-b ${isDark ? "border-white/[0.05]" : "border-slate-100"}`}>
          <p className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{filtered.length} عقد</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-white/[0.04]">
          {filtered.map(c => {
            const st = STATUS_CONFIG[c.status];
            return (
              <div key={c.id} className={`flex items-center gap-4 px-5 py-4 transition-colors ${isDark ? "hover:bg-white/[0.01]" : "hover:bg-slate-50"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`text-[13px] font-bold truncate ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{c.name}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border flex-shrink-0 ${st.bg} ${st.color}`}>{st.label}</span>
                  </div>
                  <div className={`flex items-center gap-4 text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    <span className="flex items-center gap-1"><Buildings size={10} /> {c.counterparty}</span>
                    <span className="flex items-center gap-1"><CalendarCheck size={10} /> حتى {c.endDate}</span>
                    <span className="flex items-center gap-1"><Money size={10} /> {c.value} ر.س</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${isDark ? "border-white/[0.06] text-zinc-400 hover:bg-zinc-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                    فحص
                  </button>
                  {c.status === "expiring" && (
                    <Link href="/ai/contracts" className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500 text-white">تجديد</Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Alert for expiring contracts */}
      {expiringCount > 0 && (
        <div className={`p-4 rounded-xl border flex items-center gap-3 ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
          <Warning size={18} className="text-amber-500" weight="fill" />
          <p className={`text-[12px] font-bold flex-1 ${isDark ? "text-amber-300" : "text-amber-800"}`}>
            {expiringCount} عقد ينتهي خلال 90 يوم — يُنصح بالتجديد المبكر.
          </p>
          <Link href="/ai/contracts" className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-amber-500 text-white flex-shrink-0">تجديد الآن</Link>
        </div>
      )}
    </div>
  );
}

// ─── Contract Analysis View ────────────────────────────────────────────────────

function ContractAnalysisView({ isDark, card }: { isDark: boolean; card: string }) {
  const [step, setStep] = useState<"upload" | "analyzing" | "done">("upload");
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = () => {
    setStep("analyzing");
    setTimeout(() => setStep("done"), 2500);
  };

  const scoreColor = MOCK_ANALYSIS.score >= 80 ? "text-emerald-500" : MOCK_ANALYSIS.score >= 60 ? "text-amber-500" : "text-red-500";
  const scoreTrack = MOCK_ANALYSIS.score >= 80 ? "bg-emerald-500" : MOCK_ANALYSIS.score >= 60 ? "bg-amber-400" : "bg-red-400";

  return (
    <AnimatePresence mode="wait">
      {step === "upload" && (
        <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
          <motion.div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(); }}
            animate={{ scale: dragOver ? 1.02 : 1 }}
            className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${dragOver
              ? isDark ? "border-[#C8A762]/50 bg-[#C8A762]/5" : "border-amber-400/50 bg-amber-50/50"
              : isDark ? "border-white/[0.10] hover:border-white/20" : "border-slate-200 hover:border-[#0B3D2E]/30"}`}
            onClick={handleUpload}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${isDark ? "bg-white/[0.04]" : "bg-slate-50"}`}>
              <Upload size={28} weight="duotone" className="text-[#0B3D2E]" />
            </div>
            <p className={`text-[16px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>ارفع العقد للتحليل</p>
            <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>PDF, Word, أو صورة — حتى ٥٠ صفحة</p>
          </motion.div>
        </motion.div>
      )}

      {step === "analyzing" && (
        <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-16 flex flex-col items-center`}>
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="w-16 h-16 rounded-2xl bg-[#C8A762]/10 flex items-center justify-center mb-5">
            <Robot size={30} weight="duotone" className="text-[#C8A762]" />
          </motion.div>
          <p className={`text-[15px] font-bold mb-1 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>CorpMind يُحلّل العقد...</p>
          <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>يتحقق من البنود والمخاطر القانونية</p>
        </motion.div>
      )}

      {step === "done" && (
        <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className={`${card} p-4 flex items-center justify-between`}>
            <div className="flex items-center gap-3">
              <CheckCircle size={20} weight="fill" className="text-emerald-500" />
              <div>
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{MOCK_ANALYSIS.contractName}</p>
                <p className={`text-[11px] flex items-center gap-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}><Clock size={10} /> اكتمل التحليل</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}><Download size={12} /> PDF</button>
              <button onClick={() => setStep("upload")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}><ArrowCounterClockwise size={12} /></button>
            </div>
          </div>

          <BetaReviewGate toolId="corp.corpmind" toolName="تحليل العقد عبر CorpMind" reviewScope="legal-data">
          <div className={`${card} p-5`}>
            <div className="flex items-center justify-between mb-3">
              <p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>درجة سلامة العقد</p>
              <p className={`text-2xl font-bold font-mono ${scoreColor}`}>{MOCK_ANALYSIS.score}<span className="text-[14px] font-normal">/١٠٠</span></p>
            </div>
            <div className={`h-2 rounded-full overflow-hidden ${isDark ? "bg-white/[0.06]" : "bg-slate-100"}`}>
              <motion.div className={`h-full rounded-full ${scoreTrack}`} initial={{ width: 0 }} animate={{ width: `${MOCK_ANALYSIS.score}%` }} transition={{ duration: 1, ease: "easeOut" }} />
            </div>
          </div>

          <div className={`${card} p-5`}>
            <div className="flex items-center gap-2 mb-4"><Warning size={15} weight="duotone" className="text-amber-500" /><p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>المخاطر المكتشفة ({MOCK_ANALYSIS.risks.length})</p></div>
            <div className="space-y-2">
              {MOCK_ANALYSIS.risks.map((risk, i) => {
                const rc = RISK_COLORS[risk.level as keyof typeof RISK_COLORS];
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} className={`flex items-start gap-2.5 rounded-xl border p-3 ${rc.bg}`}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 mt-0.5 ${rc.bg} ${rc.text}`}>{rc.label}</span>
                    <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{risk.text}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>

          <div className={`${card} p-5`}>
            <div className="flex items-center gap-2 mb-4"><Sparkle size={15} weight="fill" className="text-[#C8A762]" /><p className={`text-[13px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>اقتراحات التحسين</p></div>
            <div className="space-y-2">
              {MOCK_ANALYSIS.suggestions.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle size={14} weight="fill" className="text-emerald-500 flex-shrink-0 mt-0.5" />
                  <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-600"}`}>{s}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Unified Result Actions */}
          <AiResultActions
            text={formatCorpMindAnalysis()}
            filename={`corpmind-contract-analysis`}
            showVault
            showHumanReview
            showShare
            className="justify-start"
          />
          </BetaReviewGate>

          <Link href="/ai/contracts" className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-[#0B3D2E] text-[#C8A762] text-sm font-bold hover:bg-[#0a3328] transition-colors">
            <FileText size={15} /> افتح محررعقود لإصلاح البنود
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CorpMindPage() {
  const { isDark } = useTheme();
  const [onboarded, setOnboarded] = useState(false);
  const [purpose, setPurpose] = useState<AgentPurpose>("contract_analysis");
  const [activeTab, setActiveTab] = useState<AgentPurpose>("contract_analysis");

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const handleOnboardingComplete = (p: AgentPurpose) => {
    setPurpose(p);
    setActiveTab(p);
    setOnboarded(true);
  };

  const TABS: { id: AgentPurpose; label: string; icon: React.ElementType }[] = [
    { id: "contract_analysis", label: "تحليل عقد",           icon: Eye },
    { id: "clm",               label: "محفظة العقود (CLM)",   icon: GitBranch },
    { id: "compliance",        label: "الامتثال",             icon: ShieldCheck },
    { id: "policy_review",     label: "مراجعة السياسات",     icon: FileText },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>نظامي AI</Link>
          <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
          <span className={isDark ? "text-zinc-300" : "text-slate-600"}>CorpMind</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#C8A762]/10 flex items-center justify-center flex-shrink-0">
              <Robot size={24} weight="duotone" className="text-[#C8A762]" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>CorpMind</h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C8A762]/15 text-[#C8A762] border border-[#C8A762]/30">وكيل الشركة AI</span>
              </div>
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>تحليل عقود · إدارة محفظة العقود · مراقبة الامتثال</p>
            </div>
          </div>
          {onboarded && (
            <button onClick={() => setOnboarded(false)} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-[11px] font-bold ${isDark ? "border-white/[0.06] text-zinc-400 hover:bg-zinc-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
              <Gear size={14} /> إعادة الضبط
            </button>
          )}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {!onboarded ? (
          <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <OnboardingView isDark={isDark} onComplete={handleOnboardingComplete} />
          </motion.div>
        ) : (
          <motion.div key="main" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
            {/* Tabs */}
            <div className={`flex gap-1 p-1 rounded-xl ${isDark ? "bg-zinc-900/80 border border-white/[0.06]" : "bg-slate-100"}`}>
              {TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 flex-1 py-2 px-2 rounded-lg text-[11px] font-bold transition-all ${isActive ? isDark ? "bg-zinc-800 text-zinc-100 shadow-sm" : "bg-white text-slate-800 shadow-sm" : isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-500 hover:text-slate-700"}`}>
                    <Icon size={13} weight={isActive ? "fill" : "regular"} />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={activeTab} initial={{ opacity: 0, x: 15 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -15 }} transition={{ duration: 0.18 }}>
                {activeTab === "contract_analysis" && <ContractAnalysisView isDark={isDark} card={card} />}
                {activeTab === "clm" && <CLMView isDark={isDark} card={card} />}
                {activeTab === "compliance" && (
                  <div className={`${card} p-8 text-center`}>
                    <ShieldCheck size={48} weight="duotone" className="mx-auto mb-4 text-emerald-500" />
                    <h3 className={`text-[18px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>مراقب الامتثال التنظيمي</h3>
                    <p className={`text-[13px] mb-6 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      تقييم شامل لامتثالك مع الأنظمة الخمسة الإلزامية (نظام الشركات، UBO، PDPL، نطاقات، ZATCA).
                    </p>
                    <Link href="/ai/corp/compliance-monitor" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#0B3D2E] text-white text-[13px] font-bold">
                      فتح مراقب الامتثال <ArrowLeft size={16} />
                    </Link>
                  </div>
                )}
                {activeTab === "policy_review" && (
                  <div className={`${card} p-8 text-center`}>
                    <FileText size={48} weight="duotone" className="mx-auto mb-4 text-[#C8A762]" />
                    <h3 className={`text-[18px] font-bold mb-2 ${isDark ? "text-zinc-200" : "text-slate-800"}`}>مراجعة السياسات الداخلية</h3>
                    <p className={`text-[13px] mb-6 ${isDark ? "text-zinc-400" : "text-slate-600"}`}>
                      ارفع لوائح شركتك وسياساتها للمراجعة الذكية بمقارنتها مع أحدث التشريعات السعودية.
                    </p>
                    <button className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-dashed border-[#C8A762]/40 text-[#C8A762] text-[13px] font-bold hover:bg-[#C8A762]/5 transition-colors">
                      <Upload size={16} /> ارفع اللائحة للمراجعة
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
