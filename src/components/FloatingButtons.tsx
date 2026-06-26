"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import {
  WhatsappLogo, WarningCircle, X,
  PaperPlaneRight, Phone, CheckCircle, Stack,
  Paperclip, FileText
} from "@phosphor-icons/react";
import { Image as ImageIcon } from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";
import WhatsAppWidget from "./floating/WhatsAppWidget";
import type { UserCategory } from "./floating/types";
import { useUser } from "@/hooks/useUser";
import { submitIssueReport, type IssueReport, type AttachedFile } from "@/lib/invitationStore";

// ─── Props ───────────────────────────────────────────────────────────────────

interface ReportConfig {
  pageSlug: string;
  pageType: IssueReport["pageType"];
}

interface FloatingButtonsProps {
  /** When provided, shows an orange "Report Issue" mini-FAB above the WhatsApp button */
  reportConfig?: ReportConfig;
  cartCount?: number;
  onCartClick?: () => void;
}

// ─── Auto-detect category from logged-in user session ────────────────────────

function useAutoCategory(): { category: UserCategory; isLoggedIn: boolean } {
  const session = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted || !session.isLoggedIn || !session.userType) {
    return { category: null, isLoggedIn: mounted ? session.isLoggedIn : false };
  }

  const typeMap: Record<string, UserCategory> = {
    lawyer:     "lawyer",
    firm:       "firm",
    individual: "individual",
    client:     "individual",
    corporate:  "corporate",
    micro:      "micro",
    provider:   "provider",
    admin:      "admin",
    government: "government",
    ngo:        "ngo",
  };

  const category = typeMap[session.userType] ?? null;
  return { category, isLoggedIn: session.isLoggedIn };
}

// ─── Report Issue Drawer (embedded) ──────────────────────────────────────────

function ReportDrawer({
  open,
  onClose,
  reportConfig,
}: {
  open: boolean;
  onClose: () => void;
  reportConfig: ReportConfig;
}) {
  const { isDark, isRTL } = useTheme();

  const [category, setCategory]       = useState<"data_error" | "missing_data" | "add_data" | "other" | "">("");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp]       = useState("");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [submitted, setSubmitted]     = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSubmit = category !== "" && description.trim().length >= 5;

  const categories = [
    {
      id: "data_error" as const,
      label: isRTL ? "خطأ في البيانات" : "Data Error",
      desc: isRTL ? "تعديل نص مادة، تصحيح كلمة أو مرجع" : "Modify article text, correct word or reference",
    },
    {
      id: "missing_data" as const,
      label: isRTL ? "بيانات ناقصة" : "Missing Data",
      desc: isRTL ? "نص مادة غير موجود أو نقص بالفهرس" : "Missing article or incomplete index",
    },
    {
      id: "add_data" as const,
      label: isRTL ? "إضافة بيانات" : "Add Data",
      desc: isRTL ? "طلب إضافة تعميم، لائحة أو مبدأ متصل" : "Request circular, regulation or related principle",
    },
    {
      id: "other" as const,
      label: isRTL ? "أخرى" : "Other",
      desc: isRTL ? "أي ملاحظات عامة حول جودة أو عرض المحتوى" : "General display or quality feedback",
    },
  ];

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        alert(isRTL ? "أقصى حجم للملف هو 5 ميجابايت" : "Max file size is 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setAttachedFiles((prev) => [
          ...prev,
          {
            name: file.name,
            type: file.type,
            dataUrl,
            size: file.size,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit() {
    if (!canSubmit) return;
    const firstImg = attachedFiles.find(f => f.type.startsWith("image/"))?.dataUrl;
    submitIssueReport({
      pageSlug:         reportConfig.pageSlug,
      pageType:         reportConfig.pageType,
      description:      description.trim(),
      category:         category || undefined,
      attachedFiles:    attachedFiles,
      screenshotDataUrl: firstImg,
      whatsapp:         whatsapp.trim() || undefined,
    });
    setSubmitted(true);
    setTimeout(() => {
      onClose();
      setSubmitted(false);
      setCategory("");
      setDescription("");
      setWhatsapp("");
      setAttachedFiles([]);
    }, 2500);
  }

  const overlay  = isDark ? "bg-zinc-900/60 backdrop-blur-sm" : "bg-black/20 backdrop-blur-sm";
  const drawer   = isDark ? "bg-zinc-900 border border-white/[0.06]" : "bg-white border border-zinc-200 shadow-2xl";
  const inputCls = `w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
    isDark
      ? "bg-zinc-800 border-white/[0.08] text-zinc-100 placeholder-zinc-500 focus:border-orange-500/40 focus:ring-orange-500/10"
      : "bg-zinc-50 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-orange-400/60 focus:ring-orange-400/10"
  }`;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="rb-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[10000] ${overlay}`}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            key="rb-drawer"
            initial={{ x: isRTL ? "-100%" : "100%", opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: isRTL ? "-100%" : "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 30 }}
            className={`fixed top-0 end-0 z-[10001] h-full w-full max-w-sm flex flex-col ${drawer}`}
            dir={isRTL ? "rtl" : "ltr"}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? "bg-orange-950/60 border border-orange-500/20" : "bg-orange-50 border border-orange-200"}`}>
                  <WarningCircle size={16} weight="fill" className="text-orange-400" />
                </div>
                <div>
                  <h2 className={`text-[14px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                    {isRTL ? "أبلغ عن مشكلة" : "Report an Issue"}
                  </h2>
                  <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                    {isRTL ? "ساعدنا نحسّن المكتبة" : "Help us improve the library"}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-zinc-100 text-zinc-500"}`}
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
              {submitted ? (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center justify-center h-48 text-center gap-3"
                >
                  <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                    <CheckCircle size={30} weight="fill" className="text-emerald-500" />
                  </div>
                  <p className={`text-[15px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>
                    {isRTL ? "تم إرسال البلاغ!" : "Report Submitted!"}
                  </p>
                  <p className={`text-[12px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    {isRTL ? "شكراً لمساعدتك في تحسين المكتبة" : "Thank you for helping improve the library"}
                  </p>
                </motion.div>
              ) : (
                <>
                  {/* Category Selection */}
                  <div className="space-y-2">
                    <label className={`block text-[12px] font-semibold ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      {isRTL ? "نوع الملاحظة" : "Issue Type"}
                      <span className="text-red-400 ms-0.5">*</span>
                    </label>
                    <div className="space-y-2">
                      {categories.map((cat) => {
                        const selected = category === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setCategory(cat.id)}
                            className={`w-full text-start p-3 rounded-xl border transition-all flex items-start gap-2.5 ${
                              selected
                                ? isDark
                                  ? "bg-orange-500/10 border-orange-500 text-orange-400"
                                  : "bg-orange-50 border-orange-500 text-orange-600"
                                : isDark
                                  ? "bg-zinc-800/40 border-white/[0.06] hover:bg-zinc-800/80 text-zinc-300"
                                  : "bg-zinc-50/60 border-zinc-200 hover:bg-zinc-50 text-zinc-700"
                            }`}
                          >
                            <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${
                              selected
                                ? "border-orange-500"
                                : isDark ? "border-zinc-600" : "border-zinc-300"
                            }`}>
                              {selected && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-col leading-tight">
                                <span className="text-[12px] font-bold">{cat.label}</span>
                                <span className={`text-[10px] font-normal mt-0.5 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                                  {cat.desc}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      {isRTL ? "وصف المشكلة" : "Describe the Issue"}
                      <span className="text-red-400 ms-0.5">*</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3} maxLength={500}
                      placeholder={isRTL
                        ? "مثال: نص المادة 12 ناقص / الترتيب غير صحيح / المحتوى لا يظهر..."
                        : "e.g. Article 12 text is missing / content doesn't display..."}
                      className={`${inputCls} resize-none`}
                    />
                    <div className={`flex justify-end mt-1 text-[10px] ${isDark ? "text-zinc-600" : "text-zinc-400"}`}>
                      {description.length}/500
                    </div>
                  </div>

                  {/* File Attachments */}
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      {isRTL ? "إرفاق ملفات أو صور (اختياري)" : "Attach Files or Images (optional)"}
                    </label>
                    <input
                      ref={fileRef}
                      type="file"
                      multiple
                      accept="image/*,.pdf,.doc,.docx,.txt"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    
                    <div className="space-y-2">
                      {/* Attachment trigger button */}
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className={`w-full h-11 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 text-[12px] font-bold transition-all ${
                          isDark
                            ? "border-white/[0.08] text-zinc-400 bg-zinc-800/20 hover:border-orange-500/30 hover:text-orange-400 hover:bg-orange-500/[0.02]"
                            : "border-zinc-200 text-zinc-500 bg-zinc-50/50 hover:border-orange-300 hover:text-orange-600 hover:bg-orange-50/[0.02]"
                        }`}
                      >
                        <Paperclip size={14} className="text-orange-400" />
                        {isRTL ? "إضافة ملفات وصور..." : "Add files & images..."}
                      </button>

                      {/* Attached Files List */}
                      {attachedFiles.length > 0 && (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {attachedFiles.map((file, idx) => {
                            const isImage = file.type.startsWith("image/");
                            const formattedSize = file.size > 1024 * 1024
                              ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                              : `${(file.size / 1024).toFixed(0)} KB`;
                            
                            return (
                              <div
                                key={idx}
                                className={`flex items-center justify-between p-2 rounded-xl border text-[11px] ${
                                  isDark
                                    ? "bg-zinc-800/40 border-white/[0.05] text-zinc-300"
                                    : "bg-zinc-50/50 border-zinc-150 text-zinc-700"
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {isImage ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={file.dataUrl}
                                      alt={file.name}
                                      className="w-7 h-7 rounded-lg object-cover border border-zinc-200 dark:border-zinc-700 flex-shrink-0"
                                    />
                                  ) : (
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                      isDark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"
                                    }`}>
                                      <FileText size={14} />
                                    </div>
                                  )}
                                  <div className="min-w-0 leading-tight">
                                    <div className="font-semibold truncate max-w-[180px]">{file.name}</div>
                                    <div className={`text-[9px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{formattedSize}</div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                                    isDark ? "hover:bg-white/[0.06] text-zinc-400" : "hover:bg-zinc-200 text-zinc-500"
                                  }`}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <label className={`block text-[12px] font-semibold mb-1.5 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>
                      <Phone size={12} weight="fill" className="inline me-1" />
                      {isRTL ? "رقم واتساب (اختياري)" : "WhatsApp (optional)"}
                    </label>
                    <input
                      type="tel" value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="+966 5X XXX XXXX"
                      className={inputCls} dir="ltr"
                    />
                    <p className={`text-[10px] mt-1 ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>
                      {isRTL ? "لنتواصل معك ونُبلغك عند حل المشكلة" : "We'll contact you when the issue is resolved"}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {!submitted && (
              <div className={`px-5 py-4 border-t ${isDark ? "border-white/[0.06]" : "border-zinc-100"}`}>
                <motion.button
                  whileHover={canSubmit ? { scale: 1.01 } : {}}
                  whileTap={canSubmit ? { scale: 0.98 } : {}}
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={`w-full py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all ${
                    canSubmit
                      ? "bg-[#0B3D2E] text-white hover:bg-[#0a3328]"
                      : isDark
                        ? "bg-white/[0.04] text-zinc-600 cursor-not-allowed"
                        : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                  }`}
                >
                  <PaperPlaneRight size={15} weight="fill" className={isRTL ? "rotate-180" : ""} />
                  {isRTL ? "إرسال البلاغ" : "Submit Report"}
                </motion.button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Floating Buttons ────────────────────────────────────────────────────────
// Single WhatsApp FAB + optional Report mini-FAB stacked above it.
// Pass reportConfig to show the orange Report button (library pages only).

export default function FloatingButtons({ reportConfig, cartCount = 0, onCartClick }: FloatingButtonsProps = {}) {
  const { lang, isDark } = useTheme();
  const isRTL = lang === "ar";
  const { category: autoCategory, isLoggedIn } = useAutoCategory();
  const rootRef = useRef<HTMLDivElement>(null);

  const [isPrimaryInstance, setIsPrimaryInstance] = useState(true);
  const [waOpen,     setWaOpen]     = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [userCategory, setUserCategory] = useState<UserCategory>(null);
  const effectiveUserCategory = userCategory ?? autoCategory;

  const openWa  = useCallback(() => setWaOpen(true),  []);
  const closeWa = useCallback(() => setWaOpen(false), []);

  useEffect(() => {
    const refreshPrimaryInstance = () => {
      const isInsideMain = rootRef.current ? document.getElementById("main-content")?.contains(rootRef.current) : false;
      if (isInsideMain) {
        setIsPrimaryInstance(true);
      } else {
        const hasLocalInstance = document.querySelector('#main-content [data-nzamy-floating-root="true"]') !== null;
        setIsPrimaryInstance(!hasLocalInstance);
      }
    };
    refreshPrimaryInstance();
    const observer = new MutationObserver(refreshPrimaryInstance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const waBtnSide   = isRTL ? "left-6" : "right-6";
  const waPanelSide = isRTL ? "left-6" : "right-6";
  const panelBottom = "bottom-24 md:bottom-20";
  const buttonTooltip = isRTL
    ? (isLoggedIn ? "مساعد نظامي حسب دورك" : "اطلب خدمة قانونية")
    : (isLoggedIn ? "Role-aware Nzamy assistant" : "Request Legal Service");

  const reportTooltip = isRTL ? "أبلغ عن مشكلة" : "Report an issue";

  return (
    <div ref={rootRef} data-nzamy-floating-root="true" className={`${isPrimaryInstance ? "" : "hidden"} print:hidden`}>
      {/* WhatsApp Panel */}
      <WhatsAppWidget
        open={waOpen} onClose={closeWa}
        bottomPos={panelBottom} panelSide={waPanelSide}
        onUserTypeSelected={setUserCategory}
        isLoggedIn={isLoggedIn}
        userCategory={effectiveUserCategory}
      />

      {/* Report Drawer — only rendered when reportConfig provided */}
      {reportConfig && (
        <ReportDrawer
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          reportConfig={reportConfig}
        />
      )}

      {/* Speed-Dial container — stacks Report above WhatsApp */}
      <div className={`fixed bottom-20 md:bottom-6 ${waBtnSide} z-[9999] flex flex-col items-center gap-2.5 print:hidden`}>

        {/* ── Orange Report mini-FAB (only on library pages) ── */}
        {reportConfig && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, scale: 0.6, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: 8 }}
              transition={{ type: "spring", stiffness: 300, damping: 22 }}
              className="relative group"
            >
              {/* Tooltip */}
              <div className={`absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-white text-[11px] font-bold shadow-lg border pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10 ${
                isDark ? "bg-zinc-800 border-white/10" : "bg-zinc-900 border-white/10"
              }`}>
                {reportTooltip}
              </div>

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => { setReportOpen(true); setWaOpen(false); }}
                aria-label={isRTL ? "أبلغ عن مشكلة في المكتبة" : "Report a library issue"}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shadow-lg ${
                  isDark
                    ? "bg-orange-950/80 border border-orange-500/30 hover:bg-orange-900/90 hover:border-orange-500/50 shadow-orange-500/10"
                    : "bg-orange-50 border border-orange-200 hover:bg-orange-100 hover:border-orange-300 shadow-orange-200/60"
                }`}
              >
                <WarningCircle
                  size={20}
                  weight="fill"
                  className={isDark ? "text-orange-400" : "text-orange-500"}
                />
              </motion.button>
            </motion.div>
          </AnimatePresence>
        )}

        {/* ── Green WhatsApp main FAB ── */}
        <div className="relative group">
          {/* Tooltip */}
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white text-[11px] font-bold shadow-lg border border-white/10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10">
            {buttonTooltip}
          </div>

          {/* Pulse ring */}
          {!waOpen && (
            <motion.span
              className="absolute inset-0 rounded-full bg-[#25D366] pointer-events-none"
              animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
            />
          )}

          <button
            onClick={() => { waOpen ? closeWa() : openWa(); setReportOpen(false); }}
            className={`relative w-14 h-14 rounded-full shadow-[0_8px_20px_rgba(37,211,102,0.3)] flex items-center justify-center transition-all duration-300 hover:scale-105 active:scale-95
              ${waOpen
                ? "bg-[#25D366] dark:bg-[#1fad55] ring-2 ring-white ring-offset-2"
                : "bg-[#25D366] hover:bg-[#1ebe5d] dark:bg-[#1fad55] dark:hover:bg-[#1a9e4d]"
              }`}
            aria-label={buttonTooltip}
          >
            <WhatsappLogo size={28} weight="fill" className="text-white drop-shadow-md" />
          </button>
        </div>

      </div>

      {/* ── Floating Draft Cart FAB ── */}
      {cartCount > 0 && (
        <div className={`fixed bottom-20 md:bottom-6 ${isRTL ? "left-[88px]" : "right-[88px]"} z-[9999] print:hidden`}>
          <div className="relative group">
            {/* Tooltip */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white text-[11px] font-bold shadow-lg border border-white/10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {isRTL ? "المسودة" : "Draft"}
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onCartClick}
              className="relative w-14 h-14 rounded-full bg-[#0B3D2E] hover:bg-[#082d22] text-[#C8A762] shadow-[0_8px_20px_rgba(11,61,46,0.3)] flex items-center justify-center border border-white/10 transition-all duration-300 hover:scale-105 active:scale-95"
              aria-label={isRTL ? "المسودة" : "Draft"}
            >
              <Stack size={26} weight="fill" />
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#C8A762] text-[#0B3D2E] text-[10px] font-black flex items-center justify-center border border-white/20">
                {cartCount}
              </span>
            </motion.button>
          </div>
        </div>
      )}
    </div>
  );
}
