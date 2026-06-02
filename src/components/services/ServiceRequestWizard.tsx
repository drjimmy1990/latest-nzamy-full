"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, ArrowRight, ArrowLeft, CheckCircle, UploadSimple,
  CalendarBlank, CurrencyDollar, Users, UserCircle,
  Scales, FileText, Lock, Warning, Spinner,
  PaperPlaneRight,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { useUser } from "@/hooks/useUser";
import { createWorkflowId, saveWorkflowRequest } from "@/lib/workflowStore";

import {
  type FormData,
  type ServiceRequestWizardProps,
  REGIONS,
  LAWYER_SERVICE_TYPES,
  STEPS
} from "./ServiceRequestWizardData";

import {
  SummaryRow,
  SuccessScreen
} from "./ServiceRequestWizardComponents";

export default function ServiceRequestWizard({
  serviceTitle, serviceTitleEn, serviceId, onClose, userRole,
}: ServiceRequestWizardProps) {
  const { isRTL, isDark } = useTheme();
  const user = useUser();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<FormData>({
    description: "",
    region: "",
    budgetMin: 500,
    budgetMax: 3000,
    deadline: "",
    confidential: false,
    files: [],
    assignmentMethod: "open_bids",
    barNumber: "",
    courtName: "",
    caseNumber: "",
    serviceType: "",
  });

  const isLawyer = userRole === "lawyer_client";

  // ── Validation per step
  const canProceed = () => {
    if (step === 1) return form.description.trim().length >= 30 && form.region !== "";
    if (step === 2) return true; // optional
    if (step === 3) return form.deadline !== "";
    return true;
  };

  const next = () => { if (canProceed() && step < 4) setStep(s => s + 1); };
  const prev = () => { if (step > 1) setStep(s => s - 1); };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, submitting]);

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setForm(f => ({ ...f, files: [...f.files, ...Array.from(e.target.files!)] }));
    }
  };

  const removeFile = (idx: number) => {
    setForm(f => ({ ...f, files: f.files.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      await new Promise(r => setTimeout(r, 1800));
      const firmServiceIds = new Set(["srv-1", "srv-2", "srv-3"]);
      const request = saveWorkflowRequest({
        id: createWorkflowId("SRV"),
        type: "service",
        title: isRTL ? serviceTitle : serviceTitleEn,
        description: form.description,
        requester: {
          name: user.name,
          role: user.userType,
          tier: user.tier,
          businessRole: user.businessRole,
        },
        receiver: firmServiceIds.has(serviceId) ? "firm" : "lawyer",
        status: "pending_assignment",
        payment: {
          amount: form.budgetMin,
          status: "pending",
        },
        sourcePath: "/services",
        metadata: {
          serviceId,
          userRole,
          region: form.region,
          budgetMin: form.budgetMin,
          budgetMax: form.budgetMax,
          deadline: form.deadline,
          confidential: form.confidential,
          assignmentMethod: form.assignmentMethod,
          fileCount: form.files.length,
          barNumber: form.barNumber || null,
          courtName: form.courtName || null,
          caseNumber: form.caseNumber || null,
          serviceType: form.serviceType || null,
        },
        auditEvent: "service_marketplace_request_sent",
      });
      setSubmittedId(request.id);
      setSubmitted(true);
    } catch {
      setSubmitError(isRTL
        ? "تعذر حفظ الطلب الآن. راجع اتصالك أو جرّب الإرسال مرة أخرى."
        : "We could not save the request. Check your connection or try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Style tokens
  const card = isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-200";
  const muted = isDark ? "text-gray-400" : "text-gray-500";
  const heading = isDark ? "text-white" : "text-gray-900";
  const inputCls = `w-full rounded-xl border px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-[#0B3D2E]/40 ${
    isDark ? "bg-[#0c0f12] border-[#2d3748] text-white placeholder:text-gray-600" : "bg-white border-gray-200 text-gray-900 placeholder:text-gray-400"
  }`;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        dir={isRTL ? "rtl" : "ltr"}
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border shadow-2xl ${card}`}
        >
          {/* Header */}
          <div className={`sticky top-0 z-10 px-6 pt-6 pb-4 border-b ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-100"}`}>
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-[11px] font-bold mb-1 text-[#C8A762]">
                  {isRTL ? "طلب خدمة قانونية" : "Legal Service Request"}
                </p>
                <h2 className={`text-lg font-black leading-tight ${heading}`}>
                  {isRTL ? serviceTitle : serviceTitleEn}
                </h2>
              </div>
              <button
                onClick={onClose}
                className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition ${
                  isDark ? "bg-white/5 hover:bg-white/10 text-gray-400" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
                }`}
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {/* Step Indicator */}
            <div className="flex items-center gap-0">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const isActive = step === s.id;
                const isDone = step > s.id;
                return (
                  <div key={s.id} className="flex items-center flex-1 last:flex-none">
                    <button 
                      type="button"
                      onClick={() => isDone && setStep(s.id)}
                      disabled={!isDone}
                      className="flex flex-col items-center disabled:cursor-default"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all text-xs font-bold border-2 ${
                        isDone ? "bg-[#0B3D2E] border-[#0B3D2E] text-white cursor-pointer hover:scale-105 active:scale-95" :
                        isActive ? "border-[#C8A762] bg-[#C8A762]/10 text-[#C8A762]" :
                        isDark ? "border-gray-700 text-gray-600" : "border-gray-200 text-gray-400"
                      }`}>
                        {isDone ? <CheckCircle size={16} weight="fill" /> : <Icon size={14} />}
                      </div>
                      <span className={`text-[9px] mt-1 font-bold hidden sm:block transition-colors ${
                        isActive ? "text-[#C8A762]" : isDone ? isDark ? "text-gray-300 group-hover:text-white" : "text-gray-700 group-hover:text-black" : muted
                      }`}>
                        {isRTL ? s.label : s.labelEn}
                      </span>
                    </button>
                    {i < STEPS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-2 mb-4 transition-all ${
                        step > s.id ? "bg-[#0B3D2E]" : isDark ? "bg-gray-800" : "bg-gray-100"
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            {submitted ? (
              <SuccessScreen isRTL={isRTL} isDark={isDark} heading={heading} muted={muted} requestId={submittedId} onClose={onClose} />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: isRTL ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: isRTL ? 20 : -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Step 1: Description */}
                  {step === 1 && (
                    <div className="space-y-5">
                      <div>
                        <label className={`block text-sm font-bold mb-2 ${heading}`}>
                          {isRTL ? "صِف طلبك بالتفصيل" : "Describe your request in detail"}
                          <span className="text-red-500 ms-1">*</span>
                        </label>
                        <textarea
                          value={form.description}
                          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                          placeholder={isRTL
                            ? "اشرح وضعك القانوني، تفاصيل النزاع، وما تحتاجه من المحامي بدقة..."
                            : "Explain your legal situation, the dispute details, and what you need from the lawyer..."}
                          rows={5}
                          maxLength={2000}
                          className={`${inputCls} resize-none`}
                        />
                        <div className={`flex justify-between mt-1 text-[11px] ${muted}`}>
                          <span>{form.description.length < 30 && form.description.length > 0 && (
                            <span className="text-red-500">{isRTL ? `${30 - form.description.length} حرف على الأقل` : `${30 - form.description.length} more chars needed`}</span>
                          )}</span>
                          <span>{form.description.length} / 2000</span>
                        </div>
                      </div>

                      <div>
                        <label className={`block text-sm font-bold mb-2 ${heading}`}>
                          {isRTL ? "المنطقة الجغرافية" : "Geographic Region"}
                          <span className="text-red-500 ms-1">*</span>
                        </label>
                        <select
                          value={form.region}
                          onChange={e => setForm(f => ({ ...f, region: e.target.value }))}
                          className={inputCls}
                        >
                          <option value="">{isRTL ? "— اختر المنطقة —" : "— Select Region —"}</option>
                          {REGIONS.map(r => (
                            <option key={r.value} value={r.value}>{isRTL ? r.label : r.labelEn}</option>
                          ))}
                        </select>
                      </div>

                      {/* Lawyer-specific fields */}
                      {isLawyer && (
                        <div className="rounded-2xl border p-4 space-y-4 border-[#C8A762]/30 bg-[#C8A762]/5">
                          <p className="text-xs font-bold text-[#C8A762] flex items-center gap-2">
                            <Scales size={14} />
                            {isRTL ? "بيانات خاصة بالمحامين" : "Lawyer-Specific Details"}
                          </p>
                          <div>
                            <label className={`block text-xs font-bold mb-1.5 ${muted}`}>
                              {isRTL ? "نوع الخدمة المطلوبة" : "Required Service Type"}
                            </label>
                            <select
                              value={form.serviceType}
                              onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))}
                              className={inputCls}
                            >
                              <option value="">{isRTL ? "— اختر النوع —" : "— Select Type —"}</option>
                              {LAWYER_SERVICE_TYPES.map(t => (
                                <option key={t.value} value={t.value}>{isRTL ? t.label : t.labelEn}</option>
                              ))}
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`block text-xs font-bold mb-1.5 ${muted}`}>
                                {isRTL ? "رقم القيد المهني" : "Bar Number"}
                              </label>
                              <input
                                type="text"
                                value={form.barNumber}
                                onChange={e => setForm(f => ({ ...f, barNumber: e.target.value }))}
                                placeholder={isRTL ? "مثال: 123456" : "e.g. 123456"}
                                className={inputCls}
                              />
                            </div>
                            <div>
                              <label className={`block text-xs font-bold mb-1.5 ${muted}`}>
                                {isRTL ? "اسم المحكمة" : "Court Name"}
                              </label>
                              <input
                                type="text"
                                value={form.courtName}
                                onChange={e => setForm(f => ({ ...f, courtName: e.target.value }))}
                                placeholder={isRTL ? "محكمة التجارية بالرياض" : "Riyadh Commercial Court"}
                                className={inputCls}
                              />
                            </div>
                          </div>
                          <div>
                            <label className={`block text-xs font-bold mb-1.5 ${muted}`}>
                              {isRTL ? "رقم القضية" : "Case Number"} ({isRTL ? "اختياري" : "Optional"})
                            </label>
                            <input
                              type="text"
                              value={form.caseNumber}
                              onChange={e => setForm(f => ({ ...f, caseNumber: e.target.value }))}
                              placeholder={isRTL ? "مثال: 1234/46هـ" : "e.g. 1234/46H"}
                              className={inputCls}
                            />
                          </div>
                        </div>
                      )}

                      {/* Confidentiality Toggle */}
                      <div className={`flex items-center justify-between p-4 rounded-2xl border ${isDark ? "border-[#2d3748] bg-white/3" : "border-gray-100 bg-gray-50"}`}>
                        <div className="flex items-center gap-3">
                          <Lock size={18} className="text-[#0B3D2E] dark:text-[#C8A762]" />
                          <div>
                            <p className={`text-sm font-bold ${heading}`}>{isRTL ? "طلب السرية التامة" : "Request Full Confidentiality"}</p>
                            <p className={`text-[11px] ${muted}`}>{isRTL ? "يُفعّل اتفاقية NDA تلقائياً مع المحامي" : "Automatically activates NDA with the lawyer"}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => setForm(f => ({ ...f, confidential: !f.confidential }))}
                          className={`relative w-11 h-6 rounded-full transition-all ${form.confidential ? "bg-[#0B3D2E]" : isDark ? "bg-gray-700" : "bg-gray-200"}`}
                        >
                          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.confidential ? (isRTL ? "right-0.5" : "left-[22px]") : (isRTL ? "right-[22px]" : "left-0.5")}`} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Documents */}
                  {step === 2 && (
                    <div className="space-y-5">
                      <div>
                        <p className={`text-sm font-bold mb-1 ${heading}`}>{isRTL ? "المستندات الداعمة" : "Supporting Documents"}</p>
                        <p className={`text-xs mb-4 ${muted}`}>{isRTL ? "ارفع أي مستندات تساعد المحامي على فهم قضيتك (اختياري)" : "Upload documents that help the lawyer understand your case (optional)"}</p>

                        {/* Upload Zone */}
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className={`w-full border-2 border-dashed rounded-2xl p-8 flex flex-col items-center gap-3 transition hover:border-[#C8A762]/50 ${
                            isDark ? "border-[#2d3748] hover:bg-white/3" : "border-gray-200 hover:bg-gray-50"
                          }`}
                        >
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-white/5" : "bg-[#0B3D2E]/5"}`}>
                            <UploadSimple size={24} className="text-[#0B3D2E] dark:text-[#C8A762]" />
                          </div>
                          <div>
                            <p className={`text-sm font-bold ${heading}`}>{isRTL ? "اسحب الملفات أو انقر للرفع" : "Drag files or click to upload"}</p>
                            <p className={`text-[11px] mt-0.5 ${muted}`}>PDF, JPG, PNG {isRTL ? "— حتى 10 ميغابايت للملف" : "— up to 10MB per file"}</p>
                          </div>
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={handleFileAdd}
                        />
                      </div>

                      {/* File List */}
                      {form.files.length > 0 && (
                        <div className="space-y-2">
                          {form.files.map((file, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: -8 }}
                              animate={{ opacity: 1, y: 0 }}
                              className={`flex items-center justify-between p-3 rounded-xl border ${isDark ? "bg-white/3 border-[#2d3748]" : "bg-gray-50 border-gray-100"}`}
                            >
                              <div className="flex items-center gap-3">
                                <FileText size={18} className="text-[#C8A762]" />
                                <div>
                                  <p className={`text-xs font-bold truncate max-w-48 ${heading}`}>{file.name}</p>
                                  <p className={`text-[10px] ${muted}`}>{(file.size / 1024).toFixed(0)} KB</p>
                                </div>
                              </div>
                              <button onClick={() => removeFile(idx)} className="text-red-400 hover:text-red-500 transition">
                                <X size={16} weight="bold" />
                              </button>
                            </motion.div>
                          ))}
                        </div>
                      )}

                      {form.files.length === 0 && (
                        <div className="flex items-center gap-2 p-3 rounded-xl border border-yellow-200 bg-yellow-50 dark:border-yellow-500/20 dark:bg-yellow-500/5">
                          <Warning size={16} className="text-yellow-500 shrink-0" />
                          <p className="text-[11px] text-yellow-600 dark:text-yellow-400">
                            {isRTL ? "المستندات اختيارية لكنها تزيد من سرعة استجابة المحامين" : "Documents are optional but increase lawyer response speed"}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 3: Budget & Deadline */}
                  {step === 3 && (
                    <div className="space-y-6">
                      {/* Budget Range */}
                      <div>
                        <label className={`block text-sm font-bold mb-1 ${heading}`}>
                          {isRTL ? "الميزانية المتوقعة (ريال سعودي)" : "Expected Budget (SAR)"}
                        </label>
                        <p className={`text-[11px] mb-4 ${muted}`}>{isRTL ? "حدد النطاق الذي يناسبك — سيظهر للمحامين كمؤشر" : "Set your comfortable range — visible to lawyers as a guide"}</p>

                        <div className={`p-5 rounded-2xl border ${isDark ? "border-[#2d3748] bg-white/3" : "border-gray-100 bg-gray-50"}`}>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-2xl font-black text-[#0B3D2E] dark:text-[#C8A762]">{form.budgetMin.toLocaleString()}</span>
                            <span className={`text-sm ${muted}`}>—</span>
                            <span className="text-2xl font-black text-[#0B3D2E] dark:text-[#C8A762]">{form.budgetMax.toLocaleString()}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className={`text-[10px] font-bold ${muted} block mb-1`}>{isRTL ? "الحد الأدنى" : "Min"}</label>
                              <input
                                type="range" min="100" max="50000" step="100"
                                value={form.budgetMin}
                                onChange={e => setForm(f => ({ ...f, budgetMin: Math.min(+e.target.value, f.budgetMax - 100) }))}
                                className="w-full accent-[#0B3D2E]"
                              />
                            </div>
                            <div>
                              <label className={`text-[10px] font-bold ${muted} block mb-1`}>{isRTL ? "الحد الأقصى" : "Max"}</label>
                              <input
                                type="range" min="100" max="50000" step="100"
                                value={form.budgetMax}
                                onChange={e => setForm(f => ({ ...f, budgetMax: Math.max(+e.target.value, f.budgetMin + 100) }))}
                                className="w-full accent-[#0B3D2E]"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Deadline */}
                      <div>
                        <label className={`block text-sm font-bold mb-2 ${heading}`}>
                          {isRTL ? "المهلة الزمنية المطلوبة" : "Required Deadline"}
                          <span className="text-red-500 ms-1">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="date"
                            value={form.deadline}
                            min={new Date().toISOString().split("T")[0]}
                            onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                            className={inputCls}
                          />
                          <CalendarBlank size={16} className={`absolute top-1/2 -translate-y-1/2 ${isRTL ? "left-4" : "right-4"} ${muted} pointer-events-none`} />
                        </div>
                      </div>

                      {/* Budget Presets */}
                      <div>
                        <p className={`text-xs font-bold mb-2 ${muted}`}>{isRTL ? "نطاقات شائعة" : "Common ranges"}</p>
                        <div className="flex flex-wrap gap-2">
                          {[[500, 1500], [1500, 3000], [3000, 7000], [7000, 15000]].map(([min, max]) => (
                            <button
                              key={min}
                              onClick={() => setForm(f => ({ ...f, budgetMin: min, budgetMax: max }))}
                              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition ${
                                form.budgetMin === min && form.budgetMax === max
                                  ? "bg-[#0B3D2E] border-[#0B3D2E] text-white"
                                  : isDark ? "border-[#2d3748] text-gray-300 hover:border-gray-500" : "border-gray-200 text-gray-600 hover:border-gray-300"
                              }`}
                            >
                              {min.toLocaleString()} — {max.toLocaleString()}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 4: Assignment */}
                  {step === 4 && (
                    <div className="space-y-5">
                      <div>
                        <p className={`text-sm font-bold mb-1 ${heading}`}>{isRTL ? "اختر طريقة الإسناد" : "Choose Assignment Method"}</p>
                        <p className={`text-[11px] mb-5 ${muted}`}>{isRTL ? "كيف تريد اختيار المحامي الذي سينفذ طلبك؟" : "How would you like to select the lawyer for your request?"}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button
                          onClick={() => setForm(f => ({ ...f, assignmentMethod: "open_bids" }))}
                          className={`text-start p-5 rounded-2xl border-2 transition-all ${
                            form.assignmentMethod === "open_bids"
                              ? "border-[#0B3D2E] bg-[#0B3D2E]/5"
                              : isDark ? "border-[#2d3748] hover:border-gray-600" : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${form.assignmentMethod === "open_bids" ? "bg-[#0B3D2E]/10" : isDark ? "bg-white/5" : "bg-gray-100"}`}>
                            <Users size={20} className={form.assignmentMethod === "open_bids" ? "text-[#0B3D2E] dark:text-[#C8A762]" : muted} />
                          </div>
                          <p className={`text-sm font-black mb-1 ${form.assignmentMethod === "open_bids" ? "text-[#0B3D2E] dark:text-[#C8A762]" : heading}`}>
                            {isRTL ? "عروض مفتوحة" : "Open Bids"}
                          </p>
                          <p className={`text-[11px] leading-relaxed ${muted}`}>
                            {isRTL
                              ? "يُرسل طلبك لمحامين متعددين ويستقبل عروضهم للمقارنة والاختيار"
                              : "Send your request to multiple lawyers and compare their bids"}
                          </p>
                          {form.assignmentMethod === "open_bids" && (
                            <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-[#0B3D2E] dark:text-[#C8A762]">
                              <CheckCircle size={12} weight="fill" />
                              {isRTL ? "مُختار" : "Selected"}
                            </div>
                          )}
                        </button>

                        <button
                          onClick={() => setForm(f => ({ ...f, assignmentMethod: "direct" }))}
                          className={`text-start p-5 rounded-2xl border-2 transition-all ${
                            form.assignmentMethod === "direct"
                              ? "border-[#0B3D2E] bg-[#0B3D2E]/5"
                              : isDark ? "border-[#2d3748] hover:border-gray-600" : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${form.assignmentMethod === "direct" ? "bg-[#0B3D2E]/10" : isDark ? "bg-white/5" : "bg-gray-100"}`}>
                            <UserCircle size={20} className={form.assignmentMethod === "direct" ? "text-[#0B3D2E] dark:text-[#C8A762]" : muted} />
                          </div>
                          <p className={`text-sm font-black mb-1 ${form.assignmentMethod === "direct" ? "text-[#0B3D2E] dark:text-[#C8A762]" : heading}`}>
                            {isRTL ? "تعيين مباشر" : "Direct Assignment"}
                          </p>
                          <p className={`text-[11px] leading-relaxed ${muted}`}>
                            {isRTL
                              ? "اختر محامياً محدداً من القائمة مباشرةً وأرسل له الطلب"
                              : "Choose a specific lawyer from the list and send directly"}
                          </p>
                          {form.assignmentMethod === "direct" && (
                            <div className="mt-3 flex items-center gap-1 text-[10px] font-bold text-[#0B3D2E] dark:text-[#C8A762]">
                              <CheckCircle size={12} weight="fill" />
                              {isRTL ? "مُختار" : "Selected"}
                            </div>
                          )}
                        </button>
                      </div>

                      {/* Summary Card */}
                      <div className={`rounded-2xl border p-4 space-y-2 ${isDark ? "border-[#2d3748] bg-white/3" : "border-gray-100 bg-gray-50"}`}>
                        <p className={`text-xs font-bold mb-3 ${muted}`}>{isRTL ? "ملخص الطلب" : "Request Summary"}</p>
                        <SummaryRow label={isRTL ? "الخدمة" : "Service"} value={isRTL ? serviceTitle : serviceTitleEn} isDark={isDark} />
                        <SummaryRow label={isRTL ? "المنطقة" : "Region"} value={REGIONS.find(r => r.value === form.region)?.[isRTL ? "label" : "labelEn"] || "—"} isDark={isDark} />
                        <SummaryRow label={isRTL ? "الميزانية" : "Budget"} value={`${form.budgetMin.toLocaleString()} — ${form.budgetMax.toLocaleString()} ر.س`} isDark={isDark} />
                        <SummaryRow label={isRTL ? "المهلة" : "Deadline"} value={form.deadline || "—"} isDark={isDark} />
                        <SummaryRow label={isRTL ? "المستندات" : "Docs"} value={`${form.files.length} ${isRTL ? "ملف" : "file(s)"}`} isDark={isDark} />
                        <SummaryRow label={isRTL ? "السرية" : "Confidential"} value={form.confidential ? (isRTL ? "نعم (NDA مُفعّل)" : "Yes (NDA active)") : (isRTL ? "لا" : "No")} isDark={isDark} />
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {!submitted && submitError && (
            <div className={`mx-6 mb-4 rounded-2xl border p-3 flex items-start gap-3 text-sm ${
              isDark ? "border-red-500/25 bg-red-500/10 text-red-200" : "border-red-200 bg-red-50 text-red-700"
            }`}>
              <Warning size={18} weight="duotone" className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-bold">{isRTL ? "لم يكتمل الإرسال" : "Submission failed"}</p>
                <p className="text-xs mt-0.5 opacity-80">{submitError}</p>
              </div>
            </div>
          )}

          {/* Footer Navigation */}
          {!submitted && (
            <div className={`sticky bottom-0 px-6 py-4 border-t flex items-center justify-between ${isDark ? "bg-[#161b22] border-[#2d3748]" : "bg-white border-gray-100"}`}>
              <button
                onClick={prev}
                disabled={step === 1}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition ${
                  step === 1 ? "opacity-0 pointer-events-none" :
                    isDark ? "bg-white/5 hover:bg-white/10 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }`}
              >
                {isRTL ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
                {isRTL ? "السابق" : "Back"}
              </button>

              <span className={`text-xs font-bold ${muted}`}>
                {isRTL ? `الخطوة ${step} من ${STEPS.length}` : `Step ${step} of ${STEPS.length}`}
              </span>

              {step < 4 ? (
                <button
                  onClick={next}
                  disabled={!canProceed()}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${
                    canProceed()
                      ? "bg-[#0B3D2E] hover:bg-[#0a3328] text-white"
                      : "opacity-40 cursor-not-allowed bg-gray-300 dark:bg-gray-700 text-gray-500"
                  }`}
                >
                  {isRTL ? "التالي" : "Next"}
                  {isRTL ? <ArrowLeft size={16} /> : <ArrowRight size={16} />}
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-[#C8A762] hover:bg-[#b8965a] text-[#0B3D2E] transition"
                >
                  {submitting ? (
                    <><Spinner size={16} className="animate-spin" /> {isRTL ? "جارٍ إرسال الطلب..." : "Sending request..."}</>
                  ) : (
                    <><PaperPlaneRight size={16} weight="fill" /> {isRTL ? "إرسال الطلب" : "Submit Request"}</>
                  )}
                </button>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
