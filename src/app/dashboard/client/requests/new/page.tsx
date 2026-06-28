"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight, CheckCircle, FileText, UploadSimple,
  Wallet, Tag, CreditCard, CaretLeft, ShieldCheck, Info, X
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { useClientPricingCatalog } from "@/hooks/useClientPricingCatalog";
import { usePaymentsStatus } from "@/hooks/usePaymentsStatus";
import { createWorkflowId, createWorkflowRequest } from "@/lib/clientWorkflowRepository";
import { createPaymentIntentStub } from "@/lib/paymentAdapter";
import { getClientServiceById, quoteClientService } from "@/lib/pricingRepository";

const STEPS = [
  { id: "details", label: "تفاصيل الطلب" },
  { id: "documents", label: "المرفقات" },
  { id: "payment", label: "الدفع والاعتماد" },
];

export default function NewRequestWizard() {
  const router = useRouter();
  const user = useUser();
  const searchParams = useSearchParams();
  const typeParam = searchParams?.get("type") || "general";

  const [currentStep, setCurrentStep] = useState(0);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Payment mock state
  const [useWallet, setUseWallet] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const { catalog, source: pricingSource } = useClientPricingCatalog();
  const payments = usePaymentsStatus();

  const serviceInfo = getClientServiceById(typeParam, catalog);
  const price = serviceInfo.requiresPayment ? serviceInfo.basePrice : 0;
  const serviceLabel = serviceInfo.label;
  const [walletBalance, setWalletBalance] = useState(0);

  // Load the real wallet balance (no hardcoded 150 mock).
  useEffect(() => {
    fetch("/api/v1/wallet", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((body) => {
        const balance = body?.data?.balance;
        if (typeof balance === "number") setWalletBalance(balance);
      })
      .catch(() => { /* wallet optional — keep 0 */ });
  }, []);
  const couponCode = coupon.trim().toUpperCase();
  const quote = quoteClientService(serviceInfo.serviceId, {
    couponCode: couponApplied ? couponCode : undefined,
    useWallet,
    walletBalance,
    source: pricingSource,
  }, catalog);
  const discount = quote.discount;
  const walletUsed = quote.walletUsed;
  const finalTotal = quote.finalTotal;
  // Payment gate: block paid submissions while the admin gateway is disabled.
  const paymentsBlocked = payments.disabled && finalTotal > 0;

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) setCurrentStep(c => c + 1);
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep(c => c - 1);
    else router.back();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    setFiles(prev => [...prev, ...Array.from(event.target.files ?? [])]);
    event.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleApplyCoupon = () => {
    const code = coupon.trim().toUpperCase();
    setSubmitError(null);

    if (!code) {
      setCouponError("أدخل كود الخصم أولا.");
      return;
    }

    const nextQuote = quoteClientService(serviceInfo.serviceId, {
      couponCode: code,
      source: pricingSource,
    }, catalog);
    if (nextQuote.couponError) {
      setCouponApplied(false);
      setCouponError(nextQuote.couponError);
      return;
    }

    setCoupon(code);
    setCouponApplied(true);
    setCouponError(null);
  };

  const handleRemoveCoupon = () => {
    setCoupon("");
    setCouponApplied(false);
    setCouponError(null);
  };

  const handleSubmit = async () => {
    if (coupon.trim() && !couponApplied) {
      setCurrentStep(2);
      setSubmitError("طبّق كود الخصم أولا أو احذفه قبل إرسال الطلب.");
      return;
    }

    if (paymentsBlocked) {
      setSubmitError("الدفع غير متاح حالياً — سيتم تفعيل بوابة الدفع قريباً. لا يمكن إتمام الطلب المدفوع حتى التفعيل.");
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const requestId = createWorkflowId("REQ");
      const paymentIntent = await createPaymentIntentStub({
        amount: finalTotal,
        requestId,
        serviceId: serviceInfo.serviceId,
      });
      const request = await createWorkflowRequest({
        id: requestId,
        type: serviceInfo.requestType === "consultation" ? "service" : serviceInfo.requestType,
        title: subject,
        description,
        requester: {
          userId: user.userId,
          name: user.name,
          role: user.userType,
          tier: user.tier,
          businessRole: user.businessRole,
        },
        receiver: serviceInfo.receiverType,
        status: finalTotal > 0 ? "pending_payment" : "pending_assignment",
        payment: {
          amount: Math.max(0, finalTotal),
          coupon: couponApplied ? couponCode : undefined,
          walletUsed,
          status: serviceInfo.requiresPayment ? (finalTotal > 0 ? "pending" : "paid") : "not_required",
        },
        sourcePath: "/dashboard/client/requests/new",
        metadata: {
          requestedType: serviceInfo.serviceId,
          originalPrice: price,
          discount,
          couponValidated: couponApplied,
          walletBalance,
          fileCount: files.length,
          fileNames: files.map(file => file.name).join(", "),
          quoteSource: quote.source,
          paymentIntentId: paymentIntent.id,
          paymentProvider: paymentIntent.provider,
        },
        auditEvent: "client_request_created",
      });
      router.push(`/dashboard/client/requests?success=1&id=${request.id}`);
    } catch {
      setSubmitError("تعذر حفظ الطلب محليا. راجع المتصفح أو حاول مرة أخرى.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">نوع الخدمة المطلوب</label>
              <div className="w-full bg-gray-50 dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2 cursor-not-allowed font-bold">
                <FileText size={18} className="text-[#C8A762]" />
                {serviceLabel}
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">موضوع الطلب الأساسي</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="مثال: مراجعة عقد شراكة تجارية"
                className="w-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#0B3D2E] focus:ring-1 focus:ring-[#0B3D2E] outline-none transition-all dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-900 dark:text-white mb-2">وصف تفصيلي للطلب</label>
              <textarea
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="اكتب كل التفاصيل التي ستساعد المحامي في تنفيذ طلبك بأفضل شكل..."
                className="w-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:border-[#0B3D2E] focus:ring-1 focus:ring-[#0B3D2E] outline-none transition-all resize-none dark:text-white"
              />
            </div>
          </motion.div>
        );
      case 1:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-5">
            <label className="block border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl p-8 text-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer group">
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="sr-only"
              />
              <div className="w-14 h-14 bg-[#0B3D2E]/10 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
                <UploadSimple size={24} className="text-[#0B3D2E]" />
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-white mb-1">اضغط هنا لرفع المستندات</p>
              <p className="text-xs text-gray-500">أو قم بسحب وإفلات الملفات هنا (PDF, DOCX, JPG)</p>
            </label>
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-[#161b22]">
                    <div className="min-w-0">
                      <p className="truncate font-bold text-gray-900 dark:text-white">{file.name}</p>
                      <p className="text-gray-400">{Math.max(1, Math.round(file.size / 1024)).toLocaleString("ar-SA")} ك.ب</p>
                    </div>
                    <button type="button" onClick={() => removeFile(index)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-xl p-4 flex items-start gap-3 text-xs leading-relaxed">
              <Info size={18} className="flex-shrink-0 mt-0.5" />
              <p>رفع المستندات ذات الصلة (مثل العقود السابقة، أو الأحكام، أو الهوية) يُسرّع من عملية معالجة طلبك ويساعد المحامي على دراسة موقفك بدقة.</p>
            </div>
          </motion.div>
        );
      case 2:
        return (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">

            {paymentsBlocked && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300 flex items-start gap-2">
                <Info size={16} className="flex-shrink-0 mt-0.5" />
                <span>الدفع غير متاح حالياً — سيتم تفعيل بوابة الدفع قريباً. لا يمكن إتمام الطلب المدفوع حتى التفعيل.</span>
              </div>
            )}

            {/* Wallet Integration */}
            <div className="bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                  <Wallet size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">رصيد المحفظة</p>
                  <p className="text-xs text-gray-500">متاح {walletBalance} ر.س</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={useWallet} onChange={() => setUseWallet(!useWallet)} />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-[#0B3D2E]"></div>
              </label>
            </div>

            {/* Coupon Integration */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag size={16} className="absolute top-1/2 -translate-y-1/2 right-3.5 text-gray-400" />
                <input
                  type="text"
                  value={coupon}
                  onChange={e => {
                    setCoupon(e.target.value);
                    setCouponError(null);
                  }}
                  disabled={couponApplied}
                  placeholder="كود الخصم (اختياري)"
                  className="w-full bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-xl pr-10 pl-4 py-3 text-sm focus:border-[#0B3D2E] outline-none disabled:opacity-50 dark:text-white"
                />
              </div>
              <button 
                type="button"
                onClick={couponApplied ? handleRemoveCoupon : handleApplyCoupon}
                disabled={!coupon && !couponApplied}
                className="px-5 bg-gray-900 text-white dark:bg-white dark:text-gray-900 rounded-xl text-sm font-bold disabled:opacity-50 transition-opacity"
              >
                {couponApplied ? "إزالة" : "تطبيق"}
              </button>
            </div>
            {couponError && (
              <p className="text-xs font-semibold text-red-600 dark:text-red-300">{couponError}</p>
            )}
            {couponApplied && (
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-300">
                تم التحقق من الكوبون في بيانات الديمو وتطبيق خصم {discount} ر.س.
              </p>
            )}

            {/* Receipt */}
            <div className="bg-gray-50 dark:bg-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400">
                <span>رسوم الخدمة (تقديرية)</span>
                <span>{price} ر.س</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>الخصم</span>
                  <span>- {discount} ر.س</span>
                </div>
              )}
              {useWallet && (
                <div className="flex justify-between text-sm text-emerald-600">
                  <span>رصيد المحفظة المستخدم</span>
                  <span>- {walletUsed} ر.س</span>
                </div>
              )}
              <div className="pt-3 border-t border-gray-200 dark:border-white/10 flex justify-between font-black text-lg text-gray-900 dark:text-white">
                <span>الإجمالي</span>
                <span>{Math.max(0, finalTotal)} ر.س</span>
              </div>
            </div>

            {/* Fake Payment Method */}
            <div className="border border-gray-200 dark:border-white/10 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-[#0B3D2E] transition-colors">
              <div className="flex items-center gap-3">
                <CreditCard size={24} className="text-gray-400" />
                <span className="text-sm font-bold text-gray-900 dark:text-white">البطاقة الائتمانية</span>
              </div>
              <div className="w-4 h-4 rounded-full border-2 border-[#0B3D2E] flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-[#0B3D2E]" />
              </div>
            </div>

          </motion.div>
        );
      default: return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4" dir="rtl">
      
      {/* Header */}
      <div className="mb-8">
        <button onClick={handlePrev} className="w-10 h-10 flex items-center justify-center bg-white dark:bg-[#161b22] border border-gray-200 dark:border-white/10 rounded-full mb-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
          <ArrowRight size={18} className="text-gray-600 dark:text-gray-400" />
        </button>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white flex items-center gap-2">
          طلب خدمة جديدة
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          أكمل الخطوات التالية لمعاينة الطلب قبل ربط الإرسال الفعلي بالباك اند
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between mb-12 relative px-2">
        <div className="absolute top-5 left-6 right-6 h-1 bg-slate-200 dark:bg-white/[0.04] -translate-y-1/2 -z-10 rounded-full" />
        <motion.div
          className="absolute top-5 right-6 h-1 bg-[#0B3D2E] dark:bg-[#C8A762] -translate-y-1/2 -z-10 rounded-full transition-all duration-300"
          style={{ width: `calc(${(currentStep / (STEPS.length - 1)) * 100}% - 3rem)` }}
        />
        {STEPS.map((step, idx) => {
          const isPassed = idx < currentStep;
          const isActive = idx === currentStep;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => idx < currentStep && setCurrentStep(idx)}
              disabled={idx > currentStep}
              className={`flex flex-col items-center gap-2 relative ${idx > currentStep ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-105 active:scale-95 transition-transform'}`}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                  isActive
                    ? "bg-[#0B3D2E] text-white shadow-[0_0_0_4px_rgba(11,61,46,0.15)] dark:bg-[#C8A762] dark:shadow-[0_0_0_4px_rgba(200,167,98,0.2)]"
                    : isPassed
                    ? "bg-[#0B3D2E] text-white dark:bg-[#C8A762]"
                    : "bg-white dark:bg-[#161b22] text-slate-400 border-2 border-slate-200 dark:border-white/[0.06]"
                }`}
              >
                {isPassed ? <CheckCircle size={18} weight="bold" /> : idx + 1}
              </div>
              <span
                className={`absolute top-12 text-[11.5px] font-bold whitespace-nowrap transition-colors ${
                  isActive ? "text-[#0B3D2E] dark:text-white" : "text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Form */}
      <div className="bg-white/80 dark:bg-[#161b22]/80 backdrop-blur-xl border border-slate-200/50 dark:border-white/[0.06] shadow-[0_20px_40px_-15px_rgba(11,61,46,0.04)] rounded-[2rem] p-6 md:p-8 mb-6">
        <AnimatePresence mode="wait">
          {renderStepContent()}
        </AnimatePresence>
      </div>

      {/* Footer Actions */}
      {submitError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-800/40 dark:bg-red-900/20 dark:text-red-300">
          {submitError}
        </div>
      )}
      <div className="flex items-center justify-between">
        <button 
          onClick={handlePrev}
          className={`px-8 py-3.5 rounded-2xl font-bold text-[13.5px] transition-all border ${currentStep === 0 ? "opacity-0 pointer-events-none" : "text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/[0.06] hover:bg-slate-50 dark:hover:bg-white/[0.04] bg-white dark:bg-transparent shadow-sm"}`}
        >
          السابق
        </button>
        <button
          onClick={currentStep === STEPS.length - 1 ? handleSubmit : handleNext}
          disabled={isSubmitting || (currentStep === 0 && (!subject || !description)) || (currentStep === STEPS.length - 1 && paymentsBlocked)}
          className="flex items-center gap-2 px-8 py-3.5 bg-[#0B3D2E] text-white rounded-2xl font-bold text-[13.5px] hover:bg-[#0a3328] transition-all shadow-[0_4px_14px_0_rgba(11,61,46,0.3)] disabled:opacity-50 active:scale-[0.98]"
        >
          {isSubmitting ? (
             <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : currentStep === STEPS.length - 1 ? (
            <>
              معاينة نهائية <ShieldCheck size={18} />
            </>
          ) : (
            <>
              التالي <CaretLeft size={16} weight="bold" />
            </>
          )}
        </button>
      </div>

    </div>
  );
}
