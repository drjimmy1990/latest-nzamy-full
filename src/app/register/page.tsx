"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Scales,
  UserCircle,
  Briefcase,
  Buildings,
  Handshake,
  Storefront,
  Gavel,
  Certificate,
  Shield,
  ArrowLeft,
  ArrowRight,
  CaretRight,
  CaretLeft,
  Star,
  CheckCircle,
  LinkSimple,
  FilmStrip,
  GraduationCap,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

const t = {
  ar: {
    logo: "نظامي",
    backHome: "العودة للرئيسية",
    pageTitle: "إنشاء حساب جديد",
    pageSubtitle: "اختر نوع حسابك للبدء",
    seekerTitle: "طالب خدمة",
    seekerDesc: "احصل على خدمات قانونية متكاملة من محامين معتمدين وخبراء قانونيين",
    seekerCta: "سجّل كطالب خدمة",
    seekerBadge: "الأكثر شيوعاً",
    providerTitle: "مقدّم خدمة",
    providerDesc: "انضم إلى شبكة المحترفين القانونيين وقدّم خدماتك لآلاف العملاء",
    providerCta: "سجّل كمقدم خدمة",
    providerBadge: "للمحترفين",
    seekerSubTypes: ["فرد", "شركة", "مؤسسة / منشأة", "جهة حكومية", "جمعية"],
    providerSubTypes: ["محامي", "شركة محاماة", "موثق", "معقب", "محكم"],
    seekerFeats: [
      "استشارات قانونية فورية",
      "عقود موثّقة ومعتمدة",
      "تمثيل قضائي أمام المحاكم",
    ],
    providerFeats: [
      "لوحة تحكم ERP متكاملة",
      "عملاء جدد باستمرار",
      "أدوات ذكاء اصطناعي قانوني",
    ],
    alreadyHave: "لديك حساب بالفعل؟",
    signIn: "سجّل دخولك",
    trustedBy: "موثوق من قِبَل",
    trustedCount: "+٥٠,٠٠٠",
    trustedLabel: "مستخدم نشط",
    partnerTitle: "شريك نظامي",
    partnerTypes: [
      { label: "شريك / منشئ محتوى", href: "/register/client?role=partner" },
      { label: "مشترك ميديا نظامي", href: "/media" },
      { label: "مشترك أكاديمية نظامي", href: "/academy" },
    ],
  },

  en: {
    logo: "Nezamy",
    backHome: "Back to Home",
    pageTitle: "Create Account",
    pageSubtitle: "Choose your account type to get started",
    seekerTitle: "Service Seeker",
    seekerDesc: "Get comprehensive legal services from certified lawyers and legal experts",
    seekerCta: "Register as Service Seeker",
    seekerBadge: "Most Popular",
    providerTitle: "Service Provider",
    providerDesc: "Join our network of legal professionals and offer services to thousands of clients",
    providerCta: "Register as Service Provider",
    providerBadge: "For Professionals",
    seekerSubTypes: ["Individual", "Company", "Small Business", "Government Entity", "Association"],
    providerSubTypes: ["Lawyer", "Law Firm", "Notary", "Court Runner", "Arbitrator"],
    seekerFeats: [
      "Instant legal consultations",
      "Notarized & certified contracts",
      "Court representation",
    ],
    providerFeats: [
      "Full ERP dashboard",
      "Steady stream of new clients",
      "AI legal tools",
    ],
    alreadyHave: "Already have an account?",
    signIn: "Sign in",
    trustedBy: "Trusted by",
    trustedCount: "50,000+",
    trustedLabel: "active users",
    partnerTitle: "Nzamy Partner",
    partnerTypes: [
      { label: "Partner / Content Creator", href: "/register/client?role=partner" },
      { label: "Nzamy Media Subscriber", href: "/media" },
      { label: "Nezamy Academy Student", href: "/academy" },
    ],
  },
};

const seekerSubIcons = [UserCircle, Buildings, Storefront, Shield, Handshake];
const providerSubIcons = [Gavel, Buildings, Certificate, UserCircle, Scales];

interface CardProps {
  type: "seeker" | "provider";
  txt: typeof t.ar | typeof t.en;
  isAr: boolean;
  isHovered: boolean;
  onHover: (v: boolean) => void;
  href: string;
  index: number;
}

function TypeCard({ type, txt, isAr, isHovered, onHover, href, index }: CardProps) {
  const isSeeker = type === "seeker";
  const title = isSeeker ? txt.seekerTitle : txt.providerTitle;
  const desc = isSeeker ? txt.seekerDesc : txt.providerDesc;
  const cta = isSeeker ? txt.seekerCta : txt.providerCta;
  const badge = isSeeker ? txt.seekerBadge : txt.providerBadge;
  const subTypes = isSeeker ? txt.seekerSubTypes : txt.providerSubTypes;
  const subIcons = isSeeker ? seekerSubIcons : providerSubIcons;
  const feats = isSeeker ? txt.seekerFeats : txt.providerFeats;
  const MainIcon = isSeeker ? UserCircle : Briefcase;
  const ArrowIcon = isAr ? CaretLeft : CaretRight;

  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 280,
        damping: 24,
        delay: index * 0.12,
      }}
      onHoverStart={() => onHover(true)}
      onHoverEnd={() => onHover(false)}
      className="relative"
    >
      <motion.a
        href={href}
        animate={{
          y: isHovered ? -4 : 0,
          boxShadow: isHovered
            ? isSeeker
              ? "0 24px 60px -12px rgba(11,61,46,0.22), 0 0 0 1px rgba(11,61,46,0.08)"
              : "0 24px 60px -12px rgba(200,167,98,0.22), 0 0 0 1px rgba(200,167,98,0.15)"
            : "0 4px 24px -8px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.05)",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className={`block rounded-3xl border bg-white dark:bg-dark-card overflow-hidden cursor-pointer ${
          isSeeker
            ? "border-royal/15 dark:border-royal/20"
            : "border-gold/20 dark:border-gold/20"
        }`}
        style={{ textDecoration: "none" }}
      >
        {/* Card top accent bar */}
        <div
          className={`h-1.5 w-full ${
            isSeeker
              ? "bg-gradient-to-r from-royal to-royal-light"
              : "bg-gradient-to-r from-gold-dark to-gold-light"
          }`}
        />

        <div className="p-7 lg:p-8">
          {/* Badge */}
          <div className="flex items-start justify-between mb-6">
            <motion.div
              animate={{ scale: isHovered ? 1.08 : 1, rotate: isHovered ? 5 : 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                isSeeker
                  ? "bg-royal/8 dark:bg-royal/15 text-royal dark:text-emerald-400"
                  : "bg-gold/10 dark:bg-gold/15 text-gold-dark dark:text-gold"
              }`}
            >
              <MainIcon weight="duotone" size={30} />
            </motion.div>

            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                isSeeker
                  ? "bg-royal/8 dark:bg-royal/15 text-royal dark:text-emerald-400"
                  : "bg-gold/10 dark:bg-gold/15 text-gold-dark dark:text-gold-light"
              }`}
            >
              <Star weight="fill" size={10} />
              {badge}
            </span>
          </div>

          {/* Title & description */}
          <h3 className="font-heading text-2xl font-bold text-ink dark:text-gray-100 mb-2">
            {title}
          </h3>
          <p className="text-ink-muted dark:text-gray-400 text-sm leading-relaxed mb-6">
            {desc}
          </p>

          {/* Sub-types chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            {subTypes.map((sub, i) => {
              const SubIcon = subIcons[i] || UserCircle;
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border ${
                    isSeeker
                      ? "border-royal/12 bg-royal/4 dark:bg-royal/10 dark:border-royal/20 text-royal dark:text-emerald-400"
                      : "border-gold/15 bg-gold/5 dark:bg-gold/10 dark:border-gold/20 text-gold-dark dark:text-gold"
                  }`}
                >
                  <SubIcon size={12} weight="duotone" />
                  {sub}
                </span>
              );
            })}
          </div>

          {/* Feature list */}
          <ul className="space-y-2.5 mb-7">
            {feats.map((feat, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <CheckCircle
                  weight="fill"
                  size={16}
                  className={isSeeker ? "text-royal dark:text-emerald-400 shrink-0" : "text-gold-dark dark:text-gold shrink-0"}
                />
                <span className="text-sm text-ink-muted dark:text-gray-400">{feat}</span>
              </li>
            ))}
          </ul>

          {/* CTA */}
          <motion.div
            animate={{
              x: isHovered ? (isAr ? -4 : 4) : 0,
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className={`flex items-center justify-center gap-2 w-full rounded-xl py-3.5 text-sm font-semibold transition-colors ${
              isSeeker
                ? "bg-royal text-white shadow-[0_4px_16px_-4px_rgba(11,61,46,0.4)] hover:bg-royal-light"
                : "bg-gradient-to-r from-gold-dark to-gold text-white shadow-[0_4px_16px_-4px_rgba(200,167,98,0.35)] hover:from-gold hover:to-gold-light"
            }`}
          >
            <span>{cta}</span>
            <ArrowIcon size={16} weight="bold" />
          </motion.div>
        </div>
      </motion.a>
    </motion.div>
  );
}

export default function RegisterPage() {
  const { lang, theme, toggleLang, toggleTheme } = useTheme();
  const isAr = lang === "ar";
  const txt = isAr ? t.ar : t.en;
  const dir = isAr ? "rtl" : "ltr";

  const [hoveredSeeker, setHoveredSeeker] = useState(false);
  const [hoveredProvider, setHoveredProvider] = useState(false);

  return (
    <div
      dir={dir}
      className="min-h-screen bg-surface dark:bg-dark-bg font-body transition-colors duration-300"
    >
      {/* ── HEADER ── */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-40 border-b border-slate-200/60 dark:border-dark-border bg-white/80 dark:bg-dark-card/80 backdrop-blur-lg"
      >
        <div className="mx-auto max-w-5xl px-5 py-3.5 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-2.5 group">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal text-white"
            >
              <Scales weight="bold" size={18} />
            </motion.div>
            <span className="font-brand text-xl font-bold text-royal dark:text-emerald-400">
              {txt.logo}
            </span>
          </a>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal hover:border-royal transition-colors dark:text-gray-400 dark:hover:text-gold dark:hover:border-gold"
            >
              {isAr ? "EN" : "عربي"}
            </button>
            <button
              onClick={toggleTheme}
              className="rounded-lg border border-slate-200 dark:border-dark-border px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-royal transition-colors dark:text-gray-400"
            >
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-dark-border" />
            <a
              href="/"
              className="flex items-center gap-1.5 text-sm text-ink-muted dark:text-gray-400 hover:text-royal dark:hover:text-gold transition-colors group"
            >
              {isAr ? (
                <>
                  {txt.backHome}
                  <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                </>
              ) : (
                <>
                  <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                  {txt.backHome}
                </>
              )}
            </a>
          </div>
        </div>
      </motion.header>

      {/* ── MAIN CONTENT ── */}
      <main className="mx-auto max-w-5xl px-5 py-12 md:py-16">
        {/* Page heading */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="text-center mb-10 md:mb-12"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 20, delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-full border border-royal/15 dark:border-royal/25 bg-royal/5 dark:bg-royal/10 px-4 py-1.5 mb-4"
          >
            <Scales weight="duotone" size={16} className="text-royal dark:text-emerald-400" />
            <span className="text-xs font-semibold text-royal dark:text-emerald-400 uppercase tracking-wider">
              {isAr ? "منصة نظامي القانونية" : "Nezamy Legal Platform"}
            </span>
          </motion.div>

          <h1 className="font-heading text-3xl md:text-4xl font-bold text-ink dark:text-gray-100 mb-3">
            {txt.pageTitle}
          </h1>
          <p className="text-ink-muted dark:text-gray-400 text-base md:text-lg">
            {txt.pageSubtitle}
          </p>
        </motion.div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-10">
          <TypeCard
            type="seeker"
            txt={txt}
            isAr={isAr}
            isHovered={hoveredSeeker}
            onHover={setHoveredSeeker}
            href="/register/client"
            index={0}
          />
          <TypeCard
            type="provider"
            txt={txt}
            isAr={isAr}
            isHovered={hoveredProvider}
            onHover={setHoveredProvider}
            href="/register/provider"
            index={1}
          />
        </div>

        {/* ── PARTNER STRIP (subtle) ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mb-8"
        >
          <div className="relative rounded-2xl border border-dashed border-slate-200 dark:border-dark-border bg-white/50 dark:bg-dark-card/40 px-5 py-4">
            {/* Label */}
            <div className="flex items-center gap-2 mb-3">
              <FilmStrip size={14} weight="duotone" className="text-zinc-400 dark:text-zinc-600" />
              <span className="text-[11px] font-semibold text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">
                {isAr ? txt.partnerTitle : txt.partnerTitle}
              </span>
              <div className="flex-1 h-px bg-slate-100 dark:bg-dark-border ms-1" />
            </div>
            {/* Partner chips */}
            <div className="flex flex-wrap gap-2">
              {txt.partnerTypes.map((p, i) => {
                const Icon = i === 0 ? LinkSimple : i === 1 ? FilmStrip : GraduationCap;
                return (
                  <a
                    key={i}
                    href={p.href}
                    className="group flex items-center gap-2 rounded-xl border border-slate-200 dark:border-dark-border bg-white dark:bg-dark-card/60 hover:border-royal/30 dark:hover:border-royal/30 px-3.5 py-2 transition-all hover:shadow-sm"
                  >
                    <Icon size={14} weight="duotone" className="text-zinc-400 group-hover:text-royal dark:group-hover:text-emerald-400 transition-colors flex-shrink-0" />
                    <p className="text-[12px] font-semibold text-ink dark:text-gray-200 group-hover:text-royal dark:group-hover:text-emerald-400 transition-colors">{p.label}</p>
                    <CaretLeft size={10} className={`text-zinc-300 group-hover:text-royal dark:group-hover:text-emerald-400 transition-colors flex-shrink-0 ms-auto ${!isAr ? "rotate-180" : ""}`} />
                  </a>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Social proof bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-8"
        >
          {/* Avatar stack */}
          <div className="flex -space-x-2 rtl:space-x-reverse">
            {[
              "bg-royal",
              "bg-gold-dark",
              "bg-emerald-600",
              "bg-sky-500",
              "bg-purple-500",
            ].map((color, i) => (
              <div
                key={i}
                className={`flex h-8 w-8 items-center justify-center rounded-full ${color} text-white text-xs font-bold border-2 border-white dark:border-dark-bg`}
              >
                {["أ", "م", "س", "ف", "ع"][i]}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-ink-muted dark:text-gray-400">
            <span className="font-bold text-ink dark:text-gray-200">{txt.trustedCount}</span>
            <span>{txt.trustedBy}</span>
            <span>{txt.trustedLabel}</span>
          </div>
          <div className="flex items-center gap-0.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} weight="fill" size={13} className="text-gold" />
            ))}
          </div>
        </motion.div>

        {/* Sign in link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="text-center"
        >
          <span className="text-sm text-ink-muted dark:text-gray-400">
            {txt.alreadyHave}{" "}
          </span>
          <a
            href="/login"
            className="text-sm font-semibold text-royal dark:text-gold hover:underline transition-colors"
          >
            {txt.signIn}
          </a>
        </motion.div>
      </main>

      {/* ── BACKGROUND DECORATION ── */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-royal/4 dark:bg-royal/8 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-gold/4 dark:bg-gold/6 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-royal/2 dark:bg-royal/4 blur-3xl" />
      </div>
    </div>
  );
}
