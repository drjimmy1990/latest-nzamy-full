"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MagnifyingGlass,
  ArrowRight,
  MapPin,
  Bell,
  ChartBar,
  Plus,
  Minus,
  Lightning,
  CheckCircle,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

import { serviceCards, trackingSteps, govEntities, pricingTiers, faqs } from "@/components/tracking/constants";
import { TrackingMockCard } from "@/components/tracking/TrackingMockCard";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fadeUp: any = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: "easeOut" },
  }),
};

export default function TrackingPage() {
  const { isRTL, isDark } = useTheme();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div
      className={`min-h-screen bg-white dark:bg-dark-bg ${isRTL ? "font-arabic" : ""}`}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <Navbar />
      <FloatingButtons />

      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0B3D2E] via-[#0c4234] to-[#071f17] pt-32 pb-28">
        <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(ellipse_at_80%_20%,#C8A762_0%,transparent_60%)]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "radial-gradient(circle, #C8A762 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2 mb-7"
            >
              <MagnifyingGlass size={16} className="text-[#C8A762]" weight="bold" />
              <span className="text-white/80 text-sm">
                {isRTL ? "تعقيب المعاملات الحكومية" : "Government Transaction Tracking"}
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.1}
              className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight"
            >
              {isRTL ? "تعقيب المعاملات" : "Transaction Tracking"}
            </motion.h1>

            <motion.p
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.2}
              className="text-xl text-white/70 mb-12 leading-relaxed"
            >
              {isRTL
                ? "نتابع إجراءاتك الحكومية نيابةً عنك، ونُبقيك على اطلاع بكل خطوة حتى الإنجاز"
                : "We follow up on your government procedures on your behalf and keep you informed of every step until completion"}
            </motion.p>

            <motion.div
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              custom={0.3}
              className="flex flex-wrap justify-center gap-5"
            >
              {[
                { icon: Bell, ar: "إشعارات فورية", en: "Instant Notifications" },
                { icon: ChartBar, ar: "تقارير تفصيلية", en: "Detailed Reports" },
                { icon: MapPin, ar: "تتبع مباشر", en: "Live Tracking" },
              ].map((feature, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-5 py-2.5"
                >
                  <feature.icon size={16} className="text-[#C8A762]" weight="fill" />
                  <span className="text-white/80 text-sm font-medium">
                    {isRTL ? feature.ar : feature.en}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Service Types ── */}
      <section className="py-24 bg-gray-50 dark:bg-dark-bg">
        <div className="container mx-auto px-6">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {isRTL ? "خدمات التعقيب المتاحة" : "Available Tracking Services"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {isRTL
                ? "نتابع طيفاً واسعاً من الخدمات الحكومية والإجراءات الرسمية"
                : "We follow up on a wide range of government services and official procedures"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {serviceCards.map((card, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i * 0.06}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="group bg-white dark:bg-dark-card border border-gray-100 dark:border-white/10 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:border-gray-300 dark:hover:border-white/20 transition-all duration-300 cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-xl ${card.bg} flex items-center justify-center mb-4`}>
                  <card.icon size={24} className={card.color} weight="duotone" />
                </div>
                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">
                  {isRTL ? card.ar : card.en}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  {isRTL ? card.desc_ar : card.desc_en}
                </p>
                <div className="mt-4 flex items-center gap-1 text-[#0B3D2E] dark:text-[#C8A762] text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                  {isRTL ? "ابدأ المتابعة" : "Start Tracking"}
                  <ArrowRight size={12} className={isRTL ? "rotate-180" : ""} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Live Tracking Mock ── */}
      <section className="py-24 bg-white dark:bg-[#0e1318]">
        <div className="container mx-auto px-6">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {isRTL ? "تتبع معاملتك بشكل مباشر" : "Track Your Transaction Live"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {isRTL
                ? "شاهد كيف تبدو لوحة التتبع المباشر لمعاملتك"
                : "See how your live transaction tracking dashboard looks"}
            </p>
          </motion.div>

          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="max-w-2xl mx-auto"
          >
            <TrackingMockCard isRTL={isRTL} trackingSteps={trackingSteps} />
          </motion.div>
        </div>
      </section>

      {/* ── Coverage: Government Entities ── */}
      <section className="py-24 bg-gray-50 dark:bg-dark-bg">
        <div className="container mx-auto px-6">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {isRTL ? "نتعامل مع أبرز الجهات الحكومية" : "We Work With Major Government Entities"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {isRTL
                ? "تغطية شاملة لأكثر من ٢٠ جهة حكومية رئيسية في المملكة العربية السعودية"
                : "Comprehensive coverage of more than 20 major government entities in Saudi Arabia"}
            </p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
            {govEntities.map((entity, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i * 0.06}
                whileHover={{ scale: 1.05, transition: { duration: 0.15 } }}
                className="group flex items-center gap-3 bg-white dark:bg-dark-card border border-gray-200 dark:border-white/10 hover:border-[#0B3D2E]/30 dark:hover:border-[#C8A762]/30 rounded-2xl px-5 py-3.5 shadow-sm hover:shadow-md transition-all duration-200 cursor-default"
              >
                <div className="w-9 h-9 rounded-lg bg-[#0B3D2E]/10 dark:bg-[#0B3D2E]/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-black text-[#0B3D2E] dark:text-[#C8A762]">
                    {entity.short}
                  </span>
                </div>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {isRTL ? entity.ar : entity.en}
                </span>
              </motion.div>
            ))}
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              custom={0.5}
              className="flex items-center gap-2 bg-[#0B3D2E]/5 dark:bg-[#0B3D2E]/20 border border-[#0B3D2E]/20 dark:border-[#C8A762]/20 rounded-2xl px-5 py-3.5"
            >
              <span className="text-sm font-semibold text-[#0B3D2E] dark:text-[#C8A762]">
                {isRTL ? "+ ١٢ جهة أخرى" : "+ 12 more entities"}
              </span>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-24 bg-white dark:bg-[#0e1318]">
        <div className="container mx-auto px-6">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {isRTL ? "باقات التعقيب" : "Tracking Packages"}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 max-w-xl mx-auto">
              {isRTL
                ? "اختر الباقة التي تناسب احتياجاتك"
                : "Choose the package that fits your needs"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {pricingTiers.map((tier, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i * 0.1}
                className={`relative rounded-3xl border-2 ${tier.color} bg-white dark:bg-dark-card p-8 shadow-sm transition-all duration-300 ${
                  tier.highlight ? "shadow-2xl scale-[1.02] ring-2 ring-[#0B3D2E]/20 dark:ring-[#C8A762]/20" : ""
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-4 start-1/2 -translate-x-1/2">
                    <span className="bg-[#0B3D2E] text-white text-xs font-bold px-4 py-1.5 rounded-full flex items-center gap-1.5 whitespace-nowrap">
                      <Lightning size={12} weight="fill" />
                      {isRTL ? "الأكثر شيوعاً" : "Most Popular"}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                    {isRTL ? tier.name_ar : tier.name_en}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-gray-900 dark:text-white">
                      {isRTL ? tier.price : tier.price_num}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 text-sm">
                      {tier.currency} {isRTL ? tier.period_ar : tier.period_en}
                    </span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {(isRTL ? tier.features_ar : tier.features_en).map((feature, j) => (
                    <li key={j} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                      <CheckCircle size={16} className="text-[#0B3D2E] dark:text-[#C8A762] flex-shrink-0" weight="fill" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${tier.btnClass} hover:opacity-90`}
                >
                  {isRTL ? "اختر الباقة" : "Choose Plan"}
                </motion.button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 bg-gray-50 dark:bg-dark-bg">
        <div className="container mx-auto px-6 max-w-2xl">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              {isRTL ? "أسئلة شائعة" : "Frequently Asked Questions"}
            </h2>
          </motion.div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                custom={i * 0.08}
                className="border border-gray-200 dark:border-white/10 rounded-2xl overflow-hidden"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 bg-white dark:bg-dark-card hover:bg-gray-50 dark:hover:bg-[#1c2330] transition-colors text-left"
                >
                  <span className="font-semibold text-gray-900 dark:text-white text-sm md:text-base">
                    {isRTL ? faq.q_ar : faq.q_en}
                  </span>
                  <span className="flex-shrink-0 ms-4">
                    {openFaq === i ? (
                      <Minus size={18} className="text-[#0B3D2E] dark:text-[#C8A762]" />
                    ) : (
                      <Plus size={18} className="text-gray-400" />
                    )}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <div className="px-5 pb-5 bg-gray-50 dark:bg-[#111620] text-sm text-gray-600 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-white/5 pt-4">
                        {isRTL ? faq.a_ar : faq.a_en}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-24 bg-gradient-to-br from-[#0B3D2E] to-[#071f17]">
        <div className="container mx-auto px-6 text-center">
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <MagnifyingGlass size={52} className="text-[#C8A762] mx-auto mb-6" weight="duotone" />
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              {isRTL ? "ابدأ تعقيب معاملاتك الآن" : "Start Tracking Your Transactions Now"}
            </h2>
            <p className="text-white/60 mb-10 max-w-lg mx-auto">
              {isRTL
                ? "دعنا نتولى متابعة إجراءاتك الحكومية حتى تتفرغ لما يهمك"
                : "Let us handle your government procedures so you can focus on what matters"}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <motion.a
                href="/contact"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-3 bg-[#C8A762] hover:bg-[#d4b472] text-[#0B3D2E] font-bold px-10 py-4 rounded-2xl text-lg shadow-lg shadow-[#C8A762]/20 transition-colors"
              >
                {isRTL ? "ابدأ الآن" : "Get Started"}
                <ArrowRight size={20} className={isRTL ? "rotate-180" : ""} />
              </motion.a>
              <motion.a
                href="/services"
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center gap-3 bg-white/10 hover:bg-white/15 border border-white/20 text-white font-semibold px-8 py-4 rounded-2xl text-lg transition-colors"
              >
                {isRTL ? "تصفح الخدمات" : "Browse Services"}
              </motion.a>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
