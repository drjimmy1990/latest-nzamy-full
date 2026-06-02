"use client";

/**
 * OnboardingBanner.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Dismissible welcome banner for first-time dashboard visitors.
 * - Shown only on the FIRST visit (localStorage key per userType).
 * - Auto-tailored message + 3 starter actions per role.
 * - Conforms to P9: Phosphor Icons only, spring motion, no hardcoded colours.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkle, X, ArrowLeft } from "@phosphor-icons/react";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type RoleKey =
  | "lawyer" | "firm" | "client" | "business"
  | "government" | "ngo" | "provider" | "micro";

interface Action {
  label: string;
  href: string;
  primary?: boolean;
}

interface RoleContent {
  headline: string;
  body: string;
  actions: Action[];
}

// ─── Role-specific content ────────────────────────────────────────────────────

const ROLE_CONTENT: Record<RoleKey, RoleContent> = {
  lawyer: {
    headline: "أهلاً بك في منصة نظامي — بيئة العمل القانوني المتكاملة",
    body: "ابدأ بإضافة أول قضية، أو جرّب الصائغ القانوني لصياغة مستند احترافي في ثوانٍ.",
    actions: [
      { label: "أضف أول قضية", href: "/dashboard/lawyer/cases", primary: true },
      { label: "الصائغ القانوني", href: "/ai/draft" },
      { label: "جدولة جلسة", href: "/dashboard/lawyer/hearings" },
    ],
  },
  firm: {
    headline: "مرحباً بك في لوحة تحكم مكتبك القانوني",
    body: "أضف أعضاء فريقك، وعيّن القضايا، وتابع الأداء من مكان واحد.",
    actions: [
      { label: "أضف عضو في الفريق", href: "/dashboard/firm/team", primary: true },
      { label: "إنشاء قضية", href: "/dashboard/firm/cases" },
      { label: "إعدادات المكتب", href: "/dashboard/firm/settings" },
    ],
  },
  client: {
    headline: "أهلاً بك — احصل على المساعدة القانونية بسهولة",
    body: "قدّم طلب خدمة، أو تواصل مع محامٍ متخصص، أو استخدم المجيب السريع للإجابة عن سؤالك القانوني.",
    actions: [
      { label: "طلب خدمة قانونية", href: "/dashboard/client/requests/new", primary: true },
      { label: "ابحث عن محامٍ", href: "/dashboard/client/find-lawyer" },
      { label: "المجيب السريع", href: "/ai/quick-answer" },
    ],
  },
  business: {
    headline: "مرحباً بك — إدارة الملف القانوني لشركتك",
    body: "اربط مستشارك القانوني، وتابع العقود والتراخيص، وأنشئ طلبات الرأي القانوني من لوحة تحكم واحدة.",
    actions: [
      { label: "قدّم طلب قانوني", href: "/dashboard/business/requests", primary: true },
      { label: "مراجعة العقود", href: "/dashboard/business/contracts" },
      { label: "الحوكمة والامتثال", href: "/dashboard/business/governance" },
    ],
  },
  government: {
    headline: "منصة نظامي — الشريك القانوني للجهات الحكومية",
    body: "راجع اللوائح، وأنشئ الصكوك، وتابع قضايا الجهة بكفاءة وشفافية.",
    actions: [
      { label: "لوحة القضايا", href: "/dashboard/government/cases", primary: true },
      { label: "اللوائح والتعليمات", href: "/dashboard/government/regulations" },
      { label: "الرأي القانوني", href: "/ai/legal-opinion" },
    ],
  },
  ngo: {
    headline: "أهلاً بك في منصة نظامي للمنظمات غير الربحية",
    body: "إدارة المتطوعين، ورفع التقارير، وتنظيم الفعاليات والعقود — كل شيء في مكان واحد.",
    actions: [
      { label: "إضافة متطوع", href: "/dashboard/ngo/volunteers/new", primary: true },
      { label: "إنشاء تقرير", href: "/ai/ngo/report-generator" },
      { label: "إدارة الفعاليات", href: "/dashboard/ngo/events" },
    ],
  },
  provider: {
    headline: "مرحباً بك كمزوّد خدمة في سوق نظامي",
    body: "أكمل ملفك المهني، وابدأ بقبول الطلبات الواردة لعرض خدماتك على آلاف العملاء.",
    actions: [
      { label: "أكمل ملفي المهني", href: "/dashboard/provider/profile", primary: true },
      { label: "الطلبات الواردة", href: "/dashboard/provider/requests" },
      { label: "السوق القانوني", href: "/marketplace" },
    ],
  },
  micro: {
    headline: "أهلاً بك — ابدأ رحلتك نحو الامتثال القانوني",
    body: "تحقق من اشتراطات نشاطك، وأنشئ عقودك الأولى، واحصل على التوجيه بخطوات واضحة.",
    actions: [
      { label: "قائمة الاشتراطات", href: "/dashboard/micro/requirements", primary: true },
      { label: "إنشاء عقد", href: "/ai/contracts" },
      { label: "استشارة سريعة", href: "/ai/quick-answer" },
    ],
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function storageKey(role: RoleKey) {
  return `nzamy_onboarding_dismissed_${role}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingBannerProps {
  role: RoleKey;
  name?: string;
  isDark: boolean;
}

export function OnboardingBanner({ role, name, isDark }: OnboardingBannerProps) {
  const [visible, setVisible] = useState(false);
  const content = ROLE_CONTENT[role];

  // Only show on first visit per role
  useEffect(() => {
    try {
      if (!localStorage.getItem(storageKey(role))) {
        setVisible(true);
      }
    } catch { /* SSR / privacy mode */ }
  }, [role]);

  function dismiss() {
    try { localStorage.setItem(storageKey(role), "1"); } catch { /* noop */ }
    setVisible(false);
  }

  if (!content) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 200, damping: 24 }}
          className={`relative rounded-2xl border overflow-hidden ${
            isDark
              ? "border-[#C8A762]/20 bg-gradient-to-l from-[#0B3D2E]/30 via-zinc-900/70 to-zinc-900/40"
              : "border-[#C8A762]/25 bg-gradient-to-l from-[#0B3D2E]/5 via-amber-50/60 to-white"
          }`}
          dir="rtl"
        >
          {/* Decorative glow */}
          <div
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{
              background: isDark
                ? "radial-gradient(ellipse 60% 80% at 90% 50%, rgba(200,167,98,0.08) 0%, transparent 70%)"
                : "radial-gradient(ellipse 60% 80% at 90% 50%, rgba(11,61,46,0.05) 0%, transparent 70%)",
            }}
          />

          <div className="relative p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            {/* Icon */}
            <div className="w-11 h-11 rounded-xl bg-[#0B3D2E] flex items-center justify-center flex-shrink-0 shadow-md">
              <Sparkle size={20} weight="duotone" className="text-[#C8A762]" />
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className={`text-[14px] font-bold leading-tight mb-1 ${isDark ? "text-white" : "text-slate-800"}`}>
                {name ? `${content.headline}، ${name}` : content.headline}
              </p>
              <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
                {content.body}
              </p>

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mt-3">
                {content.actions.map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    onClick={dismiss}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all ${
                      a.primary
                        ? "bg-[#0B3D2E] text-[#C8A762] hover:bg-[#0B3D2E]/90"
                        : isDark
                          ? "border border-white/10 text-zinc-300 hover:bg-white/[0.06]"
                          : "border border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {a.label}
                    {a.primary && <ArrowLeft size={12} />}
                  </Link>
                ))}
              </div>
            </div>

            {/* Dismiss */}
            <button
              onClick={dismiss}
              aria-label="إغلاق"
              className={`absolute top-3 left-3 w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${
                isDark ? "text-zinc-600 hover:bg-white/[0.06] hover:text-zinc-300" : "text-slate-300 hover:bg-slate-100 hover:text-slate-600"
              }`}
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
