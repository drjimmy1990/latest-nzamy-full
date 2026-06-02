"use client";

import { motion } from "framer-motion";
import { Crown, Buildings, Briefcase, ShieldCheck } from "@phosphor-icons/react";
import type { AudienceTab, Billing, CompanySize } from "@/constants/pricingData";
import { audienceTabs, audiencesWithBillingToggle, billingNotes } from "@/constants/pricingData";

interface PricingHeroProps {
  isAr: boolean;
  billing: Billing;
  setBilling: (b: Billing) => void;
  audience: AudienceTab;
  setAudience: (a: AudienceTab) => void;
  companySize: CompanySize;
  setCompanySize: (s: CompanySize) => void;
  hasLegalDept: boolean;
  setHasLegalDept: (v: boolean) => void;
}

const companySizePills: { id: CompanySize; labelAr: string; labelEn: string; icon: React.ElementType }[] = [
  { id: "small",  labelAr: "شركة صغيرة (٦-٤٩)",    labelEn: "Small (6-49)",    icon: Briefcase },
  { id: "medium", labelAr: "شركة متوسطة (٥٠-٢٤٩)", labelEn: "Medium (50-249)", icon: Buildings },
  { id: "large",  labelAr: "مؤسسة كبيرة (٢٥٠+)",    labelEn: "Large (250+)",    icon: ShieldCheck },
];

export function PricingHero({
  isAr, billing, setBilling, audience, setAudience,
  companySize, setCompanySize, hasLegalDept, setHasLegalDept,
}: PricingHeroProps) {
  const note = billingNotes[audience];
  const showBillingToggle = audiencesWithBillingToggle.includes(audience);

  return (
    <section className="relative overflow-hidden pb-16 pt-32 md:pt-40">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full opacity-10"
          style={{ background: "radial-gradient(ellipse, rgba(11,61,46,0.6) 0%, transparent 70%)" }} />
      </div>
      <div className="relative mx-auto max-w-[1400px] px-4 text-center">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-2 text-xs font-medium text-gold-dark">
            <Crown size={14} weight="fill" />
            {isAr ? "اشتراكات شفافة — بدون رسوم خفية" : "Transparent pricing — no hidden fees"}
          </span>
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="font-brand mx-auto mt-5 max-w-[16ch] text-4xl font-extrabold tracking-tight text-royal dark:text-white md:text-5xl lg:text-6xl"
        >
          {isAr ? "باقات تناسب كل احتياج" : "Plans for Every Need"}
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="mx-auto mt-5 max-w-[52ch] text-base text-ink-muted dark:text-gray-400 md:text-lg"
        >
          {isAr ? "ابدأ مجاناً وترقَّ حسب نمو احتياجاتك — دون التزام طويل الأمد" : "Start free and upgrade as your needs grow — no long-term commitment"}
        </motion.p>

        {/* Audience tabs */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
          className="mt-8 inline-flex flex-wrap items-center justify-center gap-1 rounded-2xl border border-slate-200/50 bg-white p-1.5 dark:border-white/10 dark:bg-dark-card"
        >
          {audienceTabs.map(tab => (
            <button key={tab.id} onClick={() => setAudience(tab.id)}
              className={`rounded-xl px-5 py-2.5 text-sm font-medium transition-all ${
                audience === tab.id ? "bg-royal text-white shadow-sm" : "text-ink-muted hover:text-ink dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {isAr ? tab.labelAr : tab.labelEn}
            </button>
          ))}
        </motion.div>

        {/* Info bar — billing note per audience — BLOCK level so it's below tabs */}
        {note && (
          <motion.div
            key={audience}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.22 }}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-emerald-200/50 bg-emerald-50/80 px-5 py-2.5 text-sm font-medium text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300 mx-auto max-w-fit"
          >
            <span className="text-base">{note.icon}</span>
            <span>{isAr ? note.textAr : note.textEn}</span>
          </motion.div>
        )}

        {/* Billing toggle — only for audiences that support monthly/yearly */}
        {showBillingToggle && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="mt-3 inline-flex items-center gap-1 rounded-2xl border border-slate-200/50 bg-white p-1.5 dark:border-white/10 dark:bg-dark-card"
          >
            {(["monthly", "yearly"] as const).map(b => (
              <button key={b} onClick={() => setBilling(b)}
                className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-all ${
                  billing === b ? "bg-royal text-white shadow-sm" : "text-ink-muted hover:text-ink dark:text-gray-400 dark:hover:text-gray-200"
                }`}
              >
                {b === "monthly" ? (isAr ? "شهري" : "Monthly") : (isAr ? "سنوي" : "Yearly")}
                {b === "yearly" && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${billing === "yearly" ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"}`}>
                    -15%
                  </span>
                )}
              </button>
            ))}
          </motion.div>
        )}

        {/* Company Size Pills + Legal Dept Toggle — only for companies tab */}
        {audience === "companies" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="mt-6 space-y-4"
          >
            {/* Size pills */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs font-medium text-ink-muted dark:text-gray-400">
                {isAr ? "حجم الشركة:" : "Company size:"}
              </span>
              {companySizePills.map(pill => (
                <button key={pill.id} onClick={() => setCompanySize(pill.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-medium transition-all border ${
                    companySize === pill.id
                      ? "border-royal bg-royal/10 text-royal dark:border-royal/40 dark:bg-royal/20 dark:text-white"
                      : "border-slate-200/50 bg-white text-ink-muted hover:border-slate-300 dark:border-white/10 dark:bg-dark-card dark:text-gray-400 dark:hover:border-white/20"
                  }`}
                >
                  <pill.icon size={14} />
                  {isAr ? pill.labelAr : pill.labelEn}
                </button>
              ))}
            </div>

            {/* Legal dept toggle */}
            <div className="flex items-center justify-center gap-3">
              <span className="text-xs text-ink-muted dark:text-gray-400">
                {isAr ? "لدينا إدارة قانونية داخلية" : "We have an in-house legal department"}
              </span>
              <button
                onClick={() => setHasLegalDept(!hasLegalDept)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  hasLegalDept ? "bg-royal" : "bg-slate-300 dark:bg-white/20"
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${
                  hasLegalDept ? (isAr ? "-translate-x-5" : "translate-x-6") : (isAr ? "-translate-x-1" : "translate-x-1")
                }`} />
              </button>
            </div>

            {/* Callout when legal dept is ON */}
            {hasLegalDept && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mx-auto max-w-lg rounded-xl border border-royal/20 bg-royal/5 px-4 py-3 text-xs text-royal dark:border-royal/30 dark:bg-royal/10 dark:text-emerald-300"
              >
                {isAr
                  ? "✨ فريقك القانوني + أدوات نظامي = إنتاجية مضاعفة — الباقات تشمل اشتراك سنوي + محفظة نقاط لأدوات AI"
                  : "✨ Your legal team + Nzamy tools = doubled productivity — Plans include annual subscription + AI points wallet"}
              </motion.div>
            )}
          </motion.div>
        )}

      </div>
    </section>
  );
}
