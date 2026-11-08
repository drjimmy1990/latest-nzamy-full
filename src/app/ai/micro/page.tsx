"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Storefront, Warning, ChatCircleDots, Brain,
  ArrowLeft, ClipboardText, UserCircle,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

// S3-05. This page used to wait 2.5 seconds and print a template built from the
// answers, behind the beta gate. Owner ٤١٧ (answer of 8 Nov 2026): the contract
// tools («محترف العقود» and the contract drafter) are for lawyers and law firms
// only, so the three contract cases that opened the drafter are gone; a small
// business gets the general guidance tools every account runs. The other three
// cases have no engine yet, so they say «قريباً» and open nothing.

/** The general guidance owner ٤١٧ leaves open to every account (tools.ts REGISTERED_ROLES). */
const GUIDANCE_LINKS = [
  { href: "/ai/quick-answer", icon: ChatCircleDots, title: "سؤال قانوني سريع", desc: "سؤال محدد عن نشاطك — إجابة مستندة إلى الأنظمة السعودية" },
  { href: "/ai/legal-opinion", icon: Brain, title: "الرأي القانوني", desc: "استشارة مكتوبة أو خطاب قانوني في مسألتك" },
];

const SOON_CASES = [
  {
    id: "warning_letter",
    icon: Warning,
    title: "إنذار موظف",
    desc: "خطاب إنذار رسمي بسبب تأخر أو مخالفة",
  },
  {
    id: "complaint_reply",
    icon: ClipboardText,
    title: "رد على شكوى",
    desc: "رد رسمي على شكوى موظف أو جهة حكومية",
  },
  {
    id: "consultation",
    icon: UserCircle,
    title: "استشارة سريعة",
    desc: "سؤال قانوني بسيط — إجابة واضحة وعملية",
  },
];

export default function MicroBusinessPage() {
  const { isDark } = useTheme();

  return (
    <div className={`p-5 md:p-7 max-w-3xl mx-auto space-y-5 ${isDark ? "text-zinc-100" : "text-zinc-900"}`} dir="rtl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Storefront size={20} weight="duotone" className="text-[#C8A762]" />
          <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>المساعد القانوني للمنشآت الصغيرة</h1>
        </div>
        <p className={`text-[13px] ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
          للتوجيه العام اختر أداة أدناه. صياغة العقود في نظامي من أدوات المحامين ومكاتب المحاماة.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {GUIDANCE_LINKS.map((s) => {
          const Icon = s.icon;
          return (
            <motion.div key={s.href} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <Link
                href={s.href}
                className={`block rounded-2xl border p-5 text-start transition-all ${
                  isDark ? "border-white/[0.07] hover:bg-white/[0.03]" : "border-zinc-200/70 bg-white hover:bg-zinc-50 shadow-sm"
                }`}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[#C8A762]/30 bg-[#C8A762]/10">
                  <Icon size={20} weight="duotone" className="text-[#C8A762]" />
                </div>
                <p className={`font-bold text-[14px] mb-1 ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>{s.title}</p>
                <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.desc}</p>
                <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-[#C8A762]">
                  <span>افتح الأداة</span>
                  <ArrowLeft size={12} />
                </div>
              </Link>
            </motion.div>
          );
        })}

        {SOON_CASES.map((s) => {
          const Icon = s.icon;
          return (
            <div
              key={s.id}
              aria-disabled="true"
              className={`rounded-2xl border p-5 text-start opacity-70 ${
                isDark ? "border-white/[0.07]" : "border-zinc-200/70 bg-white shadow-sm"
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${isDark ? "border-white/[0.08] bg-white/[0.04]" : "border-zinc-200 bg-zinc-50"}`}>
                  <Icon size={20} weight="duotone" className={isDark ? "text-zinc-500" : "text-zinc-400"} />
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${isDark ? "bg-white/[0.06] text-zinc-400" : "bg-zinc-100 text-zinc-500"}`}>
                  قريباً
                </span>
              </div>
              <p className={`font-bold text-[14px] mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>{s.title}</p>
              <p className={`text-[12px] leading-relaxed ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{s.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
