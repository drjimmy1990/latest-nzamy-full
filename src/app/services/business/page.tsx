"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Buildings, Scales, ShieldCheck, ArrowLeft,
  Check, Clock, Brain, Lock, Money,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
import { services, industries, ServiceCard, AssessmentModal } from "./_components";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BusinessPage() {
  const { lang } = useTheme();
  const isAr = lang === "ar";
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showAssessment, setShowAssessment] = useState(false);
  const serviceList = isAr ? services.ar : services.en;
  const selected = serviceList.find((s) => s.id === selectedService) ?? null;

  return (
    <>
      <Navbar />
      <div className="bg-surface dark:bg-dark-bg transition-colors duration-300">

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden pb-24 pt-32 md:pt-40">
          <div className="pointer-events-none absolute inset-0">
            <motion.div
              animate={{ scale: [1, 1.05, 1] }} transition={{ duration: 8, repeat: Infinity }}
              className="absolute -top-24 left-0 h-[600px] w-[600px] rounded-full opacity-10"
              style={{ background: "radial-gradient(circle, rgba(200,167,98,0.5) 0%, transparent 70%)" }}
            />
          </div>

          <div className="relative mx-auto max-w-[1400px] px-4">
            {/* Breadcrumb */}
            <div className="mb-8 flex items-center gap-2 text-xs text-ink-faint dark:text-gray-500">
              <a href="/" className="transition-colors hover:text-royal dark:hover:text-gold">{isAr ? "الرئيسية" : "Home"}</a>
              <span>/</span>
              <span className="text-ink-muted dark:text-gray-400">{isAr ? "خدمات الشركات" : "Business Services"}</span>
            </div>

            <div className="grid items-center gap-12 md:grid-cols-2 md:gap-16">
              <motion.div initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 60, damping: 20 }}>
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-2">
                  <Buildings size={14} weight="fill" className="text-gold-dark" />
                  <span className="text-xs font-medium text-gold-dark">{isAr ? "حلول مصممة للشركات" : "Solutions Designed for Businesses"}</span>
                </motion.div>

                <h1 className="font-brand text-4xl font-extrabold leading-none tracking-tighter text-royal dark:text-white md:text-5xl lg:text-6xl">
                  {isAr ? (
                    <><span className="block">حلول قانونية</span><span className="block text-gold">للشركات</span></>
                  ) : (
                    <><span className="block">Legal Solutions</span><span className="block text-gold">for Businesses</span></>
                  )}
                </h1>
                <p className="mt-6 max-w-[50ch] text-base leading-relaxed text-ink-muted dark:text-gray-400 md:text-lg">
                  {isAr
                    ? "من الفريق القانوني المتكامل إلى الامتثال التنظيمي وإدارة المخاطر — كل ما تحتاجه شركتك في منصة واحدة."
                    : "From a full legal team to regulatory compliance and risk management — everything your company needs in one platform."}
                </p>

                {/* Industry chips */}
                <div className="mt-6">
                  <p className="mb-3 text-xs font-medium text-ink-faint dark:text-gray-500">{isAr ? "قطاعات نخدمها" : "Industries We Serve"}</p>
                  <div className="flex flex-wrap gap-2">
                    {(isAr ? industries.ar : industries.en).slice(0, 5).map((ind) => (
                      <span key={ind} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-ink-muted dark:border-white/10 dark:bg-dark-card dark:text-gray-400">{ind}</span>
                    ))}
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-royal dark:border-white/10 dark:bg-dark-card dark:text-gold">
                      +{(isAr ? industries.ar : industries.en).length - 5} {isAr ? "أخرى" : "more"}
                    </span>
                  </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-4">
                  <motion.button onClick={() => setShowAssessment(true)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-royal px-7 py-4 text-sm font-semibold text-white shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]">
                    {isAr ? "ابدأ تقييم مجاني" : "Start Free Assessment"}<ArrowLeft size={16} weight="bold" />
                  </motion.button>
                  <a href="/contact" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-medium text-ink-muted dark:border-white/10 dark:bg-dark-card dark:text-gray-300">
                    {isAr ? "تحدّث مع مستشار" : "Talk to an Advisor"}
                  </a>
                </div>
              </motion.div>

              {/* Right: Feature grid */}
              <motion.div initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ type: "spring", stiffness: 60, damping: 20, delay: 0.2 }}>
                <div className="rounded-[2.5rem] border border-slate-200/50 bg-white p-8 dark:border-white/10 dark:bg-dark-card">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10">
                      <Buildings size={20} weight="duotone" className="text-gold-dark" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">{isAr ? "لوحة الشركة" : "Company Dashboard"}</div>
                      <div className="text-xs text-ink-muted dark:text-gray-400">{isAr ? "ما تديره من داخل اللوحة" : "What you manage from the dashboard"}</div>
                    </div>
                  </div>
                  {/*
                    كانت هنا ثلاثة "مؤشرات" مكتوبة يدوياً تحت عنوان فرعي يقول إنها
                    «عرض حي للمنصة»: «١٢٤ عقداً نشطاً»، «٩٨٪ امتثال»، «٣ مخاطر
                    مكتشفة» — بأشرطة تقدّم تُرسِّخ النِّسَب نفسها (٧٨٪ و٩٨٪ و١٥٪).
                    لم تكن حيّة ولا مأخوذة من أي حساب. حُذفت الأرقام والأشرطة معاً،
                    وحُذف ادعاء «العرض الحي» من العنوان الفرعي.
                    (نُظّف الجدول في الأسفل في مراجعة سابقة وبقيت هذه البطاقة.)

                    وحُذفت معها أسماء الأقسام الثلاثة نفسها: لا توجد في المنتج لوحةُ
                    «عقود نشطة» ولا «امتثال» ولا «مخاطر مكتشفة» لحساب منشأة. راجع
                    التعليق الطويل في src/app/dashboard/business/page.tsx — ستة عشر
                    قسماً من /dashboard/business (ومنها /contracts و/governance)
                    أُلغي ربطها في ٢٦ أغسطس لأنها كانت تعرض بيانات مُختلَقة.
                    ما بقي أدناه هو ما تقرأه تلك الصفحة فعلاً من قاعدة البيانات.
                    لا تُعِد هنا رقماً ولا قسماً لا وجود له في اللوحة.
                  */}
                  {[
                    { label: isAr ? "طلبات الخدمة" : "Service Requests", desc: isAr ? "كل طلب قدّمته الشركة وحالته" : "Every request your company filed, and its status" },
                    { label: isAr ? "خزانة المستندات" : "Document Vault", desc: isAr ? "مستندات الشركة ومرفقات طلباتها" : "Your company's documents and request attachments" },
                    { label: isAr ? "ملف المنشأة" : "Company Profile", desc: isAr ? "بيانات الشركة وما ينقصها لاكتمالها" : "Your company's details and what is still missing" },
                  ].map((metric, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.15 }}
                      className="mb-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-white/10">
                      <div className="text-xs font-semibold text-ink dark:text-white">{metric.label}</div>
                      <div className="mt-0.5 text-[11px] leading-relaxed text-ink-muted dark:text-gray-400">{metric.desc}</div>
                    </motion.div>
                  ))}
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                    <ShieldCheck size={16} weight="fill" className="text-emerald-600" />
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{isAr ? "أتعابك لا تُصرف إلا بعد الإنجاز" : "Fees are released only after delivery"}</span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── Services ─────────────────────────────────────────────────────── */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-[1400px] px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-10">
              <span className="text-sm font-medium text-gold-dark">{isAr ? "خدماتنا للشركات" : "Our Business Services"}</span>
              <h2 className="font-brand mt-2 text-3xl font-bold tracking-tight text-royal dark:text-white md:text-4xl">
                {isAr ? "كل ما تحتاجه شركتك" : "Everything Your Company Needs"}
              </h2>
              <p className="mt-2 text-sm text-ink-muted dark:text-gray-400">
                {isAr ? "جميع الخدمات تُقدَّم من محامين سعوديين معتمدين — مع دعم AI لتسريع التحليل والتوثيق" : "All services delivered by certified Saudi lawyers — with AI support for faster analysis and documentation"}
              </p>
            </motion.div>

            {/* Top-level needs strip */}
            <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { emoji: "📄", labelAr: "عقود وحماية", labelEn: "Contracts & Protection", descAr: "صياغة · مراجعة · أرشفة", descEn: "Drafting · Review · Archive" },
                { emoji: "⚖️", labelAr: "نزاعات ودعاوى", labelEn: "Disputes & Litigation", descAr: "عمال · تحصيل · محاكم", descEn: "Labor · Debt · Courts" },
                { emoji: "🛡️", labelAr: "امتثال تنظيمي", labelEn: "Regulatory Compliance", descAr: "غرامات · مخالفات · ترخيص", descEn: "Fines · Violations · Licensing" },
                { emoji: "🏛️", labelAr: "تأسيس وهيكلة", labelEn: "Formation & Structuring", descAr: "شركات · فروع · نظام أساسي", descEn: "Companies · Branches · AOA" },
              ].map((cat, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.07 }}
                  className="flex flex-col gap-2 rounded-2xl border border-slate-200/50 bg-white p-4 dark:border-white/10 dark:bg-dark-card">
                  <span className="text-2xl">{cat.emoji}</span>
                  <div className="font-brand text-sm font-bold text-ink">{isAr ? cat.labelAr : cat.labelEn}</div>
                  <div className="text-[11px] text-ink-muted dark:text-gray-500">{isAr ? cat.descAr : cat.descEn}</div>
                </motion.div>
              ))}
            </motion.div>

            <div className="mb-4">
              <span className="text-xs font-semibold text-ink-faint dark:text-gray-500 uppercase tracking-wider">
                {isAr ? "— أمثلة على الخدمات المتاحة" : "— Examples of available services"}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
              {serviceList.map((service, i) => (
                <ServiceCard key={service.id} service={service} index={i} isAr={isAr}
                  isSelected={selectedService === service.id}
                  onSelect={() => setSelectedService(selectedService === service.id ? null : service.id)} />
              ))}
            </div>

            {/* Detail panel */}
            <AnimatePresence>
              {selected && (
                <motion.div key={selected.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="mt-6 rounded-[2rem] border border-royal/15 bg-white p-8 dark:border-white/10 dark:bg-dark-card md:p-10">
                    <div className="grid gap-8 md:grid-cols-2">
                      <div>
                        <h3 className="font-brand text-xl font-bold text-ink">{selected.label}</h3>
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
                          <div className="mt-1 text-xs text-ink-muted dark:text-gray-400">{isAr ? "مدة الخدمة:" : "Duration:"} {selected.duration}</div>
                        </div>
                        <motion.a href="/register" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                          className="flex items-center justify-center gap-2 rounded-2xl bg-royal px-6 py-4 text-sm font-semibold text-white">
                          {isAr ? "اطلب هذه الخدمة" : "Request This Service"}<ArrowLeft size={16} weight="bold" />
                        </motion.a>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* ── Why Companies Choose Nezamy ───────────────────────────────────── */}
        <section className="py-16 md:py-24">
          <div className="mx-auto max-w-[1400px] px-4">
            <div className="rounded-[2.5rem] bg-royal p-10 md:p-16">
              <div className="grid gap-12 md:grid-cols-2 md:items-center">
                <div>
                  <span className="text-sm font-medium text-gold">{isAr ? "لماذا نظامي للأعمال؟" : "Why Nezamy for Business?"}</span>
                  <h2 className="font-brand mt-3 text-3xl font-bold text-white md:text-4xl">{isAr ? "شريكك القانوني الاستراتيجي" : "Your Strategic Legal Partner"}</h2>
                  <p className="mt-4 text-sm leading-relaxed text-white/70">
                    {isAr ? "نظامي ليس مجرد منصة استشارات — بل شريك قانوني استراتيجي يفهم بيئة الأعمال السعودية ويساعدك على النمو." : "Nezamy is more than a consultation platform — it's a strategic legal partner that understands Saudi business and helps you grow."}
                  </p>
                  <div className="mt-8 grid grid-cols-2 gap-4">
                    {[
                      { icon: Lock, labelAr: "سرية تامة", labelEn: "Full Confidentiality" },
                      { icon: Clock, labelAr: "استجابة ٢٤/٧", labelEn: "24/7 Response" },
                      // «امتثال مضمون» / "Guaranteed Compliance" — removed.
                      // The other three chips on this card describe how the firm
                      // works; this one GUARANTEED an outcome, with no scope, no
                      // standard named, and no disclaimer. Compliance depends on
                      // a regulator's reading of a company's own facts, so it is
                      // not a thing any law firm can guarantee to a visitor who
                      // has not even signed up — and promising it in writing on a
                      // public page is the kind of claim the rest of this audit
                      // exists to remove. Replaced with what the firm actually
                      // does: review against the regulations.
                      { icon: Scales, labelAr: "مراجعة الامتثال النظامي", labelEn: "Regulatory Compliance Review" },
                      { icon: Brain, labelAr: "AI قانوني متقدم", labelEn: "Advanced Legal AI" },
                    ].map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-gold"><Icon size={18} weight="duotone" /></span>
                          <span className="text-sm text-white/80">{isAr ? item.labelAr : item.labelEn}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/*
                  أُزيلت هنا أربع "إحصاءات" مُختلَقة: «٥٠٠+ شركة تثق بنا»،
                  «٩٨٪ رضا المؤسسات»، «٤٠٪ توفير في التكاليف»، «٢٤ س متوسط وقت
                  الاستجابة». لا يوجد مصدر لأيٍّ منها. استُبدلت بعروض قيمة بلا
                  أرقام. لا تُعِد رقماً هنا ما لم يكن محسوباً من بيانات حقيقية.
                */}
                <div className="grid grid-cols-1 gap-4">
                  {[
                    {
                      icon: ShieldCheck,
                      titleAr: "الامتثال الشامل", titleEn: "End-to-End Compliance",
                      descAr: "مراجعة عقودك وسياساتك ومستنداتك على ضوء الأنظمة واللوائح السعودية السارية.",
                      descEn: "Your contracts, policies and filings reviewed against current Saudi laws and regulations.",
                    },
                    {
                      icon: Clock,
                      titleAr: "الاستجابة السريعة", titleEn: "Fast Response",
                      descAr: "قناة مباشرة مع فريقك القانوني، ومتابعة الطلب من فتحه حتى إغلاقه داخل المنصة.",
                      descEn: "A direct line to your legal team, with every request tracked in-platform from open to close.",
                    },
                    {
                      icon: Money,
                      titleAr: "الوفورات الاقتصادية", titleEn: "Cost Efficiency",
                      descAr: "بديل عن الإدارة القانونية الداخلية كاملة الدوام — تدفع مقابل ما تحتاجه فعلاً.",
                      descEn: "An alternative to a full-time in-house department — you pay for what you actually use.",
                    },
                  ].map((prop, i) => {
                    const Icon = prop.icon;
                    return (
                      <div key={i} className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
                        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold">
                          <Icon size={20} weight="duotone" />
                        </span>
                        <div>
                          <div className="font-brand text-base font-bold text-gold">{isAr ? prop.titleAr : prop.titleEn}</div>
                          <div className="mt-1 text-xs leading-relaxed text-white/60">{isAr ? prop.descAr : prop.descEn}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section className="pb-24">
          <div className="mx-auto max-w-[1400px] px-4 text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
              <h2 className="font-brand text-3xl font-bold text-royal dark:text-white md:text-4xl">
                {isAr ? "جاهز لتطوير إدارتك القانونية؟" : "Ready to Elevate Your Legal Management?"}
              </h2>
              <p className="mx-auto mt-4 max-w-[45ch] text-sm text-ink-muted dark:text-gray-400">
                {isAr ? "احصل على تقييم مجاني لاحتياجات شركتك القانونية." : "Get a free assessment of your company's legal needs."}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <motion.button onClick={() => setShowAssessment(true)} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-2 rounded-2xl bg-royal px-8 py-4 text-sm font-bold text-white shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)]">
                  {isAr ? "ابدأ تقييم مجاني" : "Start Free Assessment"}<ArrowLeft size={16} weight="bold" />
                </motion.button>
                <a href="/contact" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-7 py-4 text-sm font-medium text-ink-muted dark:border-white/10 dark:bg-dark-card dark:text-gray-300">
                  {isAr ? "تواصل مع فريق الأعمال" : "Contact Business Team"}
                </a>
              </div>
            </motion.div>
          </div>
        </section>

      </div>
      <Footer />
      
      {/* ── Assessment Modal ── */}
      <AnimatePresence>
        {showAssessment && <AssessmentModal onClose={() => setShowAssessment(false)} isAr={isAr} />}
      </AnimatePresence>
    </>
  );
}
