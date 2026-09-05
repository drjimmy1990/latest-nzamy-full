"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  WhatsappLogo, WarningCircle, X,
  PaperPlaneRight, Phone, CheckCircle, Stack, SignIn,
} from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";
import dynamic from "next/dynamic";
const WhatsAppWidget = dynamic(() => import("./floating/WhatsAppWidget"), { ssr: false });
import type { UserCategory } from "./floating/types";
import { useUser } from "@/hooks/useUser";
import { submitLibraryIssueReport, type IssueKind } from "@/lib/services/feedbackService";
import { usePathname } from "next/navigation";
import { useDraftCart } from "@/hooks/useDraftCart";
const DraftDrawer = dynamic(() => import("@/components/laws/DraftDrawer").then(m => ({ default: m.DraftDrawer })), { ssr: false });

// ─── Props ───────────────────────────────────────────────────────────────────

interface ReportConfig {
  pageSlug: string;
  pageType: "law" | "precedent" | "book" | "order";
}

// The drawer's own category picker (kept for its more specific, library-page
// wording) does not share a vocabulary with `IssueKind` — the real backend
// enum behind `submitLibraryIssueReport`
// (LIBRARY_ISSUE_KINDS in src/lib/services/feedbackInput.ts). Map the local
// choice to the closest server kind; "إضافة بيانات" (request new content)
// has no dedicated kind, so it falls to "other".
const REPORT_CATEGORY_TO_ISSUE_KIND: Record<"data_error" | "missing_data" | "add_data" | "other", IssueKind> = {
  data_error:   "wrong_text",
  missing_data: "missing_article",
  add_data:     "other",
  other:        "other",
};

interface FloatingButtonsProps {
  /** When provided, shows an orange "Report Issue" mini-FAB above the WhatsApp button */
  reportConfig?: ReportConfig;
  cartCount?: number;
  onCartClick?: () => void;
}

// ─── Auto-detect category from logged-in user session ────────────────────────

function useAutoCategory(): { category: UserCategory; isLoggedIn: boolean; loading: boolean } {
  const session = useUser();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Session still resolving (or not yet hydrated) — do not report "guest"
  // here. A logged-in lawyer whose session hasn't settled yet would
  // otherwise render as a guest for a frame, showing the guest category
  // chooser before flipping to their real role.
  if (!mounted || session.loading) {
    return { category: null, isLoggedIn: false, loading: true };
  }

  if (!session.isLoggedIn || !session.userType) {
    return { category: null, isLoggedIn: false, loading: false };
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
  return { category, isLoggedIn: session.isLoggedIn, loading: false };
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
  // Not from useAutoCategory() — that hook deliberately reports false while
  // the session is still resolving (see its own comment above), which is
  // right for the always-visible WhatsApp FAB label but wrong here: it would
  // flash the guest notice at a logged-in user for a frame. Read the session
  // directly, the same way ReportArticleIssueButton does.
  const { isLoggedIn } = useUser();

  const [category, setCategory]       = useState<"data_error" | "missing_data" | "add_data" | "other" | "">("");
  const [description, setDescription] = useState("");
  const [whatsapp, setWhatsapp]       = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted]     = useState(false);

  const canSubmit = isLoggedIn && category !== "" && description.trim().length >= 5 && !submitting;

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

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      // library_issue_reports (20260906_phase6_settings_out_of_browser.sql)
      // has no whatsapp column and no attachment storage — there is nowhere
      // server-side to put either, so the optional WhatsApp number rides
      // along inside the description text rather than being silently
      // dropped (the file-attachment picker this drawer used to offer had
      // the same problem with no such fallback, so it was removed instead).
      const whatsappNote = whatsapp.trim();
      const fullDescription = whatsappNote
        ? `${description.trim()}\n\nواتساب للتواصل: ${whatsappNote}`
        : description.trim();

      await submitLibraryIssueReport({
        lawSlug:     reportConfig.pageSlug,
        articleRef:  reportConfig.pageType,
        kind:        REPORT_CATEGORY_TO_ISSUE_KIND[category as "data_error" | "missing_data" | "add_data" | "other"],
        description: fullDescription,
      });

      setSubmitted(true);
      setTimeout(() => {
        onClose();
        setSubmitted(false);
        setCategory("");
        setDescription("");
        setWhatsapp("");
      }, 2500);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : (isRTL ? "تعذّر إرسال البلاغ، حاول مرة أخرى." : "Could not send the report, please try again."),
      );
    } finally {
      setSubmitting(false);
    }
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
              {!isLoggedIn ? (
                // Guests can't submit — `user_id` on the row comes from the
                // session (POST /api/v1/library/issue-reports), so there is
                // no anonymous report to send. Same gate + copy as
                // ReportArticleIssueButton's GuestNotice.
                <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-3 ${isDark ? "border-white/[0.08] bg-white/[0.02]" : "border-zinc-200 bg-zinc-50"}`}>
                  <SignIn size={16} weight="duotone" className={isDark ? "text-zinc-400" : "text-zinc-500"} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-[12px] font-bold ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>
                      {isRTL ? "سجّل الدخول لإرسال البلاغ" : "Log in to send the report"}
                    </p>
                  </div>
                  <a href="/login" className="flex-shrink-0 text-[11px] font-bold text-[#C8A762] hover:underline">
                    {isRTL ? "دخول" : "Log in"}
                  </a>
                </div>
              ) : submitted ? (
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

                  {submitError && (
                    <p className="text-[11px] font-medium text-red-400">{submitError}</p>
                  )}
                </>
              )}
            </div>

            {/* Footer — hidden for a guest (no form to submit) and once submitted */}
            {isLoggedIn && !submitted && (
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
                  {submitting
                    ? (isRTL ? "جارٍ الإرسال..." : "Sending...")
                    : (isRTL ? "إرسال البلاغ" : "Submit Report")}
                </motion.button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Helper to detect if current route is a specific detailed legal item (law, order, precedent, feqh book)
function isLegalItemDetailPage(pathname: string | null): boolean {
  if (!pathname) return false;

  // 1. Royal order / circular detail: /laws/orders/[slug]
  if (pathname.startsWith("/laws/orders/")) {
    const slug = pathname.substring("/laws/orders/".length);
    return Boolean(slug && slug.trim() !== "");
  }

  // 2. Legislation / Law detail: /laws/[slug] (exclude /laws index, subscribe, feqh-preview)
  if (pathname.startsWith("/laws/")) {
    const slug = pathname.substring("/laws/".length);
    if (!slug || slug === "subscribe" || slug === "feqh-preview") {
      return false;
    }
    return true;
  }

  // 3. Precedent / Judicial principle detail: /precedents/[slug] or /precedents/judgment/[slug]
  if (pathname.startsWith("/precedents/")) {
    const slug = pathname.substring("/precedents/".length);
    if (!slug) return false;
    return true;
  }

  // 4. Feqh Book detail: /book/[slug] (exclude /book index or consultation)
  if (pathname.startsWith("/book/")) {
    const slug = pathname.substring("/book/".length);
    if (!slug || slug === "consultation") return false;
    return true;
  }

  return false;
}

/**
 * The one surface the support FAB must not render on.
 *
 * The first draft of this fix suppressed it across `/dashboard`, `/settings`
 * and `/ai` — every authenticated screen. That was wrong, and the call graph
 * is what said so: `FloatingButtons → CreateClient` is a real execution flow.
 * The widget is not a marketing badge on a signed-in screen; `WhatsAppWidget`
 * takes `isLoggedIn`, skips the account-type step for a known user, greets them
 * by name, and can open a service request. Hiding it product-wide would have
 * deleted an ordering path to fix a stacking bug.
 *
 * So the suppression is one route subtree — the ADMIN console — and it is there
 * for a reason positioning cannot fix: `/dashboard/admin` is staff-facing, a
 * "request a legal service" CTA has no audience on it, and shot 07 shows the
 * button physically covering a user row's «تحقق» button and its overflow menu.
 *
 * The other complaints in the owner's screenshots are about STACKING, not
 * presence, and are fixed by the z-index below rather than by deletion.
 */
const FAB_SUPPRESSED_PREFIXES = ["/dashboard/admin"] as const;

export function isFabSuppressedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return FAB_SUPPRESSED_PREFIXES.some(
    // `=== p` covers the bare route, `p + "/"` covers its subtree. The pair is
    // why a future `/ai` entry here would not also swallow `/ai-disclaimer`.
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

// ─── Floating Buttons ────────────────────────────────────────────────────────
// Single WhatsApp FAB + optional Report mini-FAB stacked above it.
// Pass reportConfig to show the orange Report button (library pages only).

export default function FloatingButtons({ reportConfig: propReportConfig, cartCount: propCartCount, onCartClick: propOnCartClick }: FloatingButtonsProps = {}) {
  const pathname = usePathname();
  const { cart, setCart, saveError, clearSaveError } = useDraftCart();
  const [showCart, setShowCart] = useState(false);

  // Check if current page is a specific detailed legal item
  const isItemDetail = isLegalItemDetailPage(pathname);

  // Dynamically calculate reportConfig based on pathname ONLY when inside a specific legal item page
  let reportConfig: ReportConfig | undefined = propReportConfig;
  if (!reportConfig && isItemDetail) {
    if (pathname.startsWith("/laws/orders/")) {
      const slug = pathname.substring("/laws/orders/".length);
      if (slug) reportConfig = { pageSlug: "order-" + slug, pageType: "order" };
    } else if (pathname.startsWith("/laws/")) {
      const slug = pathname.substring("/laws/".length);
      if (slug) reportConfig = { pageSlug: slug, pageType: "law" };
    } else if (pathname.startsWith("/precedents/judgment/")) {
      const slug = pathname.substring("/precedents/judgment/".length);
      if (slug) reportConfig = { pageSlug: "judgment-" + slug, pageType: "precedent" };
    } else if (pathname.startsWith("/precedents/")) {
      const slug = pathname.substring("/precedents/".length);
      if (slug) reportConfig = { pageSlug: slug, pageType: "precedent" };
    } else if (pathname.startsWith("/book/")) {
      const slug = pathname.substring("/book/".length);
      if (slug) reportConfig = { pageSlug: "book-" + slug, pageType: "book" as any };
    }
  }

  // Use props if provided, otherwise use internal draft cart
  const cartCount = propCartCount !== undefined ? propCartCount : cart.length;
  // Floating Draft Cart FAB is strictly restricted to legal item detail pages
  const showDraftFab = cartCount > 0 && isItemDetail;
  const removeArticle = (id: string) => {
    setCart(prev => prev.filter(item => item.articleId !== id));
  };
  const clearAll = () => {
    setCart([]);
  };

  const handleCartClick = propOnCartClick || (() => setShowCart(true));

  const { lang, isDark } = useTheme();
  const isRTL = lang === "ar";
  const { category: autoCategory, isLoggedIn, loading: categoryLoading } = useAutoCategory();
  const rootRef = useRef<HTMLDivElement>(null);

  const [isPrimaryInstance, setIsPrimaryInstance] = useState(true);
  const [waOpen,     setWaOpen]     = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [aiModeActive, setAiModeActive] = useState(false);
  const [userCategory, setUserCategory] = useState<UserCategory>(null);
  const effectiveUserCategory = userCategory ?? autoCategory;
  // Admins manage the platform, not client relationships — the WhatsApp FAB is noise for them.
  const isAdmin = effectiveUserCategory === "admin";

  // A category picked manually (guest chooser, or an earlier session) must
  // not survive the guest→logged-in transition — once the real session
  // resolves to a logged-in user, the role's own category takes over. Keyed
  // on the false→true edge (a ref, not render-height state) so it fires once
  // per login rather than fighting every later manual pick.
  const wasLoggedInRef = useRef(false);
  useEffect(() => {
    if (isLoggedIn && !wasLoggedInRef.current) {
      setUserCategory(null);
    }
    wasLoggedInRef.current = isLoggedIn;
  }, [isLoggedIn]);

  const openWa  = useCallback(() => setWaOpen(true),  []);
  const closeWa = useCallback(() => setWaOpen(false), []);

  useEffect(() => {
    const handler = () => setShowCart(true);
    window.addEventListener("nzamy-open-cart", handler);
    return () => window.removeEventListener("nzamy-open-cart", handler);
  }, []);

  // Hidden while a page (e.g. the /laws AI tab) signals it's in full-screen
  // AI mode. Reset on route change so it never stays stuck hidden.
  useEffect(() => {
    const handler = (e: Event) => setAiModeActive(!!(e as CustomEvent<{ active: boolean }>).detail?.active);
    window.addEventListener("nzamy-ai-mode", handler);
    return () => window.removeEventListener("nzamy-ai-mode", handler);
  }, []);
  useEffect(() => { setAiModeActive(false); }, [pathname]);

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
  // While the session is still resolving, useAutoCategory forces
  // isLoggedIn to false (by design — see its comment), so reading isLoggedIn
  // here during that window would announce the guest label to a user who
  // turns out to be logged in. This always-visible FAB (unlike the panel
  // below, which is withheld outright) uses a role-neutral label until
  // categoryLoading clears, then shows the real one.
  const buttonTooltip = categoryLoading
    ? (isRTL ? "المساعد القانوني" : "Legal Assistant")
    : isRTL
      ? (isLoggedIn ? "مساعد نظامي حسب دورك" : "اطلب خدمة قانونية")
      : (isLoggedIn ? "Role-aware Nzamy assistant" : "Request Legal Service");

  const reportTooltip = isRTL ? "أبلغ عن مشكلة" : "Report an issue";

  // Every hook above has already run, so this early return does not change the
  // hook order on any route.
  if (isFabSuppressedPath(pathname)) return null;


  return (
    <div ref={rootRef} data-nzamy-floating-root="true" className={`${isPrimaryInstance && !aiModeActive ? "" : "hidden"} print:hidden`}>
      {/* WhatsApp Panel — hidden for admins (owner-edits), and withheld while the
          session is still resolving, so a logged-in user can never be shown the
          guest category chooser first (main). */}
      {!isAdmin && !categoryLoading && (
        <WhatsAppWidget
          open={waOpen} onClose={closeWa}
          bottomPos={panelBottom} panelSide={waPanelSide}
          onUserTypeSelected={setUserCategory}
          isLoggedIn={isLoggedIn}
          userCategory={effectiveUserCategory}
        />
      )}

      {/* Report Drawer — only rendered when reportConfig provided */}
      {reportConfig && (
        <ReportDrawer
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          reportConfig={reportConfig}
        />
      )}

      {/* Speed-Dial container — stacks Report above WhatsApp */}
      {/* z-40, not z-9999.
          At 9999 this FAB sat above EVERY dialog in the product: the lowest
          modal here is AddHearingModal at z-[60], AddClientModal is z-[200],
          the report drawer above is z-[10000]. Shot 25 caught the consequence —
          the green button at full opacity on top of the add-hearing modal's own
          backdrop, having escaped the modal's stacking context entirely, which
          is matrix row 168's complaint in its most severe form.
          40 is above page content and below every overlay, which is the only
          band a persistent FAB belongs in. */}
      <div className={`fixed bottom-20 md:bottom-6 ${waBtnSide} z-40 flex flex-col items-center gap-2.5 print:hidden safe-bottom`}>

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

        {/* ── Green WhatsApp main FAB (hidden for admins) ── */}
        {!isAdmin && (
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
        )}

      </div>

      {/* ── Floating Draft Cart FAB (Restricted to legal item detail pages) ── */}
      {showDraftFab && (
        <div className={`fixed bottom-20 md:bottom-6 ${isRTL ? "left-[88px]" : "right-[88px]"} z-40 print:hidden safe-bottom`}>
          <div className="relative group">
            {/* Tooltip */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white text-[11px] font-bold shadow-lg border border-white/10 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10">
              {isRTL ? "المسودة" : "Draft"}
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleCartClick}
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

      {/* ── Draft Drawer ── */}
      <AnimatePresence>
        {showCart && (
          <DraftDrawer
            cart={cart}
            onRemoveArticle={removeArticle}
            onClearAll={clearAll}
            onClose={() => setShowCart(false)}
            isDark={isDark}
            isRTL={isRTL}
          />
        )}
      </AnimatePresence>

      {/* Item 94: the server is the store for a signed-in cart — surface a
          failed sync instead of silently losing it. z-[10002] sits above the
          drawer (z-[10001]) so the message is visible whether or not it's open. */}
      {saveError && (
        <div
          role="alert"
          className={`fixed top-24 inset-x-0 mx-auto w-fit max-w-[92vw] z-[10002] px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 print:hidden ${
            isDark ? "bg-red-950/90 text-red-200 border border-red-800/60" : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          <WarningCircle size={16} weight="fill" />
          <span>{saveError}</span>
          <button
            type="button"
            onClick={clearSaveError}
            aria-label={isRTL ? "إغلاق" : "Close"}
            className="opacity-70 hover:opacity-100"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      )}
    </div>
  );
}
