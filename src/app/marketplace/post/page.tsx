"use client";

/**
 * /marketplace/post — نشر طلب جديد في سوق المهنيين
 * ────────────────────────────────────────────────────
 * نموذج 4 خطوات:
 *  1. نوع الخدمة + المدينة
 *  2. تفاصيل الطلب + المدة
 *  3. الميزانية (مع مقترح المنصة تلقائياً)
 *  4. مراجعة + نشر
 *
 * RBAC: lawyer / firm / corporate / micro فقط
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin, CalendarBlank, CurrencyDollar, PencilSimple,
  CheckCircle, ArrowRight, ArrowLeft, Warning, Info,
  Stamp, Buildings, FileText, Gavel, Globe, ChatCircle,
  Sparkle, Briefcase, UploadSimple, X, Shield,
} from "@phosphor-icons/react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";

import { CATEGORIES, CITIES, DURATIONS, URGENCY_OPTIONS, STEPS, INITIAL, type FormData, type ServiceCategory, type UrgencyType } from "./_data";

// ─── Component ───────────────────────────────────────────────────────────────
export default function MarketplacePostPage() {
  const { isDark, isRTL } = useTheme();
  const user = useUser();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  useEffect(() => setMounted(true), []);

  const bg   = isDark ? "bg-[#0c0f12] text-white"   : "bg-gray-50 text-gray-900";
  const card = `rounded-2xl border ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200"}`;
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const input = `w-full rounded-xl border px-4 py-3 text-sm bg-transparent outline-none transition focus:border-[#0B3D2E] ${isDark ? "border-[#2d3748] text-white placeholder-gray-600" : "border-gray-200 text-gray-900 placeholder-gray-400"}`;

  const selectedCat = CATEGORIES.find(c => c.id === form.category);

  const setField = <K extends keyof FormData>(key: K, val: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }));
  };

  // Auto-suggest budget when category selected
  const handleCategorySelect = (catId: ServiceCategory) => {
    const cat = CATEGORIES.find(c => c.id === catId)!;
    setForm(prev => ({
      ...prev,
      category: catId,
      budgetMin: cat.suggestedMin,
      budgetMax: cat.suggestedMax,
    }));
  };

  const validateStep = () => {
    const errs: Partial<Record<keyof FormData, string>> = {};
    if (step === 1) {
      if (!form.category) errs.category = "اختر نوع الخدمة";
      if (!form.city) errs.city = "اختر المدينة";
    }
    if (step === 2) {
      if (!form.title.trim() || form.title.length < 10) errs.title = "العنوان يجب أن يكون ١٠ أحرف على الأقل";
      if (!form.description.trim() || form.description.length < 30) errs.description = "الوصف يجب أن يكون ٣٠ حرفاً على الأقل";
      if (!form.duration) errs.duration = "اختر المدة الزمنية";
    }
    if (step === 3) {
      if (!form.budgetMin || form.budgetMin <= 0) errs.budgetMin = "أدخل الحد الأدنى للميزانية";
      if (!form.budgetMax || form.budgetMax < form.budgetMin) errs.budgetMax = "الحد الأعلى يجب أن يكون أكبر من الأدنى";
    }
    if (step === 4) {
      if (!form.terms) errs.terms = "يجب الموافقة على الشروط";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const next = () => { if (validateStep()) setStep(s => Math.min(s + 1, 4)); };
  const prev = () => setStep(s => Math.max(s - 1, 1));

  const handleSubmit = () => {
    if (!validateStep()) return;
    // Simulate submission
    setSubmitted(true);
  };

  if (!mounted) return null;

  // Not authorized
  const isProvider = user.userType === "provider";
  const isAdmin    = user.userType === "admin";
  const isIndividual = user.userType === "individual";
  const canPost    = user.isLoggedIn && (
    user.userType === "lawyer" ||
    user.userType === "firm" ||
    user.userType === "corporate" ||
    user.userType === "micro"
  );
  // Guest: show wizard as a preview but block submission
  const isGuest    = !user.isLoggedIn;

  // Route after success — corporate/business → business marketplace, others → lawyer
  const postSubmitHref =
    user.userType === "corporate" || user.userType === "micro"
      ? "/dashboard/business/marketplace"
      : "/dashboard/lawyer/marketplace";

  const Arr = isRTL ? ArrowLeft : ArrowRight;
  const ArrBack = isRTL ? ArrowRight : ArrowLeft;

  // ── Success Screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className={`min-h-screen flex flex-col ${bg}`} dir="rtl">
        <Navbar />
        <main className="flex-1 flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className={`${card} max-w-md w-full p-8 text-center`}>
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={40} className="text-emerald-500" weight="fill" />
            </div>
            <h2 className={`text-2xl font-black mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              تم نشر طلبك بنجاح! 🎉
            </h2>
            <p className={`text-sm ${muted} mb-6`}>
              سيصلك إشعار حين يقدم مزوّد خدمة عرضاً على طلبك.
              يمكنك متابعة العروض من لوحة التحكم.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Link href={postSubmitHref}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm hover:bg-[#0a3328] transition">
                <Briefcase size={15} />
                طلباتي في السوق
              </Link>
              <Link href="/marketplace"
                className={`flex items-center justify-center gap-2 px-4 py-3 font-bold rounded-xl text-sm border transition ${isDark ? "border-[#2d3748] text-gray-300 hover:bg-[#161b22]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                عودة للسوق
              </Link>
            </div>
          </motion.div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col ${bg}`} dir="rtl">
      <Navbar />

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8">

        {/* ── Page Header ──────────────────────────────────────────────────── */}
        <div className="mb-8">
          <Link href="/marketplace"
            className={`inline-flex items-center gap-1.5 text-sm ${muted} hover:text-current mb-4 transition`}>
            <ArrBack size={14} />
            العودة للسوق
          </Link>
          <h1 className={`text-2xl md:text-3xl font-black mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>
            انشر طلبك في سوق المهنيين
          </h1>
          <p className={`text-sm ${muted}`}>
            أخبرنا بما تحتاجه وسيتنافس مزودو الخدمة لوجودك.
          </p>
        </div>

        {/* Not authorized — provider/admin/individual client */}
        {(isProvider || isAdmin || isIndividual) && (
          <div className={`${card} p-6 mb-6 text-center`}>
            <Warning size={36} className="mx-auto mb-3 text-amber-500" weight="fill" />
            <p className={`font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              هذه الخاصية غير متاحة
            </p>
            <p className={`text-sm ${muted} mb-4`}>
              {isIndividual
                ? "طلبات العملاء الأفراد لها مسار مستقل داخل خدمات العميل حتى لا تختلط بسوق تعاون المهنيين."
                : "مزودو الخدمة لا ينشرون طلبات؛ بل يقدمون عروضاً على الطلبات المنشورة من المحامين والمكاتب والشركات."}
            </p>
            <Link href={isIndividual ? "/dashboard/client/services" : "/marketplace"}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm">
              {isIndividual ? "الذهاب إلى خدمات العميل" : "تصفح الطلبات"}
              <Arr size={14} />
            </Link>
          </div>
        )}

        {/* Guest nudge — preview visible but submit blocked */}
        {isGuest && (
          <div className={`${card} p-4 mb-5 flex items-center gap-4`}>
            <Info size={28} className="text-[#0B3D2E] flex-shrink-0" weight="duotone" />
            <div className="flex-1">
              <p className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                سجّل دخولك لنشر الطلب
              </p>
              <p className={`text-xs ${muted}`}>
                يمكنك الاطلاع على النموذج الآن — سيُطلب تسجيل الدخول عند الإرسال.
              </p>
            </div>
            <Link href="/login"
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B3D2E] text-white font-bold rounded-xl text-xs">
              تسجيل الدخول
              <Arr size={12} />
            </Link>
          </div>
        )}

        {(canPost || isGuest) && (
          <>
            {/* ── Stepper ────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-8 relative">
              <div className={`absolute top-4 right-0 left-0 h-0.5 ${isDark ? "bg-[#2d3748]" : "bg-gray-200"} -z-10`} />
              <div
                className="absolute top-4 right-0 h-0.5 bg-[#0B3D2E] -z-10 transition-all duration-500"
                style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
              />
              {STEPS.map(s => (
                <div key={s.n} className="flex flex-col items-center gap-1.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black border-2 transition-all duration-300 ${
                    step > s.n
                      ? "bg-[#0B3D2E] border-[#0B3D2E] text-white"
                      : step === s.n
                      ? "bg-[#0B3D2E] border-[#0B3D2E] text-white shadow-lg scale-110"
                      : isDark
                      ? "bg-[#161b22] border-[#2d3748] text-gray-500"
                      : "bg-white border-gray-200 text-gray-400"
                  }`}>
                    {step > s.n ? <CheckCircle size={16} weight="fill" /> : s.n}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${step === s.n ? (isDark ? "text-white" : "text-gray-900") : muted}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            {/* ── Steps ──────────────────────────────────────────────────── */}
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isRTL ? 20 : -20 }}
                transition={{ duration: 0.25 }}
              >

                {/* Step 1 — Category + City */}
                {step === 1 && (
                  <div className={`${card} p-6 space-y-6`}>
                    <div>
                      <h2 className={`text-lg font-black mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                        ما نوع الخدمة التي تحتاجها؟
                      </h2>
                      <p className={`text-sm ${muted}`}>اختر الفئة الأنسب لطلبك</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {CATEGORIES.map(cat => {
                        const Icon = cat.icon;
                        const active = form.category === cat.id;
                        return (
                          <button
                            key={cat.id}
                            onClick={() => handleCategorySelect(cat.id)}
                            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-right transition-all ${
                              active
                                ? "border-[#0B3D2E] bg-[#0B3D2E]/5 dark:bg-[#0B3D2E]/15"
                                : isDark
                                ? "border-[#2d3748] hover:border-[#0B3D2E]/40"
                                : "border-gray-200 hover:border-[#0B3D2E]/30"
                            }`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${active ? "bg-[#0B3D2E] text-white" : isDark ? "bg-[#2d3748] text-gray-400" : "bg-gray-100 text-gray-500"}`}>
                              <Icon size={18} />
                            </div>
                            <div>
                              <p className={`font-bold text-sm ${active ? (isDark ? "text-white" : "text-[#0B3D2E]") : isDark ? "text-gray-200" : "text-gray-800"}`}>
                                {cat.label}
                              </p>
                              <p className={`text-xs mt-0.5 ${muted}`}>{cat.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    {errors.category && <p className="text-red-500 text-xs">{errors.category}</p>}

                    <div>
                      <label className={`block text-sm font-bold mb-2 ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                        <MapPin size={14} className="inline ml-1" />
                        المدينة
                      </label>
                      <select
                        value={form.city}
                        onChange={e => setField("city", e.target.value)}
                        className={input}
                      >
                        <option value="">اختر المدينة...</option>
                        {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
                    </div>
                  </div>
                )}

                {/* Step 2 — Title + Description + Duration + Urgency */}
                {step === 2 && (
                  <div className={`${card} p-6 space-y-5`}>
                    <div>
                      <h2 className={`text-lg font-black mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                        تفاصيل الطلب
                      </h2>
                      <p className={`text-sm ${muted}`}>كلما كانت التفاصيل أوضح، كانت العروض أفضل</p>
                    </div>

                    <div>
                      <label className={`block text-sm font-bold mb-2 ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                        عنوان الطلب
                      </label>
                      <input
                        type="text"
                        value={form.title}
                        onChange={e => setField("title", e.target.value)}
                        placeholder="مثال: مطلوب مُعقِّب لمتابعة ملف إيقاف خدمات في وزارة الموارد البشرية بالرياض"
                        className={input}
                        maxLength={150}
                      />
                      <div className="flex justify-between mt-1">
                        {errors.title ? <p className="text-red-500 text-xs">{errors.title}</p> : <span />}
                        <span className={`text-xs ${muted}`}>{form.title.length}/150</span>
                      </div>
                    </div>

                    <div>
                      <label className={`block text-sm font-bold mb-2 ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                        وصف تفصيلي
                      </label>
                      <textarea
                        value={form.description}
                        onChange={e => setField("description", e.target.value)}
                        placeholder="اشرح ما تحتاجه بالتفصيل: الجهة المعنية، المستندات المتوفرة، النتيجة المطلوبة..."
                        className={`${input} min-h-[120px] resize-y`}
                        maxLength={1000}
                      />
                      <div className="flex justify-between mt-1">
                        {errors.description ? <p className="text-red-500 text-xs">{errors.description}</p> : <span />}
                        <span className={`text-xs ${muted}`}>{form.description.length}/1000</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm font-bold mb-2 ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                          <CalendarBlank size={14} className="inline ml-1" />
                          المدة المطلوبة
                        </label>
                        <select value={form.duration} onChange={e => setField("duration", e.target.value)} className={input}>
                          <option value="">اختر...</option>
                          {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        {errors.duration && <p className="text-red-500 text-xs mt-1">{errors.duration}</p>}
                      </div>

                      <div>
                        <label className={`block text-sm font-bold mb-2 ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                          الأولوية / الاستعجال
                        </label>
                        <div className="space-y-2">
                          {URGENCY_OPTIONS.map(u => (
                            <button
                              key={u.id}
                              onClick={() => setField("urgency", u.id)}
                              className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-right transition-all ${
                                form.urgency === u.id
                                  ? "border-[#0B3D2E] bg-[#0B3D2E]/5"
                                  : isDark ? "border-[#2d3748]" : "border-gray-200"
                              }`}
                            >
                              <span className="text-sm">{u.label}</span>
                              <span className={`text-xs ${muted}`}>{u.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Attachments placeholder */}
                    <div>
                      <label className={`block text-sm font-bold mb-2 ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                        المرفقات (اختياري)
                      </label>
                      <div className={`border-2 border-dashed rounded-xl p-6 text-center ${isDark ? "border-[#2d3748]" : "border-gray-200"}`}>
                        <UploadSimple size={24} className={`mx-auto mb-2 ${muted}`} />
                        <p className={`text-sm ${muted}`}>اسحب ملفاتك هنا أو انقر للرفع</p>
                        <p className={`text-xs mt-1 ${muted}`}>PDF, JPG, PNG — حد أقصى 10MB</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3 — Budget */}
                {step === 3 && (
                  <div className={`${card} p-6 space-y-5`}>
                    <div>
                      <h2 className={`text-lg font-black mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>
                        الميزانية المقترحة
                      </h2>
                      <p className={`text-sm ${muted}`}>
                        نطاق السعر يساعد المزوّدين على تقديم عروض مناسبة
                      </p>
                    </div>

                    {/* Platform suggestion */}
                    {selectedCat && (
                      <div className={`rounded-xl p-4 flex items-start gap-3 ${isDark ? "bg-[#C8A762]/10 border border-[#C8A762]/20" : "bg-amber-50 border border-amber-100"}`}>
                        <Sparkle size={18} className="text-[#C8A762] flex-shrink-0 mt-0.5" weight="fill" />
                        <div>
                          <p className={`text-sm font-bold ${isDark ? "text-[#C8A762]" : "text-amber-800"}`}>
                            اقتراح المنصة لـ "{selectedCat.label}"
                          </p>
                          <p className={`text-sm ${isDark ? "text-[#C8A762]/70" : "text-amber-700"} mt-0.5`}>
                            النطاق المعتاد: <span className="font-black">{selectedCat.suggestedMin.toLocaleString()} — {selectedCat.suggestedMax.toLocaleString()} ر.س</span>
                          </p>
                          <p className={`text-xs mt-1 ${isDark ? "text-[#C8A762]/50" : "text-amber-600"}`}>
                            بناءً على متوسط السوق. يمكنك تعديل هذه القيمة.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm font-bold mb-2 ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                          <CurrencyDollar size={14} className="inline ml-1" />
                          الحد الأدنى (ر.س)
                        </label>
                        <input
                          type="number"
                          value={form.budgetMin || ""}
                          onChange={e => setField("budgetMin", Number(e.target.value))}
                          className={input}
                          placeholder="200"
                          min={0}
                        />
                        {errors.budgetMin && <p className="text-red-500 text-xs mt-1">{errors.budgetMin}</p>}
                      </div>
                      <div>
                        <label className={`block text-sm font-bold mb-2 ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                          الحد الأعلى (ر.س)
                        </label>
                        <input
                          type="number"
                          value={form.budgetMax || ""}
                          onChange={e => setField("budgetMax", Number(e.target.value))}
                          className={input}
                          placeholder="700"
                          min={0}
                        />
                        {errors.budgetMax && <p className="text-red-500 text-xs mt-1">{errors.budgetMax}</p>}
                      </div>
                    </div>

                    {/* Commission info */}
                    <div className={`rounded-xl p-4 flex items-start gap-3 ${isDark ? "bg-blue-500/5 border border-blue-500/20" : "bg-blue-50 border border-blue-100"}`}>
                      <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" weight="fill" />
                      <p className={`text-xs ${isDark ? "text-blue-300" : "text-blue-700"}`}>
                        <span className="font-bold">عمولة المنصة:</span> 15% من قيمة الصفقة يدفعها مزوّد الخدمة — لا تُخصم من ميزانيتك.
                        تحمي المنصة حقك عبر نظام الضمان المالي (Escrow).
                      </p>
                    </div>
                  </div>
                )}

                {/* Step 4 — Review + Submit */}
                {step === 4 && (
                  <div className="space-y-4">
                    <div className={`${card} p-6`}>
                      <h2 className={`text-lg font-black mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
                        مراجعة الطلب قبل النشر
                      </h2>
                      <div className="space-y-4">
                        {[
                          {
                            label: "نوع الخدمة",
                            value: `${selectedCat?.label || "—"} · ${form.city}`,
                          },
                          {
                            label: "العنوان",
                            value: form.title || "—",
                          },
                          {
                            label: "الوصف",
                            value: form.description ? `${form.description.slice(0, 120)}...` : "—",
                          },
                          {
                            label: "المدة والأولوية",
                            value: `${form.duration || "—"} · ${URGENCY_OPTIONS.find(u => u.id === form.urgency)?.label}`,
                          },
                          {
                            label: "الميزانية",
                            value: form.budgetMin && form.budgetMax
                              ? `${form.budgetMin.toLocaleString()} — ${form.budgetMax.toLocaleString()} ر.س (مقترح)`
                              : "—",
                          },
                        ].map((row, i) => (
                          <div key={i} className={`flex gap-4 pb-4 border-b last:border-0 last:pb-0 ${isDark ? "border-[#2d3748]" : "border-gray-100"}`}>
                            <span className={`text-xs font-bold w-28 shrink-0 ${muted}`}>{row.label}</span>
                            <span className={`text-sm flex-1 ${isDark ? "text-gray-200" : "text-gray-800"}`}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Escrow guarantee note */}
                    <div className={`rounded-xl p-4 flex items-start gap-3 ${isDark ? "bg-emerald-500/5 border border-emerald-500/20" : "bg-emerald-50 border border-emerald-100"}`}>
                      <Shield size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" weight="fill" />
                      <p className={`text-xs ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                        <span className="font-bold">ضمانك معنا:</span> مبلغ الطلب محمي بنظام Escrow — لن يُفرج عنه للمزوّد إلا بعد تأكيدك باكتمال الخدمة.
                      </p>
                    </div>

                    {/* Terms */}
                    <div className={`${card} p-4`}>
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.terms}
                          onChange={e => setField("terms", e.target.checked)}
                          className="mt-0.5 accent-[#0B3D2E] w-4 h-4"
                        />
                        <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                          أوافق على{" "}
                          <Link href="/terms" className="text-[#0B3D2E] font-bold underline underline-offset-2">
                            شروط الاستخدام
                          </Link>{" "}
                          وسياسة سوق المهنيين في نظامي.
                        </span>
                      </label>
                      {errors.terms && <p className="text-red-500 text-xs mt-2">{errors.terms}</p>}
                    </div>
                  </div>
                )}

              </motion.div>
            </AnimatePresence>

            {/* ── Navigation Buttons ────────────────────────────────────────── */}
            <div className={`flex items-center justify-between mt-6 pt-4 border-t ${isDark ? "border-[#2d3748]" : "border-gray-200"}`}>
              <button
                onClick={prev}
                disabled={step === 1}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition ${
                  step === 1
                    ? "opacity-30 cursor-not-allowed"
                    : isDark
                    ? "border border-[#2d3748] text-gray-300 hover:bg-[#161b22]"
                    : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <ArrBack size={14} />
                السابق
              </button>

              {step < 4 ? (
                <button
                  onClick={next}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm hover:bg-[#0a3328] transition shadow-lg"
                >
                  التالي
                  <Arr size={14} />
                </button>
              ) : isGuest ? (
                <Link href="/login"
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm hover:bg-[#0a3328] transition shadow-lg">
                  <Shield size={16} weight="bold" />
                  سجّل دخولك للنشر
                  <Arr size={14} />
                </Link>
              ) : (
                <button
                  onClick={handleSubmit}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#0B3D2E] text-white font-bold rounded-xl text-sm hover:bg-[#0a3328] transition shadow-lg"
                >
                  <CheckCircle size={16} weight="bold" />
                  نشر الطلب الآن
                </button>
              )}
            </div>
          </>
        )}

      </main>
      <Footer />
    </div>
  );
}
