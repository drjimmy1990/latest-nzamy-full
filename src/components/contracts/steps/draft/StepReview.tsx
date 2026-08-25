"use client";

import { motion } from "framer-motion";
import {
  CheckCircle, Warning, XCircle, ShieldCheck, Sparkle,
} from "@phosphor-icons/react";
import { CONTRACT_TYPES } from "@/components/contracts/constants";

interface StepReviewProps {
  isDark: boolean;
  contractType: string;
  clauses: { id: number; title: string; checked: boolean }[];
  additionalClauses: string[];
}

// ─── Check items definition ───────────────────────────────────────────────────

type CheckStatus = "ok" | "warn" | "error";

interface CheckItem {
  id: string;
  label: string;
  detail: string;
  status: CheckStatus;
}

// Genuine deterministic logic over real cross-step state (contractType,
// clauses, additionalClauses) — kept from the original implementation.
// Task C2 stripped only the theatre around it: the staggered "AI scanning"
// reveal and the canned PROPOSED_FIXES text (removed below).
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
      // hasParties reads the "الطرف الأول والثاني" *clause checkbox*
      // (clauses.id === 1) — whether that clause is included in the draft —
      // not whether party1Data/party2Data were actually filled in on the
      // parties step. The two are unrelated; do not imply the party records
      // themselves are populated here.
      detail: hasParties
        ? "بند الأطراف مُفعّل — سيُدرَج ضمن نص العقد"
        : "بند الأطراف غير مفعّل — قد يفقد العقد حجيته القانونية",
      status: hasParties ? "ok" : "error",
    },
    {
      id: "type",
      label: "نوع العقد",
      detail: hasType
        ? `نوع العقد محدد — ${CONTRACT_TYPES.find(c => c.id === contractType)?.title ?? contractType}`
        : "نوع العقد غير محدد (اختياري) — سيستخدم الفريق نموذجاً عاماً عند الصياغة",
      status: hasType ? "ok" : "warn",
    },
    {
      id: "scope",
      label: "نطاق العمل والالتزامات",
      detail: hasScope
        ? "نطاق العمل محدد بوضوح"
        : "بند نطاق العمل غير مفعّل — خطر نزاع على الصلاحيات",
      status: hasScope ? "ok" : "error",
    },
    {
      id: "payment",
      label: "المقابل المالي",
      detail: hasPayment
        ? "بند المقابل المالي وطريقة الدفع محدد"
        : "بند المقابل المالي غير موجود — يُوصى بتفعيله",
      status: hasPayment ? "ok" : "warn",
    },
    {
      id: "termination",
      label: "الإنهاء والفسخ",
      detail: hasTermination
        ? "آلية الإنهاء والفسخ محددة بوضوح"
        : "بند الإنهاء غير موجود — قد يؤدي لنزاع عند انتهاء العلاقة",
      status: hasTermination ? "ok" : "warn",
    },
    {
      id: "dispute",
      label: "القانون الحاكم وحل النزاعات",
      detail: hasDispute
        ? "طريقة حل النزاعات والقانون الحاكم محددان"
        : "مؤشر حل النزاعات غائب — يُوصى بالإضافة وفق أفضل الممارسات",
      status: hasDispute ? "ok" : "warn",
    },
    {
      // This is a count of ticked checkboxes (activeCount >= 5), nothing
      // more — it cannot establish regulatory compliance, so neither the
      // label nor the detail text claims that.
      id: "compliance",
      label: "تغطية البنود الأساسية",
      detail: activeCount >= 5
        ? "عدد البنود المفعّلة كافٍ لتغطية أساسيات العقد"
        : "عدد البنود أقل من المعتاد — يُوصى بمراجعة اكتمال العقد",
      status: activeCount >= 5 ? "ok" : "warn",
    },
    {
      id: "force",
      label: "القوة القاهرة",
      detail: hasForce
        ? "بند القوة القاهرة مُدرَج"
        : "بند القوة القاهرة غير موجود (اختياري) — يُوصى به لحماية الطرفين",
      status: hasForce ? "ok" : "warn",
    },
    {
      id: "ip",
      label: "الملكية الفكرية",
      detail: hasIP
        ? "بند الملكية الفكرية مُدرَج"
        : "الملكية الفكرية غير محددة — قد يكون مهماً حسب طبيعة العقد",
      status: hasIP ? "ok" : "warn",
    },
  ];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StepReview({ isDark, contractType, clauses, additionalClauses }: StepReviewProps) {
  const checks = buildChecks(contractType, clauses, additionalClauses);

  const activeCount = clauses.filter(c => c.checked).length + additionalClauses.length;
  const contractLabel = CONTRACT_TYPES.find(c => c.id === contractType)?.title ?? "عام";

  const errors   = checks.filter(c => c.status === "error");
  const warnings = checks.filter(c => c.status === "warn");
  const passed   = checks.filter(c => c.status === "ok");
  // Ratio of checklist items passed — a proxy for clause coverage, not a
  // legal-quality score. Labelled "نسبة اكتمال البنود" below, never "جودة".
  const score    = Math.round((passed.length / checks.length) * 100);

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  const statusIcon = (s: CheckStatus) => {
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
          فحص اكتمال <strong className={isDark ? "text-zinc-200" : "text-slate-700"}>عقد {contractLabel}</strong>
          {" "}— يحتوي على{" "}
          <strong className={isDark ? "text-zinc-200" : "text-slate-700"}>{activeCount} بند</strong>
          {additionalClauses.length > 0 && <>{" "}منها <strong>{additionalClauses.length}</strong> بند مخصص</>}.
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "bg-royal/10" : "bg-royal/8"}`}>
          <ShieldCheck size={20} weight="duotone" className="text-royal" />
        </div>
        <div>
          <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
            تقرير اكتمال العقد
          </p>
          <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
            {passed.length} عنصر ✅ · {warnings.length} تحذير ⚠️ · {errors.length} خطأ ❌
          </p>
        </div>
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
            نسبة اكتمال البنود
          </p>
        </div>
      </div>

      {/* Check list */}
      <div className={`${card} divide-y ${isDark ? "divide-white/[0.04]" : "divide-slate-50"}`}>
        {checks.map((check) => (
          <div key={check.id} className="flex items-center gap-3 px-4 py-3">
            {statusIcon(check.status)}
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
                {check.label}
              </p>
              <p className={`text-[11px] mt-0.5 ${
                check.status === "ok"
                  ? isDark ? "text-zinc-600" : "text-slate-400"
                  : check.status === "error"
                  ? "text-red-500"
                  : "text-amber-500"
              }`}>
                {check.detail}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Summary banner */}
      {errors.length === 0 && warnings.length === 0 ? (
        <div className={`flex items-center gap-3 p-4 rounded-2xl border ${
          isDark ? "border-emerald-500/20 bg-emerald-500/8" : "border-emerald-200 bg-emerald-50"
        }`}>
          <CheckCircle size={20} weight="fill" className="text-emerald-500 flex-shrink-0" />
          <p className={`text-[13px] font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
            العقد اجتاز جميع فحوصات الاكتمال
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
    </motion.div>
  );
}
