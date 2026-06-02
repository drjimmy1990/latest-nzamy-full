"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, CaretLeft, CheckCircle, Warning, XCircle, ArrowRight,
  Download, FilePdf, Article, Buildings, Users, Shield, Receipt, ListChecks
} from "@phosphor-icons/react";
import Link from "next/link";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { useTheme } from "@/components/ThemeProvider";

// ─── Compliance Types ─────────────────────────────────────────────────────────

type Status = "pass" | "warn" | "fail" | "pending";

interface SectionResult {
  id: string;
  title: string;
  status: Status;
  score: number;
  maxScore: number;
  recommendations: string[];
}

const QUESTIONS = [
  {
    sectionId: "s1",
    title: "نظام الشركات (الجديد)",
    icon: Buildings,
    color: "text-blue-500",
    qs: [
      { id: "q1_1", text: "هل تم تحديث عقد التأسيس / النظام الأساسي ليتوافق مع نظام الشركات الجديد؟" },
      { id: "q1_2", text: "هل تم توحيد السجل التجاري (إذا كانت هناك فروع لنفس النشاط)؟" },
    ]
  },
  {
    sectionId: "s2",
    title: "المستفيد الفعلي (UBO)",
    icon: Users,
    color: "text-purple-500",
    qs: [
      { id: "q2_1", text: "هل يوجد سجل داخلي موثق بالمستفيدين الفعليين للشركة؟" },
      { id: "q2_2", text: "هل تم الإبلاغ عن المستفيد الفعلي في وزارة التجارة؟" },
    ]
  },
  {
    sectionId: "s3",
    title: "نطاقات والتوطين (قوى)",
    icon: ListChecks,
    color: "text-emerald-500",
    qs: [
      { id: "q3_1", text: "هل نسبة التوطين (السعودة) الحالية أعلى من الحد الأدنى المفروض؟" },
      { id: "q3_2", text: "هل ملف المنشأة محدّث ونشط في منصة قوى؟" },
    ]
  },
  {
    sectionId: "s4",
    title: "حماية البيانات الشخصية (PDPL)",
    icon: Shield,
    color: "text-red-500",
    qs: [
      { id: "q4_1", text: "هل توجد سياسة خصوصية واضحة ومنشورة للعملاء؟" },
      { id: "q4_2", text: "هل يوجد سجل بالبيانات المحتفظ بها وآلية أخذ موافقة صريحة؟" },
    ]
  },
  {
    sectionId: "s5",
    title: "الفوترة الإلكترونية (ZATCA)",
    icon: Receipt,
    color: "text-amber-500",
    qs: [
      { id: "q5_1", text: "هل الشركة مسجلة في منصة فاتورة (Fatoora)؟" },
      { id: "q5_2", text: "هل تُصدَر فواتير إلكترونية متوافقة مع المرحلة الثانية (الربط والتكامل)؟" },
    ]
  }
];

// ─── PDPL Generator Component ─────────────────────────────────────────────────

function PDPLGenerator({ isDark, onGenerate }: { isDark: boolean; onGenerate: () => void }) {
  return (
    <div className={`mt-6 p-5 rounded-2xl border ${isDark ? "border-red-500/30 bg-red-900/10" : "border-red-200 bg-red-50"}`}>
      <div className="flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? "bg-red-500/20 text-red-400" : "bg-red-100 text-red-600"}`}>
          <Article size={24} weight="duotone" />
        </div>
        <div className="flex-1">
          <h3 className={`text-[14px] font-bold mb-1 ${isDark ? "text-red-300" : "text-red-800"}`}>مُولّد وثائق الامتثال (PDPL)</h3>
          <p className={`text-[12px] mb-4 ${isDark ? "text-red-400/80" : "text-red-600/80"}`}>
            النظام اكتشف نقصاً في الامتثال لنظام حماية البيانات الشخصية. هل ترغب في توليد الوثائق الأساسية فوراً؟
            (سياسة الخصوصية، نموذج موافقة عملاء، سجل الاحتفاظ بالبيانات)
          </p>
          <button onClick={onGenerate} className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold bg-gradient-to-r from-red-600 to-red-500 text-white shadow-md hover:shadow-lg transition-all">
            <FilePdf size={16} /> توليد حزمة الوثائق (عربي/إنجليزي)
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page Component ──────────────────────────────────────────────────────

function formatComplianceMonitorReport(results: SectionResult[], overallScore: number, pdplGenerated: boolean) {
  return [
    "Corporate Compliance Monitor Report",
    `Overall score: ${overallScore}%`,
    `PDPL documents generated: ${pdplGenerated ? "yes" : "no"}`,
    "",
    ...results.map((res) => [
      `${res.title}: ${res.status} (${res.score}/${res.maxScore})`,
      ...res.recommendations.map((rec) => `- ${rec}`),
    ].join("\n")),
  ].join("\n\n");
}

export default function ComplianceMonitorPage() {
  const { isDark } = useTheme();
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<SectionResult[]>([]);
  const [showPDPL, setShowPDPL] = useState(false);
  const [pdplGenerated, setPdplGenerated] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const handleAnswer = (qId: string, val: boolean) => {
    setAnswers(p => ({ ...p, [qId]: val }));
  };

  const calculateResults = () => {
    const res: SectionResult[] = QUESTIONS.map(sec => {
      let score = 0;
      sec.qs.forEach(q => {
        if (answers[q.id]) score += 1;
      });

      let status: Status = "pass";
      const recs: string[] = [];
      const maxScore = sec.qs.length;

      if (score === maxScore) {
        status = "pass";
      } else if (score > 0) {
        status = "warn";
      } else {
        status = "fail";
      }

      // Generate localized recommendations based on failures
      if (sec.sectionId === "s1" && score < maxScore) {
        recs.push("المسارعة بتحديث عقد التأسيس وفق نظام الشركات الجديد لتجنب إيقاف الخدمات.");
        recs.push("توحيد السجلات الفرعية في سجل تجاري واحد لنفس النشاط لتقليل الرسوم المقابلة.");
      }
      if (sec.sectionId === "s2" && score < maxScore) {
        status = "fail"; // UBO is critical
        recs.push("تحديث سجل المستفيد الفعلي (UBO) فوراً على منصة وزارة التجارة لتجنب الغرامات المالية التي قد تصل لـ 500,000 ريال.");
      }
      if (sec.sectionId === "s3" && score < maxScore) {
        recs.push("مراجعة ملف قوى وتحسين نسبة التوطين لتجنب الهبوط للنطاق الأحمر وإيقاف خدمات النقل وتجديد الإقامات.");
      }
      if (sec.sectionId === "s4" && score < maxScore) {
        recs.push("إنشاء وتفعيل سياسة خصوصية واضحة للمستخدمين (يمكنك استخدام المُولّد أسفله).");
      }
      if (sec.sectionId === "s5" && score < maxScore) {
        recs.push("الربط مع مزود فاتورة إلكترونية معتمد من هيئة الزكاة والضريبة والجمارك (ZATCA Phase 2).");
      }

      return { id: sec.sectionId, title: sec.title, status, score, maxScore, recommendations: recs };
    });

    setResults(res);
    
    // Check if PDPL failed or warned
    const pdplRes = res.find(r => r.id === "s4");
    if (pdplRes && pdplRes.status !== "pass") {
      setShowPDPL(true);
    } else {
      setShowPDPL(false);
    }
    
    setStep(2);
  };

  const getOverallScore = () => {
    if (!results.length) return 0;
    const totalMax = results.reduce((acc, r) => acc + r.maxScore, 0);
    const totalScore = results.reduce((acc, r) => acc + r.score, 0);
    return Math.round((totalScore / totalMax) * 100);
  };

  const totalAnswered = Object.keys(answers).length;
  const totalQuestions = QUESTIONS.reduce((acc, s) => acc + s.qs.length, 0);
  const canSubmit = totalAnswered === totalQuestions;

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>نظامي AI</Link>
          <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
          <span className={isDark ? "text-zinc-300" : "text-slate-600"}>مراقب الامتثال التنظيمي</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck size={24} weight="duotone" className="text-cyan-500" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
              مراقب الامتثال التنظيمي 2025
            </h1>
            <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              تقييم ذاتي للمطابقة مع الأنظمة المستحدثة (نظام الشركات، PDPL، ZATCA، UBO)
            </p>
          </div>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* Step 1: Questionnaire */}
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
            
            <div className={`p-4 flex items-center justify-between rounded-xl border ${isDark ? "bg-cyan-900/10 border-cyan-700/30 text-cyan-300" : "bg-cyan-50 border-cyan-200 text-cyan-800"}`}>
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} weight="fill" className="text-cyan-500" />
                <span className="text-[12px] font-bold">أجب على جميع الأسئلة بدقة للحصول على تقرير المخاطر التنظيمية.</span>
              </div>
              <span className="text-[12px] font-bold">{totalAnswered} من {totalQuestions} مُجاب</span>
            </div>

            {QUESTIONS.map((sec) => {
              const Icon = sec.icon;
              return (
                <div key={sec.sectionId} className={`${card} overflow-hidden`}>
                  <div className={`px-5 py-4 border-b flex items-center gap-3 ${isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50"}`}>
                    <Icon size={20} className={sec.color} weight="duotone" />
                    <h2 className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{sec.title}</h2>
                  </div>
                  <div className="p-5 space-y-4">
                    {sec.qs.map((q) => (
                      <div key={q.id} className="flex sm:flex-row flex-col sm:items-center justify-between gap-4">
                        <p className={`text-[13px] font-medium leading-relaxed max-w-xl ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{q.text}</p>
                        <div className="flex gap-2 flex-shrink-0">
                          <button onClick={() => handleAnswer(q.id, true)}
                            className={`px-4 py-2 rounded-lg text-[12px] font-bold border transition-colors ${answers[q.id] === true ? "bg-emerald-500 text-white border-emerald-500" : isDark ? "border-white/[0.1] text-zinc-400 hover:border-emerald-500/50 hover:text-emerald-400" : "border-slate-200 text-slate-500 hover:border-emerald-200 hover:bg-emerald-50"}`}>
                            نعم
                          </button>
                          <button onClick={() => handleAnswer(q.id, false)}
                            className={`px-4 py-2 rounded-lg text-[12px] font-bold border transition-colors ${answers[q.id] === false ? "bg-red-500 text-white border-red-500" : isDark ? "border-white/[0.1] text-zinc-400 hover:border-red-500/50 hover:text-red-400" : "border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50"}`}>
                            لا
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex justify-end pt-4 pb-10">
              <button onClick={calculateResults} disabled={!canSubmit}
                className={`py-3 px-8 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-all ${canSubmit ? "bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] text-white shadow-md hover:shadow-lg" : isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
                توليد تقرير الامتثال <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 2: Results */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
            <BetaReviewGate toolId="corp.compliance-monitor" toolName="تقرير الامتثال التنظيمي" reviewScope="legal-data">
            
            {/* Overall Score */}
            <div className={`${card} p-8 text-center flex flex-col items-center relative overflow-hidden`}>
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-cyan-400 to-blue-500" />
              <h2 className={`text-[14px] font-bold mb-6 uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مؤشر الامتثال التنظيمي</h2>
              
              <div className="relative mb-6">
                <svg className="w-40 h-40 transform -rotate-90">
                  <circle cx="80" cy="80" r="70" className={`stroke-current ${isDark ? "text-zinc-800" : "text-slate-100"}`} strokeWidth="12" fill="transparent" />
                  <motion.circle
                    cx="80" cy="80" r="70"
                    className={`stroke-current ${getOverallScore() >= 80 ? "text-emerald-500" : getOverallScore() >= 50 ? "text-amber-500" : "text-red-500"}`}
                    strokeWidth="12" fill="transparent" strokeLinecap="round"
                    strokeDasharray={440}
                    initial={{ strokeDashoffset: 440 }}
                    animate={{ strokeDashoffset: 440 - (440 * getOverallScore()) / 100 }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-4xl font-black font-mono ${isDark ? "text-white" : "text-slate-800"}`}>{getOverallScore()}%</span>
                </div>
              </div>
              
              <p className={`text-[13px] font-medium max-w-md ${isDark ? "text-zinc-300" : "text-slate-600"}`}>
                {getOverallScore() >= 80 ? "أداء ممتاز! منشأتك متوافقة بنسبة عالية مع تشريعات 2025." :
                 getOverallScore() >= 50 ? "أداء متوسط. يوجد ثغرات تنظيمية يجب معالجتها قريباً لتجنب الغرامات." :
                 "تحذير خطر! منشأتك معرضة لغرامات مالية ضخمة وإيقاف خدمات بسبب ضعف التوافق مع الأنظمة الإلزامية."}
              </p>
            </div>

            {/* PDPL Generator Prompt */}
            {showPDPL && !pdplGenerated && (
              <PDPLGenerator isDark={isDark} onGenerate={() => setPdplGenerated(true)} />
            )}

            {pdplGenerated && (
              <div className={`mt-6 p-5 rounded-2xl border ${isDark ? "border-emerald-500/30 bg-emerald-900/10 text-emerald-400" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle size={24} weight="fill" className="text-emerald-500" />
                  <h3 className="text-[14px] font-bold">تم توليد حزمة وثائق PDPL بنجاح</h3>
                </div>
                <div className="flex flex-wrap gap-3 mt-4">
                  <button className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/50 dark:bg-black/20 border ${isDark ? "border-emerald-800" : "border-emerald-200"} hover:shadow-sm`}>
                    <Download size={14} /> سياسة الخصوصية
                  </button>
                  <button className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/50 dark:bg-black/20 border ${isDark ? "border-emerald-800" : "border-emerald-200"} hover:shadow-sm`}>
                    <Download size={14} /> نموذج جمع بيانات العملاء
                  </button>
                  <button className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-white/50 dark:bg-black/20 border ${isDark ? "border-emerald-800" : "border-emerald-200"} hover:shadow-sm`}>
                    <Download size={14} /> سجل الاحتفاظ بالبيانات
                  </button>
                </div>
              </div>
            )}

            {/* Detailed Report */}
            <div className="space-y-4">
              <h3 className={`text-[16px] font-bold mt-8 mb-4 ${isDark ? "text-white" : "text-slate-800"}`}>تفاصيل التقرير التنظيمي</h3>
              
              {results.map((res) => {
                const isPass = res.status === "pass";
                const isWarn = res.status === "warn";
                const isFail = res.status === "fail";
                
                const statusColor = isPass ? "text-emerald-500" : isWarn ? "text-amber-500" : "text-red-500";
                const statusBg = isPass ? "bg-emerald-500/10" : isWarn ? "bg-amber-500/10" : "bg-red-500/10";
                const statusBorder = isPass ? "border-emerald-500/30" : isWarn ? "border-amber-500/30" : "border-red-500/30";
                const Icon = isPass ? CheckCircle : isWarn ? Warning : XCircle;

                return (
                  <div key={res.id} className={`rounded-xl border p-5 transition-all ${isDark ? `border-white/[0.06] bg-zinc-900/40` : `border-slate-100 bg-white shadow-sm`}`}>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${statusBg}`}>
                          <Icon size={18} className={statusColor} weight="fill" />
                        </div>
                        <h4 className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{res.title}</h4>
                      </div>
                      <span className={`text-[14px] font-mono font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{res.score}/{res.maxScore}</span>
                    </div>

                    {!isPass && res.recommendations.length > 0 && (
                      <div className={`mt-3 p-3 rounded-lg border ${statusBg} ${statusBorder}`}>
                        <p className={`text-[11px] font-black uppercase tracking-wider mb-2 ${statusColor}`}>خطة التصحيح الفورية:</p>
                        <ul className="space-y-1.5 list-disc list-inside">
                          {res.recommendations.map((rec, i) => (
                            <li key={i} className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{rec}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Unified Result Actions */}
            <AiResultActions
              text={formatComplianceMonitorReport(results, getOverallScore(), pdplGenerated)}
              filename="corp-compliance-monitor-report"
              showVault
              showHumanReview
              showShare
              className="justify-start"
            />

            <div className={`mt-6 p-4 rounded-xl flex items-center justify-between border ${isDark ? "border-blue-500/20 bg-blue-900/10" : "border-blue-200 bg-blue-50"}`}>
              <div className="flex items-center gap-3">
                <ShieldCheck size={24} weight="duotone" className="text-blue-500" />
                <p className={`text-[12px] font-bold ${isDark ? "text-blue-300" : "text-blue-800"}`}>تحتاج استشارة قانونية لمعالجة هذه المخالفات؟</p>
              </div>
              <Link href="/dashboard/business" className="px-4 py-2 rounded-lg text-[11px] font-bold bg-blue-500 text-white shadow-md hover:bg-blue-600 transition-colors">
                طلب مستشار عبر المنصة
              </Link>
            </div>
            </BetaReviewGate>

            <div className="flex justify-center pt-8 pb-10">
              <button onClick={() => { setStep(1); setAnswers({}); setResults([]); setShowPDPL(false); setPdplGenerated(false); }} className={`px-6 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${isDark ? "border-white/[0.1] text-zinc-400 hover:bg-zinc-800" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                إعادة التقييم
              </button>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
