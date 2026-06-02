"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Money, CaretLeft, Warning, CheckCircle, ArrowRight,
  ArrowCounterClockwise, Copy, Download, FileText,
  Scales, ArrowCircleLeft, Gavel, Alarm, X,
} from "@phosphor-icons/react";
import Link from "next/link";
import AiResultActions from "@/components/AiResultActions";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ─────────────────────────────────────────────────────────────────

type Track = "friendly" | "formal" | "pre_court" | "court_order";

interface DebtInputs {
  debtorName:    string;
  debtorType:    "company" | "individual" | "";
  amount:        string;
  currency:      "SAR";
  dueDate:       string;
  hasContract:   boolean;
  hasPenaltyClause: boolean;
  penaltyRate:   string;
  hasInvoice:    boolean;
  hasCheque:     boolean;
  lastContact:   string;
  debtorAcknowledges: boolean;
  hasDispute:    boolean;
}

const TRACK_CONFIG: Record<Track, {
  label: string; stage: string; color: string; bg: string;
  borderColor: string; icon: React.ElementType; urgencyLevel: string;
}> = {
  friendly:    { label: "تسوية ودية",        stage: "المرحلة 1", color: "text-emerald-600", bg: "bg-emerald-500/10", borderColor: "border-emerald-500/30", icon: CheckCircle, urgencyLevel: "موصى به أولاً" },
  formal:      { label: "إشعار قانوني رسمي",  stage: "المرحلة 2", color: "text-amber-600",   bg: "bg-amber-500/10",   borderColor: "border-amber-500/30",   icon: FileText,    urgencyLevel: "مع بند جزائي" },
  pre_court:   { label: "إنذار ما قبل القضاء", stage: "المرحلة 3", color: "text-orange-600",  bg: "bg-orange-500/10",  borderColor: "border-orange-500/30",  icon: Alarm,       urgencyLevel: "آخر تحذير" },
  court_order: { label: "طلب أمر الأداء",      stage: "المرحلة 4", color: "text-red-600",    bg: "bg-red-500/10",     borderColor: "border-red-500/30",     icon: Gavel,       urgencyLevel: "للمحكمة التجارية" },
};

// ─── Notice Generator ─────────────────────────────────────────────────────

function generateNotice(track: Track, inputs: DebtInputs, firmName = "مكتب المحامي / الشركة"): string {
  const amount = parseFloat(inputs.amount.replace(/,/g, "")).toLocaleString("ar-SA");
  const debtorTitle = inputs.debtorType === "company" ? "شركة / مؤسسة" : "السيد / السيدة";
  const today = new Date().toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });

  const header = `
بسم الله الرحمن الرحيم

صادر عن: ${firmName}
التاريخ: ${today}
إلى: ${debtorTitle} ${inputs.debtorName}
`.trim();

  if (track === "friendly") {
    return `${header}

الموضوع: تذكير ودي بسداد المستحقات المالية

السلام عليكم ورحمة الله وبركاته،

نودّ تذكيركم بأن المبلغ المستحق علينا والبالغ (${amount} ريال سعودي) قد حلّ أجل سداده بتاريخ ${inputs.dueDate || "المتفق عليه"}.

نأمل منكم تسوية هذا المبلغ في أقرب وقت ممكن، وإشعارنا بذلك.

مع خالص التقدير،
${firmName}
`;
  }

  if (track === "formal") {
    return `${header}

إشعار قانوني رسمي — صادر عن جهة قانونية معتمدة

الموضوع: المطالبة الرسمية بسداد المستحقات

إلى ${debtorTitle} ${inputs.debtorName}،

استناداً ${inputs.hasContract ? `للعقد المبرم بتاريخ ${inputs.dueDate || "..."}` : "للاتفاق القائم بيننا"}، يُخطركم هذا الإشعار القانوني الرسمي بأن المبلغ المستحق والبالغ (${amount} ريال سعودي) لم يُسدَّد حتى تاريخه.

${inputs.hasPenaltyClause && inputs.penaltyRate ? `وفقاً للبند الجزائي المتفق عليه، يترتب على التأخر في السداد جزاء تأخر بنسبة ${inputs.penaltyRate}% عن كل أسبوع تأخير مما يستوجب تصفيته فوراً.` : ""}

نطالبكم بسداد المبلغ المستحق خلال مدة أقصاها (٧ أيام) من تاريخ استلام هذا الإشعار، وإلا تعرّضتم لاتخاذ كافة الإجراءات القانونية اللازمة.

صادر عن: ${firmName}
هذا إشعار قانوني رسمي — يُعدّ سنداً قانونياً معتمداً.
`;
  }

  if (track === "pre_court") {
    return `${header}

إنذار قانوني نهائي ما قبل القضاء

إلى ${debtorTitle} ${inputs.debtorName}،

تحية قانونية، وبعد:

يُخطركم هذا الإنذار القانوني النهائي الصادر عن مكتب محاماة معتمد بأن جميع المحاولات الودية لتسوية مستحقاتنا البالغة (${amount} ريال سعودي) قد باءت بالفشل، وأن الأجل القانوني للتسوية قد انقضى.

يُمنحكم مهلة أخيرة مقدارها (١٠ أيام) من تاريخ استلام هذا الإنذار لسداد كامل المبلغ المستحق أو التواصل معنا لإيجاد تسوية. فإن انقضت دون رد، سيُلجأ فوراً إلى:
- رفع دعوى قضائية أمام المحكمة التجارية المختصة
- المطالبة بكامل المبلغ مضافاً إليه الجزاء التأخيري والمصاريف القضائية

هذا الإنذار سند قانوني معتمد ويُعدّ إخطاراً رسمياً بالمعنى النظامي.

صادر عن: ${firmName} — مكتب قانوني معتمد
`;
  }

  // court_order
  return `${header}

طلب أمر الأداء — نموذج جاهز للتقديم

المحكمة التجارية المختصة
طالب الأمر: ${firmName}
المطلوب ضده: ${debtorTitle} ${inputs.debtorName}
المبلغ المطلوب: ${amount} ريال سعودي
${inputs.hasInvoice ? "المستندات: فاتورة ضريبية مؤرخة مرفقة" : ""}
${inputs.hasCheque ? "المستندات: شيك بنكي موقع مرفق" : ""}
${inputs.hasContract ? "المستندات: نسخة من العقد المبرم مرفقة" : ""}

الطلب:
يتشرف الطالب برفع هذا الطلب لاستصدار أمر الأداء في مواجهة المطلوب ضده بإلزامه بسداد المبلغ المشار إليه، وذلك وفقاً لأحكام نظام المحاكم التجارية ولائحته التنفيذية.

ملاحظة: يُقدَّم هذا الطلب رفقة المستندات إلى قلم كتّاب المحكمة التجارية المختصة.
`;
}

// ─── Step Components ──────────────────────────────────────────────────────

function Step1({ inputs, setInputs, isDark }: { inputs: DebtInputs; setInputs: React.Dispatch<React.SetStateAction<DebtInputs>>; isDark: boolean }) {
  const inp = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`;

  return (
    <div className="space-y-4">
      <h2 className={`text-[14px] font-black ${isDark ? "text-zinc-200" : "text-slate-800"}`}>الخطوة 1 — معلومات الدين</h2>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>اسم المدين</label>
          <input value={inputs.debtorName} onChange={e => setInputs(p => ({ ...p, debtorName: e.target.value }))}
            placeholder="الاسم / اسم الشركة" className={inp} />
        </div>
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>نوع المدين</label>
          <div className="flex gap-2">
            {(["company", "individual"] as const).map(v => (
              <button key={v} onClick={() => setInputs(p => ({ ...p, debtorType: v }))}
                className={`flex-1 py-2.5 rounded-xl border text-[12px] font-bold transition-all ${inputs.debtorType === v ? "bg-[#0B3D2E]/10 border-[#0B3D2E]/30 text-[#0B3D2E] dark:text-emerald-400" : isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
                {v === "company" ? "شركة" : "فرد"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>مبلغ الدين (ريال)</label>
          <input value={inputs.amount} onChange={e => setInputs(p => ({ ...p, amount: e.target.value }))}
            placeholder="مثال: 75,000" className={inp} />
        </div>
        <div>
          <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>تاريخ الاستحقاق</label>
          <input type="date" value={inputs.dueDate} onChange={e => setInputs(p => ({ ...p, dueDate: e.target.value }))} className={inp} />
        </div>
      </div>

      <div>
        <label className={`block text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>المستندات المتوفرة</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            ["hasContract", "عقد موقع"],
            ["hasInvoice",  "فاتورة"],
            ["hasCheque",   "شيك بنكي"],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setInputs(p => ({ ...p, [key]: !p[key] }))}
              className={`py-2.5 rounded-xl border text-[12px] font-bold flex items-center justify-center gap-1.5 transition-all ${inputs[key] ? "bg-[#0B3D2E] text-white border-[#0B3D2E]" : isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
              {inputs[key] && <CheckCircle size={12} weight="fill" />}
              {label}
            </button>
          ))}
        </div>
      </div>

      {inputs.hasContract && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
          <div className={`rounded-xl border p-4 space-y-3 ${isDark ? "border-white/[0.06]" : "border-slate-100"}`}>
            <div className="flex items-center justify-between">
              <label className={`text-[12px] font-bold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>يتضمن العقد بنداً جزائياً؟</label>
              <button onClick={() => setInputs(p => ({ ...p, hasPenaltyClause: !p.hasPenaltyClause }))}
                className={`w-10 h-5 rounded-full transition-all ${inputs.hasPenaltyClause ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-700" : "bg-slate-200"}`}>
                <motion.div animate={{ x: inputs.hasPenaltyClause ? 20 : 2 }} className="w-4 h-4 rounded-full bg-white shadow-sm" />
              </button>
            </div>
            {inputs.hasPenaltyClause && (
              <input value={inputs.penaltyRate} onChange={e => setInputs(p => ({ ...p, penaltyRate: e.target.value }))}
                placeholder="نسبة الجزاء (%) لكل أسبوع تأخير" className={inp} />
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Step2({ inputs, setInputs, isDark }: { inputs: DebtInputs; setInputs: React.Dispatch<React.SetStateAction<DebtInputs>>; isDark: boolean }) {
  const inp = `w-full rounded-xl border px-3 py-2.5 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800 text-zinc-200 placeholder:text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-800 placeholder:text-slate-400"}`;

  return (
    <div className="space-y-4">
      <h2 className={`text-[14px] font-black ${isDark ? "text-zinc-200" : "text-slate-800"}`}>الخطوة 2 — تاريخ التواصل</h2>

      <div>
        <label className={`block text-[11px] font-black uppercase tracking-wider mb-1.5 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>تاريخ آخر تواصل</label>
        <input type="date" value={inputs.lastContact} onChange={e => setInputs(p => ({ ...p, lastContact: e.target.value }))} className={inp} />
      </div>

      <div>
        <label className={`block text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هل يُقرّ المدين بالدين؟</label>
        <div className="flex gap-2">
          {([true, false] as const).map(v => (
            <button key={String(v)} onClick={() => setInputs(p => ({ ...p, debtorAcknowledges: v }))}
              className={`flex-1 py-2.5 rounded-xl border text-[13px] font-bold transition-all ${inputs.debtorAcknowledges === v ? v ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" : "bg-red-500/10 border-red-500/30 text-red-500" : isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
              <span className="flex items-center justify-center gap-1.5">{v ? <><CheckCircle size={14} weight="fill" /> نعم، يُقرّ بالدين</> : <><X size={14} weight="bold" /> ينكر أو يتجاهل</>}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className={`block text-[11px] font-black uppercase tracking-wider mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>هل يوجد نزاع على المبلغ؟</label>
        <div className="flex gap-2">
          {([true, false] as const).map(v => (
            <button key={String(v)} onClick={() => setInputs(p => ({ ...p, hasDispute: v }))}
              className={`flex-1 py-2.5 rounded-xl border text-[13px] font-bold transition-all ${inputs.hasDispute === v ? v ? "bg-amber-500/10 border-amber-500/30 text-amber-600" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" : isDark ? "border-white/[0.06] text-zinc-400" : "border-slate-200 text-slate-500"}`}>
              <span className="flex items-center justify-center gap-1.5">{v ? <><Warning size={14} weight="fill" /> يوجد نزاع</> : <><CheckCircle size={14} weight="fill" /> لا يوجد نزاع</>}</span>
            </button>
          ))}
        </div>
        {inputs.hasDispute && (
          <div className={`mt-3 p-3 rounded-xl border ${isDark ? "border-amber-500/20 bg-amber-900/10" : "border-amber-200 bg-amber-50"}`}>
            <p className={`text-[12px] ${isDark ? "text-amber-300" : "text-amber-700"}`}>
              <Warning size={13} className="inline me-1" weight="fill" />
              وجود نزاع يُوصي بالبدء بالتسوية الودية أو التفاوض أولاً قبل التصعيد القانوني.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Step3({ inputs, isDark, onSelectTrack }: { inputs: DebtInputs; isDark: boolean; onSelectTrack: (t: Track) => void }) {
  const tracks: { id: Track; recommended?: boolean }[] = [
    { id: "friendly", recommended: inputs.hasDispute || !inputs.hasContract },
    { id: "formal" },
    { id: "pre_court" },
    { id: "court_order", recommended: inputs.hasInvoice || inputs.hasCheque },
  ];

  return (
    <div className="space-y-4">
      <h2 className={`text-[14px] font-black ${isDark ? "text-zinc-200" : "text-slate-800"}`}>الخطوة 3 — اختر مسار التحصيل</h2>

      <div className={`p-3.5 rounded-xl border flex gap-2 ${isDark ? "border-emerald-700/30 bg-emerald-900/10" : "border-emerald-200 bg-emerald-50"}`}>
        <CheckCircle size={15} className="text-emerald-500 flex-shrink-0 mt-0.5" weight="fill" />
        <p className={`text-[12px] ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>
          <span className="font-bold">تنبيه شرعي:</span> لا يجوز اشتراط فائدة ربوية على التأخر. الجزاء التأخيري المذكور في المرحلة 2 مشروع بشرط أن يكون <span className="font-bold">بنداً مُدرَجاً في العقد الأصلي الموقَّع</span>. نزامي تعرف هذا — تأكد من صحة عقودك.
        </p>
      </div>

      <div className="space-y-3">
        {tracks.map(({ id, recommended }) => {
          const cfg = TRACK_CONFIG[id];
          const Icon = cfg.icon;
          return (
            <motion.button key={id} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
              onClick={() => onSelectTrack(id)}
              className={`w-full flex items-center gap-4 px-4 py-4 rounded-2xl border text-right transition-all ${isDark ? `border-white/[0.07] bg-zinc-800/60 hover:${cfg.borderColor} hover:${cfg.bg}` : `border-slate-100 bg-white hover:border-[1.5px] hover:${cfg.borderColor} hover:${cfg.bg} shadow-sm`}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}>
                <Icon size={18} className={cfg.color} weight="duotone" />
              </div>
              <div className="flex-1 text-right">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-black uppercase tracking-wider ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{cfg.stage}</span>
                  {recommended && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>موصى به</span>}
                </div>
                <p className={`text-[13px] font-black ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{cfg.label}</p>
                <p className={`text-[11px] ${cfg.color}`}>{cfg.urgencyLevel}</p>
              </div>
              <ArrowCircleLeft size={20} className={`flex-shrink-0 ${isDark ? "text-zinc-700" : "text-slate-300"}`} />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function DebtCollectionPage() {
  const { isDark } = useTheme();
  const [step, setStep] = useState(1);
  const [inputs, setInputs] = useState<DebtInputs>({
    debtorName: "", debtorType: "", amount: "", currency: "SAR", dueDate: "",
    hasContract: false, hasPenaltyClause: false, penaltyRate: "",
    hasInvoice: false, hasCheque: false, lastContact: "",
    debtorAcknowledges: false, hasDispute: false,
  });
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [copied, setCopied] = useState(false);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const step1Valid = !!inputs.debtorName && !!inputs.debtorType && !!inputs.amount;
  const step2Valid = true; // optional

  const handleSelectTrack = (track: Track) => {
    setSelectedTrack(track);
    setNoticeText(generateNotice(track, inputs));
    setStep(4);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(noticeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setStep(1); setSelectedTrack(null); setNoticeText("");
    setInputs({ debtorName: "", debtorType: "", amount: "", currency: "SAR", dueDate: "", hasContract: false, hasPenaltyClause: false, penaltyRate: "", hasInvoice: false, hasCheque: false, lastContact: "", debtorAcknowledges: false, hasDispute: false });
  };

  const STEPS = [
    { n: 1, label: "معلومات الدين" },
    { n: 2, label: "تاريخ التواصل" },
    { n: 3, label: "اختيار المسار" },
    { n: 4, label: "الوثيقة" },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-4 text-sm">
          <Link href="/ai" className={`transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>نظامي AI</Link>
          <CaretLeft size={12} className={isDark ? "text-zinc-600" : "text-slate-300"} />
          <span className={isDark ? "text-zinc-300" : "text-slate-600"}>أداة التحصيل القانوني</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center flex-shrink-0">
            <Money size={24} weight="duotone" className="text-red-500" />
          </div>
          <div>
            <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`} style={{ fontFamily: "var(--font-brand)" }}>
              التحصيل القانوني
            </h1>
            <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
              سلسلة تصاعدية من التذكير الودي حتى أمر الأداء أمام المحكمة
            </p>
          </div>
        </div>
      </motion.div>

      {/* Progress bar */}
      <div className="flex gap-1">
        {STEPS.map(s => {
          const isDone = s.n < step;
          return (
            <button key={s.n} 
              type="button"
              onClick={() => { if (isDone) setStep(s.n); }}
              disabled={!isDone}
              className={`flex-1 flex flex-col items-center gap-1 ${isDone ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
            >
              <div className={`h-1.5 w-full rounded-full transition-all ${step >= s.n ? "bg-[#0B3D2E]" : isDark ? "bg-zinc-800" : "bg-slate-100"}`} />
              <span className={`text-[10px] font-bold hidden sm:block ${step >= s.n ? isDark ? "text-zinc-400" : "text-slate-500" : isDark ? "text-zinc-700" : "text-slate-300"}`}>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Steps */}
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.18 }}>

          {step <= 3 && (
            <div className={`${card} p-6`}>
              {step === 1 && <Step1 inputs={inputs} setInputs={setInputs} isDark={isDark} />}
              {step === 2 && <Step2 inputs={inputs} setInputs={setInputs} isDark={isDark} />}
              {step === 3 && <Step3 inputs={inputs} isDark={isDark} onSelectTrack={handleSelectTrack} />}

              <div className="flex gap-3 mt-6">
                {step > 1 && (
                  <button onClick={() => setStep(s => s - 1)} className={`px-4 py-3 rounded-xl border text-[13px] font-bold ${isDark ? "border-white/[0.06] text-zinc-300" : "border-slate-200 text-slate-600"}`}>
                    رجوع
                  </button>
                )}
                {step < 3 && (
                  <button onClick={() => setStep(s => s + 1)}
                    disabled={step === 1 && !step1Valid}
                    className={`flex-1 py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all ${(step === 1 && !step1Valid) ? isDark ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed" : "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-gradient-to-r from-[#0B3D2E] to-[#1a6b50] text-white shadow-md"}`}>
                    التالي <ArrowRight size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Step 4 — Generated Notice */}
          {step === 4 && selectedTrack && (
            <div className="space-y-4">
              {/* Track badge */}
              <div className={`flex items-center gap-3 p-4 rounded-2xl border ${TRACK_CONFIG[selectedTrack].bg} ${TRACK_CONFIG[selectedTrack].borderColor}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${TRACK_CONFIG[selectedTrack].bg}`}>
                  {(() => { const Icon = TRACK_CONFIG[selectedTrack].icon; return <Icon size={18} className={TRACK_CONFIG[selectedTrack].color} weight="duotone" />; })()}
                </div>
                <div>
                  <p className={`text-[11px] font-black uppercase tracking-wider ${TRACK_CONFIG[selectedTrack].color}`}>{TRACK_CONFIG[selectedTrack].stage}</p>
                  <p className={`text-[14px] font-bold ${isDark ? "text-zinc-200" : "text-slate-800"}`}>{TRACK_CONFIG[selectedTrack].label}</p>
                </div>
              </div>

              {/* Notice text */}
              <div className={`${card} p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText size={15} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                    <span className={`text-[12px] font-bold ${isDark ? "text-zinc-400" : "text-slate-600"}`}>نص الوثيقة</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleCopy}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${copied ? "bg-emerald-500/10 text-emerald-500" : isDark ? "bg-white/[0.06] text-zinc-400 hover:text-zinc-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                      <Copy size={12} /> {copied ? "تم النسخ!" : "نسخ"}
                    </button>
                    <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-400 hover:text-zinc-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                      <Download size={12} /> تصدير
                    </button>
                  </div>
                </div>
                <AiResultActions
                  text={noticeText}
                  filename={`debt-collection-${selectedTrack}`}
                  showShare
                  className="mb-3"
                />
                <textarea
                  value={noticeText}
                  onChange={e => setNoticeText(e.target.value)}
                  rows={14}
                  className={`w-full text-[12px] leading-relaxed rounded-xl border p-3 resize-y outline-none font-mono ${isDark ? "border-white/[0.06] bg-zinc-800/80 text-zinc-200" : "border-slate-100 bg-slate-50 text-slate-700"}`}
                />
                <p className={`text-[10px] mt-2 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>يمكنك تعديل النص مباشرة قبل الإرسال.</p>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-3">
                <Link href="/ai/contracts" className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-[12px] font-bold transition-colors ${isDark ? "border-white/[0.06] text-zinc-300 hover:bg-white/[0.04]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <Scales size={14} /> صياغة عقد جديد
                </Link>
                {selectedTrack !== "court_order" && (
                  <button onClick={() => { const next: Record<Track, Track | null> = { friendly: "formal", formal: "pre_court", pre_court: "court_order", court_order: null }; const n = next[selectedTrack]; if (n) handleSelectTrack(n); }}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white text-[12px] font-bold shadow-md">
                    تصعيد للمرحلة التالية <ArrowRight size={14} />
                  </button>
                )}
                {selectedTrack === "court_order" && (
                  <div className={`flex items-center gap-2 px-3 py-3 rounded-xl text-center text-[11px] font-bold ${isDark ? "bg-red-900/20 text-red-400 border border-red-900/30" : "bg-red-50 text-red-600 border border-red-200"}`}>
                    <Warning size={13} weight="fill" /> هذه آخر مرحلة — قدِّم الطلب للمحكمة
                  </div>
                )}
              </div>

              <button onClick={reset} className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
                <ArrowCounterClockwise size={13} /> بدء حالة تحصيل جديدة
              </button>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
