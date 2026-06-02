"use client";

import { motion } from "framer-motion";
import { ShieldCheck, ArrowLeft } from "@phosphor-icons/react";

interface PricingCTAProps {
  isAr: boolean;
}

export function PricingCTA({ isAr }: PricingCTAProps) {
  return (
    <section className="pb-24">
      <div className="mx-auto max-w-[1200px] px-4">
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="rounded-[2.5rem] bg-royal p-10 text-center shadow-[0_20px_60px_-15px_rgba(11,61,46,0.4)] md:p-16"
        >
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-gold">
            <ShieldCheck size={28} weight="duotone" />
          </div>
          <h2 className="font-brand text-3xl font-bold text-white md:text-4xl">
            {isAr ? "ابدأ مجاناً اليوم" : "Start Free Today"}
          </h2>
          <p className="mx-auto mt-4 max-w-[45ch] text-sm text-white/70">
            {isAr ? "لا بطاقة ائتمانية مطلوبة — ابدأ باستشارتك الأولى مع نظامي AI مجاناً."
                  : "No credit card required — start with your first AI consultation completely free."}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <motion.a href="/register" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-royal shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)]"
            >
              {isAr ? "سجّل مجاناً" : "Sign Up Free"}<ArrowLeft size={16} weight="bold" />
            </motion.a>
            <a href="/contact"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/30 px-7 py-4 text-sm font-medium text-white/90 hover:border-white/50 hover:text-white transition-colors"
            >
              {isAr ? "تواصل مع المبيعات" : "Contact Sales"}
            </a>
          </div>
          <p className="mt-5 text-xs text-white/40">
            {isAr ? "ضمان استرداد كامل خلال ١٤ يوماً · بدون عقود طويلة" : "14-day money-back guarantee · No long-term contracts"}
          </p>
        </motion.div>
      </div>
    </section>
  );
}
