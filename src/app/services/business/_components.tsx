"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Buildings, Scales, FileText, ShieldCheck, Gavel, Warning,
  Check, Clock, CurrencyDollar, CheckCircle, XCircle, ArrowLeft,
  SpinnerGap, WarningCircle,
} from "@phosphor-icons/react";
// The pickers below and the public endpoint that stores their answers read ONE
// list of company sizes and ONE list of legal needs, from the endpoint's own
// module. Two copies would drift, and the first sign of the drift would be
// leads silently failing validation with nobody watching.
// The module is pure (no Supabase, no next/*) precisely so it can be imported
// here, into the browser bundle.
import {
  COMPANY_SIZES, HONEYPOT_FIELD, LEGAL_NEEDS, LIMITS,
  validateBusinessLead,
  type CompanySizeId, type LegalNeedId,
} from "@/app/api/v1/leads/business-assessment/lead";

// ─── Data ─────────────────────────────────────────────────────────────────────

export const services = {
  ar: [
    { id: "labor", icon: Gavel, label: "قضايا العمال", tagline: "نزاعات مكتب العمل والفصل التعسفي", desc: "تمثيل في نزاعات العمال، شكاوى الفصل التعسفي، ومطالبات الرواتب — استشارة مباشرة وتمثيل قانوني كامل.", href: "/services/business/labor", price: "يبدأ من 299 ر.س / تمثيل من 2,000 ر.س", duration: "حسب القضية", color: "bg-orange-50 text-orange-600", borderHover: "hover:border-orange-200", features: ["شكاوى الفصل التعسفي ومكتب العمل", "مطالبات الرواتب والمستحقات", "تمثيل أمام هيئة تسوية النزاعات", "نظامي AI يحلل قضيتك أولاً"] },
    { id: "supplier-contracts", icon: FileText, label: "عقود الموردين", tagline: "صياغة ومراجعة عقود التوريد", desc: "صياغة ومراجعة عقود الموردين والمشتريات — حماية حقوقك، تحديد المسؤوليات، وضمان الالتزام بالتسليم.", href: "/services/business/supplier-contracts", price: "يبدأ من 499 ر.س", duration: "٢٤–٤٨ ساعة", color: "bg-gold/10 text-gold-dark", borderHover: "hover:border-gold/20", features: ["AI يكشف البنود المجحفة تلقائياً", "قوالب معتمدة لعقود التوريد", "محامٍ متخصص يراجع نهائياً", "أرشيف رقمي آمن للعقود"] },
    { id: "construction-contracts", icon: Buildings, label: "عقود المقاولات", tagline: "عقود البناء والمشاريع الإنشائية", desc: "صياغة ومراجعة عقود المقاولات والمشاريع الإنشائية — تحديد النطاق والجداول الزمنية وآليات فض النزاعات.", href: "/services/business/construction-contracts", price: "يبدأ من 699 ر.س", duration: "٢–٥ أيام", color: "bg-royal/5 text-royal", borderHover: "hover:border-royal/20", features: ["تحليل شروط FIDIC والعقود الدولية", "بنود الغرامات التأخيرية والضمانات", "آليات فض النزاعات المبكرة", "مراجعة مستجدات نظام المنافسات"] },
    { id: "fines-violations", icon: Warning, label: "غرامات ومخالفات", tagline: "الطعن في المخالفات والغرامات الحكومية", desc: "مساعدة الشركات في الطعن بالغرامات والمخالفات الحكومية — هيئة العمل، الزكاة والضريبة، البلديات، والجهات الرقابية.", href: "/services/business/fines", price: "يبدأ من 1,499 ر.س", duration: "حسب الجهة", color: "bg-red-50 text-red-600", borderHover: "hover:border-red-200", features: ["تحليل المخالفة وفرص الطعن", "إعداد لائحة الاعتراض الرسمية", "التفاوض مع الجهات الحكومية", "متابعة القضية حتى الحسم"] },
    { id: "debt-collection", icon: Scales, label: "تحصيل الديون وتسوية النزاعات", tagline: "استرداد الحقوق التجارية", desc: "تحصيل الديون التجارية وتسوية النزاعات المالية — مراسلات قانونية، أوامر أداء، وتمثيل أمام المحاكم التجارية.", href: "/services/business/debt-collection", price: "يبدأ من 999 ر.س + 5–10%", duration: "حسب النزاع", color: "bg-emerald-50 text-emerald-600", borderHover: "hover:border-emerald-200", features: ["إنذارات وخطابات مطالبة رسمية", "أوامر الأداء والتنفيذ القضائي", "تمثيل أمام المحاكم التجارية", "تحكيم تجاري للنزاعات الكبرى"] },
    { id: "company-formation", icon: ShieldCheck, label: "تأسيس الشركات", tagline: "تأسيس وهيكلة الكيانات القانونية", desc: "تأسيس الشركات وهيكلتها قانونياً — شركات ذات مسؤولية محدودة، مساهمة، وفروع الشركات الأجنبية في المملكة.", href: "/services/business/company-formation", price: "يبدأ من 1,999 ر.س", duration: "٣–١٠ أيام", color: "bg-purple-50 text-purple-600", borderHover: "hover:border-purple-200", features: ["تأسيس شركة ذات مسؤولية محدودة أو مساهمة", "هيكلة عقد التأسيس والنظام الأساسي", "فروع الشركات الأجنبية", "استشارة اختيار الهيكل القانوني الأمثل"] },
  ],
  en: [
    { id: "labor", icon: Gavel, label: "Labor Disputes", tagline: "Labor office disputes & unfair dismissal", desc: "Representation in labor disputes, unfair dismissal complaints, and salary claims — direct consultation and full legal representation.", href: "/services/business/labor", price: "Starting from 299 SAR / representation from 2,000 SAR", duration: "Case-dependent", color: "bg-orange-50 text-orange-600", borderHover: "hover:border-orange-200", features: ["Unfair dismissal & labor office claims", "Salary and entitlement recovery", "Representation before dispute settlement authority", "Nezamy AI analyzes your case first"] },
    { id: "supplier-contracts", icon: FileText, label: "Supplier Contracts", tagline: "Drafting & review of supply agreements", desc: "Draft and review supplier and procurement contracts — protect your rights, define responsibilities, and ensure delivery compliance.", href: "/services/business/supplier-contracts", price: "Starting from 499 SAR", duration: "24–48 hours", color: "bg-gold/10 text-gold-dark", borderHover: "hover:border-gold/20", features: ["AI auto-detects unfair clauses", "Approved templates for supply contracts", "Specialist lawyer final review", "Secure digital contract archive"] },
    { id: "construction-contracts", icon: Buildings, label: "Construction Contracts", tagline: "Building & infrastructure project contracts", desc: "Draft and review construction and infrastructure project contracts — scope, timelines, and dispute resolution mechanisms.", href: "/services/business/construction-contracts", price: "Starting from 699 SAR", duration: "2–5 days", color: "bg-royal/5 text-royal", borderHover: "hover:border-royal/20", features: ["FIDIC and international contract analysis", "Delay penalty and warranty clauses", "Early dispute resolution mechanisms", "Government tenders law compliance"] },
    { id: "fines-violations", icon: Warning, label: "Fines & Violations", tagline: "Contesting government fines & violations", desc: "Help businesses contest government fines and violations — Labor Authority, Zakat & Tax, Municipalities, and regulatory bodies.", href: "/services/business/fines", price: "Starting from 1,499 SAR", duration: "Authority-dependent", color: "bg-red-50 text-red-600", borderHover: "hover:border-red-200", features: ["Violation analysis and appeal opportunities", "Formal objection letter preparation", "Government negotiation & liaison", "Full case follow-up until resolution"] },
    { id: "debt-collection", icon: Scales, label: "Debt Collection & Dispute Settlement", tagline: "Commercial rights recovery", desc: "Collect commercial debts and settle financial disputes — legal correspondence, performance orders, and commercial court representation.", href: "/services/business/debt-collection", price: "Starting from 999 SAR + 5–10%", duration: "Dispute-dependent", color: "bg-emerald-50 text-emerald-600", borderHover: "hover:border-emerald-200", features: ["Official demand and notice letters", "Performance orders & judicial enforcement", "Commercial court representation", "Commercial arbitration for major disputes"] },
    { id: "company-formation", icon: ShieldCheck, label: "Company Formation", tagline: "Legal entity setup & structuring", desc: "Establish and legally structure companies — LLCs, joint stock companies, and foreign company branches in Saudi Arabia.", href: "/services/business/company-formation", price: "Starting from 1,999 SAR", duration: "3–10 days", color: "bg-purple-50 text-purple-600", borderHover: "hover:border-purple-200", features: ["LLC or joint stock company formation", "Articles of association structuring", "Foreign company branches", "Optimal legal structure consultation"] },
  ],
};

export const industries = {
  ar: ["تقنية المعلومات", "العقارات", "التجزئة والتجارة", "الرعاية الصحية", "الضيافة والسياحة", "الإنشاء والمقاولات", "التعليم", "الطاقة والتعدين"],
  en: ["Information Technology", "Real Estate", "Retail & Trade", "Healthcare", "Hospitality & Tourism", "Construction & Contracting", "Education", "Energy & Mining"],
};

// ─── ServiceCard ──────────────────────────────────────────────────────────────

export function ServiceCard({ service, index, isAr, isSelected, onSelect }: {
  service: typeof services.ar[0]; index: number; isAr: boolean; isSelected: boolean; onSelect: () => void;
}) {
  const Icon = service.icon;
  return (
    <motion.button
      initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 100, damping: 20 }}
      whileHover={{ y: -4 }} whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={`group relative w-full overflow-hidden rounded-[2rem] border p-6 text-start transition-all md:p-8 ${
        isSelected
          ? "border-royal/30 bg-royal text-white shadow-[0_20px_40px_-10px_rgba(11,61,46,0.3)]"
          : `border-slate-200/50 bg-white dark:border-white/10 dark:bg-dark-card ${service.borderHover} hover:shadow-[0_12px_32px_-8px_rgba(0,0,0,0.08)]`
      }`}
    >
      {isSelected && <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(200,167,98,0.15),transparent_60%)]" />}
      <div className="relative">
        <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${isSelected ? "bg-white/10" : service.color}`}>
          <Icon size={24} weight="duotone" />
        </span>
        <h3 className={`font-brand mt-4 text-lg font-bold ${isSelected ? "text-white" : "text-ink"}`}>{service.label}</h3>
        <p className={`mt-1 text-xs font-medium ${isSelected ? "text-white/70" : "text-gold-dark"}`}>{service.tagline}</p>
        <p className={`mt-3 text-sm leading-relaxed ${isSelected ? "text-white/80" : "text-ink-muted dark:text-gray-400"}`}>{service.desc}</p>
        <div className={`mt-4 flex items-center gap-4 text-xs ${isSelected ? "text-white/60" : "text-ink-faint dark:text-gray-500"}`}>
          <span className="flex items-center gap-1"><CurrencyDollar size={14} />{service.price}</span>
          <span className="flex items-center gap-1"><Clock size={14} />{service.duration}</span>
        </div>
      </div>
    </motion.button>
  );
}

// ─── AssessmentModal ──────────────────────────────────────────────────────────

/**
 * The free-assessment form — the primary call to action on this page, offered
 * twice on it (hero + closing CTA).
 *
 * WHAT CHANGED, AND WHY THE OLD SCREEN COULD NOT STAY
 * It used to collect the company name, size and legal needs and then throw all
 * of it away: there was no POST anywhere in this file. Step 3 span a spinner
 * captioned «نظامي AI يحلل احتياجاتك...» for exactly 1200ms and then showed a
 * subscription plan as though it were the analysis result. Nothing was
 * analysed, nothing was sent, and nobody was ever going to call the visitor
 * back.
 *
 * It now submits to POST /api/v1/leads/business-assessment — a public endpoint,
 * because a visitor to a marketing page is not signed in and «سجّل أولاً»
 * would kill the lead this form exists to capture. The three screen states are
 * real: «جارٍ الإرسال» while the request is in flight, an Arabic error with a
 * retry when the server says no, and the confirmation ONLY after a 2xx, showing
 * the reference the server actually wrote.
 *
 * The lists of company sizes and legal needs are imported from the endpoint's
 * own module so the pickers and the validator cannot drift apart.
 */

type SubmitState = "idle" | "submitting" | "error";

export function AssessmentModal({ onClose, isAr }: { onClose: () => void; isAr: boolean }) {
  const [step, setStep]                   = useState(1);
  const [companyName, setCompanyName]     = useState("");
  const [companySize, setCompanySize]     = useState<CompanySizeId | null>(null);
  const [selectedNeeds, setSelectedNeeds] = useState<LegalNeedId[]>([]);
  const [contactName, setContactName]     = useState("");
  const [contactPhone, setContactPhone]   = useState("");
  const [contactEmail, setContactEmail]   = useState("");
  const [notes, setNotes]                 = useState("");
  // Never filled by a human: the input is off-screen, unlabelled and
  // tabIndex={-1}. An autofilling bot fills it, and the server rejects that
  // submission.
  const [honeypot, setHoneypot]           = useState("");
  const [submitState, setSubmitState]     = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage]   = useState("");
  // Set from the server's response only. While it is null there is no
  // confirmation screen, which is what makes a false success unreachable.
  const [reference, setReference]         = useState<string | null>(null);

  const done = reference !== null;
  const submitting = submitState === "submitting";

  const toggleNeed = (need: LegalNeedId) =>
    setSelectedNeeds(prev => prev.includes(need) ? prev.filter(n => n !== need) : [...prev, need]);

  const handleSubmit = async () => {
    if (submitting) return;

    const payload = {
      companyName,
      companySize,
      needs: selectedNeeds,
      contactName,
      contactPhone,
      contactEmail,
      notes,
      [HONEYPOT_FIELD]: honeypot,
    };

    // Run the server's own validator first, so a fixable mistake is named in
    // exactly the words the server would have used — one dictionary of Arabic
    // messages, not two that slowly disagree.
    const check = validateBusinessLead(payload);
    if (!check.ok) {
      setErrorMessage(check.errors.join(" "));
      setSubmitState("error");
      return;
    }

    setSubmitState("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/v1/leads/business-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null) as { success?: boolean; reference?: string; error?: string } | null;

      if (!res.ok) {
        setErrorMessage(data?.error || "تعذّر إرسال طلبك، حاول مرة أخرى.");
        setSubmitState("error");
        return;
      }

      // `res.ok` alone is NOT enough to show a confirmation. A 200 carrying an
      // HTML body — a proxy or edge error page, a redirect to a login wall —
      // parses to null here, and treating that as success would put the
      // «تم استلام طلبك» screen in front of a visitor whose lead was never
      // written. The route answers a real write with `{ success: true }` and
      // nothing else does, so that is what the screen is gated on.
      if (data?.success !== true) {
        setErrorMessage("لم نتمكّن من تأكيد استلام طلبك. حاول مرة أخرى أو تواصل معنا مباشرة.");
        setSubmitState("error");
        return;
      }

      setReference(typeof data.reference === "string" ? data.reference : "");
      setSubmitState("idle");
    } catch {
      setErrorMessage("تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم حاول مرة أخرى.");
      setSubmitState("error");
    }
  };

  const canSubmit =
    contactName.trim().length >= 2 &&
    (contactPhone.trim().length > 0 || contactEmail.trim().length > 0);

  const inputClass =
    "w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-zinc-800 px-4 py-3 text-sm text-slate-800 dark:text-zinc-200 outline-none focus:border-[#0B3D2E]";
  const labelClass = "block text-sm font-semibold text-slate-700 dark:text-zinc-300 mb-1.5";

  // While a submission is in flight the modal stays put: closing it mid-write
  // would leave the visitor unable to tell whether their request was saved.
  const requestClose = () => { if (!submitting) onClose(); };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) requestClose(); }}
    >
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0, y: 16 }}
        className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-white/[0.08] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? "تقييم مجاني لاحتياجاتك القانونية" : "Free Legal Needs Assessment"}
            </h3>
            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-0.5">
              {done
                ? (isAr ? "تم إرسال الطلب" : "Request submitted")
                : (isAr ? `الخطوة ${step} من 3` : `Step ${step} of 3`)}
            </p>
          </div>
          <button onClick={requestClose} disabled={submitting}
            aria-label={isAr ? "إغلاق" : "Close"}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/[0.07] flex items-center justify-center text-slate-400 hover:text-slate-600 disabled:opacity-40">
            <XCircle size={15} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-slate-100 dark:bg-white/[0.04]">
          <motion.div className="h-full bg-[#0B3D2E]" animate={{ width: done ? "100%" : `${(step / 3) * 100}%` }} transition={{ duration: 0.4 }} />
        </div>

        <div className="px-6 py-6">
          <AnimatePresence mode="wait">
            {/* Step 1 — company */}
            {step === 1 && !done && (
              <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div>
                  <label className={labelClass}>
                    {isAr ? "اسم الشركة أو المنشأة" : "Company Name"}
                  </label>
                  <input value={companyName} onChange={e => setCompanyName(e.target.value)}
                    maxLength={LIMITS.companyName}
                    placeholder={isAr ? "مثال: شركة النخيل التجارية" : "E.g. Al Nakheel Trading Co."}
                    className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>
                    {isAr ? "حجم الشركة" : "Company Size"}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {COMPANY_SIZES.map(s => (
                      <button key={s.id} type="button" onClick={() => setCompanySize(s.id)}
                        className={`rounded-xl p-3 border text-center transition-all ${companySize === s.id ? "border-[#0B3D2E] bg-[#0B3D2E]/5 dark:bg-[#0B3D2E]/20" : "border-slate-200 dark:border-white/[0.08] hover:border-[#0B3D2E]/30"}`}>
                        <div className="text-sm font-bold text-slate-800 dark:text-zinc-200">{isAr ? s.labelAr : s.labelEn}</div>
                        <div className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">{isAr ? s.subAr : s.subEn}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <button type="button" disabled={companyName.trim().length < 2 || !companySize} onClick={() => setStep(2)}
                  className="w-full rounded-xl bg-[#0B3D2E] disabled:opacity-40 py-3 text-sm font-bold text-white transition mt-2">
                  {isAr ? "التالي ←" : "Next →"}
                </button>
              </motion.div>
            )}

            {/* Step 2 — legal needs */}
            {step === 2 && !done && (
              <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                  {isAr ? "ما هي أبرز احتياجاتك القانونية؟ (اختر ما ينطبق)" : "What are your main legal needs? (select all that apply)"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {LEGAL_NEEDS.map(need => (
                    <button key={need.id} type="button" onClick={() => toggleNeed(need.id)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border text-right text-[12px] font-medium transition-all ${
                        selectedNeeds.includes(need.id)
                          ? "border-[#0B3D2E] bg-[#0B3D2E]/5 dark:bg-[#0B3D2E]/20 text-[#0B3D2E] dark:text-emerald-400"
                          : "border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-zinc-400 hover:border-[#0B3D2E]/20"
                      }`}>
                      <span className={`w-4 h-4 rounded-full flex-shrink-0 border-2 flex items-center justify-center transition-colors ${selectedNeeds.includes(need.id) ? "border-[#0B3D2E] bg-[#0B3D2E]" : "border-slate-300 dark:border-zinc-600"}`}>
                        {selectedNeeds.includes(need.id) && <Check size={9} weight="bold" className="text-white" />}
                      </span>
                      {need.labelAr}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setStep(1)} className="flex-1 rounded-xl py-2.5 text-sm font-semibold bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-300">
                    {isAr ? "رجوع" : "Back"}
                  </button>
                  <button type="button" disabled={selectedNeeds.length === 0} onClick={() => setStep(3)}
                    className="flex-1 rounded-xl py-2.5 text-sm font-bold bg-[#0B3D2E] text-white disabled:opacity-40 transition">
                    {isAr ? "التالي ←" : "Next →"}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3 — how the team reaches you, then the real submit */}
            {step === 3 && !done && (
              <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                    {isAr ? "كيف يتواصل معك الفريق؟" : "How should the team reach you?"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    {isAr
                      ? "يراجع فريق نظامي طلبك ويتواصل معك بعرض السعر. التقييم مجاني ولا يُطلب منك أي دفع الآن."
                      : "The Nezamy team reviews your request and gets back to you with a quote. The assessment is free — no payment is requested now."}
                  </p>
                </div>

                {/* Honeypot. `sr-only` rather than a negative offset: an
                    absolutely-positioned element at left:-9999px can push the
                    document's own scroll width in an RTL layout, and `hidden`
                    is what a bot checks for. aria-hidden + tabIndex={-1} keep
                    it away from screen readers and the keyboard, so no real
                    visitor can reach it by any route. */}
                <input type="text" name={HONEYPOT_FIELD} value={honeypot} onChange={e => setHoneypot(e.target.value)}
                  tabIndex={-1} autoComplete="off" aria-hidden="true"
                  className="sr-only pointer-events-none" />

                <div>
                  <label className={labelClass}>{isAr ? "اسم مسؤول التواصل" : "Contact Person"}</label>
                  <input value={contactName} onChange={e => setContactName(e.target.value)}
                    maxLength={LIMITS.contactName} autoComplete="name"
                    placeholder={isAr ? "مثال: أحمد العتيبي" : "E.g. Ahmed Al-Otaibi"}
                    className={inputClass} />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>{isAr ? "رقم الجوال" : "Mobile"}</label>
                    <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                      inputMode="tel" dir="ltr" maxLength={LIMITS.contactPhone} autoComplete="tel"
                      placeholder="05XXXXXXXX"
                      className={`${inputClass} text-start`} />
                  </div>
                  <div>
                    <label className={labelClass}>{isAr ? "البريد الإلكتروني" : "Email"}</label>
                    <input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                      type="email" inputMode="email" dir="ltr" maxLength={LIMITS.contactEmail} autoComplete="email"
                      placeholder="name@company.com"
                      className={`${inputClass} text-start`} />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-zinc-500 -mt-2">
                  {isAr ? "يكفي أحدهما — جوال أو بريد إلكتروني." : "Either one is enough — mobile or email."}
                </p>

                <div>
                  <label className={labelClass}>{isAr ? "ملاحظات إضافية (اختياري)" : "Additional notes (optional)"}</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    rows={3} maxLength={LIMITS.notes}
                    placeholder={isAr ? "اكتب أي تفاصيل تساعد الفريق على فهم وضعك." : "Anything that helps the team understand your situation."}
                    className={`${inputClass} resize-none`} />
                </div>

                {submitState === "error" && errorMessage && (
                  <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2.5">
                    <WarningCircle size={16} weight="fill" className="text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs font-medium text-red-700 dark:text-red-300">{errorMessage}</p>
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => setStep(2)} disabled={submitting}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold bg-slate-100 dark:bg-white/[0.07] text-slate-600 dark:text-zinc-300 disabled:opacity-40">
                    {isAr ? "رجوع" : "Back"}
                  </button>
                  <button type="button" disabled={!canSubmit || submitting} onClick={handleSubmit}
                    className="flex-[2] inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold bg-[#0B3D2E] text-white disabled:opacity-40 transition">
                    {submitting && (
                      <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="inline-flex">
                        <SpinnerGap size={15} weight="bold" />
                      </motion.span>
                    )}
                    {submitting
                      ? (isAr ? "جارٍ إرسال طلبك..." : "Sending your request...")
                      : (isAr ? "إرسال الطلب" : "Submit Request")}
                  </button>
                </div>
              </motion.div>
            )}

            {/* Confirmation — reachable only after the server confirmed the write */}
            {done && (
              <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle size={26} weight="fill" className="text-emerald-500" />
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    {isAr ? "تم استلام طلبك" : "Your request has been received"}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                    {isAr ? `شكراً لك، ${companyName}.` : `Thank you, ${companyName}.`}
                  </p>
                </div>

                {reference && (
                  <div className="rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-zinc-800/60 px-4 py-3 text-center">
                    <div className="text-[11px] text-slate-400 dark:text-zinc-500">{isAr ? "رقم المرجع" : "Reference"}</div>
                    <div className="font-mono text-base font-bold tracking-widest text-[#0B3D2E] dark:text-emerald-400" dir="ltr">{reference}</div>
                  </div>
                )}

                <div className="rounded-2xl border border-[#0B3D2E]/20 bg-[#0B3D2E]/[0.03] dark:bg-[#0B3D2E]/10 p-5 space-y-2.5">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{isAr ? "ما الذي يحدث الآن؟" : "What happens next?"}</p>
                  <ul className="space-y-2">
                    {/* No response-time promise is made here on purpose:
                        nothing in the platform commits to one, and inventing a
                        window the team never agreed to is the same class of
                        untrue statement as the fake analysis this screen
                        replaced. */}
                    {(isAr
                      ? [
                          "يراجع فريق نظامي احتياجات شركتك.",
                          "سيتواصل معك الفريق على وسيلة التواصل التي أدخلتها.",
                          "تحصل على عرض سعر مكتوب قبل بدء أي عمل — والتقييم نفسه مجاني.",
                        ]
                      : [
                          "The Nezamy team reviews your company's needs.",
                          "The team will contact you on the details you provided.",
                          "You get a written quote before any work starts — the assessment itself is free.",
                        ]
                    ).map((line, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-zinc-300">
                        <Check size={11} weight="bold" className="text-[#0B3D2E] dark:text-emerald-400 flex-shrink-0 mt-1" />{line}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 pt-1 border-t border-[#0B3D2E]/10">
                    {isAr
                      ? "الأسعار المعروضة على هذه الصفحة تقديرية — يحدد الفريق السعر النهائي بعد مراجعة طلبك."
                      : "Prices shown on this page are estimates — the team sets the final price after reviewing your request."}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button type="button" onClick={onClose} className="flex-1 text-center rounded-xl bg-[#0B3D2E] py-3 text-sm font-bold text-[#C8A762]">
                    {isAr ? "إغلاق" : "Close"}
                  </button>
                  <a href="/contact" className="flex-1 text-center rounded-xl border border-slate-200 dark:border-white/[0.08] py-3 text-sm font-semibold text-slate-600 dark:text-zinc-300">
                    {isAr ? "تواصل مع الفريق" : "Contact the Team"}
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
