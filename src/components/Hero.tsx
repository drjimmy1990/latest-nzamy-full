"use client";

import { useState, useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, AnimatePresence } from "framer-motion";
import { ArrowLeft, Play, Scales, ShieldCheck, Brain, Buildings, LockKey, CheckCircle, X } from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";
import Link from "next/link";

function FloatingOrb({ delay, size, x, y }: { delay: number; size: number; x: string; y: string }) {
  return (
    <motion.div
      className="absolute rounded-full opacity-20"
      style={{
        width: size,
        height: size,
        left: x,
        top: y,
        background: "radial-gradient(circle, rgba(200,167,98,0.4) 0%, rgba(11,61,46,0.15) 70%, transparent 100%)",
      }}
      animate={{
        y: [0, -20, 0],
        scale: [1, 1.05, 1],
      }}
      transition={{
        duration: 6,
        delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

function AnimatedStat({ value, label, delay }: { value: string; label: string; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay }}
      className="text-center"
    >
      <div className="font-brand text-2xl font-bold text-royal md:text-3xl">{value}</div>
      <div className="mt-1 text-xs text-ink-muted md:text-sm">{label}</div>
    </motion.div>
  );
}

export default function Hero() {
  const { lang, theme } = useTheme();
  const isAr = lang === "ar";
  const isDark = theme === "dark";
  const [videoOpen, setVideoOpen] = useState(false);
  
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const rotateX = useTransform(mouseY, [-300, 300], [3, -3]);
  const rotateY = useTransform(mouseX, [-300, 300], [-3, 3]);

  const handleMouse = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    mouseX.set(e.clientX - rect.left - rect.width / 2);
    mouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  // Close video modal with Escape key + lock body scroll
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!videoOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setVideoOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", handler);
    };
  }, [videoOpen]);

  return (
    <>
      {/* YouTube Modal — accessible dialog */}
      <AnimatePresence>
        {videoOpen && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={isAr ? "مقطع الفيديو التعريفي" : "Introduction video"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
            onClick={() => setVideoOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-2xl bg-black shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <button
                ref={closeButtonRef}
                onClick={() => setVideoOpen(false)}
                aria-label={isAr ? "إغلاق الفيديو" : "Close video"}
                className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-md transition-colors hover:bg-black/80"
              >
                <X size={20} weight="bold" />
              </button>
              <iframe
                className="h-full w-full"
                src="https://www.youtube.com/embed/M7lc1UVf-VE?autoplay=1"
                title={isAr ? "مقطع نظامي التعريفي" : "Nezamy Introduction Video"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    <section
      className="relative min-h-[100dvh] overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24"
      onMouseMove={handleMouse}
    >
      {/* Aesthetic Video Background */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          muted
          playsInline
          preload="none"
          onTimeUpdate={(e) => {
            if (e.currentTarget.currentTime >= 5) {
              e.currentTarget.currentTime = 1;
              e.currentTarget.play();
            }
          }}
          className="h-full w-full object-cover opacity-30 dark:opacity-20 mix-blend-luminosity"
        >
          <source src="/hero-bg.mp4" type="video/mp4" />
        </video>
        <div className={`absolute inset-0 bg-gradient-to-t ${isDark ? "from-dark-bg via-dark-bg/80 to-transparent" : "from-surface via-surface/80 to-transparent"}`} />
      </div>

      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden mix-blend-color-dodge">
        <FloatingOrb delay={0} size={400} x="70%" y="10%" />
        <FloatingOrb delay={2} size={300} x="10%" y="60%" />
        <FloatingOrb delay={4} size={200} x="80%" y="70%" />
      </div>

      {/* Grain overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.02] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 mx-auto max-w-[1400px] px-4">
        <div className="grid items-center gap-12 md:grid-cols-2 md:gap-8">
          {/* Content - Right side (RTL) */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 60, damping: 20 }}
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-2"
            >
              <motion.span
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="h-2 w-2 rounded-full bg-gold"
              />
              <span className="text-xs font-medium text-gold-dark">
                {isAr ? "المنصة القانونية الأولى في المملكة" : "The First Legal Platform in Saudi Arabia"}
              </span>
            </motion.div>

            <h1 className="font-brand text-4xl font-extrabold leading-none tracking-tighter text-royal md:text-6xl lg:text-7xl">
              <span className="block">{isAr ? "شريكك" : "Your Smart"}</span>
              <span className="block">{isAr ? "القانوني" : "Legal"}</span>
              <span className="relative inline-block">
                <span className="relative z-10">{isAr ? "الذكي" : "Partner"}</span>
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ delay: 0.8, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute bottom-1 right-0 z-0 h-3 rounded-sm bg-gold/25 md:h-4"
                />
              </span>
            </h1>

            <p className={`mt-6 max-w-[50ch] text-base leading-relaxed md:text-lg ${isDark ? "text-gray-300" : "text-ink-muted"}`}>
              {isAr
                ? "استشارات قانونية فورية، صياغة عقود بالذكاء الاصطناعي، تمثيل قضائي، وإدارة مكاتب المحاماة — كل ما تحتاجه في منصة واحدة."
                : "Instant legal consultations, AI-powered contract drafting, litigation, and law firm management — everything you need in one platform."}
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <motion.a
                href="#services"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="group inline-flex items-center gap-2 rounded-2xl bg-royal px-7 py-4 text-sm font-semibold text-white shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)] transition-shadow hover:shadow-[0_12px_40px_-8px_rgba(11,61,46,0.6)]"
              >
                {isAr ? "اطلب خدمة فورية" : "Get Started Now"}
                <ArrowLeft
                  size={18}
                  weight="bold"
                  className="transition-transform group-hover:-translate-x-1"
                />
              </motion.a>

              <motion.button
                onClick={() => setVideoOpen(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className={`inline-flex items-center gap-3 rounded-2xl border px-6 py-4 text-sm font-medium shadow-sm transition-all hover:border-royal/20 ${isDark ? "border-white/10 bg-white/5 text-gray-200 hover:text-emerald-400" : "border-slate-200 bg-white text-ink-muted hover:text-royal"}`}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-royal/5 dark:bg-emerald-500/10">
                  <Play size={16} weight="fill" className="text-royal dark:text-emerald-400" />
                </span>
                {isAr ? "شاهد الفيديو التعريفي" : "Watch the Intro Video"}
              </motion.button>
            </div>

            {/* Trust badges */}
            <div className={`mt-10 flex flex-wrap items-center gap-4 text-xs font-medium border-t pt-8 ${isDark ? "border-white/10 text-gray-400" : "border-slate-100 text-slate-500"}`}>
              <div className="flex items-center gap-1.5 rounded-full bg-slate-50 dark:bg-white/5 px-3 py-1.5">
                <Buildings size={16} className="text-royal dark:text-emerald-400" />
                {isAr ? "مرخّص من وزارة العدل" : "Ministry of Justice Licensed"}
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-slate-50 dark:bg-white/5 px-3 py-1.5">
                <LockKey size={16} className="text-royal dark:text-emerald-400" />
                {isAr ? "تشفير 256-bit SSL" : "256-bit SSL Security"}
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-slate-50 dark:bg-white/5 px-3 py-1.5">
                <CheckCircle size={16} className="text-gold-dark" />
                {isAr ? "ضمان Escrow المالي" : "Escrow Financial Guarantee"}
              </div>
            </div>
          </motion.div>

          {/* Visual - Left side (RTL) */}
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 60, damping: 20, delay: 0.3 }}
            style={{ rotateX, rotateY, perspective: 1000 }}
            className="relative"
          >
            {/* Caption */}
            <div className="mb-3 flex items-center justify-center gap-2 text-xs font-medium text-ink-faint">
              <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 2, repeat: Infinity }}
                className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {isAr ? "معاينة مباشرة للمنصة" : "Live Platform Preview"}
            </div>
            {/* Main card */}
            <div className="relative rounded-[2.5rem] border border-slate-200/50 bg-white p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-dark-card dark:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.4)] md:p-10">
              {/* Glass inner border */}
              <div className="absolute inset-0 rounded-[2.5rem] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]" />

              {/* Mock UI */}
              <div className="relative space-y-6">
                {/* Header — Dashboard indicator */}
                <Link href="/dashboard/client" className="flex items-center justify-between group/header">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-bl from-royal to-royal-light transition group-hover/header:opacity-80">
                      <Scales size={18} weight="bold" className="text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink group-hover/header:text-royal transition">{isAr ? "لوحة تحكم العميل" : "Client Dashboard"}</div>
                      <div className="text-xs text-ink-muted">{isAr ? "اضغط للدخول ←" : "Tap to enter →"}</div>
                    </div>
                  </div>
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600"
                  >
                    {isAr ? "نشط" : "Active"}
                  </motion.div>
                </Link>

                {/* Service cards — clickable shortcuts */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: Scales, label: isAr ? "استشارة" : "Consult", color: "bg-royal/5 text-royal", href: "/services/consultations" },
                    { icon: ShieldCheck, label: isAr ? "عقود" : "Contracts", color: "bg-gold/10 text-gold-dark", href: "/services/contracts" },
                    { icon: Brain, label: isAr ? "AI تحليل" : "AI Analysis", color: "bg-emerald-50 text-emerald-600", href: "/ai" },
                  ].map((item, i) => (
                    <motion.div
                      key={item.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 + i * 0.15, type: "spring", stiffness: 100, damping: 20 }}
                    >
                      <Link
                        href={item.href}
                        className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 p-4 transition-all hover:border-royal/20 hover:shadow-md hover:-translate-y-0.5 active:scale-95 dark:border-white/10 dark:hover:border-white/20 cursor-pointer"
                      >
                        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${item.color} transition-transform group-hover:scale-110`}>
                          <item.icon size={20} weight="duotone" />
                        </span>
                        <span className="text-xs font-medium text-ink-muted">{item.label}</span>
                      </Link>
                    </motion.div>
                  ))}
                </div>

                {/* Chat simulation */}
                <div className="space-y-3 rounded-2xl bg-surface p-4 dark:bg-dark-bg">
                  {/* User bubble — ms-auto pushes to end (right in RTL, left in LTR) */}
                  <motion.div
                    initial={{ opacity: 0, x: isAr ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.2 }}
                    className="ms-auto max-w-[80%] rounded-2xl rounded-ee-none bg-royal px-4 py-3 text-xs leading-relaxed text-white"
                  >
                    {isAr ? "أحتاج مراجعة عقد إيجار تجاري عاجل" : "I need an urgent commercial lease review"}
                  </motion.div>
                  {/* AI bubble — me-auto pushes to start (left in RTL, right in LTR) */}
                  <motion.div
                    initial={{ opacity: 0, x: isAr ? -20 : 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.6 }}
                    className="me-auto max-w-[80%] rounded-2xl rounded-ss-none border border-slate-100 bg-white px-4 py-3 text-xs leading-relaxed text-ink-muted dark:border-white/10 dark:bg-dark-card dark:text-gray-300"
                  >
                    <span className="mb-1 block text-[10px] font-semibold text-gold-dark">{isAr ? "نظامي AI" : "Nezamy AI"}</span>
                    {isAr ? "تم تحليل العقد. وجدنا ٣ بنود تحتاج مراجعة متخصصة..." : "Contract analyzed. Found 3 clauses needing expert review..."}
                  </motion.div>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className={isDark ? "text-gray-400" : "text-ink-muted"}>{isAr ? "تقدم القضية" : "Case Progress"}</span>
                    <span className={`font-medium ${isDark ? "text-emerald-400" : "text-royal"}`}>٦٨%</span>
                  </div>
                  <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-white/10" : "bg-slate-100"}`}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: "68%" }}
                      transition={{ delay: 1.8, duration: 1, ease: [0.16, 1, 0.3, 1] }}
                      className="h-full rounded-full bg-gradient-to-l from-royal to-gold dark:from-emerald-500 dark:to-emerald-300"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 2, type: "spring", stiffness: 100, damping: 15 }}
              className="absolute -bottom-4 -right-4 rounded-2xl border border-white bg-white px-5 py-3 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-dark-card"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10">
                  <ShieldCheck size={22} weight="fill" className="text-gold-dark" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-ink">{isAr ? "ضمان مالي كامل" : "Full Financial Guarantee"}</div>
                  <div className="text-[10px] text-ink-muted">{isAr ? "نظام Escrow لحماية الطرفين" : "Escrow system to protect both parties"}</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
    </>
  );
}
