"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  ChatCircleDots,
  CalendarCheck,
  Brain,
  ArrowLeft,
  ArrowRight,
  Star,
  CaretDown,
  Check,
  Clock,
  CurrencyCircleDollar,
  Video,
  Microphone,
  User,
  Lightning,
  Sparkle,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import SmartSchedulingPicker, { type SchedulingChoice } from "@/components/SmartSchedulingPicker";
import { useTheme } from "@/components/ThemeProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type Lang = "ar" | "en";

// ─── Data ─────────────────────────────────────────────────────────────────────

const consultationTypes = {
  ar: [
    {
      icon: Brain,
      title: "نظامي AI",
      subtitle: "إجابة فورية من الذكاء الاصطناعي",
      price: "٩٩",
      currency: "ر.س",
      desc: "احصل على إجابات قانونية فورية من نموذج AI متخصص في الأنظمة واللوائح السعودية — مع خيار تصعيد للمحامي في أي وقت",
      features: ["غير محدود خلال الجلسة", "لحظي ٢٤/٧", "يستشهد بالمادة القانونية", "تصعيد للمحامي بضغطة"],
      badge: "الأوفر",
      color: "from-emerald-500/10 to-emerald-500/5",
      border: "border-emerald-500/20",
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: Video,
      title: "استشارة صوتية / مرئية",
      subtitle: "جلسة مباشرة مع محامٍ",
      price: "٢٩٩",
      currency: "ر.س",
      desc: "جلسة استشارية مباشرة مع محامٍ معتمد عبر الصوت أو الفيديو — ٤٥ دقيقة كاملة وتقرير مكتوب بعد الجلسة",
      features: ["٤٥ دقيقة مع محامٍ معتمد", "صوت أو فيديو حسب اختيارك", "تقرير مكتوب بعد الجلسة", "متابعة مجانية ٢٤ ساعة"],
      badge: "الأكثر طلبًا",
      color: "from-royal/10 to-royal/5",
      border: "border-royal/20",
      accent: "text-royal",
    },
    {
      icon: User,
      title: "استشارة حضورية",
      subtitle: "لقاء شخصي في المكتب",
      price: "٧٠٠",
      currency: "ر.س",
      desc: "استشارة حضورية في مكتب المحامي لمن يفضل التواصل المباشر — ٦٠ دقيقة مع محامٍ متخصص وملف قضية كامل",
      features: ["٦٠ دقيقة في مكتب المحامي", "توقيع وثائق رسمية", "ملف قضية مكتوب كامل", "متابعة مجانية أسبوع"],
      badge: null,
      color: "from-gold/10 to-gold/5",
      border: "border-gold/20",
      accent: "text-gold",
    },
  ],
  en: [
    {
      icon: Brain,
      title: "Nezamy AI",
      subtitle: "Instant AI-powered legal answers",
      price: "99",
      currency: "SAR",
      desc: "Get instant legal answers from an AI model specialized in Saudi regulations — with the option to escalate to a lawyer at any time",
      features: ["Unlimited within session", "Instant 24/7", "Cites legal articles", "One-tap lawyer escalation"],
      badge: "Best Value",
      color: "from-emerald-500/10 to-emerald-500/5",
      border: "border-emerald-500/20",
      accent: "text-emerald-600 dark:text-emerald-400",
    },
    {
      icon: Video,
      title: "Voice / Video Consultation",
      subtitle: "Live session with a lawyer",
      price: "299",
      currency: "SAR",
      desc: "Live consultation session with a certified lawyer via voice or video — 45 full minutes with a written report after the session",
      features: ["45 min with certified lawyer", "Voice or video, your choice", "Written report after session", "Free 24-hour follow-up"],
      badge: "Most Popular",
      color: "from-royal/10 to-royal/5",
      border: "border-royal/20",
      accent: "text-royal",
    },
    {
      icon: User,
      title: "In-Person Consultation",
      subtitle: "Face-to-face at the office",
      price: "700",
      currency: "SAR",
      desc: "In-person consultation at the lawyer's office for those who prefer direct contact — 60 minutes with a specialist lawyer and a full case file",
      features: ["60 min at lawyer's office", "Sign official documents", "Full written case file", "Free one-week follow-up"],
      badge: null,
      color: "from-gold/10 to-gold/5",
      border: "border-gold/20",
      accent: "text-gold",
    },
  ],
};

const steps = {
  ar: [
    { num: "١", title: "اختر المحامي", desc: "تصفّح ملفات المحامين وفلتر حسب التخصص والتقييم" },
    { num: "٢", title: "احجز الموعد", desc: "اختر نوع الاستشارة والوقت المناسب وادفع بأمان" },
    { num: "٣", title: "الجلسة", desc: "التواصل عبر المنصة بالصوت أو الفيديو أو الدردشة" },
    { num: "٤", title: "التقرير", desc: "احصل على ملخص مكتوب وتوصيات المحامي بعد الجلسة" },
  ],
  en: [
    { num: "1", title: "Choose a Lawyer", desc: "Browse lawyer profiles and filter by specialty and rating" },
    { num: "2", title: "Book a Slot", desc: "Select consultation type, preferred time and pay securely" },
    { num: "3", title: "The Session", desc: "Connect via the platform by voice, video or chat" },
    { num: "4", title: "The Report", desc: "Receive a written summary and lawyer recommendations after the session" },
  ],
};

const lawyers = [
  { name: { ar: "أ. محمد الغامدي", en: "Atty. Mohammad Al-Ghamdi" }, specialty: { ar: "قانون العمل", en: "Labor Law" }, rating: 4.9, sessions: 312 },
  { name: { ar: "أ. سارة الحربي", en: "Atty. Sarah Al-Harbi" }, specialty: { ar: "قانون الأسرة", en: "Family Law" }, rating: 4.8, sessions: 247 },
  { name: { ar: "أ. خالد العتيبي", en: "Atty. Khaled Al-Otaibi" }, specialty: { ar: "القانون التجاري", en: "Commercial Law" }, rating: 4.9, sessions: 189 },
  { name: { ar: "أ. نورة السبيعي", en: "Atty. Noura Al-Subaie" }, specialty: { ar: "العقود والملكية", en: "Contracts & Property" }, rating: 4.7, sessions: 156 },
];

const faqs = {
  ar: [
    { q: "كيف تتم الاستشارة الفورية؟", a: "بعد الدفع مباشرةً يتم تحويلك لغرفة دردشة/صوت/فيديو مع أول محامٍ متاح من التخصص المطلوب. متوسط وقت الانتظار أقل من ٥ دقائق." },
    { q: "هل الاستشارة سرية؟", a: "نعم، جميع المحادثات مشفرة ومحمية ولا يطّلع عليها أي طرف ثالث. تلتزم المنصة بسرية المعلومات القانونية بموجب النظام السعودي." },
    { q: "ما الفرق بين الاستشارة الفورية والمجدولة؟", a: "الفورية تربطك بأول محامٍ متاح خلال دقائق لمدة ٣٠ دقيقة. المجدولة تتيح لك اختيار محامٍ بعينه وتحديد وقت يناسبك لمدة ٦٠ دقيقة." },
    { q: "هل يمكن استرداد المبلغ إذا لم أكن راضيًا؟", a: "نعم، نضمن الرضا الكامل. إذا لم تكن راضيًا عن الاستشارة يمكنك طلب استرداد كامل خلال ٢٤ ساعة من انتهاء الجلسة." },
    { q: "هل نظامي AI يغني عن المحامي البشري؟", a: "نظامي AI أداة مساعدة ممتازة للاستفسارات العامة والمعلوماتية، لكن للقضايا المعقدة والتمثيل القضائي لا بديل عن محامٍ بشري معتمد." },
  ],
  en: [
    { q: "How does an instant consultation work?", a: "After payment you are immediately connected to a voice/video/chat room with the first available lawyer in the requested specialty. Average wait time is under 5 minutes." },
    { q: "Is the consultation confidential?", a: "Yes, all conversations are encrypted and protected. No third party can access them. The platform complies with Saudi legal confidentiality requirements." },
    { q: "What is the difference between instant and scheduled?", a: "Instant connects you with the first available lawyer in minutes for 30 minutes. Scheduled lets you choose a specific lawyer and a time that suits you for 60 minutes." },
    { q: "Can I get a refund if I am not satisfied?", a: "Yes, we guarantee full satisfaction. If you are not satisfied with the consultation you can request a full refund within 24 hours of session completion." },
    { q: "Does Nezamy AI replace a human lawyer?", a: "Nezamy AI is an excellent aid for general and informational queries, but for complex cases and court representation there is no substitute for a certified human lawyer." },
  ],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ConsultationsPage() {
  const { theme, lang } = useTheme();
  const isRTL = lang === "ar";
  const isDark = theme === "dark";
  const L = lang as Lang;
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [scheduling, setScheduling] = useState<SchedulingChoice>(null);

  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div className={`min-h-screen ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"}`} dir={isRTL ? "rtl" : "ltr"}>
      <Navbar />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden pt-28 pb-20">
        <div className="absolute inset-0 bg-gradient-to-br from-royal/8 via-transparent to-gold/5 pointer-events-none" />
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-royal/30 to-transparent" />

        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-14"
          >
            <div className="inline-flex items-center gap-2 bg-royal/10 text-royal text-sm font-medium px-4 py-1.5 rounded-full mb-5 border border-royal/20">
              <ChatCircleDots weight="fill" size={16} />
              <span>{isRTL ? "خدمة الاستشارات" : "Consultation Service"}</span>
            </div>
            <h1 className={`text-4xl sm:text-5xl font-bold mb-4 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "الاستشارات القانونية" : "Legal Consultations"}
            </h1>
            <p className={`text-lg max-w-2xl mx-auto ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              {isRTL
                ? "تواصل مع محامٍ معتمد في دقائق — صوتاً أو مرئياً أو نصاً — أو استعن بنظامي AI المتخصص في الأنظمة السعودية"
                : "Connect with a certified lawyer in minutes — by voice, video or text — or use Nezamy AI specialized in Saudi law"}
            </p>
          </motion.div>

          {/* Consultation type cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {consultationTypes[L].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className={`relative rounded-2xl border p-6 bg-gradient-to-br ${item.color} ${item.border} ${isDark ? "dark:bg-dark-card dark:border-white/10" : "bg-white"} overflow-hidden group hover:shadow-lg transition-all duration-300`}
              >
                {item.badge && (
                  <div className="absolute top-4 end-4 bg-royal text-white text-xs font-bold px-2.5 py-1 rounded-full">
                    {item.badge}
                  </div>
                )}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${isDark ? "bg-white/10" : "bg-white"} shadow-sm`}>
                  <item.icon size={24} className={item.accent} weight="duotone" />
                </div>
                <h3 className={`text-xl font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>{item.title}</h3>
                <p className={`text-sm mb-3 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{item.subtitle}</p>
                <p className={`text-sm mb-5 leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>{item.desc}</p>
                <ul className="space-y-2 mb-6">
                  {item.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check size={14} className="text-royal flex-shrink-0" weight="bold" />
                      <span className={isDark ? "text-gray-300" : "text-gray-700"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex items-end justify-between">
                  <div>
                    <span className={`text-3xl font-black ${item.accent}`}>{item.price}</span>
                    <span className={`text-sm ms-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{item.currency}</span>
                  </div>
                  <motion.a
                    href="/register/client"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-1.5 bg-royal text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-royal/90 transition-colors"
                  >
                    {isRTL ? "ابدأ" : "Start"}
                    <Arrow size={14} weight="bold" />
                  </motion.a>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-[#0e1217]" : "bg-white"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-14"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "كيف تعمل المنصة؟" : "How It Works"}
            </h2>
            <p className={`text-base ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL ? "٤ خطوات بسيطة للحصول على استشارتك القانونية" : "4 simple steps to get your legal consultation"}
            </p>
          </motion.div>

          <div className="relative">
            {/* Connector line */}
            <div className={`hidden md:block absolute top-10 ${isRTL ? "right-[12.5%]" : "left-[12.5%]"} w-3/4 h-0.5 bg-gradient-to-r from-royal/20 via-gold/30 to-royal/20`} />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {steps[L].map((step, i) => (
                <motion.div
                  key={step.num}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.12 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-royal to-royal/70 flex items-center justify-center shadow-lg mb-5 z-10">
                    <span className="text-2xl font-black text-white">{step.num}</span>
                    <div className="absolute inset-0 rounded-2xl bg-white/10" />
                  </div>
                  <h3 className={`text-lg font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>{step.title}</h3>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Smart Scheduling ─────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"}`}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-10"
          >
            <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium mb-4 ${
              isDark ? "bg-[#C8A762]/10 border-[#C8A762]/20 text-[#C8A762]" : "bg-royal/10 border-royal/20 text-royal"
            }`}>
              <Lightning size={15} weight="fill" />
              {isRTL ? "احجز استشارتك الآن" : "Book Your Consultation Now"}
            </div>
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "كيف تفضل الحجز؟" : "How would you like to book?"}
            </h2>
            <p className={`text-base ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL
                ? "اختر الطريقة الأنسب لك — فورياً أو بموعد مجدول أو بأقرب وقت"
                : "Choose the best option for you — instant, scheduled, or next available"}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className={`rounded-3xl border p-6 ${isDark ? "border-white/10 bg-[#161b22]" : "border-slate-200 bg-white shadow-sm"}`}
          >
            <SmartSchedulingPicker
              mode="consultation"
              selected={scheduling}
              onSelect={(c) => {
                setScheduling(c);
                if (c === "calendar") {/* calendar opens inline inside picker */}
                else if (c === "instant") window.location.href = "/register/client";
              }}
              isRTL={isRTL}
              isDark={isDark}
            />
            {scheduling && scheduling !== "earliest" && scheduling !== "calendar" && (
              <motion.a
                href="/register/client"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0B3D2E] py-3.5 text-sm font-semibold text-white hover:bg-[#0a3328] transition-colors"
              >
                {isRTL ? "التالي — التسجيل والدفع" : "Next — Register & Pay"}
                {isRTL ? <ArrowLeft size={16} weight="bold" /> : <ArrowRight size={16} weight="bold" />}
              </motion.a>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── Lawyer Profiles ───────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-[#0e1217]" : "bg-white"}`}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "محامون معتمدون" : "Certified Lawyers"}
            </h2>
            <p className={`text-base ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL ? "فريق من أبرز المحامين المعتمدين من وزارة العدل" : "A team of top lawyers certified by the Ministry of Justice"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {lawyers.map((lawyer, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -4 }}
                className={`rounded-2xl border p-6 text-center cursor-pointer transition-all duration-300 ${
                  isDark
                    ? "bg-[#161b22] border-white/10 hover:border-royal/40"
                    : "bg-white border-gray-100 hover:border-royal/30 hover:shadow-md"
                }`}
              >
                {/* Avatar placeholder */}
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-royal/20 to-royal/10 border-2 border-royal/20 mx-auto mb-4 flex items-center justify-center">
                  <User size={28} className="text-royal" weight="duotone" />
                </div>
                <h4 className={`font-bold mb-1 text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{lawyer.name[L]}</h4>
                <p className={`text-xs mb-3 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{lawyer.specialty[L]}</p>
                <div className="flex items-center justify-center gap-1 mb-2">
                  {[...Array(5)].map((_, s) => (
                    <Star key={s} size={12} weight={s < Math.floor(lawyer.rating) ? "fill" : "regular"} className="text-gold" />
                  ))}
                  <span className="text-xs text-gold font-semibold ms-1">{lawyer.rating}</span>
                </div>
                <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  {isRTL ? `${lawyer.sessions} جلسة` : `${lawyer.sessions} sessions`}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ───────────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-[#0e1217]" : "bg-white"}`}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "الأسعار" : "Pricing"}
            </h2>
            <p className={`text-base ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {isRTL ? "أسعار شفافة بدون رسوم مخفية" : "Transparent pricing with no hidden fees"}
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {consultationTypes[L].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`rounded-2xl border p-7 relative ${
                  i === 0
                    ? "border-royal bg-gradient-to-br from-royal/8 to-royal/3 ring-2 ring-royal/20"
                    : isDark
                    ? "border-white/10 bg-[#161b22]"
                    : "border-gray-100 bg-white"
                }`}
              >
                {i === 0 && (
                  <div className="absolute -top-3 start-1/2 -translate-x-1/2 bg-royal text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    {isRTL ? "الأكثر طلبًا" : "Most Popular"}
                  </div>
                )}
                <item.icon size={28} className={`${item.accent} mb-4`} weight="duotone" />
                <h3 className={`text-lg font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>{item.title}</h3>
                <div className="flex items-end gap-1 my-4">
                  <span className={`text-4xl font-black ${item.accent}`}>{item.price}</span>
                  <span className={`text-sm pb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{item.currency}</span>
                </div>
                <ul className="space-y-2.5 mb-7">
                  {item.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <div className="w-4 h-4 rounded-full bg-royal/10 flex items-center justify-center flex-shrink-0">
                        <Check size={10} className="text-royal" weight="bold" />
                      </div>
                      <span className={isDark ? "text-gray-300" : "text-gray-600"}>{f}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href="/register/client"
                  className={`block text-center py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    i === 0
                      ? "bg-royal text-white hover:bg-royal/90"
                      : isDark
                      ? "bg-white/10 text-white hover:bg-white/15"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                  }`}
                >
                  {isRTL ? "ابدأ الآن" : "Get Started"}
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <section className={`py-20 ${isDark ? "bg-[#0c0f12]" : "bg-gray-50"}`}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className={`text-3xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
            </h2>
          </motion.div>

          <div className="space-y-3">
            {faqs[L].map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className={`rounded-xl border overflow-hidden ${
                  isDark ? "bg-[#161b22] border-white/10" : "bg-white border-gray-100"
                }`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between p-5 text-start"
                >
                  <span className={`font-semibold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{faq.q}</span>
                  <motion.div animate={{ rotate: openFaq === i ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <CaretDown size={16} className={isDark ? "text-gray-400" : "text-gray-500"} />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className={`px-5 pb-5 text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-gray-600"}`}>{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative rounded-3xl bg-gradient-to-br from-royal via-royal/90 to-[#0a3025] p-12 text-center overflow-hidden"
          >
            <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-5" />
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
            <Lightning size={40} className="text-gold mx-auto mb-4" weight="duotone" />
            <h2 className="text-3xl font-bold text-white mb-3">
              {isRTL ? "ابدأ استشارتك الآن" : "Start Your Consultation Now"}
            </h2>
            <p className="text-white/70 mb-8 text-base max-w-xl mx-auto">
              {isRTL
                ? "انضم لآلاف العملاء الذين حصلوا على إجاباتهم القانونية عبر نظامي"
                : "Join thousands of clients who got their legal answers through Nezamy"}
            </p>
            <motion.a
              href="/register/client"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2.5 bg-gold text-[#0B3D2E] font-bold px-8 py-3.5 rounded-xl text-base hover:bg-gold/90 transition-colors shadow-lg"
            >
              {isRTL ? "ابدأ استشارتك الآن" : "Start Your Consultation"}
              <Arrow size={18} weight="bold" />
            </motion.a>
          </motion.div>
        </div>
      </section>

      <Footer />
      <FloatingButtons />
    </div>
  );
}
