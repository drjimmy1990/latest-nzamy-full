"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, ShieldCheck, UserCircle, Briefcase,
  WarningOctagon, MagnifyingGlass, FileText, CheckCircle,
  CurrencyCircleDollar, Scales, Sparkle, Robot, UserSwitch,
  FolderOpen
} from "@phosphor-icons/react";

// ── Types ──────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3;

interface MatterData {
  clientName: string;
  opponentName: string;
  matterType: string;
  leadAttorney: string;
  feeStructure: "hourly" | "flat" | "retainer";
  playbook: string;
}

const PLAYBOOKS = [
  { id: "litigation_com", title: "ترافع تجاري شامل", desc: "يولد 12 مهمة أساسية وهيكل بليحة الدعوى والمذكرات.", icon: Scales, color: "text-blue-500" },
  { id: "corporate_ma", title: "اندماج واستحواذ (M&A)", desc: "يبني مسار فحص نافي للجهالة (Due Diligence) وهيكل بائعي العقود.", icon: BuildingsIcon, color: "text-[#C8A762]" },
  { id: "labor_dispute", title: "نزاع عمالي", desc: "أتمتة تسويات مكتب العمل وجدولة الجلسات العمالية الأولى.", icon: Briefcase, color: "text-purple-500" },
];

function BuildingsIcon(props: any) {
  // Mapping Phosphor Buildings icon inside the array
  return <Briefcase {...props} />; // Fallback just in case
}

// ── Page Component ─────────────────────────────────────────────────────────────
import { RoleGuard } from "@/components/dashboard/RoleGuard";

export default function NewMatterIntake() {
  const { isDark } = useTheme();
  const router = useRouter();
  
  const [step, setStep] = useState<Step>(1);
  const [data, setData] = useState<MatterData>({
    clientName: "",
    opponentName: "",
    matterType: "commercial",
    leadAttorney: "شريك - نورة الزهراني",
    feeStructure: "retainer",
    playbook: ""
  });

  const [isCheckingConflict, setIsCheckingConflict] = useState(false);
  const [conflictResult, setConflictResult] = useState<null | "safe" | "warning">(null);

  const handleConflictCheck = () => {
    if (!data.clientName || !data.opponentName) return;
    setIsCheckingConflict(true);
    // Mock simulation
    setTimeout(() => {
      setIsCheckingConflict(false);
      setConflictResult(data.opponentName.includes("خطر") ? "warning" : "safe");
    }, 2000);
  };

  const nextStep = () => setStep(s => Math.min(s + 1, 3) as Step);
  const prevStep = () => setStep(s => Math.max(s - 1, 1) as Step);

  const handleFinish = () => {
    // Generate a mock case ID until backend integration
    const caseId = `CASE-${Date.now().toString().slice(-6)}`;
    router.push(`/dashboard/business/cases/${caseId}`);
  };

  const cardStyle = isDark ? "bg-zinc-900/80 border-white/[0.06] shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]" : "bg-white border-zinc-200/70 shadow-[inset_0_1px_0_rgba(255,255,255,1)]";
  const inputStyle = isDark ? "bg-zinc-800/80 border-white/[0.06] text-white" : "bg-slate-50 border-slate-200 text-zinc-900";

  return (
    <RoleGuard allowedRoles={["owner", "legal_manager", "seconded"]}>
    <div className={`min-h-screen ${isDark ? "bg-zinc-950 text-zinc-100" : "bg-zinc-50/50 text-zinc-900"}`} dir="rtl">
      
      {/* ── Navbar ── */}
      <header className={`sticky top-0 z-30 flex items-center justify-between border-b px-6 py-4 backdrop-blur-md ${isDark ? "border-white/[0.05] bg-zinc-950/80" : "border-zinc-200 bg-white/80"}`}>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/business/kanban" className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${isDark ? "bg-white/[0.05] hover:bg-white/[0.1]" : "bg-zinc-100 hover:bg-zinc-200"}`}>
            <ArrowRight size={16} />
          </Link>
          <div className="flex items-center gap-2">
            <FolderOpen size={20} weight="duotone" className="text-[#C8A762]" />
            <h1 className="text-lg font-bold">فتح ملف قضية جديدة</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[12px] font-bold">
          <span className={step >= 1 ? "text-[#C8A762]" : isDark ? "text-zinc-600" : "text-zinc-400"}>1. فحص التعارض</span>
          <span className={isDark ? "text-zinc-700" : "text-zinc-300"}>—</span>
          <span className={step >= 2 ? "text-[#C8A762]" : isDark ? "text-zinc-600" : "text-zinc-400"}>2. التأسيس والأتعاب</span>
          <span className={isDark ? "text-zinc-700" : "text-zinc-300"}>—</span>
          <span className={step >= 3 ? "text-[#C8A762]" : isDark ? "text-zinc-600" : "text-zinc-400"}>3. أتمتة الذكاء الاصطناعي</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl py-10 px-6">
        <AnimatePresence mode="wait">
          
          {/* ── STEP 1: CONFLICT CHECK ── */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                  <ShieldCheck size={24} className="text-blue-500" />
                  فحص تعارض المصالح (Conflict Check)
                </h2>
                <p className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  وفقاً لنظام المحاماة، يجب التحقق من عدم وجود تعارض مصالح مع أي قضايا أو موكلين حاليين أو سابقين للمكتب.
                </p>
              </div>

              <div className={`${cardStyle} rounded-2xl p-6 space-y-5`}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-[12px] font-bold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>اسم الموكل المحتمل</label>
                    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${inputStyle}`}>
                      <UserCircle size={16} className="text-zinc-400" />
                      <input 
                        value={data.clientName} onChange={e => setData({...data, clientName: e.target.value})}
                        placeholder="شركة البناء الحديث المحدودة..." 
                        className="bg-transparent text-sm w-full outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className={`block text-[12px] font-bold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>اسم الخصم / الطرف المقابل</label>
                    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${inputStyle}`}>
                      <UserSwitch size={16} className="text-zinc-400" />
                      <input 
                        value={data.opponentName} onChange={e => setData({...data, opponentName: e.target.value})}
                        placeholder="أدخل اسم الشخص أو الكيان..." 
                        className="bg-transparent text-sm w-full outline-none" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button 
                    onClick={handleConflictCheck}
                    disabled={!data.clientName || !data.opponentName || isCheckingConflict}
                    className={`flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-50`}
                  >
                    {isCheckingConflict ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Robot size={18} /></motion.div> : <MagnifyingGlass size={18} />}
                    {isCheckingConflict ? "جاري الفحص المتقاطع في قاعدة المكتب..." : "تشغيل نظام فحص التعارض"}
                  </button>
                </div>
              </div>

              {/* Conflict Results Area */}
              <AnimatePresence>
                {conflictResult === "safe" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl border p-4 flex items-start gap-4 ${isDark ? "border-emerald-500/20 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50"}`}>
                    <div className="rounded-full bg-emerald-500 p-1.5 text-white shadow-sm mt-0.5">
                      <CheckCircle size={20} weight="fill" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-bold text-emerald-600 dark:text-emerald-400 mb-1">النتيجة آمنة - لا يوجد تعارض</h3>
                      <p className={`text-[12px] leading-relaxed ${isDark ? "text-emerald-500/80" : "text-emerald-700/80"}`}>
                        تم فحص سجلات المكتب (1,240 قضية، 3,500 عميل وجهة اتصال) ولم يتم العثور على أي تشابه مع الطرف المقابل أو الموكل يمنع استلام القضية.
                      </p>
                    </div>
                  </motion.div>
                )}
                
                {conflictResult === "warning" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl border p-4 flex items-start gap-4 ${isDark ? "border-red-500/20 bg-red-500/10" : "border-red-200 bg-red-50"}`}>
                     <div className="rounded-full bg-red-500 p-1.5 text-white shadow-sm mt-0.5">
                      <WarningOctagon size={20} weight="fill" />
                    </div>
                    <div>
                      <h3 className="text-[14px] font-bold text-red-600 dark:text-red-400 mb-1">تحذير تعارض محتمل!</h3>
                      <p className={`text-[12px] leading-relaxed ${isDark ? "text-red-500/80" : "text-red-700/80"}`}>
                        تم العثور على الخصم المدخل كطرف في القضية السابقة (رقم 149 - تصفية تركة). يرجى تحويل الأمر للشريك الموكل قبل تأكيد قبول هذه القضية لمنع المساءلة التأديبية.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Navigation */}
              <div className="flex justify-start pt-6 border-t border-zinc-200 dark:border-white/[0.05]">
                <button 
                  onClick={nextStep}
                  disabled={!conflictResult}
                  className="rounded-xl flex items-center gap-2 bg-[#0B3D2E] px-6 py-2.5 text-sm font-bold text-white transition-opacity disabled:opacity-50"
                >
                  <span className="mb-px border-b border-transparent">التالي: تأسيس تفاصيل القضية</span>
                  <ArrowLeft size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: MATTER SETUP ── */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                  <Briefcase size={24} className="text-[#0B3D2E] dark:text-emerald-500" />
                  قالب الملف والأتعاب
                </h2>
                <p className={`text-sm ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  إعداد البيانات الأساسية للقضية ليتم توجيهها للقسم المالي والقانوني بشكل صحيح.
                </p>
              </div>

              <div className={`${cardStyle} rounded-2xl p-6 space-y-6`}>
                
                {/* Basic Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-[12px] font-bold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>تصنيف القضية والتخصص</label>
                    <select value={data.matterType} onChange={e => setData({...data, matterType: e.target.value})} className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${inputStyle}`}>
                      <option value="commercial">قضية تجارية (تقاضي)</option>
                      <option value="labor">قضية عمالية</option>
                      <option value="corporate">تأسيس وهيكلة شركات</option>
                      <option value="real_estate">نزاع عقاري</option>
                    </select>
                  </div>
                  <div>
                    <label className={`block text-[12px] font-bold mb-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>المحامي المسؤول (Lead Attorney)</label>
                    <select value={data.leadAttorney} onChange={e => setData({...data, leadAttorney: e.target.value})} className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${inputStyle}`}>
                      <option>شريك - نورة الزهراني</option>
                      <option>أخصائي - فهد السبيعي</option>
                      <option>مستشار - سلمى الدوسري</option>
                    </select>
                  </div>
                </div>

                {/* Billing */}
                <div>
                  <label className={`block text-[12px] font-bold mb-3 flex items-center gap-1.5 ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                    <CurrencyCircleDollar size={16} /> شكل ونظام الأتعاب
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: "flat", label: "مبلغ مقطوع (Flat Fee)", desc: "سعر ثابت لكامل القضية" },
                      { id: "hourly", label: "ساعات مفوترة (Hourly)", desc: "يتطلب تشغيل التتبع الزمني" },
                      { id: "retainer", label: "حساب أمانة تعاقدي (Retainer)", desc: "اقتطاع الدفعات من العربون" }
                    ].map(f => (
                      <button 
                        key={f.id} onClick={() => setData({...data, feeStructure: f.id as any})}
                        className={`rounded-xl border p-4 text-start transition-all ${data.feeStructure === f.id ? (isDark ? "bg-[#C8A762]/10 border-[#C8A762]" : "bg-orange-50 border-[#C8A762] shadow-sm") : (isDark ? "border-white/[0.06] hover:bg-white/[0.04]" : "border-zinc-200 hover:bg-slate-50")}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <h4 className={`text-[13px] font-bold ${data.feeStructure === f.id ? "text-[#C8A762]" : isDark ? "text-white" : "text-zinc-800"}`}>{f.label}</h4>
                          {data.feeStructure === f.id && <CheckCircle size={16} weight="fill" className="text-[#C8A762]" />}
                        </div>
                        <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{f.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

              </div>

              {/* Navigation */}
              <div className="flex justify-between pt-6 border-t border-zinc-200 dark:border-white/[0.05]">
                <button onClick={prevStep} className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"}`}>
                  العودة للتعارض
                </button>
                <button onClick={nextStep} className="rounded-xl flex items-center gap-2 bg-[#0B3D2E] px-6 py-2.5 text-sm font-bold text-white">
                  <span>التالي: خطة أتمتة الـ AI</span>
                  <ArrowLeft size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: AI PLAYBOOK ── */}
          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div>
                <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                   <Sparkle size={24} weight="fill" className="text-purple-500" />
                   الأتمتة الاستباقية (AI Playbooks)
                </h2>
                <p className={`text-sm leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                  اختر سيناريو لتشغيل إجراءات تلقائية للقضية. نظامي AI سيبني الهيكل البصري، ويقوم بأتمتة المهام الإدارية لتبدأ العمل مباشرة على الجوانب القانونية الدقيقة بدلاً من إضاعة الساعات في التأسيس.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {PLAYBOOKS.map(pb => {
                  const Icon = pb.icon;
                  return (
                    <button 
                      key={pb.id} onClick={() => setData({...data, playbook: pb.id})}
                      className={`relative flex flex-col text-start rounded-2xl border p-5 transition-all overflow-hidden ${data.playbook === pb.id ? (isDark ? "bg-[#0B3D2E]/20 border-emerald-500/50 shadow-lg" : "bg-emerald-50/50 border-[#0B3D2E]/30 shadow-md transform -translate-y-1") : (isDark ? "bg-zinc-900/50 border-white/[0.06] hover:bg-zinc-900" : "bg-white border-zinc-200 hover:border-zinc-300 hover:shadow-sm")}`}
                    >
                      {/* Selection Indicator */}
                      <div className={`absolute top-4 start-4 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${data.playbook === pb.id ? "border-emerald-500 bg-emerald-500" : isDark ? "border-zinc-700" : "border-zinc-300"}`}>
                        {data.playbook === pb.id && <CheckCircle size={14} weight="bold" className="text-white" />}
                      </div>

                      <div className="mb-4 mt-8">
                        <div className={`inline-flex items-center justify-center p-3 rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-50 dark:from-zinc-800 dark:to-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-700/50 ${pb.color}`}>
                          <Icon size={24} weight="duotone" />
                        </div>
                      </div>
                      
                      <h4 className={`text-[15px] font-bold mb-2 ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{pb.title}</h4>
                      <p className={`text-[12px] leading-relaxed flex-1 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                        {pb.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Navigation */}
              <div className="flex justify-between pt-8 border-t border-zinc-200 dark:border-white/[0.05]">
                <button onClick={prevStep} className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"}`}>
                  العودة للبيانات
                </button>
                <button onClick={handleFinish} disabled={!data.playbook} className="rounded-xl flex items-center justify-center gap-2 bg-[#C8A762] hover:bg-[#b59554] shadow-lg shadow-[#C8A762]/30 px-8 py-3 text-sm font-bold text-white transition-all disabled:opacity-50">
                  <FileText size={18} />
                  <span>توليد وتأكيد فتح ملف القضية</span>
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

    </div>
    </RoleGuard>
  );
}
