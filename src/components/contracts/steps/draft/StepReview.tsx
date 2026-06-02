"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle, Warning, XCircle, Spinner,
  DownloadSimple, ShieldCheck, CaretDown, Lightbulb, Sparkle,
} from "@phosphor-icons/react";
import { CONTRACT_TYPES } from "@/components/contracts/constants";

interface StepReviewProps {
  isDark: boolean;
  contractType: string;
  clauses: { id: number; title: string; checked: boolean }[];
  additionalClauses: string[];
  onGoToStep?: (step: string) => void;
}

// ─── Check items definition ───────────────────────────────────────────────────

type CheckStatus = "ok" | "warn" | "error" | "scanning";

interface CheckItem {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
  fixStep?: string; // which step to navigate to for fix
}

function buildChecks(
  contractType: string,
  clauses: { id: number; title: string; checked: boolean }[],
  additionalClauses: string[]
): CheckItem[] {
  const activeCount = clauses.filter(c => c.checked).length + additionalClauses.length;
  const hasParties   = clauses.find(c => c.id === 1)?.checked ?? false;
  const hasScope     = clauses.find(c => c.id === 2)?.checked ?? false;
  const hasPayment   = clauses.find(c => c.id === 3)?.checked ?? false;
  const hasTermination = clauses.find(c => c.id === 6)?.checked ?? false;
  const hasDispute   = clauses.find(c => c.id === 7)?.checked ?? false;
  const hasForce     = clauses.find(c => c.id === 8)?.checked ?? false;
  const hasIP        = clauses.find(c => c.id === 9)?.checked ?? false;
  const hasType      = !!contractType;

  return [
    {
      id: "parties",
      label: "بيانات الأطراف",
      detail: hasParties
        ? "بيانات الطرفين مُحددة — الاسم والهوية والعنوان"
        : "بند الأطراف غير مفعّل — قد يفقد العقد حجيته القانونية",
      status: hasParties ? "ok" : "error",
      fixStep: "clauses",
    },
    {
      id: "type",
      label: "نوع العقد",
      detail: hasType
        ? `نوع العقد محدد — ${CONTRACT_TYPES.find(c => c.id === contractType)?.title ?? contractType}`
        : "نوع العقد غير محدد (اختياري) — الذكاء الاصطناعي استخدم القالب العام",
      status: hasType ? "ok" : "warn",
      fixStep: "domain",
    },
    {
      id: "scope",
      label: "نطاق العمل والالتزامات",
      detail: hasScope
        ? "نطاق العمل محدد بوضوح"
        : "بند نطاق العمل غير مفعّل — خطر نزاع على الصلاحيات",
      status: hasScope ? "ok" : "error",
      fixStep: "clauses",
    },
    {
      id: "payment",
      label: "المقابل المالي",
      detail: hasPayment
        ? "بند المقابل المالي وطريقة الدفع محدد"
        : "بند المقابل المالي غير موجود — يُوصى بتفعيله",
      status: hasPayment ? "ok" : "warn",
      fixStep: "clauses",
    },
    {
      id: "termination",
      label: "الإنهاء والفسخ",
      detail: hasTermination
        ? "آلية الإنهاء والفسخ محددة بوضوح"
        : "بند الإنهاء غير موجود — قد يؤدي لنزاع عند انتهاء العلاقة",
      status: hasTermination ? "ok" : "warn",
      fixStep: "clauses",
    },
    {
      id: "dispute",
      label: "القانون الحاكم وحل النزاعات",
      detail: hasDispute
        ? "طريقة حل النزاعات والقانون الحاكم محددان"
        : "مؤشر حل النزاعات غائب — يُوصى بالإضافة وفق أفضل الممارسات",
      status: hasDispute ? "ok" : "warn",
      fixStep: "clauses",
    },
    {
      id: "compliance",
      label: "التوافق مع الأنظمة",
      detail: activeCount >= 5
        ? "البنود المفعّلة كافية — العقد متوافق مع المتطلبات التنظيمية الأساسية"
        : "عدد البنود أقل من المعتاد — يُوصى بمراجعة اكتمال العقد",
      status: activeCount >= 5 ? "ok" : "warn",
      fixStep: "clauses",
    },
    {
      id: "force",
      label: "القوة القاهرة",
      detail: hasForce
        ? "بند القوة القاهرة مُدرَج"
        : "بند القوة القاهرة غير موجود (اختياري) — يُوصى به لحماية الطرفين",
      status: hasForce ? "ok" : "warn",
      fixStep: "clauses",
    },
    {
      id: "ip",
      label: "الملكية الفكرية",
      detail: hasIP
        ? "بند الملكية الفكرية مُدرَج"
        : "الملكية الفكرية غير محددة — قد يكون مهماً حسب طبيعة العقد",
      status: hasIP ? "ok" : "warn",
      fixStep: "clauses",
    },
  ];
}

// ─── Proposed fixes per check ─────────────────────────────────────────────────

const PROPOSED_FIXES: Record<string, { title: string; text: string }> = {
  parties: {
    title: "بند مقترح — بيانات الأطراف",
    text: `الطرف الأول: [اسم الموكل] — رقم الهوية: [XXXXXXXXXX] — العنوان: [مدينة، شارع]، ويُشار إليه فيما يلي ب"الطرف الأول".
الطرف الثاني: [اسم الموكل عليه] — رقم السجل التجاري: [XXXXXXXX] — ويُشار إليه ب"الطرف الثاني".`,
  },
  scope: {
    title: "بند مقترح — نطاق العمل والالت挪امات",
    text: `يلتزم الطرف الثاني بتقديم الخدمات التالية: [تحديد الخدمات]. تكون الخدمات وفقاً للمعايير المهنية المتعارف عليها. لا يجوز لأي طرف تكليف الطرف الآخر بأي مهام خارج نطاق هذا العقد إلا باتفاق خطي موقع من كلاهما.`,
  },
  payment: {
    title: "بند مقترح — المقابل المالي",
    text: `يلتزم الطرف الأول بدفع مبلغ [المبلغ] ريالاً سعودياً بمجرد [الحدث المحدد]. يتضمن المبلغ ضريبة القيمة المضافة (إن انطبقت). يتم الدفع عبر [طريقة الدفع] إلى حساب رقم: [XXXXXX].`,
  },
  termination: {
    title: "بند مقترح — الإنهاء والفسخ",
    text: `يجوز لأي طرف إنهاء هذا العقد بإشعار خطي مسبق مدته [ثلاثون (30)] يوماً على الأقل. في حال الإخلال الجسيم بالتزامات العقد، يحق للطرف المتضرر فسخ العقد فوراً مع المطالبة بالتعويض.`,
  },
  dispute: {
    title: "بند مقترح — حل النزاعات",
    text: `يخضع هذا العقد لأحكام المملكة العربية السعودية. في حال نشوء أي نزاع يُلجأ الطرفان أولاً إلى الوساطة خلال [خمسة عشر] أيام عمل. فإن تعذر التسوية الودية، تختص محاكم [المدينة] بالفصل فيه.`,
  },
  compliance: {
    title: "مقترح — تفعيل بنود إضافية",
    text: "يُوصى بتفعيل بنود: الأطراف — نطاق العمل — المقابل المالي. هذه البنود الثلاثة ضرورية لحجية العقد أمام الجهات القضائية.",
  },
  force: {
    title: "بند مقترح — القوة القاهرة",
    text: `لا يُسأل أي طرف عن عدم تنفيذ التزاماته إذا حال دون ذلك ظرف من كوارث طبيعية، حروب، أو أوبئة، شريطة إخطار الطرف الآخر خلال [72] ساعة.`,
  },
  ip: {
    title: "بند مقترح — الملكية الفكرية",
    text: `جميع المخرجات والأعمال المنجزة خلال تنفيذ هذا العقد تكون ملكاً حصرياً ل[اسم الطرف المستفيد] بعد سداد كامل المستحقات. للطرف المنجز حق الاحتفاظ بنسخ لأغراض محفظته.`,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StepReview({ isDark, contractType, clauses, additionalClauses, onGoToStep }: StepReviewProps) {
  const [phase, setPhase] = useState<"scanning" | "done">("scanning");
  const [revealed, setRevealed] = useState(0);
  const [expandedFix, setExpandedFix] = useState<string | null>(null);
  const checks = buildChecks(contractType, clauses, additionalClauses);

  const activeCount = clauses.filter(c => c.checked).length + additionalClauses.length;
  const contractLabel = CONTRACT_TYPES.find(c => c.id === contractType)?.title ?? "عام";

  // Animate reveal
  useEffect(() => {
    setPhase("scanning");
    setRevealed(0);
    const interval = setInterval(() => {
      setRevealed(prev => {
        if (prev >= checks.length - 1) {
          clearInterval(interval);
          setTimeout(() => setPhase("done"), 300);
          return checks.length;
        }
        return prev + 1;
      });
    }, 340);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors   = checks.filter(c => c.status === "error");
  const warnings = checks.filter(c => c.status === "warn");
  const passed   = checks.filter(c => c.status === "ok");
  const score    = Math.round((passed.length / checks.length) * 100);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const statusIcon = (s: CheckStatus, i: number) => {
    if (i > revealed) return <div className={`w-5 h-5 rounded-full ${isDark ? "bg-zinc-800" : "bg-slate-100"}`} />;
    if (s === "ok")    return <CheckCircle size={18} weight="fill" className="text-emerald-500 flex-shrink-0" />;
    if (s === "error") return <XCircle     size={18} weight="fill" className="text-red-500 flex-shrink-0" />;
    return                   <Warning     size={18} weight="fill" className="text-amber-500 flex-shrink-0" />;
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

      {/* ── Context strip: what is being reviewed ── */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-[11px] ${
        isDark ? "border-white/[0.06] bg-white/[0.02]" : "border-slate-100 bg-slate-50/80"
      }`}>
        <Sparkle size={13} weight="fill" className="text-[#C8A762] flex-shrink-0" />
        <p className={isDark ? "text-zinc-500" : "text-slate-500"}>
          يتم مراجعة <strong className={isDark ? "text-zinc-200" : "text-slate-700"}>عقد {contractLabel}</strong>
          {" "}المؤلف في الخطوة ٦ — يحتوي على{" "}
          <strong className={isDark ? "text-zinc-200" : "text-slate-700"}>{activeCount} بنود</strong>
          {additionalClauses.length > 0 && <>{" "}وـ <strong>{additionalClauses.length}</strong> بند مخصص</>}.
          {" "}الذكاء الاصطناعي يفحص البنية القانونية والاكتمال التشريعي.
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-royal/10" : "bg-royal/8"}`}>
          {phase === "scanning"
            ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}>
                <Spinner size={20} className="text-royal" />
              </motion.div>
            : <ShieldCheck size={20} weight="duotone" className="text-royal" />
          }
        </div>
        <div>
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
            {phase === "scanning" ? "جارس؁ فحص العقد..." : "تقرير المراجعة الذكية"}
          </p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {phase === "scanning"
              ? `يتم فحص ${checks.length} عنصر...`
              : `${passed.length} عنصر ✅ · ${warnings.length} تحذير ⚠️ · ${errors.length} خطأ ❌`
            }
          </p>
        </div>
        {phase === "done" && (
          <div className={`mr-auto text-center px-3 py-1.5 rounded-xl border ${
            score >= 80
              ? isDark ? "border-emerald-500/30 bg-emerald-500/10" : "border-emerald-200 bg-emerald-50"
              : score >= 60
              ? isDark ? "border-amber-500/30 bg-amber-500/10" : "border-amber-200 bg-amber-50"
              : isDark ? "border-red-500/30 bg-red-500/10" : "border-red-200 bg-red-50"
          }`}>
            <p className={`text-[20px] font-black ${score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-red-500"}`}>
              {score}%
            </p>
            <p className={`text-[9px] font-bold ${score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-red-500"}`}>
              جودة العقد
            </p>
          </div>
        )}
      </div>

      {/* Scan list */}
      <div className={`${card} divide-y ${isDark ? "divide-white/[0.04]" : "divide-slate-50"}`}>
        {checks.map((check, i) => (
          <div key={check.id}>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: i <= revealed ? 1 : 0.25 }}
              className="flex items-center gap-3 px-4 py-3"
            >
              {statusIcon(check.status, i)}
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                  {check.label}
                </p>
                {i <= revealed && (
                  <motion.p
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className={`text-[11px] mt-0.5 ${
                      check.status === "ok"
                        ? isDark ? "text-zinc-600" : "text-slate-400"
                        : check.status === "error"
                        ? "text-red-500"
                        : "text-amber-500"
                    }`}
                  >
                    {check.detail}
                  </motion.p>
                )}
              </div>
              {/* Inline fix toggle (no navigation back) */}
              {i <= revealed && check.status !== "ok" && PROPOSED_FIXES[check.id] && (
                <button
                  onClick={() => setExpandedFix(expandedFix === check.id ? null : check.id)}
                  className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all ${
                    expandedFix === check.id
                      ? isDark ? "border-[#C8A762]/40 bg-[#C8A762]/10 text-[#C8A762]" : "border-amber-300 bg-amber-50 text-amber-700"
                      : isDark ? "border-white/[0.08] text-zinc-400 hover:text-[#C8A762] hover:border-[#C8A762]/30" : "border-slate-200 text-slate-500 hover:text-amber-600 hover:border-amber-300"
                  }`}
                >
                  <Lightbulb size={11} weight={expandedFix === check.id ? "fill" : "regular"} />
                  مقترح
                  <CaretDown size={9} className={`transition-transform ${expandedFix === check.id ? "rotate-180" : ""}`} />
                </button>
              )}
            </motion.div>

            {/* Inline proposed fix panel */}
            <AnimatePresence>
              {expandedFix === check.id && PROPOSED_FIXES[check.id] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className={`mx-4 mb-3 rounded-xl border p-3 space-y-2 ${
                    isDark ? "border-[#C8A762]/20 bg-[#C8A762]/5" : "border-amber-200 bg-amber-50/60"
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <Lightbulb size={12} weight="duotone" className="text-[#C8A762]" />
                      <p className={`text-[11px] font-bold ${isDark ? "text-[#C8A762]" : "text-amber-700"}`}>
                        {PROPOSED_FIXES[check.id].title}
                      </p>
                    </div>
                    <p className={`text-[11px] leading-relaxed font-mono p-2 rounded-lg ${
                      isDark ? "bg-zinc-800/60 text-zinc-300" : "bg-white text-zinc-700 border border-amber-100"
                    }`}>
                      {PROPOSED_FIXES[check.id].text}
                    </p>
                    <p className={`text-[9px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                      💡 هذا نص مقترح — دقّقه وعدّله حسب اتفاقك مع العميل قبل الإضافة
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Done — summary + actions */}
      <AnimatePresence>
        {phase === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {/* Summary banner */}
            {errors.length === 0 && warnings.length === 0 ? (
              <div className={`flex items-center gap-3 p-4 rounded-2xl border ${
                isDark ? "border-emerald-500/20 bg-emerald-500/8" : "border-emerald-200 bg-emerald-50"
              }`}>
                <CheckCircle size={20} weight="fill" className="text-emerald-500 flex-shrink-0" />
                <p className={`text-[13px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                  العقد اجتاز جميع الفحوصات — جاهز للتسليم
                </p>
              </div>
            ) : (
              <div className={`p-4 rounded-2xl border ${
                errors.length > 0
                  ? isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"
                  : isDark ? "border-amber-500/20 bg-amber-500/5" : "border-amber-100 bg-amber-50"
              }`}>
                <p className={`text-[13px] font-bold mb-2 ${errors.length > 0 ? "text-red-500" : "text-amber-600"}`}>
                  {errors.length > 0
                    ? `${errors.length} مشكلة تحتاج معالجة · ${warnings.length} تحذير للمراجعة`
                    : `${warnings.length} تحذير — يُوصى بالمراجعة قبل الإرسال`
                  }
                </p>
                <ul className="space-y-1">
                  {[...errors, ...warnings].map(c => (
                    <li key={c.id} className={`flex items-center gap-2 text-[11px] ${
                      c.status === "error"
                        ? isDark ? "text-red-400" : "text-red-600"
                        : isDark ? "text-amber-400" : "text-amber-700"
                    }`}>
                      <span>{c.status === "error" ? "❌" : "⚠️"}</span>
                      {c.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Download */}
            <div className="flex gap-3">
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#0B3D2E] px-5 py-3 text-[13px] font-bold text-white shadow-md">
                <DownloadSimple size={15} /> تنزيل Word
              </motion.button>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-5 py-3 text-[13px] font-semibold ${
                  isDark ? "border-white/[0.07] bg-zinc-800 text-zinc-300" : "border-zinc-200 bg-white text-zinc-600"
                }`}>
                <DownloadSimple size={15} /> تنزيل PDF
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
