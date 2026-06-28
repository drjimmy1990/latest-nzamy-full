"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Robot, SealCheck, VideoCamera, ArrowRight, ArrowLeft,
  Check, Warning, CreditCard, Sparkle,
  Buildings, ChatsCircle, Info, CheckCircle, Phone,
  Paperclip, X, Lightning, Clock, FileText,
  Package,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { useSubscription } from "@/hooks/useSubscription";
import { useUser } from "@/hooks/useUser";
import { useClientPricingCatalog } from "@/hooks/useClientPricingCatalog";
import { usePaymentsStatus } from "@/hooks/usePaymentsStatus";
import { createWorkflowId, createWorkflowRequest } from "@/lib/clientWorkflowRepository";
import { createPaymentIntentStub } from "@/lib/paymentAdapter";
import { getClientServiceById, getConsultationModeServiceId } from "@/lib/pricingRepository";
import { LEGAL_BRANCHES_REGULAR } from "@/components/draft/draftConstants";
import { MOCK_LAWYERS } from "@/app/dashboard/client/find-lawyer/data";

import {
  type ConsultPath,
  type LawyerMode,
  MODE_COPY,
  IS_BETA,
} from "@/constants/clientConsultationData";
import { StepBar, PlanBadge } from "@/components/consultation/ClientConsultationComponents";

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewConsultationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const subscription = useSubscription();
  const user = useUser();
  const { catalog, source: pricingSource } = useClientPricingCatalog();
  const payments = usePaymentsStatus();
  const isDark = theme === "dark";
  const selectedLawyer = MOCK_LAWYERS.find((lawyer) => lawyer.id === searchParams.get("lawyer"));
  const modeConfig = useMemo(() => (
    Object.fromEntries(
      (Object.entries(MODE_COPY) as [LawyerMode, typeof MODE_COPY[LawyerMode]][]).map(([key, cfg]) => [
        key,
        {
          ...cfg,
          price: getClientServiceById(cfg.serviceId, catalog).basePrice,
        },
      ]),
    ) as Record<LawyerMode, typeof MODE_COPY[LawyerMode] & { price: number }>
  ), [catalog]);
  const aiConsultPrice = getClientServiceById("ai-consult", catalog).basePrice;
  const writtenOpinionPrice = getClientServiceById("written-opinion", catalog).basePrice;

  const [step, setStep] = useState(1);
  const [path, setPath] = useState<ConsultPath | null>(null);
  const [specialty, setSpecialty] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [urgency, setUrgency] = useState<"normal" | "urgent" | "critical">("normal");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [aiQuestion, setAiQuestion] = useState("");
  const [mode, setMode] = useState<LawyerMode>("video");
  const [confirmed, setConfirmed] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Pre-fill from URL context (e.g. coming from Services or AI assistant) ──
  useEffect(() => {
    const urlSpecialty = searchParams.get("specialty");
    const urlQ         = searchParams.get("q");
    const urlPath      = searchParams.get("path") as ConsultPath | null;
    const urlType      = searchParams.get("type"); // e.g. video-short, in-person, written-opinion
    const urlLawyer    = searchParams.get("lawyer");

    if (urlType === "contract-review") {
      router.replace("/dashboard/client/requests/new?type=contract-review");
      return;
    }

    if (urlSpecialty) setSpecialty(urlSpecialty);
    if (urlQ)         setAiQuestion(urlQ);
    if (urlLawyer) {
      const lawyer = MOCK_LAWYERS.find((item) => item.id === urlLawyer);
      setPath("lawyer");
      setMode("video");
      if (lawyer) setSpecialty(lawyer.specialty);
      setStep(2);
      return;
    }

    if (urlType) {
      // Coming from Services page (already chose human service)
      setPath("lawyer");
      if (urlType.includes("video")) setMode("video");
      else if (urlType.includes("in-person")) setMode("in-person");
      else if (urlType.includes("written") || urlType.includes("text")) setMode("text");
      setStep(2);
    } else if (urlPath) {
      setPath(urlPath);
      setStep(2);
    }
  }, [router, searchParams]);

  const activeTopic = path === "ai" ? aiQuestion : topic;
  const canGoStep3 = specialty !== null && activeTopic.trim().length > 5;
  const serviceId = path === "ai" ? "ai-consult" : getConsultationModeServiceId(mode);
  const total = getClientServiceById(serviceId, catalog).basePrice;
  const consultationLimit = subscription.tierRank >= 3 ? 5 : subscription.tierRank >= 2 ? 1 : 0;
  // TODO: derive consultationsUsed from a real consultations-count endpoint
  // (count of the user's consultation workflow requests). 0 is the honest
  // default until that endpoint exists — it does not fake a number.
  const consultationsUsed = 0;
  const consultationIncluded = path === "lawyer" && consultationsUsed < consultationLimit;
  // Payment gate: when the admin has disabled the gateway, block paid submissions.
  const needsPayment = !consultationIncluded && total > 0;
  const paymentsBlocked = payments.disabled && needsPayment;

  const confirmConsultation = async () => {
    if (!path) return;
    if (paymentsBlocked) return; // do not create a request when payments are disabled
    const requestId = createWorkflowId(path === "ai" ? "AIC" : "CON");
    const payableTotal = path === "lawyer" && consultationIncluded ? 0 : total;
    const paymentIntent = await createPaymentIntentStub({
      amount: payableTotal,
      requestId,
      serviceId,
    });
    const request = await createWorkflowRequest({
      id: requestId,
      type: "consultation",
      title: path === "ai"
        ? `استشارة AI - ${specialty}`
        : selectedLawyer
          ? `حجز استشارة مع ${selectedLawyer.name}`
          : `حجز استشارة — ${specialty}`,
      description: activeTopic,
      requester: {
        userId: user.userId,
        name: user.name,
        role: user.userType,
        tier: user.tier,
        businessRole: user.businessRole,
      },
      receiver: path === "ai" ? "ai_workspace" : "lawyer",
      status: path === "lawyer" && consultationIncluded ? "pending_assignment" : "pending_payment",
      payment: {
        amount: payableTotal,
        status: path === "lawyer" && consultationIncluded ? "included" : "pending",
      },
      sourcePath: "/dashboard/client/consultation/new",
      metadata: {
        path,
        specialty,
        mode: path === "lawyer" ? mode : "ai",
        serviceId,
        quoteSource: pricingSource,
        lawyerId: selectedLawyer?.id ?? null,
        lawyerName: selectedLawyer?.name ?? null,
        paymentIntentId: paymentIntent.id,
        paymentProvider: paymentIntent.provider,
      },
      auditEvent: "client_consultation_created",
    });
    setRequestId(request.id);
    setConfirmed(true);
  };

  const card = isDark
    ? "rounded-2xl border border-white/[0.07] bg-zinc-900/60"
    : "rounded-2xl border border-slate-200 bg-white";

  if (confirmed) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? "bg-[#0d1117]" : "bg-slate-50"}`} dir="rtl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`${card} p-10 max-w-md w-full mx-4 text-center`}
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
            className="w-20 h-20 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-5"
          >
            <CheckCircle size={40} className="text-emerald-500" weight="fill" />
          </motion.div>
          <h2 className={`text-[22px] font-black mb-2 ${isDark ? "text-white" : "text-zinc-900"}`}>
            {path === "ai" ? "جاهز لتشغيل المساعد" : "تم تجهيز معاينة الحجز"}
          </h2>
          <p className={`text-[13px] mb-2 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            {path === "ai"
              ? "تم حفظ طلب الاستشارة وسيتم فتح المساعد من هنا."
              : selectedLawyer
                ? `تم تسجيل طلبك مع ${selectedLawyer.name}. سيتم تأكيد الموعد من داخل المنصة.`
                : `تم تسجيل طلبك. سيتم تعيين محام متخصص والتواصل معك لترتيب الموعد.`
            }
          </p>
          {path === "lawyer" && (
            <div className={`mt-4 mb-5 p-3 rounded-xl text-[11px] flex items-start gap-2 ${isDark ? "bg-amber-900/20 border border-amber-700/20 text-amber-400" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
              <Info size={13} className="flex-shrink-0 mt-0.5" />
              <span>رقم الطلب <strong>{requestId}</strong>. يظهر الآن في طلباتك ولوحة المحامي كطلب وارد.</span>
            </div>
          )}
          {path === "ai" && requestId && (
            <p className={`mb-5 text-xs font-bold ${isDark ? "text-[#C8A762]" : "text-[#0B3D2E]"}`}>رقم الطلب: {requestId}</p>
          )}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                if (path === "ai") router.push("/ai/consult");
                else router.push("/dashboard/client/consultation");
              }}
              className="w-full flex items-center justify-center gap-2 py-3 bg-[#0B3D2E] text-white rounded-xl font-bold text-[14px] hover:bg-[#0d4d39] transition-colors"
            >
              <Sparkle size={15} weight="fill" />
              {path === "ai" ? "ابدأ الاستشارة" : "متابعة"}
            </button>
            <Link
              href="/dashboard/client"
              className={`text-[12px] text-center font-semibold ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"} transition-colors`}
            >
              العودة للوحة التحكم
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen ${isDark ? "bg-[#0d1117] text-white" : "bg-slate-50 text-zinc-900"}`}
      dir="rtl"
    >
      {/* Breadcrumb */}
      <div className={`sticky top-0 z-40 border-b px-6 py-3 flex items-center gap-2 text-[12px] backdrop-blur-xl ${isDark ? "bg-[#0d1117]/80 border-white/[0.06] text-zinc-400" : "bg-white/80 border-slate-100 text-slate-500"}`}>
        <Link href="/dashboard/client" className="hover:underline">لوحة التحكم</Link>
        <ArrowRight size={11} />
        <Link href="/dashboard/client/consultation" className="hover:underline">استشاراتي</Link>
        <ArrowRight size={11} />
        <span className={isDark ? "text-white" : "text-zinc-800"}>استشارة جديدة</span>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className={`text-[22px] font-black mb-1 ${isDark ? "text-white" : "text-zinc-900"}`}>
            استشارة جديدة
          </h1>
          <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
            استشارة فورية مع نظامي AI أو موعد مع محامٍ متخصص
          </p>
        </div>

        {/* Step bar */}
        <StepBar step={step} />

        <AnimatePresence mode="wait">

          {/* ── Step 1: Type ── */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <PlanBadge
                isDark={isDark}
                included={consultationIncluded}
                used={consultationsUsed}
                limit={consultationLimit}
                basePrice={writtenOpinionPrice}
              />

              <p className={`text-[13px] font-bold mb-4 ${isDark ? "text-zinc-200" : "text-zinc-700"}`}>
                كيف تريد استشارتك؟
              </p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                {/* AI */}
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { setPath("ai"); setStep(2); }}
                  className={`flex flex-col items-start gap-3 p-5 rounded-2xl border-2 transition-all ${
                    path === "ai"
                      ? "border-[#C8A762] bg-[#C8A762]/5"
                      : isDark ? "border-white/10 hover:border-[#C8A762]/40" : "border-gray-200 hover:border-[#C8A762]/50 hover:bg-[#C8A762]/5"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Robot size={24} weight="fill" className="text-amber-500" />
                  </div>
                  <div className="text-right w-full">
                    <p className={`text-[14px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>نظامي AI</p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                      استشارة فورية · {aiConsultPrice.toLocaleString("ar-SA")} ر.س
                    </p>
                    <div className="flex flex-col gap-1 mt-2.5">
                      {["إجابة فورية ٢٤/٧", "استناد للأنظمة السعودية", "سرية تامة"].map(f => (
                        <span key={f} className={`flex items-center gap-1 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                          <Check size={9} weight="bold" className="text-amber-500" /> {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2.5 py-1 rounded-full font-bold">
                    متاح ٢٤/٧
                  </span>
                </motion.button>

                {/* Lawyer */}
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { setPath("lawyer"); setStep(2); }}
                  className={`flex flex-col items-start gap-3 p-5 rounded-2xl border-2 transition-all ${
                    path === "lawyer"
                      ? "border-[#0B3D2E] bg-[#0B3D2E]/5"
                      : isDark ? "border-white/10 hover:border-[#0B3D2E]/40" : "border-gray-200 hover:border-[#0B3D2E]/30 hover:bg-[#0B3D2E]/5"
                  }`}
                >
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <SealCheck size={24} weight="fill" className="text-emerald-600" />
                  </div>
                  <div className="text-right w-full">
                    <p className={`text-[14px] font-black ${isDark ? "text-white" : "text-zinc-900"}`}>مع محامٍ</p>
                    <p className={`text-[11px] mt-0.5 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                      جلسة مجدولة · من {writtenOpinionPrice.toLocaleString("ar-SA")} ر.س
                    </p>
                    <div className="flex flex-col gap-1 mt-2.5">
                      {[
                        "محامٍ سعودي معتمد ومرخّص",
                        "اختر: مرئية · حضورية · نصية",
                        "ملخص مكتوب بعد الجلسة",
                      ].map(f => (
                        <span key={f} className={`flex items-center gap-1 text-[10px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                          <Check size={9} weight="bold" className="text-emerald-500" /> {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2.5 py-1 rounded-full font-bold">
                    محامٍ معتمد
                  </span>
                </motion.button>
              </div>

              {/* Comparison note */}
              <div className={`rounded-xl p-3.5 flex items-start gap-2.5 text-[11px] ${isDark ? "bg-white/[0.03] border border-white/[0.06]" : "bg-slate-50 border border-slate-200"}`}>
                <Info size={13} className={isDark ? "text-zinc-500 flex-shrink-0 mt-0.5" : "text-slate-400 flex-shrink-0 mt-0.5"} />
                <p className={isDark ? "text-zinc-500" : "text-slate-500"}>
                  الاستشارة مع نظامي AI <strong>لا تُعدّ رأياً قانونياً رسمياً</strong> ولا تصلح أمام المحاكم. لو الموضوع حساس أو يتعلق بنزاع قضائي — نوصي باستشارة محامٍ معتمد.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── Step 2: Details ── */}
          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

              {/* ① Specialty */}
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  التخصص القانوني <span className="text-red-400">*</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {LEGAL_BRANCHES_REGULAR.map((s: string) => (
                    <motion.button
                      key={s}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSpecialty(s === specialty ? null : s)}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all ${
                        specialty === s
                          ? "bg-[#0B3D2E] text-white border-[#0B3D2E] shadow-sm"
                          : isDark
                            ? "border-white/[0.08] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                            : "border-slate-200 text-slate-600 hover:border-[#0B3D2E]/40 hover:bg-[#0B3D2E]/5"
                      }`}
                    >
                      {s}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* ② Session mode (lawyer only) */}
              {path === "lawyer" && (
                <div>
                  <p className={`text-[11px] font-black uppercase tracking-widest mb-3 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    نوع الجلسة
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.entries(modeConfig) as [LawyerMode, typeof modeConfig[LawyerMode]][]).map(([key, cfg]) => {
                      const Icon = cfg.Icon;
                      return (
                        <motion.button
                          key={key}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => setMode(key)}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-[11px] font-semibold transition-all ${
                            mode === key
                              ? "bg-[#0B3D2E] text-white border-[#0B3D2E]"
                              : isDark ? "border-white/[0.08] text-zinc-400 hover:border-white/20" : "border-slate-200 text-slate-600 hover:border-[#0B3D2E]/30"
                          }`}
                        >
                          <Icon size={16} />
                          <span>{cfg.label}</span>
                          <span className={`text-[10px] font-black ${mode === key ? "text-[#C8A762]" : isDark ? "text-zinc-600" : "text-slate-400"}`}>
                            {cfg.price} ر.س
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ③ Topic / Question */}
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  {path === "ai" ? "سؤالك القانوني" : "موضوع الاستشارة"} <span className="text-red-400">*</span>
                </p>
                <textarea
                  value={path === "ai" ? aiQuestion : topic}
                  onChange={e => path === "ai" ? setAiQuestion(e.target.value) : setTopic(e.target.value)}
                  placeholder={path === "ai"
                    ? "صِف مشكلتك بالتفصيل... مثال: فُصلت دون إشعار بعد ٥ سنوات خدمة، ما حقوقي؟"
                    : "صِف موضوع الاستشارة بوضوح... مثال: نزاع مع المؤجر حول شروط تجديد عقد الإيجار التجاري"}
                  rows={4}
                  className={`w-full rounded-xl border px-4 py-3 text-[13px] outline-none resize-none leading-relaxed transition-colors ${
                    isDark
                      ? "border-white/[0.08] bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-700/50"
                      : "border-slate-200 bg-slate-50/80 text-zinc-800 placeholder:text-zinc-400 focus:border-[#0B3D2E]/40 focus:bg-white"
                  }`}
                />
                <p className={`text-[10px] mt-1.5 ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  كلما كانت التفاصيل أدق، كانت الاستشارة أكثر دقةً وفائدةً.
                </p>
              </div>

              {/* ④ Urgency */}
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  درجة الأولوية
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { key: "normal",   label: "عادية",    Icon: Clock,      color: isDark ? "text-zinc-400" : "text-slate-500" },
                    { key: "urgent",   label: "عاجلة",    Icon: Lightning,  color: "text-amber-500" },
                    { key: "critical", label: "حرجة جداً", Icon: Warning,    color: "text-red-500" },
                  ] as const).map(({ key, label, Icon, color }) => (
                    <motion.button
                      key={key}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setUrgency(key)}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-[12px] font-semibold transition-all ${
                        urgency === key
                          ? key === "critical" ? "bg-red-500/10 border-red-400 text-red-500"
                            : key === "urgent" ? "bg-amber-500/10 border-amber-400 text-amber-600"
                            : "bg-[#0B3D2E]/10 border-[#0B3D2E]/50 text-[#0B3D2E] dark:text-emerald-400"
                          : isDark ? "border-white/[0.08] text-zinc-500" : "border-slate-200 text-slate-500"
                      }`}
                    >
                      <Icon size={13} className={urgency === key ? "" : color} />
                      {label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* ⑤ Attachments */}
              <div>
                <p className={`text-[11px] font-black uppercase tracking-widest mb-2 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  المرفقات <span className={`normal-case font-normal ${isDark ? "text-zinc-600" : "text-slate-400"}`}>(اختياري)</span>
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={e => {
                    const files = Array.from(e.target.files ?? []);
                    setAttachments(prev => [...prev, ...files].slice(0, 10));
                    e.target.value = "";
                  }}
                />
                {attachments.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {attachments.map((f, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] ${
                          isDark ? "bg-white/[0.04] border border-white/[0.06]" : "bg-slate-50 border border-slate-200"
                        }`}
                      >
                        <FileText size={13} className={isDark ? "text-zinc-500" : "text-slate-400"} />
                        <span className={`flex-1 truncate font-medium ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{f.name}</span>
                        <span className={`text-[10px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                          {(f.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <button
                          onClick={() => setAttachments(a => a.filter((_, j) => j !== i))}
                          className={`p-0.5 rounded transition-colors ${isDark ? "hover:text-red-400 text-zinc-600" : "hover:text-red-500 text-slate-400"}`}
                        >
                          <X size={12} />
                        </button>
                      </motion.div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => fileRef.current?.click()}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed text-[12px] font-semibold transition-all ${
                    isDark
                      ? "border-white/[0.1] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                      : "border-slate-300 text-slate-500 hover:border-[#0B3D2E]/40 hover:text-[#0B3D2E]"
                  }`}
                >
                  <Paperclip size={14} />
                  إضافة مستندات أو صور
                  <span className={`text-[10px] font-normal ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                    (PDF, Word, صور — حتى ١٠ ملفات)
                  </span>
                </button>
              </div>

              {/* Beta notice (lawyer only) */}
              {path === "lawyer" && IS_BETA && !selectedLawyer && (
                <div className={`flex items-start gap-2.5 p-4 rounded-xl border ${isDark ? "bg-amber-900/10 border-amber-900/30" : "bg-amber-50 border-amber-200"}`}>
                  <Info size={15} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-amber-500" : "text-amber-600"}`} weight="fill" />
                  <div>
                    <p className={`text-[12px] font-bold mb-0.5 ${isDark ? "text-amber-400" : "text-amber-800"}`}>مرحلة البيتا</p>
                    <p className={`text-[11px] leading-relaxed ${isDark ? "text-amber-300/70" : "text-amber-700"}`}>
                      تقوم المنصة بتعيين أفضل محام متخصص تلقائيا. سيتواصل معك لتأكيد الموعد.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-1">
                <button
                  onClick={() => setStep(1)}
                  className={`flex items-center gap-1.5 text-[12px] px-4 py-2 rounded-xl border font-semibold transition-colors ${isDark ? "border-white/10 text-zinc-400 hover:text-zinc-200" : "border-gray-200 text-gray-500 hover:text-gray-700"}`}
                >
                  <ArrowRight size={13} /> رجوع
                </button>
                <motion.button
                  whileHover={{ scale: canGoStep3 ? 1.02 : 1 }}
                  onClick={() => canGoStep3 && setStep(3)}
                  disabled={!canGoStep3}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-[#0B3D2E] text-white text-[13px] font-bold rounded-xl hover:bg-[#0d4d39] disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shadow-[#0B3D2E]/20"
                >
                  مراجعة وتأكيد <ArrowLeft size={13} />
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3: Review + Payment ── */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>

              <PlanBadge
                isDark={isDark}
                included={consultationIncluded}
                used={consultationsUsed}
                limit={consultationLimit}
                basePrice={writtenOpinionPrice}
              />

              {/* Summary card */}
              <div className={`${isDark ? "border-white/[0.07] bg-zinc-900/60" : "border-slate-200 bg-white"} rounded-2xl border p-5 mb-5`}>
                <p className={`text-[11px] font-black uppercase tracking-wider mb-4 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                  ملخص الاستشارة
                </p>
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>النوع</span>
                    <span className={`text-[13px] font-bold text-right ${isDark ? "text-white" : "text-zinc-900"}`}>
                      {path === "ai" ? "نظامي AI — فورية" : `مع محام — ${mode === "video" ? "مرئية" : mode === "in-person" ? "حضورية" : mode === "voice" ? "صوتية" : "نصية"}`}
                    </span>
                  </div>
                  {specialty && (
                    <div className="flex justify-between">
                      <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>التخصص</span>
                      <span className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{specialty}</span>
                    </div>
                  )}
                  {path === "lawyer" && (IS_BETA || selectedLawyer) && (
                    <div className="flex justify-between">
                      <span className={`text-[12px] ${isDark ? "text-zinc-400" : "text-slate-500"}`}>المحامي والموعد</span>
                      <span className={`text-[13px] font-bold ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                        {selectedLawyer ? selectedLawyer.name : "يحدد من قبل المنصة"}
                      </span>
                    </div>
                  )}
                  {path === "ai" && aiQuestion && (
                    <div className="flex justify-between items-start gap-3">
                      <span className={`text-[12px] flex-shrink-0 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>سؤالك</span>
                      <span className={`text-[12px] text-right line-clamp-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{aiQuestion}</span>
                    </div>
                  )}
                  <div className={`flex justify-between items-center pt-3 border-t ${isDark ? "border-white/[0.07]" : "border-gray-100"}`}>
                    <span className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>الإجمالي</span>
                    <span className="text-[18px] font-black text-[#C8A762]">{total} ر.س</span>
                  </div>
                </div>
              </div>

              {/* Pending / payment-disabled notice */}
              {paymentsBlocked ? (
                <div className={`rounded-xl p-3.5 flex items-start gap-2.5 mb-5 text-[11px] ${isDark ? "bg-red-900/15 border border-red-700/25" : "bg-red-50 border border-red-200"}`}>
                  <Warning size={13} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-red-400" : "text-red-600"}`} weight="fill" />
                  <p className={isDark ? "text-red-300/80" : "text-red-700"}>
                    الدفع غير متاح حالياً — سيتم تفعيل بوابة الدفع قريباً. لا يمكن إتمام الطلب المدفوع حتى التفعيل.
                  </p>
                </div>
              ) : (
                <div className={`rounded-xl p-3.5 flex items-start gap-2.5 mb-5 text-[11px] ${isDark ? "bg-amber-900/15 border border-amber-700/20" : "bg-amber-50 border border-amber-200"}`}>
                  <Warning size={13} className={`flex-shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-amber-600"}`} weight="fill" />
                  <p className={isDark ? "text-amber-300/80" : "text-amber-700"}>
                    بعد الضغط على «تأكيد وادفع» سيتم إنشاء طلب فعلي في طبقة الـ workflow مع payment intent تجريبي لحين ربط مزود الدفع النهائي.
                  </p>
                </div>
              )}

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(2)}
                  className={`flex items-center gap-1.5 text-[12px] px-4 py-2 rounded-xl border font-semibold ${isDark ? "border-white/10 text-zinc-400" : "border-gray-200 text-gray-500"}`}
                >
                  <ArrowRight size={13} /> رجوع
                </button>
                <motion.button
                  whileHover={{ scale: !paymentsBlocked ? 1.02 : 1 }} whileTap={{ scale: !paymentsBlocked ? 0.98 : 1 }}
                  onClick={confirmConsultation}
                  disabled={paymentsBlocked}
                  className={`flex items-center gap-2 px-6 py-3 text-white text-[13px] font-black rounded-xl transition-colors shadow-lg shadow-[#0B3D2E]/20 ${
                    paymentsBlocked
                      ? "bg-zinc-400/60 cursor-not-allowed shadow-none"
                      : "bg-[#0B3D2E] hover:bg-[#0d4d39]"
                  }`}
                >
                  <CreditCard size={15} />
                  {consultationIncluded
                    ? "تأكيد بدون رسوم"
                    : "تأكيد وادفع"}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
