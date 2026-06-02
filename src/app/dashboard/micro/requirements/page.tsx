"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Buildings, ArrowRight, ArrowLeft, CheckCircle, Warning, Clock,
  Percent, ShieldStar, Briefcase, Storefront, Lightning,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const SECTIONS = [
  {
    key: "municipality",
    titleAr: "اشتراطات البلدية",
    titleEn: "Municipality",
    descAr: "رخصة النشاط، لافتات، سلامة",
    descEn: "Activity license, signage, safety",
    icon: Buildings,
    color: "from-emerald-600 to-emerald-400",
    statusAr: "1 منتهي",
    statusEn: "1 expired",
    severity: "expired" as const,
  },
  {
    key: "zakat",
    titleAr: "الزكاة والضريبة",
    titleEn: "Zakat & Tax",
    descAr: "شهادة ZATCA، إقرارات ضريبية",
    descEn: "ZATCA certificate, tax returns",
    icon: Percent,
    color: "from-amber-600 to-amber-400",
    statusAr: "تنتهي قريباً",
    statusEn: "Expiring soon",
    severity: "warning" as const,
  },
  {
    key: "gosi",
    titleAr: "التأمينات الاجتماعية",
    titleEn: "Social Insurance (GOSI)",
    descAr: "اشتراكات GOSI، تسجيل العمال",
    descEn: "GOSI contributions, worker registration",
    icon: ShieldStar,
    color: "from-blue-600 to-blue-400",
    statusAr: "سارية",
    statusEn: "Valid",
    severity: "ok" as const,
  },
  {
    key: "labor",
    titleAr: "اشتراطات العمل",
    titleEn: "Labor Requirements",
    descAr: "نسب السعودة، عقود العمل، حماية الأجور",
    descEn: "Saudization ratios, contracts, wage protection",
    icon: Storefront,
    color: "from-purple-600 to-purple-400",
    statusAr: "سارية",
    statusEn: "Valid",
    severity: "ok" as const,
  },
  {
    key: "licenses",
    titleAr: "التراخيص التخصصية",
    titleEn: "Specialized Licenses",
    descAr: "تراخيص الأنشطة المقيدة والجهات الرقابية",
    descEn: "Restricted activity permits & regulators",
    icon: Briefcase,
    color: "from-rose-600 to-rose-400",
    statusAr: "سارية",
    statusEn: "Valid",
    severity: "ok" as const,
  },
];

const SEV = {
  ok:      { icon: CheckCircle, label: "سارية",   colorDark: "text-emerald-400", colorLight: "text-emerald-600", bgDark: "bg-emerald-500/10", bgLight: "bg-emerald-50" },
  warning: { icon: Clock,       label: "تنبيه",   colorDark: "text-amber-400",   colorLight: "text-amber-600",   bgDark: "bg-amber-500/10",   bgLight: "bg-amber-50" },
  expired: { icon: Warning,     label: "منتهي",   colorDark: "text-red-400",     colorLight: "text-red-600",     bgDark: "bg-red-500/10",     bgLight: "bg-red-50" },
};

export default function MicroRequirementsIndex() {
  const { isDark, lang } = useTheme();
  const isAr = lang === "ar";
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-sm";

  const stats = {
    ok: SECTIONS.filter(s => s.severity === "ok").length,
    warning: SECTIONS.filter(s => s.severity === "warning").length,
    expired: SECTIONS.filter(s => s.severity === "expired").length,
  };

  return (
    <div className="max-w-[900px] mx-auto space-y-5" dir={isAr ? "rtl" : "ltr"}>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/dashboard/micro"
          className={`inline-flex items-center gap-1.5 text-[13px] mb-3 transition-colors ${isDark ? "text-zinc-500 hover:text-zinc-300" : "text-slate-400 hover:text-slate-600"}`}>
          <Arrow size={13} className={isAr ? "" : "rotate-180"} />
          {isAr ? "لوحة التحكم" : "Dashboard"}
        </Link>
        <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
          {isAr ? "اشتراطات ومتطلبات النشاط" : "Business Requirements & Compliance"}
        </h1>
        <p className={`text-[13px] mt-1 ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          {isAr ? "رقابة شاملة على جميع تراخيص واشتراطات منشأتك" : "Complete oversight of all your business licenses and requirements"}
        </p>
      </motion.div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: isAr ? "سارية" : "Valid",         value: stats.ok,      color: "text-emerald-500", dot: "bg-emerald-400" },
          { label: isAr ? "تحتاج تجديد" : "Expiring", value: stats.warning, color: "text-amber-500",   dot: "bg-amber-400 animate-pulse" },
          { label: isAr ? "منتهية" : "Expired",       value: stats.expired, color: "text-red-500",     dot: "bg-red-400" },
        ].map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={`${card} p-4 text-center`}>
            <p className={`text-2xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>{s.label}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Alert if expired */}
      {stats.expired > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`p-4 rounded-2xl border flex items-start gap-3 ${isDark ? "border-red-500/20 bg-red-500/5" : "border-red-200 bg-red-50"}`}>
          <Warning size={18} weight="duotone" className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className={`text-[13px] font-semibold ${isDark ? "text-red-400" : "text-red-700"}`}>
              {isAr ? `يوجد ${stats.expired} قسم به تراخيص منتهية` : `${stats.expired} section(s) with expired licenses`}
            </p>
            <p className={`text-[12px] mt-0.5 ${isDark ? "text-red-500/60" : "text-red-600"}`}>
              {isAr ? "التراخيص المنتهية قد تعرّض منشأتك لغرامات. راجع الأقسام أدناه." : "Expired licenses may result in fines. Review the sections below."}
            </p>
          </div>
        </motion.div>
      )}

      {/* Sections grid */}
      <div className="space-y-3">
        {SECTIONS.map((sec, i) => {
          const Icon = sec.icon;
          const sev = SEV[sec.severity];
          const SevIcon = sev.icon;
          return (
            <Link key={sec.key} href={`/dashboard/micro/requirements/${sec.key}`}>
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                whileHover={{ y: -2, transition: { type: "spring", stiffness: 200, damping: 20 } }}
                className={`${card} p-4 flex items-center gap-4 cursor-pointer group transition-all hover:shadow-md mb-3`}
              >
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${sec.color} flex items-center justify-center shadow shrink-0`}>
                  <Icon size={20} weight="fill" className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] font-bold ${isDark ? "text-zinc-100" : "text-slate-800"}`}>
                    {isAr ? sec.titleAr : sec.titleEn}
                  </p>
                  <p className={`text-[12px] ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
                    {isAr ? sec.descAr : sec.descEn}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${isDark ? sev.bgDark + " " + sev.colorDark : sev.bgLight + " " + sev.colorLight}`}>
                    <SevIcon size={10} weight="bold" />
                    {isAr ? sec.statusAr : sec.statusEn}
                  </span>
                  <Arrow size={13} className={`${isDark ? "text-zinc-600" : "text-slate-300"} group-hover:translate-x-0.5 transition-transform`} />
                </div>
              </motion.div>
            </Link>
          );
        })}
      </div>

    </div>
  );
}
