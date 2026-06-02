"use client";

import { motion } from "framer-motion";
import { HouseLine, MagnifyingGlass, ArrowLeft, Scales, ShieldCheck } from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingButtons from "@/components/FloatingButtons";
import { useTheme } from "@/components/ThemeProvider";

export default function NotFound() {
  const { lang } = useTheme();
  const isAr = lang === "ar";

  const links = [
    {
      href: "/",
      icon: HouseLine,
      label: isAr ? "الصفحة الرئيسية" : "Home Page",
      desc: isAr ? "العودة للصفحة الرئيسية" : "Back to the main page",
    },
    {
      href: "/services/individuals",
      icon: Scales,
      label: isAr ? "خدمات الأفراد" : "Individual Services",
      desc: isAr ? "استشارات، عقود، تمثيل قضائي" : "Consultations, contracts, representation",
    },
    {
      href: "/ai",
      icon: ShieldCheck,
      label: isAr ? "نظامي AI" : "Nezamy AI",
      desc: isAr ? "المساعد القانوني الذكي" : "Smart legal assistant",
    },
    {
      href: "/pricing",
      icon: MagnifyingGlass,
      label: isAr ? "الاشتراكات" : "Pricing",
      desc: isAr ? "اختر الباقة المناسبة لك" : "Choose the right plan for you",
    },
  ];

  return (
    <>
      <Navbar />
      <main className="relative min-h-[100dvh] overflow-hidden pt-32 pb-20">
        {/* Background decoration */}
        <div className="pointer-events-none absolute inset-0">
          <motion.div
            animate={{ y: [0, -15, 0], scale: [1, 1.03, 1] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[15%] right-[10%] h-72 w-72 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, rgba(200,167,98,0.4) 0%, transparent 70%)" }}
          />
          <motion.div
            animate={{ y: [0, 12, 0], scale: [1, 1.05, 1] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="absolute bottom-[20%] left-[5%] h-56 w-56 rounded-full opacity-15"
            style={{ background: "radial-gradient(circle, rgba(11,61,46,0.3) 0%, transparent 70%)" }}
          />
        </div>

        <div className="relative mx-auto max-w-2xl px-4 text-center">
          {/* 404 Number */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 80, damping: 15 }}
          >
            <span className="font-brand text-[10rem] font-black leading-none tracking-tighter text-royal/10 md:text-[14rem]">
              404
            </span>
          </motion.div>

          {/* Message */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 80, damping: 20, delay: 0.2 }}
            className="-mt-16 md:-mt-24"
          >
            <h1 className="font-brand text-3xl font-bold text-ink md:text-4xl">
              {isAr ? "الصفحة غير موجودة" : "Page Not Found"}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-ink-muted md:text-lg">
              {isAr
                ? "يبدو أن هذه الصفحة غير متوفرة أو تم نقلها. لا تقلق، يمكنك العودة واستكشاف خدماتنا."
                : "This page doesn't exist or has been moved. Don't worry, you can go back and explore our services."}
            </p>
          </motion.div>

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-10 grid gap-3 sm:grid-cols-2"
          >
            {links.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.1, type: "spring", stiffness: 100, damping: 20 }}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                className="group flex items-start gap-4 rounded-2xl border border-slate-200/50 bg-white p-5 text-start shadow-sm transition-all hover:border-royal/15 hover:shadow-md"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-royal/5 text-royal transition-colors group-hover:bg-royal/10">
                  <link.icon size={22} weight="duotone" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-ink">{link.label}</div>
                  <div className="mt-0.5 text-xs text-ink-muted">{link.desc}</div>
                </div>
              </motion.a>
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="mt-10"
          >
            <motion.a
              href="/"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 rounded-2xl bg-royal px-7 py-4 text-sm font-semibold text-white shadow-[0_8px_32px_-8px_rgba(11,61,46,0.5)] transition-shadow hover:shadow-[0_12px_40px_-8px_rgba(11,61,46,0.6)]"
            >
              {isAr ? "العودة للرئيسية" : "Back to Home"}
              <ArrowLeft size={18} weight="bold" />
            </motion.a>
          </motion.div>
        </div>
      </main>
      <Footer />
      <FloatingButtons />
    </>
  );
}
