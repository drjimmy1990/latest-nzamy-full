"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useRef } from "react";
import {
  Storefront, FileText, Warning, UsersThree, HouseSimple,
  ArrowRight, ArrowLeft, Check, X, Copy, DownloadSimple,
  Sparkle, CloudArrowUp, ChatCircleDots, Scales,
  ClipboardText, HandPointing, Receipt, UserCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { VoiceInput } from "@/components/ui/VoiceInput";
import AiResultActions from "@/components/AiResultActions";
import BetaReviewGate from "@/components/BetaReviewGate";
import { useUser } from "@/hooks/useUser";
import { createWorkflowId, saveWorkflowRequest } from "@/lib/workflowStore";

// ─── Situations ───────────────────────────────────────────────────────────────

const SITUATIONS = [
  {
    id: "labor_contract",
    icon: UsersThree,
    title: "عقد عامل / موظف",
    desc: "عقد عمل بسيط لعامل في المحل",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    questions: [
      { label: "اسم صاحب العمل والمحل", placeholder: "مثال: محمد العتيبي — بقالة النور" },
      { label: "اسم العامل والجنسية", placeholder: "مثال: أحمد علي — مصري" },
      { label: "الراتب الشهري ونوع العمل", placeholder: "مثال: ١٥٠٠ ريال — عامل بقالة" },
    ],
  },
  {
    id: "warning_letter",
    icon: Warning,
    title: "إنذار موظف",
    desc: "خطاب إنذار رسمي بسبب تأخر أو مخالفة",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    questions: [
      { label: "اسم الموظف والمنشأة", placeholder: "مثال: خالد أحمد — مغسلة السعادة" },
      { label: "سبب الإنذار", placeholder: "مثال: التغيب عن العمل ٣ أيام بدون إذن" },
      { label: "تاريخ المخالفة", placeholder: "مثال: ١٥ / ٠٣ / ١٤٤٦" },
    ],
  },
  {
    id: "complaint_reply",
    icon: ClipboardText,
    title: "رد على شكوى",
    desc: "رد رسمي على شكوى موظف أو جهة حكومية",
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    questions: [
      { label: "اسم المنشأة وطبيعة نشاطها", placeholder: "مثال: ورشة التميز للسيارات" },
      { label: "موضوع الشكوى المقدمة ضدك", placeholder: "مثال: الادعاء بعدم صرف الراتب" },
      { label: "ردك ووجهة نظرك باختصار", placeholder: "مثال: تم صرف الراتب في ١٠ الشهر بالتحويل" },
    ],
  },
  {
    id: "rent_contract",
    icon: HouseSimple,
    title: "عقد إيجار محل",
    desc: "عقد تأجير أو استئجار محل تجاري بسيط",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    questions: [
      { label: "اسم المؤجر والمستأجر", placeholder: "مثال: سعود الشمري (مؤجر) — فهد العنزي (مستأجر)" },
      { label: "الموقع وطبيعة المحل", placeholder: "مثال: شارع الأمير محمد — بقالة ٦٠م²" },
      { label: "قيمة الإيجار السنوي ومدة العقد", placeholder: "مثال: ٣٦٠٠٠ ريال — سنة واحدة" },
    ],
  },
  {
    id: "service_contract",
    icon: Receipt,
    title: "عقد خدمة",
    desc: "اتفاقية خدمة أو صيانة أو توريد بسيطة",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    questions: [
      { label: "الطرف المقدم والمتلقي للخدمة", placeholder: "مثال: شركة التقنية (مقدم) — مطعم النجوم (متلقي)" },
      { label: "نوع الخدمة وتفاصيلها", placeholder: "مثال: صيانة أجهزة الكمبيوتر شهرياً" },
      { label: "قيمة الخدمة والمدة", placeholder: "مثال: ٥٠٠ ريال شهرياً — ١٢ شهراً" },
    ],
  },
  {
    id: "consultation",
    icon: UserCircle,
    title: "استشارة سريعة",
    desc: "سؤال قانوني بسيط — إجابة واضحة وعملية",
    color: "text-[#C8A762]",
    bg: "bg-[#C8A762]/10",
    border: "border-[#C8A762]/30",
    questions: [
      { label: "ما مجال سؤالك؟", placeholder: "مثال: عمالي / إيجار / شكوى / عقد" },
      { label: "اشرح موقفك باختصار", placeholder: "مثال: عاملي طلب مني صك إقامة وأنا ما عندي..." },
      { label: "ما الذي تريد معرفته بالتحديد؟", placeholder: "مثال: هل أنا ملزم؟ وما العقوبة لو ما سوّيت؟" },
    ],
  },
];

// ─── Dynamic output builder ───────────────────────────────────────────────────
function buildOutput(situationId: string, answers: string[]): string {
  const [a1 = "[الطرف الأول]", a2 = "[الطرف الثاني]", a3 = "[التفاصيل]"] = answers;
  const date = new Intl.DateTimeFormat("ar-SA", { dateStyle: "long" }).format(new Date());

  if (situationId === "labor_contract") return `بسم الله الرحمن الرحمن الرحيم\n\nعقد عمل\n\nالطرف الأول (صاحب العمل): ${a1}\nالسجل التجاري: [               ]\nالعنوان: [               ]\n\nالطرف الثاني (العامل): ${a2}\nرقم الإقامة: [               ]\n\nاتفق الطرفان بتاريخ ${date} على:\n\nأولاً: طبيعة العمل\n${a3 || "عمل تجاري بسيط"} — يلتزم الطرف الثاني بأدائه بأمانة وإتقان.\n\nثانياً: الراتب\nيتقاضى الطرف الثاني راتباً شهرياً متفقاً عليه.\n\nثالثاً: مدة العقد\nسنة هجرية قابلة للتجديد.\n\nرابعاً: القانون الحاكم\nيخضع هذا العقد لنظام العمل السعودي.\n\nتوقيع الطرف الأول: _______________   التاريخ: _______________\nتوقيع الطرف الثاني: _______________  التاريخ: _______________`;

  if (situationId === "warning_letter") return `بسم الله الرحمن الرحيم\n\nإنذار رسمي\n\nإلى: ${a1}\nالتاريخ: ${date}\n\nيُبلَّغ بأن إدارة المنشأة رصدت المخالفة التالية:\n${a2}\n\nتاريخ المخالفة: ${a3}\n\nنطلب منكم تصحيح هذا الوضع فور الاطلاع. وفي حال التكرار، ستُتخذ الإجراءات النظامية اللازمة وفق نظام العمل السعودي.\n\nالإدارة: _______________   التوقيع: _______________`;

  if (situationId === "complaint_reply") return `بسم الله الرحمن الرحيم\n\nرد على شكوى\n\nالمنشأة: ${a1}\nتاريخ الرد: ${date}\n\nموضوع الشكوى: ${a2}\n\nرد المنشأة:\n${a3}\n\nنؤكد التزامنا الكامل بأحكام نظام العمل السعودي وحقوق الموظفين، ونُعبّر عن استعدادنا للتعاون مع الجهات المختصة.\n\nالمدير المفوض: _______________   التاريخ: _______________`;

  if (situationId === "rent_contract") return `بسم الله الرحمن الرحيم\n\nعقد إيجار محل تجاري\n\nالطرف الأول (المؤجر): ${a1.split("(")[0].trim()}\nالطرف الثاني (المستأجر): ${a1.includes("(") ? a1.split("(")[1]?.replace(")", "").trim() : "[المستأجر]"}\n\nالمحل: ${a2}\nقيمة الإيجار والمدة: ${a3}\nتاريخ التعاقد: ${date}\n\nاتفق الطرفان على الشروط المتعلقة بالإيجار المذكورة أعلاه ويلتزمان بأحكام نظام الإيجار السعودي.\n\nتوقيع المؤجر: _______________   التاريخ: _______________\nتوقيع المستأجر: _______________  التاريخ: _______________`;

  if (situationId === "service_contract") return `بسم الله الرحمن الرحيم\n\nعقد خدمة\n\nالطرف المقدم: ${a1.split("-")[0]?.trim() || a1}\nالطرف المتلقي: ${a1.split("-")[1]?.trim() || "[المتلقي]"}\n\nالخدمة المتفق عليها: ${a2}\nالقيمة والمدة: ${a3}\nتاريخ العقد: ${date}\n\nيلتزم الطرف المقدم بأداء الخدمة بجودة واحترافية، والطرف المتلقي بالسداد في المواعيد المتفق عليها.\n\nتوقيع الطرف الأول: _______________   التاريخ: _______________\nتوقيع الطرف الثاني: _______________  التاريخ: _______________`;

  // consultation
  return `بسم الله الرحمن الرحيم\n\nرأي قانوني أولي\n\nالمجال: ${a1}\nالموقف: ${a2}\nالسؤال: ${a3}\n\n— هذا رأي أولي مبني على المعلومات المُقدَّمة. يُنصح بمراجعة محامٍ معتمد للتحقق من تفاصيل وضعك القانوني.\n\nالتاريخ: ${date}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MicroBusinessPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [step, setStep] = useState<"pick" | "questions" | "result">("pick");
  const [selected, setSelected] = useState<typeof SITUATIONS[0] | null>(null);
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);
  const [file, setFile] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [generatedOutput, setGeneratedOutput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const card = isDark
    ? "bg-zinc-900 border border-white/[0.06] rounded-2xl"
    : "bg-white border border-zinc-200/70 rounded-2xl";

  function pickSituation(s: typeof SITUATIONS[0]) {
    setSelected(s);
    setAnswers(["", "", ""]);
    setFile(null);
    setStep("questions");
  }

  async function generate() {
    setGenerating(true);
    await new Promise(r => setTimeout(r, 2500));
    const output = buildOutput(selected?.id ?? "consultation", answers);
    setGeneratedOutput(output);
    const id = createWorkflowId("MICRO");
    saveWorkflowRequest({
      id,
      type: selected?.id === "labor_contract" ? "ai_draft" : "service",
      title: selected?.title ?? "Micro legal output",
      description: output,
      requester: {
        name: user.name,
        role: user.userType,
        tier: user.tier,
        businessRole: user.businessRole,
      },
      receiver: selected?.id === "consultation" ? "lawyer" : "ai_workspace",
      status: selected?.id === "consultation" ? "pending_assignment" : "completed",
      payment: {
        amount: 0,
        status: "not_required",
      },
      sourcePath: "/ai/micro",
      metadata: {
        situationId: selected?.id ?? null,
        fileName: file,
        answer1: answers[0],
        answer2: answers[1],
        answer3: answers[2],
      },
      auditEvent: "micro_ai_output_saved",
    });
    setSavedId(id);
    setGenerating(false);
    setStep("result");
  }

  function copyText() {
    navigator.clipboard.writeText(generatedOutput);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canGenerate = selected?.id === "consultation"
    ? answers[1].trim().length > 10
    : answers.filter(a => a.trim().length > 2).length >= 2;

  return (
    <div className={`p-5 md:p-7 max-w-3xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Storefront size={20} weight="duotone" className="text-[#C8A762]" />
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>المساعد القانوني للمنشآت الصغيرة</h1>
          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400">٢٥٠ ريال</span>
        </div>
        <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          عقود · إنذارات · ردود شكاوى — بدون تعقيد قانوني · ٣ خطوات فقط
        </p>
      </div>

      {/* Progress stepper */}
      <div className={`${card} px-5 py-3 shadow-sm`}>
        <div className="flex items-center gap-2">
          {[
            { label: "اختر الحالة", num: 1, key: "pick" },
            { label: "أجب على الأسئلة", num: 2, key: "questions" },
            { label: "استلم المستند", num: 3, key: "result" },
          ].map((s, i) => {
            const steps = ["pick", "questions", "result"];
            const cur = steps.indexOf(step);
            const isActive = s.key === step;
            const isDone = steps.indexOf(s.key) < cur;
            return (
              <div key={s.key} className="flex items-center gap-1.5 flex-1">
                <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold flex-shrink-0 transition-all ${
                  isDone ? "bg-emerald-500 text-white" :
                  isActive ? "bg-[#0B3D2E] text-white" :
                  isDark ? "bg-zinc-800 text-zinc-500" : "bg-zinc-100 text-zinc-400"
                }`}>
                  {isDone ? <Check size={12} weight="bold" /> : s.num}
                </div>
                <span className={`text-[11px] hidden sm:block ${isActive ? (isDark ? "text-white font-semibold" : "text-zinc-900 font-semibold") : isDark ? "text-zinc-600" : "text-zinc-400"}`}>{s.label}</span>
                {i < 2 && <div className={`flex-1 h-px mx-1 ${isDone ? "bg-emerald-500/40" : isDark ? "bg-zinc-800" : "bg-zinc-200"}`} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step 1: اختيار الحالة ── */}
      {step === "pick" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SITUATIONS.map(s => {
            const Icon = s.icon;
            return (
              <motion.button key={s.id} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={() => pickSituation(s)}
                className={`rounded-2xl border p-5 text-start transition-all ${isDark ? `border-white/[0.07] hover:${s.border} hover:${s.bg}` : `border-zinc-200 hover:${s.border} hover:${s.bg}`}`}>
                <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${s.bg} ${s.border} border`}>
                  <Icon size={20} weight="duotone" className={s.color} />
                </div>
                <p className={`font-bold text-[14px] mb-1 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{s.title}</p>
                <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.desc}</p>
                <div className={`mt-3 flex items-center gap-1 text-[11px] font-semibold ${s.color}`}>
                  <span>ابدأ الآن</span>
                  <ArrowLeft size={12} />
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      {/* ── Step 2: الأسئلة ── */}
      {step === "questions" && selected && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Back */}
          <button onClick={() => setStep("pick")} className={`flex items-center gap-1.5 text-[12px] ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-zinc-400 hover:text-zinc-700"}`}>
            <ArrowRight size={14} /> تغيير الحالة
          </button>

          {/* Situation badge */}
          <div className={`${card} p-4 shadow-sm`}>
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${selected.bg} ${selected.border} border flex-shrink-0`}>
                <selected.icon size={20} weight="duotone" className={selected.color} />
              </div>
              <div>
                <p className={`font-bold ${isDark ? "text-zinc-100" : "text-zinc-800"}`}>{selected.title}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{selected.desc}</p>
              </div>
            </div>
          </div>

          {/* Questions */}
          <div className={`${card} p-5 shadow-sm space-y-4`}>
            <p className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
              أجب على هذه الأسئلة — AI سيُنشئ المستند فوراً
            </p>
            {selected.questions.map((q, idx) => (
              <div key={idx}>
                <p className={`text-[13px] font-semibold mb-2 ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                  {idx + 1}. {q.label}
                </p>
                <div className="relative">
                  <input
                    type="text"
                    value={answers[idx]}
                    onChange={e => {
                      const next = [...answers];
                      next[idx] = e.target.value;
                      setAnswers(next);
                    }}
                    placeholder={q.placeholder}
                    className={`w-full rounded-xl border px-4 py-3 pe-14 text-[13px] outline-none ${isDark ? "border-white/[0.08] bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-600 focus:border-[#C8A762]/40" : "border-zinc-200 bg-zinc-50 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/30"}`}
                  />
                  <div className="absolute inset-y-0 end-3 flex items-center">
                    <VoiceInput onTranscript={t => {
                      const next = [...answers];
                      next[idx] = answers[idx] ? `${answers[idx]} ${t}` : t;
                      setAnswers(next);
                    }} compact />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Optional: upload supporting doc */}
          <div className={`${card} p-4 shadow-sm`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CloudArrowUp size={15} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                <p className={`text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>ارفع مستنداً داعماً (اختياري)</p>
              </div>
              {file && (
                <div className={`flex items-center gap-1.5 text-[11px] ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                  <Check size={11} weight="bold" />
                  <span className="truncate max-w-[140px]">{file}</span>
                  <button onClick={() => setFile(null)}><X size={11} /></button>
                </div>
              )}
            </div>
            {!file && (
              <>
                <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.png"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f.name); }} />
                <button onClick={() => fileRef.current?.click()}
                  className={`mt-2 w-full rounded-xl border-2 border-dashed py-2.5 text-center text-[12px] transition-colors ${isDark ? "border-white/[0.06] text-zinc-600 hover:border-white/[0.12]" : "border-zinc-200 text-zinc-400 hover:border-zinc-300"}`}>
                  اسحب وأفلت أو اضغط للرفع — PDF · Word · صور
                </button>
              </>
            )}
          </div>

          {/* Generate button */}
          <motion.button
            whileHover={{ scale: canGenerate ? 1.01 : 1 }}
            whileTap={{ scale: canGenerate ? 0.97 : 1 }}
            onClick={generate}
            disabled={!canGenerate || generating}
            className={`w-full rounded-2xl py-4 text-[14px] font-bold transition-all flex items-center justify-center gap-2 ${
              canGenerate
                ? "bg-gradient-to-l from-[#0B3D2E] to-emerald-700 text-white shadow-lg shadow-emerald-900/20"
                : isDark ? "bg-zinc-800 text-zinc-600 cursor-not-allowed" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
            }`}>
            {generating ? (
              <>
                <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white" />
                جارٍ الإنشاء...
              </>
            ) : (
              <>
                <Sparkle size={16} weight="fill" />
                أنشئ المستند
              </>
            )}
          </motion.button>
        </motion.div>
      )}

      {/* ── Step 3: النتيجة ── */}
      {step === "result" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          {/* Success banner */}
          <div className={`rounded-2xl p-4 flex items-center gap-3 ${isDark ? "bg-emerald-900/20 border border-emerald-700/25" : "bg-emerald-50 border border-emerald-200"}`}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 flex-shrink-0">
              <Check size={18} weight="bold" className="text-white" />
            </div>
            <div>
              <p className={`font-bold text-[13px] ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>تم إنشاء المستند بنجاح ✓</p>
              <p className={`text-[11px] ${isDark ? "text-emerald-500" : "text-emerald-600"}`}>راجعه وعدّل أي بيانات بين الأقواس [ ] قبل التوقيع</p>
              {savedId && <p className="mt-1 text-[10px] font-bold text-emerald-500">تم الحفظ برقم: {savedId}</p>}
            </div>
          </div>

          <BetaReviewGate toolId="micro.result" toolName="مستند المنشأة الصغيرة" reviewScope="legal-data">
            {/* Document */}
            <div className={`${card} p-6 shadow-sm`}>
              <pre className={`whitespace-pre-wrap font-sans text-[13px] leading-[2] ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                {generatedOutput}
              </pre>
            </div>

            {/* Actions */}
            <div className="flex gap-3 flex-wrap">
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                onClick={copyText}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-bold transition-colors ${
                  copied
                    ? "bg-emerald-500 text-white"
                    : isDark ? "bg-zinc-800 text-zinc-200 border border-white/[0.07] hover:border-white/[0.14]" : "bg-zinc-100 text-zinc-700 border border-zinc-200 hover:border-zinc-300"
                }`}>
                {copied ? <><Check size={15} weight="bold" /> تم النسخ!</> : <><Copy size={15} /> نسخ النص</>}
              </motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-l from-[#0B3D2E] to-emerald-700 px-4 py-2.5 text-[13px] font-bold text-white shadow-md">
                <DownloadSimple size={15} weight="bold" /> تنزيل PDF
              </motion.button>
            </div>

            {/* Unified Result Actions */}
            <div className={`pt-3 border-t ${isDark ? "border-white/[0.05]" : "border-zinc-100"}`}>
              <AiResultActions
                text={generatedOutput}
                filename={`micro-${selected?.id ?? "doc"}`}
                showVault
                showHumanReview
                className="justify-start"
              />
            </div>
          </BetaReviewGate>

          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
            onClick={() => { setStep("pick"); setSelected(null); }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] border transition-colors ${isDark ? "border-white/[0.07] text-zinc-500 hover:text-zinc-300" : "border-zinc-200 text-zinc-400 hover:text-zinc-600"}`}>
            <ArrowRight size={14} /> مستند آخر
          </motion.button>

          {/* Upsell */}

          <div className={`rounded-2xl p-4 ${isDark ? "bg-[#C8A762]/5 border border-[#C8A762]/20" : "bg-amber-50 border border-amber-200"}`}>
            <div className="flex items-start gap-3">
              <Scales size={18} className="text-[#C8A762] flex-shrink-0 mt-0.5" weight="duotone" />
              <div>
                <p className={`font-bold text-[13px] mb-1 ${isDark ? "text-[#C8A762]" : "text-amber-800"}`}>تحتاج مساعدة محامي؟</p>
                <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  باقة الربع القانوني تمنحك ٤ استشارات مع محامٍ معتمد + مستندات غير محدودة خلال ٣ أشهر
                </p>
                <button className={`mt-2 text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>
                  تعرف على الباقة ←
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
