"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Download, Trash, ArrowSquareOut, ShieldCheck,
  UserCircle, Buildings, CheckCircle,
} from "@phosphor-icons/react";
import { useUser } from "@/hooks/useUser";
import { SectionTitle, ToggleRow } from "./_shared";

// ── Privacy config per user type ──────────────────────────────────────
function getPrivacyToggles(userType: string | null) {
  const shared = [
    { key: "ai_training", label: "السماح لنظامي AI باستخدام محادثاتي", description: "يُستخدم لتحسين دقة الاستشارات القانونية", defaultOn: false },
  ];

  switch (userType) {
    case "individual":
      return [
        { key: "show_profile",  label: "إظهار ملفي للمحامين المقترحين",  description: "يسمح للمحامين برؤية ملفك عند المطابقة",          defaultOn: true  },
        { key: "search_index",  label: "ظهوري في نتائج البحث الداخلي",    description: "المحامون والمكاتب يستطيعون العثور عليك",           defaultOn: true  },
        ...shared,
      ];

    case "lawyer":
      return [
        { key: "show_profile",     label: "إظهار ملفي في سوق المحامين",    description: "العملاء يستطيعون العثور عليك والتواصل",           defaultOn: true  },
        { key: "show_stats",       label: "إظهار إحصائيات الأداء العامة",   description: "عدد القضايا ونسبة النجاح ظاهرة على ملفك",        defaultOn: false },
        { key: "share_with_firms", label: "السماح للمكاتب بمشاهدة ملفي",    description: "للتواصل بشأن فرص العمل أو التعاون",              defaultOn: true  },
        ...shared,
      ];

    case "firm":
      return [
        { key: "show_firm",        label: "إظهار المكتب في دليل المكاتب",    description: "العملاء والشركات يجدون المكتب بالبحث",           defaultOn: true  },
        { key: "show_team_count",  label: "إظهار عدد أعضاء الفريق",          description: "ظاهر على صفحة المكتب العامة",                  defaultOn: true  },
        { key: "share_cases",      label: "مشاركة ملخصات القضايا المنجزة",    description: "كتجارب مجهولة على الملف العام",                 defaultOn: false },
        ...shared,
      ];

    case "corporate":
    case "ngo":
      return [
        { key: "pdpl_consent",     label: "الموافقة على معالجة البيانات (PDPL)", description: "موافقتك الصريحة وفق نظام حماية البيانات",  defaultOn: true  },
        { key: "cross_border",     label: "السماح بنقل البيانات عبر الحدود",  description: "في حال استخدام خوادم خارج المملكة",            defaultOn: false },
        { key: "share_analytics",  label: "مشاركة بيانات الاستخدام مجهولة",   description: "لتحسين المنصة — لا تتضمن بيانات شخصية",       defaultOn: true  },
        ...shared,
      ];

    case "government":
      return [
        { key: "strict_data",      label: "وضع الحماية القصوى للبيانات",       description: "جميع البيانات تبقى داخل البنية التحتية الحكومية", defaultOn: true },
        { key: "audit_log_public", label: "سجل التدقيق مرئي للإدارة العليا",   description: "المشرفون يستطيعون مراجعة كل نشاط",              defaultOn: true },
        ...shared,
      ];

    default:
      return [
        { key: "show_profile",  label: "إظهار ملفي في المنصة", description: "مرئي للمستخدمين الآخرين", defaultOn: true },
        ...shared,
      ];
  }
}

// ── Component ─────────────────────────────────────────────────────────
export function PrivacyTab() {
  const { userType } = useUser();
  const toggleDefs = getPrivacyToggles(userType);
  const [states, setStates] = useState<Record<string, boolean>>(
    Object.fromEntries(toggleDefs.map((t) => [t.key, t.defaultOn]))
  );
  const [saved, setSaved] = useState(false);

  const toggle = (key: string) => setStates((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className="space-y-8">
      {/* Privacy toggles */}
      <div>
        <SectionTitle>إعدادات الخصوصية والمشاركة</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] px-5 divide-y divide-gray-100 dark:divide-white/[0.04]">
          {toggleDefs.map((t) => (
            <ToggleRow
              key={t.key}
              label={t.label}
              description={t.description}
              checked={states[t.key] ?? t.defaultOn}
              onChange={() => toggle(t.key)}
            />
          ))}
        </div>
      </div>

      {/* PDPL rights */}
      <div>
        <SectionTitle>حقوق البيانات (نظام PDPL)</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] divide-y divide-gray-100 dark:divide-white/[0.04]">
          {[
            { icon: Download,       label: "تحميل بياناتي",       desc: "استلم نسخة كاملة من بياناتك خلال 72 ساعة",  danger: false },
            { icon: Trash,          label: "طلب حذف بياناتي",     desc: "يُعالج خلال ٣٠ يوماً وفق نظام PDPL",        danger: true  },
            { icon: ArrowSquareOut, label: "سياسة الخصوصية",      desc: "اقرأ سياستنا الكاملة والمعتمدة",            danger: false },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors text-start"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  item.danger
                    ? "bg-red-100 dark:bg-red-900/30 text-red-500"
                    : "bg-gray-100 dark:bg-gray-800 text-zinc-600 dark:text-zinc-300"
                }`}>
                  <Icon size={18} />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${item.danger ? "text-red-500" : "text-zinc-800 dark:text-zinc-200"}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.desc}</p>
                </div>
                <ArrowSquareOut size={14} className="text-zinc-400 rtl:rotate-180 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500); }}
        className="flex items-center gap-2 px-8 py-3 bg-royal hover:bg-royal/90 text-white rounded-xl font-semibold text-sm transition-all shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)]"
      >
        {saved && <CheckCircle size={18} weight="fill" />}
        {saved ? "تم الحفظ" : "حفظ إعدادات الخصوصية"}
      </motion.button>
    </div>
  );
}
