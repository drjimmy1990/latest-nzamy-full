"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldWarning, CaretLeft, CheckCircle, Warning, XCircle, ArrowRight,
  Download, Buildings, MagnifyingGlass, Handshake, FileText, ArrowCounterClockwise,
  PlusCircle, Scales
} from "@phosphor-icons/react";
import Link from "next/link";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { useTheme } from "@/components/ThemeProvider";

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface RiskInputs {
  // 1
  partyName: string;
  partyType: "supplier" | "client" | "partner" | "contractor" | "";
  duration: string;
  contractValue: string;
  // 2
  latePayments: boolean;
  rejectedClauses: boolean;
  // 3
  modifyTerms: boolean;
  previousDisputes: boolean;
  // 4
  validCR: boolean;
  pdplCompliant: boolean;
  // 5
  notes: string;
}

type RiskLevel = "high" | "medium" | "low";

interface RiskResult {
  level: RiskLevel;
  score: number; // 0 to 100 (higher = riskier)
  recommendations: string[];
}

// ─── Evaluation Logic ────────────────────────────────────────────────────────

function evaluateRisk(inp: RiskInputs): RiskResult {
  let score = 0;
  const recs: string[] = [];

  // Financial
  if (inp.latePayments) { score += 25; recs.push("الطرف لديه سجل بتأخير الدفعات/التسليم. يُنصح بإضافة بند جزائي صارم وربط الدفعات بالإنجاز المؤكد."); }
  if (inp.rejectedClauses) { score += 10; recs.push("الطرف متشدد في قبول البنود القياسية. تأكد من مراجعة الشروط الجوهرية (Force Majeure, Liability) بدقة."); }

  // Contractual
  if (inp.modifyTerms) { score += 15; recs.push("ميل الطرف لتعديل الشروط بعد التوقيع يتطلب آلية 'Change Order' واضحة لتجنب زحف النطاق (Scope Creep)."); }
  if (inp.previousDisputes) { score += 30; recs.push("وجود نزاعات سابقة يُشكل خطراً أحمر (Red Flag). يُنصح باشتراط التحكيم التجاري المُلزم بدل المحاكم لتسريع أي نزاع محتمل."); }

  // Compliance
  if (!inp.validCR) { score += 35; recs.push("عدم وجود سجل تجاري ساري أو موثق يمنع التعاقد النظامي تماماً. يجب إيقاف الإجراءات لحين توفير المستندات."); }
  if (!inp.pdplCompliant) { score += 15; recs.push("نظام PDPL يُلزمك بالتأكد من امتثال المورد لحماية البيانات. يُنصح بربط العقد بـ (اتفاقية معالجة بيانات - DPA)."); }

  // Value Context
  const val = parseFloat(inp.contractValue.replace(/,/g, "")) || 0;
  if (val > 500000 && score > 30) {
    recs.push(`قيمة العقد العالية (${inp.contractValue} ر.س) تضاعف تأثير المخاطر الحالية. استشر محامياً قبل التوقيع.`);
  }

  let level: RiskLevel = "low";
  if (score >= 50) level = "high";
  else if (score >= 25) level = "medium";

  if (recs.length === 0) {
    recs.push("سجل الطرف سليم ولا توجد مؤشرات خطر واضحة. تعاقد آمن ضمن الشروط القياسية.");
  }

  return { level, score, recommendations: recs };
}

// ─── Component ────────────────────────────────────────────────────────────────

function formatRiskAssessmentReport(inp: RiskInputs, result: RiskResult) {
  return [
    "Counterparty Risk Assessment",
    `Party: ${inp.partyName}`,
    `Party type: ${inp.partyType || "-"}`,
    `Contract value: ${inp.contractValue || "-"}`,
    `Duration: ${inp.duration || "-"}`,
    `Risk level: ${result.level}`,
    `Risk score: ${result.score}/100`,
    "",
    "Recommendations:",
    ...result.recommendations.map((rec) => `- ${rec}`),
    inp.notes ? `\nNotes:\n${inp.notes}` : "",
  ].filter(Boolean).join("\n");
}

export default function SupplierRiskAssessmentPage() {
  const { isDark } = useTheme();
  const [inp, setInp] = useState<RiskInputs>({
    partyName: "", partyType: "", duration: "", contractValue: "",
    latePayments: false, rejectedClauses: false,
    modifyTerms: false, previousDisputes: false,
    validCR: true, pdplCompliant: true,
    notes: ""
  });
  const [result, setResult] = useState<RiskResult | null>(null);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const inpCls = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`;
  const labelCls = `block text-[11px] font-black uppercase tracking-wider mb-2 mt-4 ${isDark ? "text-zinc-500" : "text-slate-400"}`;

  const canAssess = !!inp.partyName && !!inp.partyType && !!inp.contractValue;

  const handleAssess = () => {
    setResult(evaluateRisk(inp));
  };

  const handleReset = () => {
    setResult(null);
    setInp({
      partyName: "", partyType: "", duration: "", contractValue: "",
      latePayments: false, rejectedClauses: false, modifyTerms: false, previousDisputes: false,
      validCR: true, pdplCompliant: true, notes: ""
    });
  };

  const toggleBtn = (val: boolean, onClick: () => void, textTrue: string, textFalse: string, colorTrue: string, colorFalse: string) => (
    <div className="flex gap-2">
      <button onClick={onClick} className={`flex-1 py-2 rounded-xl text-[12px] font-bold border transition-all ${val ? colorTrue : isDark ? "border-white/[0.06] text-zinc-500 hover:border-white/10" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
        {textTrue}
      </button>
      <button onClick={onClick} className={`flex-1 py-2 rounded-xl text-[12px] font-bold border transition-all ${!val ? colorFalse : isDark ? "border-white/[0.06] text-zinc-500 hover:border-white/10" : "border-slate-200 text-slate-400 hover:border-slate-300"}`}>
        {textFalse}
      </button>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6" dir="rtl">
      
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>نظامي AI</Link>
          <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
          <span className={isDark ? "text-zinc-300" : "text-slate-600"}>تحليل مخاطر الموردين والأطراف</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
              <ShieldWarning size={24} weight="duotone" className="text-amber-500" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
                تحليل مخاطر الأطراف (KYC/B)
              </h1>
              <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                استمارة ذكية داخلية لتقييم الموردين والشركاء قبل توقيع العقود النهائية.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Form Container */}
        <div className={`lg:col-span-7 ${card} p-6 space-y-4`}>
          
          <div className={`p-4 rounded-xl flex items-center gap-3 border ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
            <MagnifyingGlass size={18} className="text-amber-500" weight="duotone" />
            <p className={`text-[12px] font-bold ${isDark ? "text-amber-300" : "text-amber-800"}`}>هذا التقييم داخلي ويعتمد على المدخلات، ولا يتم استرجاع معلومات حية من الإنترنت.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>اسم الطرف / الشركة</label>
              <input value={inp.partyName} onChange={e => setInp(p => ({ ...p, partyName: e.target.value }))} placeholder="الاسم" className={inpCls} />
            </div>
            <div>
              <label className={labelCls}>نوع الطرف</label>
              <select value={inp.partyType} onChange={e => setInp(p => ({ ...p, partyType: e.target.value as any }))} className={inpCls}>
                <option value="">اختر..</option>
                <option value="supplier">مورد / بائع</option>
                <option value="client">عميل</option>
                <option value="contractor">مقاول</option>
                <option value="partner">شريك تجاري</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>قيمة التعاقد التقديرية (ريال)</label>
              <input value={inp.contractValue} onChange={e => setInp(p => ({ ...p, contractValue: e.target.value }))} placeholder="مثال: 150,000" className={inpCls} />
            </div>
            <div>
              <label className={labelCls}>مدة التعامل المتوقعة</label>
              <input value={inp.duration} onChange={e => setInp(p => ({ ...p, duration: e.target.value }))} placeholder="شهران، سنة..." className={inpCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-white/5">
            <div>
              <label className={labelCls}><span className="text-red-500">*</span> التاريخ المالي</label>
              <p className={`text-[10px] mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هل يماطل في الدفعات أو التسليم؟</p>
              {toggleBtn(inp.latePayments, () => setInp(p => ({ ...p, latePayments: !p.latePayments })), "نعم، تأخيرات سابقة", "لا المشوار سليم", "bg-red-500/10 text-red-500 border-red-500/30", "bg-emerald-500/10 text-emerald-500 border-emerald-500/30")}
              
              <p className={`text-[10px] mt-4 mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هل يعترض كثيراً على البنود القياسية؟</p>
              {toggleBtn(inp.rejectedClauses, () => setInp(p => ({ ...p, rejectedClauses: !p.rejectedClauses })), "نعم، متشدد", "لا، متجاوب", "bg-amber-500/10 text-amber-500 border-amber-500/30", "bg-emerald-500/10 text-emerald-500 border-emerald-500/30")}
            </div>
            
            <div>
              <label className={labelCls}><span className="text-red-500">*</span> السلوك التعاقدي والنزاعات</label>
              <p className={`text-[10px] mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هل يحاول تغيير الشروط بعد التوقيع؟</p>
              {toggleBtn(inp.modifyTerms, () => setInp(p => ({ ...p, modifyTerms: !p.modifyTerms })), "نعم، يغير الاتفاق", "لا، ملتزم", "bg-amber-500/10 text-amber-500 border-amber-500/30", "bg-emerald-500/10 text-emerald-500 border-emerald-500/30")}
              
              <p className={`text-[10px] mt-4 mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هل سبق وتورط في دعاوى قضائية؟</p>
              {toggleBtn(inp.previousDisputes, () => setInp(p => ({ ...p, previousDisputes: !p.previousDisputes })), "نعم، توجد سوابق", "لا توجد", "bg-red-500/10 text-red-500 border-red-500/30", "bg-emerald-500/10 text-emerald-500 border-emerald-500/30")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-white/5">
            <div>
              <label className={labelCls}><span className="text-red-500">*</span> الامتثال والتوثيق</label>
              <p className={`text-[10px] mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هل لديه سجل تجاري / رخصة سارية؟</p>
              {toggleBtn(!inp.validCR, () => setInp(p => ({ ...p, validCR: !p.validCR })), "لا يوجد / منتهي", "ساري وموثق", "bg-red-500/10 text-red-500 border-red-500/30", "bg-emerald-500/10 text-emerald-500 border-emerald-500/30")}
            </div>
            <div>
              <label className={labelCls}><span className="text-transparent">*</span></label>
              <p className={`text-[10px] mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هل يمتثل لحماية البيانات (PDPL)؟</p>
              {toggleBtn(!inp.pdplCompliant, () => setInp(p => ({ ...p, pdplCompliant: !p.pdplCompliant })), "لا / غير معروف", "نعم، متوافق", "bg-amber-500/10 text-amber-500 border-amber-500/30", "bg-emerald-500/10 text-emerald-500 border-emerald-500/30")}
            </div>
          </div>

          <div className="pt-2">
            <label className={labelCls}>ملاحظات إضافية</label>
            <textarea value={inp.notes} onChange={e => setInp(p => ({ ...p, notes: e.target.value }))} rows={2} className={`${inpCls} resize-none`} placeholder="أي تفاصيل أخرى..." />
          </div>

          <div className="pt-4 flex gap-3">
            <button onClick={handleAssess} disabled={!canAssess}
              className={`flex-1 py-3 rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 transition-all ${canAssess ? "bg-gradient-to-r from-amber-600 to-amber-500 text-white shadow-md hover:shadow-lg" : isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}>
              تقييم المخاطر <ArrowRight size={16} />
            </button>
            {result && <button onClick={handleReset} className={`px-4 py-3 rounded-xl border text-[14px] ${isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}><ArrowCounterClockwise size={16} /></button>}
          </div>

        </div>

        {/* Results Container */}
        <div className={`lg:col-span-5 h-fit`}>
          <AnimatePresence mode="wait">
            {!result ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`${card} p-10 flex flex-col items-center justify-center text-center h-full min-h-[400px]`}>
                <ShieldWarning size={48} className={`mb-4 ${isDark ? "text-zinc-800" : "text-slate-200"}`} weight="duotone" />
                <p className={`text-[13px] font-bold ${isDark ? "text-zinc-500" : "text-slate-400"}`}>قم بتعبئة الاستمارة لتقييم الطرف ومعرفة التوصيات التعاقدية.</p>
              </motion.div>
            ) : (
              <motion.div key="result" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="space-y-4">
                <BetaReviewGate toolId="corp.risk-assessment" toolName="تحليل مخاطر الطرف التعاقدي" reviewScope="legal-data">
                <AiResultActions
                  text={formatRiskAssessmentReport(inp, result)}
                  filename="corp-risk-assessment"
                  showShare
                />
                
                <div className={`${card} p-6 pb-8 text-center relative overflow-hidden`}>
                  {result.level === "high" && <div className="absolute top-0 right-0 left-0 h-1.5 bg-red-500" />}
                  {result.level === "medium" && <div className="absolute top-0 right-0 left-0 h-1.5 bg-amber-500" />}
                  {result.level === "low" && <div className="absolute top-0 right-0 left-0 h-1.5 bg-emerald-500" />}

                  <h3 className={`text-[11px] font-black uppercase tracking-wider mb-4 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مؤشر المخاطرة</h3>

                  <div className="flex items-center justify-center mb-2">
                    {result.level === "high" && <XCircle size={64} className="text-red-500" weight="fill" />}
                    {result.level === "medium" && <Warning size={64} className="text-amber-500" weight="fill" />}
                    {result.level === "low" && <CheckCircle size={64} className="text-emerald-500" weight="fill" />}
                  </div>

                  <h2 className={`text-[24px] font-black mb-1 ${result.level === "high" ? "text-red-500" : result.level === "medium" ? "text-amber-500" : "text-emerald-500"}`}>
                    {result.level === "high" ? "مخاطرة عالية" : result.level === "medium" ? "مخاطرة متوسطة" : "مخاطرة منخفضة (آمن)"}
                  </h2>
                  <p className={`text-[13px] font-medium font-mono ${isDark ? "text-zinc-400" : "text-slate-500"}`}>Risk Score: {result.score}/100</p>
                </div>

                <div className={`${card} p-6`}>
                  <h3 className={`text-[14px] font-bold mb-4 flex items-center gap-2 ${isDark ? "text-white" : "text-slate-800"}`}>
                    <FileText size={18} className="text-amber-500" weight="duotone" /> التوصيات التعاقدية للوقاية
                  </h3>
                  <ul className="space-y-3">
                    {result.recommendations.map((rec, i) => (
                      <li key={i} className={`text-[12px] leading-relaxed flex items-start gap-2 ${isDark ? "text-zinc-300" : "text-slate-700"}`}>
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${result.level === "high" ? "bg-red-500" : result.level === "medium" ? "bg-amber-500" : "bg-emerald-500"}`} />
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                </BetaReviewGate>

                <div className="grid grid-cols-1 gap-2">
                  <Link href="/dashboard/lawyer/clients" className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border text-[12px] font-bold transition-all ${isDark ? "border-white/[0.06] text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                    <PlusCircle size={16} /> إضافة لملف الأطراف والعملاء
                  </Link>
                  <Link href="/ai/contracts" className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0B3D2E] text-white text-[12px] font-bold shadow-md hover:bg-[#0B3D2E]/90 transition-all`}>
                    <Scales size={16} /> الانتقال لصياغة العقد استناداً للتحليل
                  </Link>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
