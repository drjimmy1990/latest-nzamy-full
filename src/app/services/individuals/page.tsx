"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  ChatCircleDots,
  Scales,
  FileText,
  Stamp,
  Shield,
  ArrowLeft,
  Check,
  Star,
  Clock,
  CurrencyDollar,
  ShieldCheck,
  Brain,
  CaretDown,
  User,
  Buildings,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

import { services, faqs } from "@/constants/servicesData";
import { ServiceCard, FAQItem } from "@/components/services/ServiceComponents";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IndividualsPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const serviceList = isAr ? services.ar : services.en;
  const faqList = isAr ? faqs.ar : faqs.en;
  const selected = serviceList.find((s) => s.id === selectedService) ?? null;

  return (
    <>
      <Navbar />
      <main className="bg-surface dark:bg-dark-bg transition-colors duration-300">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden pb-24 pt-32 md:pt-40">
          <div className="pointer-events-none absolute inset-0">
            <motion.div
              animate={{ scale: [1, 1.05, 1], opacity: [0.15, 0.25, 0.15] }}
              transition={{ duration: 8, repeat: Infinity }}
              className="absolute -top-24 right-0 h-[600px] w-[600px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(11,61,46,0.12) 0%, transparent 70%)" }}
            />
            <motion.div
              animate={{ scale: [1, 1.08, 1], opacity: [0.1, 0.2, 0.1] }}
              transition={{ duration: 10, repeat: Infinity, delay: 2 }}
              className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full"
              style={{ background: "radial-gradient(circle, rgba(200,167,98,0.15) 0%, transparent 70%)" }}
            />
          </div>

          <div className="relative mx-auto max-w-[1400px] px-4">
            {/* Breadcrumb */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 flex items-center gap-2 text-xs text-ink-faint dark:text-gray-500"
            >
              <a href="/" className="transition-colors hover:text-royal dark:hover:text-gold">{isAr ? "الرئيسية" : "Home"}</a>
              <span>/</span>
              <span className="text-ink-muted dark:text-gray-400">{isAr ? "خدمات الأفراد" : "Individual Services"}</span>
            </motion.div>

            <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
              <motion.div
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 60, damping: 20 }}
              >
                {/* Badge */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-2"
                >
                  <User size={14} weight="fill" className="text-gold-dark" />
                  <span className="text-xs font-medium text-gold-dark">
                    {isAr ? "خدمات مصممة للأفراد" : "Services Designed for Individuals"}
                  </span>
                </motion.div>

                <h1 className="font-brand text-4xl font-extrabold leading-none tracking-tighter text-royal dark:text-white md:text-5xl lg:text-6xl">
                  {isAr ? (
                    <>
                      <span className="block">خدمات قانونية</span>
                      <span className="block text-gold">للأفراد</span>
                    </>
                  ) : (
                    <>
                      <span className="block">Legal Services</span>
                      <span className="block text-gold">for Individuals</span>
                    </>
                  )}
                </h1>
                <p className="mt-6 max-w-[50ch] text-base leading-relaxed text-ink-muted dark:text-gray-400 md:text-lg">
                  {isAr
                    ? "٦ خدمات قانونية متكاملة — من الاستشارة الفورية إلى التمثيل القضائي — بأسعار شفافة وضمان مالي كامل."
                    : "6 comprehensive legal services — from instant consultation to court representation — with transparent pricing and full financial guarantee."}
                </p>

                {/* Quick stats */}
                <div className="mt-8 grid grid-cols-3 gap-4">
                  {[
                    { value: "٣٧٠+", valueEn: "370+", label: isAr ? "خدمة" : "Services" },
                    { value: "٢٤/٧", valueEn: "24/7", label: isAr ? "دعم" : "Support" },
                    { value: "٩٨٪", valueEn: "98%", label: isAr ? "رضا العملاء" : "Satisfaction" },
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="rounded-2xl border border-slate-200/50 bg-white p-4 text-center dark:border-white/10 dark:bg-dark-card"
                    >
                      <div className="font-brand text-xl font-bold text-royal dark:text-gold">
                        {isAr ? stat.value : stat.valueEn}
                      </div>
                      <div className="mt-1 text-xs text-ink-muted dark:text-gray-400">{stat.label}</div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-4">
                  <motion.a
                    href="/register"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-royal px-7 py-4 text-sm font-semibold text-white shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]"
                  >
                    {isAr ? "ابدأ الآن مجاناً" : "Start Free Now"}
                    <ArrowLeft size={16} weight="bold" />
                  </motion.a>
                  <motion.a
                    href="/login"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-medium text-ink-muted dark:border-white/10 dark:bg-dark-card dark:text-gray-300"
                  >
                    {isAr ? "لديك حساب؟ سجّل دخولك" : "Have an account? Sign in"}
                  </motion.a>
                </div>
              </motion.div>

              {/* Right: trust badges */}
              <motion.div
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 60, damping: 20, delay: 0.2 }}
                className="grid grid-cols-2 gap-4"
              >
                {[
                  { icon: ShieldCheck, label: isAr ? "ضمان مالي كامل" : "Full Financial Guarantee", desc: isAr ? "Escrow لحماية أموالك" : "Escrow protects your money", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10" },
                  { icon: Brain, label: isAr ? "ذكاء اصطناعي قانوني" : "Legal AI", desc: isAr ? "مدرّب على الأنظمة السعودية" : "Trained on Saudi law", color: "text-royal bg-royal/5 dark:bg-royal/20" },
                  { icon: Star, label: isAr ? "محامون موثّقون" : "Verified Lawyers", desc: isAr ? "معتمدون من وزارة العدل" : "Ministry of Justice certified", color: "text-gold-dark bg-gold/10" },
                  { icon: Clock, label: isAr ? "استجابة فورية" : "Instant Response", desc: isAr ? "خلال ١٥ دقيقة أو أقل" : "Within 15 minutes or less", color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10" },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                      className="rounded-[1.75rem] border border-slate-200/50 bg-white p-6 dark:border-white/10 dark:bg-dark-card"
                    >
                      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${item.color}`}>
                        <Icon size={22} weight="duotone" />
                      </span>
                      <div className="mt-4 text-sm font-semibold text-ink dark:text-gray-100">{item.label}</div>
                      <div className="mt-1 text-xs text-ink-muted dark:text-gray-400">{item.desc}</div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Services Grid ────────────────────────────────────────────────── */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-[1400px] px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-12"
            >
              <span className="text-sm font-medium text-gold-dark">{isAr ? "اختر خدمتك" : "Choose Your Service"}</span>
              <h2 className="font-brand mt-2 text-3xl font-bold tracking-tight text-royal dark:text-white md:text-4xl">
                {isAr ? "٦ خدمات قانونية متكاملة" : "6 Comprehensive Legal Services"}
              </h2>
            </motion.div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {serviceList.map((service, i) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  index={i}
                  isAr={isAr}
                  isSelected={selectedService === service.id}
                  onSelect={() => setSelectedService(selectedService === service.id ? null : service.id)}
                />
              ))}
            </div>

            {/* Expanded detail panel */}
            <AnimatePresence>
              {selected && (
                <motion.div
                  key={selected.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ type: "spring", stiffness: 200, damping: 30 }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 rounded-[2rem] border border-royal/15 bg-white p-8 dark:border-white/10 dark:bg-dark-card md:p-10">
                    <div className="grid gap-8 md:grid-cols-2">
                      <div>
                        <h3 className="font-brand text-xl font-bold text-ink dark:text-gray-100">{selected.label}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-ink-muted dark:text-gray-400">{selected.desc}</p>
                        <ul className="mt-6 space-y-3">
                          {selected.features.map((f, i) => (
                            <li key={i} className="flex items-center gap-3 text-sm text-ink-muted dark:text-gray-400">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-royal/5">
                                <Check size={12} weight="bold" className="text-royal" />
                              </span>
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-col gap-4">
                        <div className="rounded-2xl border border-slate-100 bg-surface p-6 dark:border-white/10 dark:bg-dark-bg">
                          <div className="text-xs text-ink-faint dark:text-gray-500">{isAr ? "السعر يبدأ من" : "Starting price"}</div>
                          <div className="font-brand mt-1 text-2xl font-bold text-royal dark:text-gold">{selected.price}</div>
                          <div className="mt-1 text-xs text-ink-muted dark:text-gray-400">{isAr ? "مدة الخدمة:" : "Service duration:"} {selected.duration}</div>
                        </div>
                        <motion.a
                          href="/register"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="flex items-center justify-center gap-2 rounded-2xl bg-royal px-6 py-4 text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)]"
                        >
                          {isAr ? "اطلب هذه الخدمة" : "Request This Service"}
                          <ArrowLeft size={16} weight="bold" />
                        </motion.a>
                        <a
                          href="/login"
                          className="rounded-2xl border border-slate-200 py-3 text-center text-sm font-medium text-ink-muted transition-colors hover:border-royal/20 hover:text-royal dark:border-white/10 dark:text-gray-400 dark:hover:text-gold"
                        >
                          {isAr ? "سجّل دخولك أولاً" : "Sign in first"}
                        </a>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ── How It Works ─────────────────────────────────────────────────── */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-[1400px] px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-12 text-center"
            >
              <span className="text-sm font-medium text-gold-dark">{isAr ? "الآلية" : "How It Works"}</span>
              <h2 className="font-brand mt-2 text-3xl font-bold tracking-tight text-royal dark:text-white md:text-4xl">
                {isAr ? "٣ خطوات فقط" : "Only 3 Steps"}
              </h2>
            </motion.div>

            <div className="grid gap-4 md:grid-cols-3 lg:gap-6">
              {[
                {
                  step: "١",
                  stepEn: "1",
                  labelAr: "سجّل وحدد احتياجك",
                  labelEn: "Register & Define Your Need",
                  descAr: "أنشئ حسابك مجاناً وأخبرنا بطلبك القانوني بالتفصيل.",
                  descEn: "Create your free account and tell us about your legal need in detail.",
                  icon: User,
                },
                {
                  step: "٢",
                  stepEn: "2",
                  labelAr: "نطابقك مع المتخصص",
                  labelEn: "We Match You with a Specialist",
                  descAr: "يقترح نظامي AI أفضل محامٍ متخصص في قضيتك بناءً على التقييمات والخبرة.",
                  descEn: "Nezamy AI recommends the best specialist lawyer for your case based on ratings and experience.",
                  icon: Brain,
                },
                {
                  step: "٣",
                  stepEn: "3",
                  labelAr: "احصل على خدمتك بضمان",
                  labelEn: "Get Your Service with Guarantee",
                  descAr: "استلم خدمتك مع ضمان استرداد كامل عبر نظام Escrow إذا لم تكن راضياً.",
                  descEn: "Receive your service with a full refund guarantee via Escrow if you're not satisfied.",
                  icon: ShieldCheck,
                },
              ].map((step, i) => {
                const Icon = step.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, type: "spring", stiffness: 100, damping: 20 }}
                    className="relative rounded-[2rem] border border-slate-200/50 bg-white p-8 dark:border-white/10 dark:bg-dark-card"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <span className="font-brand text-5xl font-black text-royal/10 dark:text-white/5">
                        {isAr ? step.step : step.stepEn}
                      </span>
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-royal/5 text-royal dark:bg-royal/20">
                        <Icon size={24} weight="duotone" />
                      </span>
                    </div>
                    <h3 className="font-brand text-lg font-bold text-ink dark:text-gray-100">
                      {isAr ? step.labelAr : step.labelEn}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted dark:text-gray-400">
                      {isAr ? step.descAr : step.descEn}
                    </p>
                    {i < 2 && (
                      <div className="absolute -left-3 top-1/2 hidden -translate-y-1/2 md:block">
                        <ArrowLeft size={20} className="text-slate-300 dark:text-white/20" />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Also For ─────────────────────────────────────────────────────── */}
        <section className="py-16">
          <div className="mx-auto max-w-[1400px] px-4">
            <div className="rounded-[2.5rem] border border-slate-200/50 bg-white p-8 dark:border-white/10 dark:bg-dark-card md:p-12">
              <div className="grid gap-8 md:grid-cols-2 md:items-center">
                <div>
                  <span className="text-sm font-medium text-gold-dark">{isAr ? "هل أنت شركة؟" : "Are you a business?"}</span>
                  <h2 className="font-brand mt-2 text-2xl font-bold text-ink dark:text-gray-100 md:text-3xl">
                    {isAr ? "لدينا خدمات مخصصة للشركات والمؤسسات" : "We have services for companies & enterprises"}
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted dark:text-gray-400">
                    {isAr
                      ? "فريق قانوني متكامل، إدارة مخاطر، امتثال، عقود مؤسسية، وتحكيم تجاري."
                      : "Full legal team, risk management, compliance, corporate contracts, and commercial arbitration."}
                  </p>
                  <motion.a
                    href="/services/business"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-royal px-6 py-3.5 text-sm font-semibold text-white"
                  >
                    {isAr ? "خدمات الشركات" : "Business Services"}
                    <Buildings size={16} weight="duotone" />
                  </motion.a>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    isAr ? "فريق قانوني متكامل" : "Complete legal team",
                    isAr ? "إدارة مخاطر" : "Risk management",
                    isAr ? "امتثال تنظيمي" : "Regulatory compliance",
                    isAr ? "تحكيم تجاري" : "Commercial arbitration",
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-xl border border-slate-100 bg-surface px-4 py-3 text-sm text-ink-muted dark:border-white/10 dark:bg-dark-bg dark:text-gray-400"
                    >
                      <Check size={14} weight="bold" className="text-royal dark:text-gold" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-[900px] px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-10 text-center"
            >
              <span className="text-sm font-medium text-gold-dark">{isAr ? "أسئلة شائعة" : "FAQ"}</span>
              <h2 className="font-brand mt-2 text-3xl font-bold text-royal dark:text-white">
                {isAr ? "أسئلة يسألها العملاء دائماً" : "Questions Clients Always Ask"}
              </h2>
            </motion.div>
            <div className="space-y-3">
              {faqList.map((faq, i) => (
                <FAQItem key={i} q={faq.q} a={faq.a} index={i} />
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="pb-24">
          <div className="mx-auto max-w-[1400px] px-4">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-[2.5rem] bg-royal p-10 text-center shadow-[0_20px_60px_-15px_rgba(11,61,46,0.4)] md:p-16"
            >
              <h2 className="font-brand text-3xl font-bold text-white md:text-4xl">
                {isAr ? "ابدأ رحلتك القانونية اليوم" : "Start Your Legal Journey Today"}
              </h2>
              <p className="mx-auto mt-4 max-w-[45ch] text-sm text-white/70">
                {isAr
                  ? "سجّل مجاناً والاستشارة الأولى عبر AI مجانية بدون قيود."
                  : "Sign up free — your first AI consultation is completely free."}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <motion.a
                  href="/register"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-royal"
                >
                  {isAr ? "سجّل مجاناً" : "Sign Up Free"}
                  <ArrowLeft size={16} weight="bold" />
                </motion.a>
                <a
                  href="/ai"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/30 px-7 py-4 text-sm font-medium text-white/90 transition-colors hover:border-white/50 hover:text-white"
                >
                  {isAr ? "جرّب نظامي AI" : "Try Nezamy AI"}
                  <Brain size={16} weight="duotone" />
                </a>
              </div>
            </motion.div>
          </div>
        </section>
      </main>
      <Footer />
      <FloatingButtons />
    </>
  );
}
