"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, ShieldCheck, ShieldWarning, UserCircle,
  Clock, CheckCircle, Warning, Robot, Copy, Check,
  ArrowRight, Key, Users, Sparkle, SealCheck,
  Signature, FilePdf, Pen, Trash, Eye, ShareNetwork,
  ClockCounterClockwise, ArrowUpRight, ArrowFatUp
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import UpgradeModal from "@/components/UpgradeModal";
import AiResultActions from "@/components/AiResultActions";

// ─── TYPES & DATA ───────────────────────────────────────────────────────────

interface AuditLog {
  time: string;
  user: string;
  role: string;
  action: string;
  type: "system" | "user" | "security" | "ai";
}

interface ContractDetail {
  id: string;
  title: string;
  party: string;
  type: string;
  status: "active" | "draft" | "expired" | "pending_signature";
  value: string;
  startDate: string;
  endDate: string;
  assignee: string;
  chineseWall: boolean;
  score: number;
  criticalIssues: { id: string; title: string; desc: string; severity: "high" | "medium"; alternative: string }[];
  content: string;
  auditLogs: AuditLog[];
}

const CONTRACT_MOCK: Record<string, ContractDetail> = {
  "1": {
    id: "1",
    title: "اتفاقية تمثيل قانوني — شركة الأفق",
    party: "شركة الأفق للتجارة والمقاولات",
    type: "اتفاقية تمثيل قانوني وخدمات استشارية",
    status: "active",
    value: "١٢٠,٠٠٠ ﷼",
    startDate: "١ يناير ٢٠٢٤",
    endDate: "٣١ ديسمبر ٢٠٢٥",
    assignee: "أ. سارة المنصور",
    chineseWall: true,
    score: 87,
    criticalIssues: [
      {
        id: "iss-1",
        title: "تحديد سقف المسؤولية (Liability Cap)",
        desc: "البند الثامن يخلو من تحديد حد أقصى للتعويضات المالية في حال وقوع ضرر غير مقصود.",
        severity: "high",
        alternative: "لا تتجاوز المسؤولية الإجمالية للمكتب عن أي أضرار ناتجة عن هذا العقد قيمة الأتعاب الفعلية المدفوعة للمكتب خلال الاثني عشر شهراً السابقة للحدث الموجب للمطالبة."
      },
      {
        id: "iss-2",
        title: "التعويض ضد الغير (Indemnification)",
        desc: "البند العاشر يفرض التزاماً مطلقاً بالتعويض دون استثناء حالات الإهمال الجسيم من الطرف الآخر.",
        severity: "medium",
        alternative: "يعوض الطرف الأول الطرف الثاني عن الأضرار الناشئة عن تنفيذ هذا العقد ما لم تكن ناتجة عن إهمال جسيم أو خطأ متعمد من الطرف الثاني."
      }
    ],
    content: `اتفاقية تقديم خدمات تمثيل قانوني

الطرف الأول: مكتب نظامي للمحاماة والاستشارات القانونية
الطرف الثاني: شركة الأفق للتجارة والمقاولات

البند الأول: موضوع العقد
يتعهد الطرف الأول بتقديم الخدمات الاستشارية والتمثيل القانوني للطرف الثاني أمام الجهات القضائية المختصة، بما يشمل صياغة اللوائح وحضور الجلسات وتقديم الرأي النظامي.

البند الثاني: الأتعاب المالية
يلتزم الطرف الثاني بدفع أتعاب سنوية قدرها ١٢٠,٠٠٠ ريال سعودي، تُدفع على أربع دفعات ربع سنوية متساوية.

البند الثالث: السرية والخصوصية
يلتزم الطرفان بالمحافظة على سرية المعلومات والمستندات المتبادلة طوال فترة سريان العقد ولمدة خمس سنوات من تاريخ انقضائه.`,
    auditLogs: [
      { time: "١٢:٣٠", user: "أ. سارة المنصور", role: "الشريك المكلّف", action: "تفعيل جدار الحماية الصيني الصارم (Chinese Wall)", type: "security" },
      { time: "١٠:١٥", user: "نظامي AI", role: "الذكاء الاصطناعي", action: "تحليل بنود العقد وتحديد درجتين من المخاطر", type: "ai" },
      { time: "أمس", user: "أ. فهد السبيعي", role: "الشريك المدير", action: "اعتماد المسودة النهائية وتصديرها للعميل", type: "user" },
    ]
  },
  "2": {
    id: "2",
    title: "عقد كتمان المعلومات — المجموعة الخليجية",
    party: "المجموعة الخليجية للاستثمار",
    type: "اتفاقية عدم إفصاح (NDA)",
    status: "pending_signature",
    value: "—",
    startDate: "١ أبريل ٢٠٢٤",
    endDate: "٣١ مارس ٢٠٢٦",
    assignee: "أ. تركي العمر",
    chineseWall: false,
    score: 95,
    criticalIssues: [
      {
        id: "iss-3",
        title: "فترة حماية السرية بعد الانتهاء",
        desc: "العقد يحدد مدة السرية بسنة واحدة فقط بعد الانتهاء، وهي مدة غير كافية لحماية الأسرار التجارية.",
        severity: "medium",
        alternative: "تظل التزامات السرية الواردة في هذا العقد سارية المفعول طالما ظلت المعلومات سرية بطبيعتها، وبحد أدنى ثلاث سنوات بعد انتهاء العقد."
      }
    ],
    content: `اتفاقية عدم إفصاح وحماية أسرار تجارية

الطرف الأول: مكتب نظامي للمحاماة
الطرف الثاني: المجموعة الخليجية للاستثمار

يتفق الطرفان على تبادل المعلومات السرية لغرض دراسة الفرص الاستثمارية المشتركة، مع الالتزام الكامل بعدم تسريبها أو استخدامها لأغراض منافسة.`,
    auditLogs: [
      { time: "١٤:٤٥", user: "نظامي AI", role: "الذكاء الاصطناعي", action: "إتمام مراجعة وحساب درجة الأمان القانوني", type: "ai" },
      { time: "أمس", user: "أ. تركي العمر", role: "محامي المكتب", action: "إنشاء مسودة العقد بناءً على النموذج القياسي", type: "user" }
    ]
  }
};

const DEFAULT_CONTRACT: ContractDetail = {
  id: "0",
  title: "نموذج عقد افتراضي",
  party: "شركة افتراضية",
  type: "خدمات عامة",
  status: "draft",
  value: "٥٠,٠٠٠ ﷼",
  startDate: "١ مايو ٢٠٢٤",
  endDate: "٣٠ أبريل ٢٠٢٥",
  assignee: "مستشار المكتب",
  chineseWall: false,
  score: 82,
  criticalIssues: [],
  content: "هذا نموذج توضيحي لعقد قياسي مؤقت.",
  auditLogs: []
};

// ─── COMPONENT ───────────────────────────────────────────────────────────────

export default function FirmContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { isDark } = useTheme();
  const user = useUser();
  const [contractId, setContractId] = useState<string>("1");
  const [contract, setContract] = useState<ContractDetail>(DEFAULT_CONTRACT);
  const [activeTab, setActiveTab] = useState<"content" | "ai" | "audit">("content");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [chineseWallState, setChineseWallState] = useState<boolean>(false);
  const [signingStep, setSigningStep] = useState<"idle" | "sending" | "sent">("idle");
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  useEffect(() => {
    params.then((res) => {
      const id = res.id;
      setContractId(id);
      const matched = CONTRACT_MOCK[id] || CONTRACT_MOCK["1"];
      setContract(matched);
      setChineseWallState(matched.chineseWall);
    });
  }, [params]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleChineseWall = () => {
    const nextVal = !chineseWallState;
    setChineseWallState(nextVal);
    // Add local audit event log dynamically
    const newLog: AuditLog = {
      time: "الآن",
      user: user.name || "مستخدم المكتب",
      role: "الوصول الحالي",
      action: nextVal ? "تم تفعيل جدار الحماية الصيني بنجاح" : "تم إلغاء تفعيل جدار الحماية الصيني",
      type: "security"
    };
    setContract(prev => ({
      ...prev,
      auditLogs: [newLog, ...prev.auditLogs]
    }));
  };

  const triggerNafathSignature = () => {
    setSigningStep("sending");
    setTimeout(() => {
      setSigningStep("sent");
      const newLog: AuditLog = {
        time: "الآن",
        user: "نظام نفاذ الموحد",
        role: "توثيق حكومي",
        action: "تم إرسال طلب التوقيع الرقمي لجوال العميل المرتبط بنفاذ",
        type: "system"
      };
      setContract(prev => ({
        ...prev,
        auditLogs: [newLog, ...prev.auditLogs]
      }));
    }, 1500);
  };

  const hasUpgradePermission = (user.tier as string) === "enterprise" || (user.tier as string) === "professional";

  // Framer motion standard spring setup
  const springTransition = { type: "spring", stiffness: 100, damping: 20 };

  const themeClasses = {
    card: isDark
      ? "bg-zinc-900/80 border-white/[0.06] backdrop-blur-xl rounded-[2rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)]"
      : "bg-white border-slate-100 rounded-[2rem] shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]",
    innerCard: isDark
      ? "bg-white/[0.02] border-white/[0.04]"
      : "bg-slate-50/60 border-slate-100",
    textMuted: isDark ? "text-zinc-500" : "text-slate-400",
    textBody: isDark ? "text-zinc-300 font-medium" : "text-slate-700 font-medium",
    textHeading: isDark ? "text-white" : "text-slate-900"
  };

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-8 space-y-6 min-h-[100dvh]" dir="rtl">
      
      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} featureBlocked="التحليلات القانونية الشاملة للمؤسسات" />

      {/* Breadcrumb & Navigation */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <Link href="/dashboard/firm/contracts" className={`flex items-center gap-2 text-xs font-black ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"} transition-all hover:-translate-x-1`}>
          <ArrowRight size={16} />
          العودة لإدارة العقود
        </Link>
        
        <div className="flex gap-2">
          <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <ShareNetwork size={14} /> مشاركة
          </button>
          <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-bold ${isDark ? "border-white/10 text-zinc-300 hover:bg-white/5" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            <FilePdf size={14} /> تصدير PDF
          </button>
        </div>
      </motion.div>

      {/* Asymmetric Header Grid */}
      <div className={`p-8 border ${themeClasses.card}`}>
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-[10px] font-black font-mono px-2.5 py-1 rounded-full border tracking-wider bg-royal/10 text-royal border-royal/20`}>
                ID: NZ-CON-{contractId}
              </span>
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                contract.status === "active"
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-500 border-amber-500/20"
              }`}>
                {contract.status === "active" ? "ساري الصلاحية" : "بانتظار التوقيع"}
              </span>
            </div>
            <h1 className={`text-2xl md:text-3xl font-black tracking-tight ${themeClasses.textHeading}`}>
              {contract.title}
            </h1>
            <p className={`text-[13px] ${themeClasses.textMuted} font-medium`}>
              الطرف المتعاقد: <strong className={isDark ? "text-zinc-300" : "text-slate-800"}>{contract.party}</strong>
            </p>
          </div>

          <div className="flex flex-wrap gap-4 lg:self-center">
            <div className={`px-4 py-3 rounded-2xl border ${themeClasses.innerCard} flex flex-col`}>
              <span className={`text-[9px] font-bold tracking-wider uppercase mb-1 ${themeClasses.textMuted}`}>القيمة التقريبية</span>
              <span className={`text-lg font-black font-mono ${themeClasses.textHeading}`}>{contract.value}</span>
            </div>
            <div className={`px-4 py-3 rounded-2xl border ${themeClasses.innerCard} flex flex-col`}>
              <span className={`text-[9px] font-bold tracking-wider uppercase mb-1 ${themeClasses.textMuted}`}>المسؤول عن الملف</span>
              <span className={`text-sm font-black ${themeClasses.textHeading}`}>{contract.assignee}</span>
            </div>
            <div className={`px-4 py-3 rounded-2xl border ${themeClasses.innerCard} flex flex-col`}>
              <span className={`text-[9px] font-bold tracking-wider uppercase mb-1 ${themeClasses.textMuted}`}>انتهاء الاتفاقية</span>
              <span className={`text-sm font-black font-mono ${themeClasses.textHeading}`}>{contract.endDate}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Layout: 12-Column Asymmetric Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: 8 Columns for Contract Content and AI Review */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Tabs Control */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { key: "content" as const, label: "بنود العقد", icon: FileText },
              { key: "ai" as const, label: "تحليل الذكاء الاصطناعي", icon: Robot },
              { key: "audit" as const, label: "سجل العمليات وحوكمة الصلاحيات", icon: ClockCounterClockwise },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all ${
                  activeTab === t.key
                    ? "bg-[#0B3D2E] text-[#C8A762]"
                    : `${themeClasses.textMuted} hover:bg-[#0B3D2E]/10`
                }`}
              >
                <t.icon size={15} weight={activeTab === t.key ? "fill" : "regular"} />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab Screen Content */}
          <AnimatePresence mode="wait">
            
            {activeTab === "content" && (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={springTransition}
                className={`p-6 border ${themeClasses.card}`}
              >
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/[0.04]">
                  <h3 className={`text-md font-black ${themeClasses.textHeading}`}>نص المحرّر القانوني</h3>
                  <button
                    onClick={() => handleCopy(contract.content, "fullContent")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold ${
                      copiedId === "fullContent" ? "bg-emerald-500 text-white" : `${themeClasses.innerCard} border`
                    }`}
                  >
                    {copiedId === "fullContent" ? <SealCheck size={12} /> : <Copy size={12} />}
                    {copiedId === "fullContent" ? "تم النسخ" : "نسخ النص كاملاً"}
                  </button>
                </div>
                <div className={`whitespace-pre-wrap text-[13px] leading-loose max-w-[70ch] ${themeClasses.textBody}`}>
                  {contract.content}
                </div>
              </motion.div>
            )}

            {activeTab === "ai" && (
              <motion.div
                key="ai"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={springTransition}
                className="space-y-4"
              >
                {/* AI Score Card */}
                <div className={`p-6 border ${themeClasses.card} flex flex-col md:flex-row items-center gap-6 relative overflow-hidden`}>
                  <div className="relative flex items-center justify-center shrink-0">
                    {/* Radial score gauge */}
                    <svg className="w-24 h-24 transform -rotate-90">
                      <circle cx="48" cy="48" r="40" stroke="rgba(200,167,98,0.1)" strokeWidth="8" fill="transparent" />
                      <circle cx="48" cy="48" r="40" stroke="#C8A762" strokeWidth="8" fill="transparent"
                        strokeDasharray={251.2}
                        strokeDashoffset={251.2 - (251.2 * contract.score) / 100}
                      />
                    </svg>
                    <span className="absolute text-2xl font-mono font-black text-[#C8A762]">{contract.score}</span>
                  </div>

                  <div className="space-y-1 text-center md:text-right">
                    <div className="flex items-center justify-center md:justify-start gap-2">
                      <Sparkle size={16} className="text-[#C8A762]" weight="fill" />
                      <h3 className={`text-md font-black ${themeClasses.textHeading}`}>مؤشر الحماية القانونية للعقد</h3>
                    </div>
                    <p className={`text-xs ${themeClasses.textBody} max-w-[50ch] leading-relaxed`}>
                      تم فحص البند للتأكد من خلوه من البنود المجحفة وتوافق الصياغة مع نظام التعاملات الإلكترونية ونظام المعاملات المدنية السعودي.
                    </p>
                  </div>
                </div>

                {/* Critical Issues List */}
                <div className="space-y-3">
                  {contract.criticalIssues.length === 0 ? (
                    <div className={`p-8 border text-center ${themeClasses.card}`}>
                      <CheckCircle size={32} className="text-emerald-500 mx-auto mb-2" />
                      <p className={`text-xs ${themeClasses.textBody}`}>لم يعثر محرك AI على أي مخاطر قانونية أو بنود تحتاج تعديل في هذه الاتفاقية!</p>
                    </div>
                  ) : (
                    contract.criticalIssues.map((issue) => (
                      <div key={issue.id} className={`p-5 border ${themeClasses.card} space-y-3`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2">
                            {issue.severity === "high" ? (
                              <ShieldWarning size={20} className="text-red-500 mt-0.5" weight="fill" />
                            ) : (
                              <Warning size={20} className="text-amber-500 mt-0.5" weight="fill" />
                            )}
                            <div>
                              <h4 className={`text-sm font-black ${themeClasses.textHeading}`}>{issue.title}</h4>
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                issue.severity === "high" ? "bg-red-500/10 text-red-500" : "bg-amber-500/10 text-amber-500"
                              }`}>
                                {issue.severity === "high" ? "حرج جداً" : "تنبيه متوسط"}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className={`text-xs leading-relaxed ${themeClasses.textBody}`}>
                          {issue.desc}
                        </p>

                        <div className={`p-4 rounded-xl border ${isDark ? "border-emerald-500/20 bg-emerald-950/15" : "border-emerald-200 bg-emerald-50/50"} space-y-2`}>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">الصياغة البديلة المقترحة من نظامي AI:</span>
                            <button
                              onClick={() => handleCopy(issue.alternative, issue.id)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold ${
                                copiedId === issue.id ? "bg-emerald-500 text-white" : `${themeClasses.innerCard} border`
                              }`}
                            >
                              {copiedId === issue.id ? <SealCheck size={11} /> : <Copy size={11} />}
                              {copiedId === issue.id ? "تم النسخ" : "نسخ البند"}
                            </button>
                          </div>
                          <p className={`text-xs leading-relaxed font-mono ${isDark ? "text-emerald-200" : "text-emerald-900"}`}>
                            {issue.alternative}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === "audit" && (
              <motion.div
                key="audit"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={springTransition}
                className={`p-6 border ${themeClasses.card} space-y-4`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
                  <h3 className={`text-md font-black ${themeClasses.textHeading}`}>سجل حركات النظام الموحد</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-white/5 text-zinc-400" : "bg-slate-100 text-slate-500"}`}>
                    يتوافق مع معايير Audit Log للمؤسسات
                  </span>
                </div>

                <div className="space-y-4">
                  {contract.auditLogs.map((log, index) => {
                    const iconColor = 
                      log.type === "security" ? "text-red-500" : 
                      log.type === "ai" ? "text-[#C8A762]" : 
                      log.type === "system" ? "text-blue-500" : "text-emerald-500";

                    return (
                      <div key={index} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.04]" : "bg-zinc-50"}`}>
                            {log.type === "security" ? <Key size={14} className={iconColor} /> :
                             log.type === "ai" ? <Robot size={14} className={iconColor} /> :
                             log.type === "system" ? <ClockCounterClockwise size={14} className={iconColor} /> : <UserCircle size={14} className={iconColor} />}
                          </div>
                          {index < contract.auditLogs.length - 1 && (
                            <div className={`w-px flex-1 my-1.5 ${isDark ? "bg-white/[0.06]" : "bg-zinc-200"}`} />
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[12px] font-black ${themeClasses.textHeading}`}>{log.user}</span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded bg-zinc-500/10 ${themeClasses.textMuted}`}>{log.role}</span>
                            <span className={`text-[10px] font-mono ${themeClasses.textMuted} ms-auto`}>{log.time}</span>
                          </div>
                          <p className={`text-[12px] ${themeClasses.textBody}`}>{log.action}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Right Side: 4 Columns for Action Cards & Subscriptions Settings */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Action Center - Chinese Wall Shield (Liquid Glass) */}
          <div className={`p-6 border ${themeClasses.card} space-y-4 relative overflow-hidden`}>
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-red-500" weight="fill" />
              <h3 className={`text-md font-black ${themeClasses.textHeading}`}>جدار الحماية الصيني</h3>
            </div>
            
            <p className={`text-xs leading-relaxed ${themeClasses.textBody}`}>
              عند تشغيل جدار الحماية، سيُحظر وصول أي محامٍ متدرب أو زميل خارج النطاق الاستثنائي المحدّد للملف لحماية سرية الموكل ومنع تضارب المصالح.
            </p>

            <div className="flex items-center justify-between p-3 rounded-xl border border-white/[0.04] bg-white/[0.01]">
              <span className={`text-xs font-bold ${themeClasses.textHeading}`}>حالة الحماية الصارمة</span>
              <button
                onClick={toggleChineseWall}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  chineseWallState ? "bg-red-500" : isDark ? "bg-zinc-800" : "bg-slate-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    chineseWallState ? "-translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Electronic Signature Center */}
          <div className={`p-6 border ${themeClasses.card} space-y-4`}>
            <div className="flex items-center gap-2">
              <Signature size={20} className="text-royal" weight="fill" />
              <h3 className={`text-md font-black ${themeClasses.textHeading}`}>اعتماد التوقيع الرقمي</h3>
            </div>

            <p className={`text-xs leading-relaxed ${themeClasses.textBody}`}>
              أرسل طلب توقيع آمن وموثّق متكامل مع بوابة نفاذ الوطنية الموحدة مباشرة إلى ممثلي الأطراف لتسهيل عملية الإغلاق.
            </p>

            {signingStep === "idle" && (
              <button
                onClick={triggerNafathSignature}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#0B3D2E] text-white text-xs font-black hover:bg-[#0a3328] transition-all shadow-md active:scale-[0.98]"
              >
                توقيع رقمي نفاذ الموحد
              </button>
            )}

            {signingStep === "sending" && (
              <div className="space-y-2 py-2">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className={themeClasses.textMuted}>جاري إرسال الطلب عبر نفاذ...</span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? "bg-zinc-800" : "bg-slate-200"}`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 1.5, ease: "easeInOut" }}
                    className="h-full rounded-full bg-[#C8A762]"
                  />
                </div>
              </div>
            )}

            {signingStep === "sent" && (
              <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-500 flex items-center gap-2 text-xs font-bold">
                <SealCheck size={16} weight="fill" />
                <span>تم إرسال الإشعار بنجاح! بانتظار العميل.</span>
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
