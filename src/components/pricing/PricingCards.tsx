"use client";

import { useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import {
  Check, Crown, ArrowLeft, Buildings,
  Lightning, Star, Flame, Coins, Gift, Gavel, Users
} from "@phosphor-icons/react";
import type { Plan, AudienceTab, Billing } from "@/constants/pricingData";
import { lawyerServicesTable } from "@/constants/pricing/pricing.lawyers";

interface PricingCardsProps {
  planList: Plan[];
  billing: Billing;
  isAr: boolean;
  audience: AudienceTab;
  libraryMode?: boolean;
}

/* ─── Spotlight Card — border lights up under cursor ─────────────────────── */
function SpotlightCard({
  plan, billing, index, isLawyer, isAr, compact = false,
}: {
  plan: Plan; billing: Billing; index: number; isLawyer: boolean; isAr: boolean; compact?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const spotOpacity = useTransform(
    [mouseX, mouseY],
    ([x, y]) => (Math.abs(x as number) + Math.abs(y as number) > 10 ? 1 : 0),
  );

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  }
  function onMouseLeave() { mouseX.set(0); mouseY.set(0); }

  const price = billing === "monthly" ? plan.priceMonthly : plan.priceYearly;
  const period = billing === "monthly" ? plan.periodMonthly : plan.periodYearly;
  const { bonusLabel } = plan;
  const allFeatures = [
    ...plan.features.ai,
    ...plan.features.platform,
    ...plan.features.support,
  ].filter(Boolean) as string[];

  const isHighlighted = plan.highlighted;

  /* badge icon per lawyer tier */
  const tierIcon = isLawyer ? (() => {
    if (plan.id === "lawyer-free") return null;
    if (plan.id === "lawyer-basic") return <Lightning size={12} weight="fill" />;
    if (plan.id === "lawyer-advanced") return <Star size={12} weight="fill" />;
    if (plan.id === "lawyer-elite") return <Flame size={12} weight="fill" />;
    if (plan.id === "lawyer-royal") return <Crown size={12} weight="fill" />;
    return null;
  })() : null;

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 90, damping: 20 }}
      whileHover={{ y: -8, transition: { type: "spring", stiffness: 300, damping: 20 } }}
      className={`relative overflow-hidden rounded-[2rem] border transition-shadow duration-300 ${
        isHighlighted
          ? "border-royal/20 bg-[#0B3D2E] shadow-[0_32px_64px_-16px_rgba(11,61,46,0.4)]"
          : `${plan.color} bg-white dark:bg-dark-card hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.1)] dark:hover:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.3)]`
      }`}
    >
      {/* Spotlight gradient that follows cursor */}
      {!isHighlighted && (
        <motion.div
          style={{ opacity: spotOpacity }}
          className="pointer-events-none absolute inset-0 z-0 rounded-[2rem]"
          /* radial gradient centred on mouse */
        >
          <motion.div
            style={{
              background: `radial-gradient(300px circle at ${
                mouseX.get() + "px"
              } ${mouseY.get() + "px"}, rgba(11,61,46,0.06), transparent 70%)`,
            }}
            className="absolute inset-0"
          />
        </motion.div>
      )}

      {/* Noise texture overlay */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-[0.015] [background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22300%22 height=%22300%22 filter=%22url(%23n)%22/%3E%3C/svg%3E')]" />

      <div className={`relative z-10 flex h-full flex-col ${compact ? "p-5" : "p-7 md:p-8"}`}>
        {/* Badge */}
        {plan.badge && (
          <div className="absolute -top-px start-6">
            <div className={`inline-flex items-center gap-1.5 rounded-b-xl px-3.5 py-1.5 text-[11px] font-bold tracking-wide ${
              isHighlighted ? "bg-gold text-[#0B3D2E]" : "bg-gold text-white"
            }`}>
              <Crown size={10} weight="fill" />
              {plan.badge}
            </div>
          </div>
        )}

        {/* Target label */}
        <div className={`mb-3 flex items-center gap-2 ${plan.badge ? "mt-5" : "mt-0"}`}>
          {tierIcon && (
            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${
              isHighlighted ? "bg-white/10 text-gold" : "bg-royal/8 text-royal"
            }`}>
              {tierIcon}
            </span>
          )}
          <span className={`text-[11px] font-semibold uppercase tracking-widest ${
            isHighlighted ? "text-white/50" : "text-gold-dark/80 dark:text-gold/70"
          }`}>
            {plan.target}
          </span>
        </div>

        {/* Name */}
        <h3 className={`font-brand text-2xl font-extrabold leading-tight ${
          isHighlighted ? "text-white" : "text-ink dark:text-gray-100"
        }`}>
          {plan.name}
        </h3>
        <p className={`mt-1.5 text-sm leading-relaxed ${
          isHighlighted ? "text-white/60" : "text-ink-muted dark:text-gray-400"
        }`}>
          {plan.desc}
        </p>

        {plan.pricingFormulaLabel && (
          <div className={`mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-bold w-fit ${
            isHighlighted
              ? "bg-white/10 text-gold border border-white/5"
              : "bg-royal/5 text-royal border border-royal/10 dark:bg-royal/20 dark:text-emerald-300 dark:border-royal/30"
          }`}>
            <Users size={14} weight="fill" />
            <span>{plan.pricingFormulaLabel}</span>
          </div>
        )}

        {/* Price block */}
        <div className={`my-6 border-y py-5 ${
          isHighlighted ? "border-white/10" : "border-slate-100 dark:border-white/8"
        }`}>
          {plan.priceOriginal && (
            <div className={`mb-1 text-xs font-medium ${
              isHighlighted ? "text-white/65" : "text-ink-muted dark:text-gray-500"
            }`}>
              <span className="opacity-80">{isAr ? "بدلاً من " : "Was "}</span>
              <span className="line-through font-semibold">
                {plan.priceOriginal} {isAr ? "ر.س" : "SAR"}
              </span>
            </div>
          )}
          <div className="flex items-end gap-2">
            <AnimatePresence mode="wait">
              <motion.span
                key={price}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
                className={`font-brand text-4xl font-extrabold tabular-nums ${
                  isHighlighted ? "text-gold" : "text-royal dark:text-gold"
                }`}
              >
                {price}
              </motion.span>
            </AnimatePresence>
            {period && (
              <span className={`mb-1 text-sm font-medium ${
                isHighlighted ? "text-white/50" : "text-ink-faint dark:text-gray-500"
              }`}>
                {period}
              </span>
            )}
          </div>

          {/* Bonus pill — prominent gold/emerald */}
          {bonusLabel && (
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 260, damping: 18, delay: 0.1 }}
              className={`mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ${
                isHighlighted
                  ? "bg-emerald-400/20 text-emerald-200 ring-1 ring-emerald-400/30"
                  : "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
              }`}
            >
              <Coins size={11} weight="fill" />
              {bonusLabel}
            </motion.div>
          )}
        </div>

        {/* Features */}
        <ul className="flex-1 space-y-2.5">
          {allFeatures.map((f, j) => (
            <motion.li
              key={j}
              initial={{ opacity: 0, x: -6 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.08 + j * 0.04 }}
              className="flex items-start gap-3"
            >
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                isHighlighted ? "bg-gold/20" : "bg-royal/8 dark:bg-royal/20"
              }`}>
                <Check size={10} weight="bold" className={
                  isHighlighted ? "text-gold" : "text-royal dark:text-gold"
                } />
              </span>
              <span className={`text-sm leading-snug ${
                isHighlighted ? "text-white/80" : "text-ink-muted dark:text-gray-400"
              }`}>
                {f}
              </span>
            </motion.li>
          ))}
        </ul>

        {/* CTA */}
        <motion.a
          href={plan.ctaHref}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97, y: 1 }}
          className={`mt-7 flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-bold tracking-wide transition-all ${
            isHighlighted
              ? "bg-white text-[#0B3D2E] shadow-[0_4px_20px_-4px_rgba(255,255,255,0.3)] hover:shadow-[0_8px_28px_-4px_rgba(255,255,255,0.4)]"
              : "bg-royal text-white shadow-[0_4px_20px_-4px_rgba(11,61,46,0.35)] hover:shadow-[0_8px_28px_-4px_rgba(11,61,46,0.5)]"
          }`}
        >
          {plan.cta}
          <ArrowLeft size={15} weight="bold" />
        </motion.a>
      </div>
    </motion.div>
  );
}

/* ─── Lawyer-specific layout: single 4-col row ───────────────────────────── */
function LawyerCreditsLayout({ planList, billing, isAr }: { planList: Plan[]; billing: Billing; isAr: boolean }) {
  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Single row: all 4 plans */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 lg:gap-4">
        {planList.map((plan, i) => (
          <SpotlightCard key={plan.id} plan={plan} billing={billing} index={i} isLawyer isAr={isAr} compact />
        ))}
      </div>

      {/* Free brief footnote — slim strip */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="flex flex-wrap items-center justify-center gap-3 rounded-2xl border border-gold/15 bg-gold/5 px-6 py-3.5 dark:border-gold/10 dark:bg-gold/8"
      >
        <Gift size={16} weight="duotone" className="shrink-0 text-gold-dark dark:text-gold" />
        <p className="text-sm text-ink-muted dark:text-gray-300">
          <span className="font-semibold text-ink dark:text-white">مذكرة مجانية (أي نوع) فور التسجيل</span>
          {" + "}
          <span className="font-semibold text-ink dark:text-white">مذكرة ثانية مجاناً بعد أول شحن</span>
          {" — عرض لفترة محدودة لأول ٥٠٠ محامٍ مرخّص"}
        </p>
        <Coins size={16} weight="duotone" className="shrink-0 text-ink-faint dark:text-gray-500" />
        <p className="text-xs text-ink-faint dark:text-gray-500">
          نظام النقاط: اشتري مرة واحدة — استخدم متى تحتاج. صلاحية ٦ أشهر (الملكية ١٢ شهراً).
        </p>
      </motion.div>
    </div>
  );
}


// ─── Lawyer Services Catalog ──────────────────────────────────────────────────
function LawyerServicesTable({ isAr }: { isAr: boolean }) {
  const [open, setOpen] = useState(true); // Open by default!
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="mt-14"
    >
      {/* Toggle Header */}
      <div className="mb-6 text-center">
        <button
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-2.5 rounded-2xl border border-slate-200/50 bg-white px-6 py-3 text-sm font-bold text-royal shadow-sm transition-all hover:border-royal/20 hover:shadow-md dark:border-white/10 dark:bg-dark-card dark:text-emerald-300"
        >
          <Gavel size={16} weight="duotone" />
          {isAr ? (open ? "إخفاء قائمة أسعار الخدمات" : "شاهد قائمة أسعار جميع الخدمات") : (open ? "Hide service catalog" : "View full service price list")}
        </button>
        {!open && (
          <p className="mt-2 text-xs text-ink-faint">
            {isAr ? "السعر المبيّن هو السعر المرجعي للنقطة (١ نقطة = ١ ر.س) — تنخفض مع كل باقة" : "Prices shown at base rate (1 pt = 1 SAR) — drop with each package tier"}
          </p>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 28 }}
            className="overflow-hidden"
          >
            {/* Disclaimer */}
            <div className="mb-6 rounded-2xl border border-amber-200/60 bg-amber-50/60 px-5 py-3.5 text-[12px] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-300 flex items-start gap-3" dir="rtl">
              <span className="text-xl">💡</span>
              <p className="leading-relaxed">
                <span className="font-bold">كيف تقرأ الجدول؟</span><br/>
                تُخصم هذه النقاط من رصيدك عند استخدام الخدمة، وكلما اخترت باقة أكبر، حصلت على نقاط أكثر بتكلفة أقل.
              </p>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {lawyerServicesTable.map((cat, ci) => (
                <div key={ci} className="overflow-hidden rounded-2xl border border-slate-200/50 bg-white dark:border-white/10 dark:bg-dark-card">
                  {/* Category Header */}
                  <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <span className="text-base">{cat.emoji}</span>
                    <span className={`text-[13px] font-bold ${cat.color}`}>{cat.category}</span>
                  </div>
                  {/* Rows */}
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-50 dark:border-white/5">
                        <th className="px-5 py-2 text-right text-[11px] font-semibold text-ink-faint">الخدمة</th>
                        <th className="px-3 py-2 text-center text-[11px] font-semibold text-ink-faint">التكلفة (نقاط)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.items.map((item, ii) => (
                        <tr key={ii} className={`border-b border-slate-50 dark:border-white/5 ${
                          item.points === 0 ? "bg-emerald-50/40 dark:bg-emerald-500/5" :
                          ii % 2 ? "bg-slate-50/40 dark:bg-white/[0.015]" : ""
                        }`}>
                          <td className="px-5 py-2.5 text-right text-[12px] text-ink" dir="rtl">
                            {item.name}
                            {item.note && (
                              <span className="mr-1.5 block md:inline-block text-[10px] font-semibold text-amber-600 dark:text-amber-400">{item.note}</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center font-mono text-[12px] font-bold text-royal">
                            {item.points === 0 ? "—" : item.points.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <p className="mt-4 text-center text-[11px] text-ink-faint">
              {isAr ? "* الأسعار لا تشمل ضريبة القيمة المضافة. الخدمات المجانية متاحة لجميع الحسابات بدون قيود." : "* Prices exclude VAT. Free services are available to all accounts without restrictions."}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}


/* ─── Default layout: flexible grid ─────────────────────────────────────── */
function DefaultLayout({ planList, billing, isAr }: { planList: Plan[]; billing: Billing; isAr: boolean }) {
  const cols =
    planList.length <= 3 ? "md:grid-cols-3" :
    planList.length === 4 ? "md:grid-cols-2 lg:grid-cols-4" :
    "md:grid-cols-3";

  return (
    <div className={`grid gap-4 ${cols} lg:gap-5`}>
      {planList.map((plan, i) => (
        <SpotlightCard key={plan.id} plan={plan} billing={billing} index={i} isLawyer={false} isAr={isAr} />
      ))}
    </div>
  );
}

/* ─── Main export ────────────────────────────────────────────────────────── */
export function PricingCards({ planList, billing, isAr, audience, libraryMode }: PricingCardsProps) {
  const isLawyer         = audience === "lawyers";
  const showEnterpriseRow = audience === "companies";
  const showSMESection    = false; // Removed as there is a dedicated Micro tab now

  return (
    <section className="pb-16 md:pb-24">
      <div className="mx-auto max-w-[1200px] px-4">

        {isLawyer && !libraryMode ? (
          <>
            <LawyerCreditsLayout planList={planList} billing={billing} isAr={isAr} />
            <LawyerServicesTable isAr={isAr} />
          </>
        ) : (
          <DefaultLayout planList={planList} billing={billing} isAr={isAr} />
        )}

        {/* Enterprise row */}
        {showEnterpriseRow && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-4 rounded-[2rem] border border-slate-200/50 bg-white p-6 dark:border-white/10 dark:bg-dark-card lg:mt-5 md:p-8"
          >
            <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
              <div className="flex items-center gap-5">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/10">
                  <Buildings size={24} weight="duotone" className="text-gold-dark" />
                </span>
                <div>
                  <div className="font-brand text-lg font-bold text-ink dark:text-gray-100">
                    {isAr ? "نظامي مؤسسي" : "Nezamy Enterprise"}
                  </div>
                  <div className="mt-0.5 text-sm text-ink-muted dark:text-gray-400">
                    {isAr
                      ? "للمؤسسات الكبيرة والجهات الحكومية — سعر تفاوضي وميزات مخصصة"
                      : "For large enterprises & government entities — custom pricing & features"}
                  </div>
                </div>
              </div>
              <motion.a
                href="/contact"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="shrink-0 rounded-2xl bg-royal px-7 py-3.5 text-sm font-semibold text-white"
              >
                {isAr ? "تواصل مع فريق المبيعات" : "Contact Sales Team"}
              </motion.a>
            </div>
          </motion.div>
        )}

        {/* SME section */}
        {showSMESection && (
          <div className="mt-4 lg:mt-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-[2rem] border border-slate-200/50 bg-white p-6 dark:border-white/10 dark:bg-dark-card md:p-8"
            >
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-10">
                <div className="flex items-center gap-4 shrink-0">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-500/10">
                    <Buildings size={22} weight="duotone" className="text-emerald-600 dark:text-emerald-400" />
                  </span>
                  <div>
                    <div className="font-brand text-lg font-bold text-ink dark:text-gray-100">
                      {isAr ? "أصحاب المشاريع الصغيرة" : "Small Business Owners"}
                    </div>
                    <div className="mt-0.5 text-sm text-ink-muted dark:text-gray-400">
                      {isAr ? "بقالة · ورشة · مطعم · محل تجاري" : "Grocery · Workshop · Restaurant · Shop"}
                    </div>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm leading-relaxed text-ink-muted dark:text-gray-400">
                    {isAr
                      ? "مشروعك الصغير يستحق حماية قانونية حقيقية — عقود العمال، النزاعات التجارية، تراخيص البلدية، وأكثر."
                      : "Your small business deserves real legal protection — worker contracts, commercial disputes, municipal licenses, and more."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(isAr
                      ? ["عقود العمال", "نزاعات الموردين", "تراخيص ومخالفات", "استشارة سريعة بـ AI"]
                      : ["Worker contracts", "Supplier disputes", "Licenses & fines", "Quick AI consultation"]
                    ).map((tag) => (
                      <span key={tag} className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-center gap-2">
                  <div className="text-center">
                    <div className="font-brand text-2xl font-extrabold text-emerald-700 dark:text-emerald-400">
                      {isAr ? "٢٥٠ ر.س" : "250 SAR"}
                    </div>
                    <div className="text-xs text-ink-muted dark:text-gray-400">{isAr ? "/ شهر" : "/ month"}</div>
                  </div>
                  <motion.a
                    href="/register/client?type=individual"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    {isAr ? "اشترك الآن" : "Subscribe Now"}
                  </motion.a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </section>
  );
}
