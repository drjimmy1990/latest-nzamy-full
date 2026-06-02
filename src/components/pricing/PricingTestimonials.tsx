"use client";

import { motion } from "framer-motion";
import { Star } from "@phosphor-icons/react";
import type { Plan } from "@/constants/pricingData";

interface PricingTestimonialsProps {
  isAr: boolean;
  planList: Plan[];
}

type Testimonial = { name: string; role: string; text: string; plan: string };

export function PricingTestimonials({ isAr, planList }: PricingTestimonialsProps) {
  const testimonials: Testimonial[] = [
    {
      name: isAr ? "فيصل الدوسري"  : "Faisal Al-Dosari",
      role: isAr ? "مدير قانوني — مجموعة الرائد" : "Legal Manager — Al-Raed Group",
      text: isAr ? "نظامي AI وفّر علينا ٤٠٪ من وقت مراجعة العقود." : "Nezamy AI saved us 40% of contract review time.",
      plan: "ai",
    },
    {
      name: isAr ? "نورة القحطاني" : "Noura Al-Qahtani",
      role: isAr ? "محامية مستقلة — الرياض"        : "Independent Lawyer — Riyadh",
      text: isAr ? "نظامي برو غيّر طريقة إدارتي لمكتبي بشكل كامل." : "Nezamy Pro completely changed how I manage my office.",
      plan: "pro",
    },
    {
      name: isAr ? "خالد العمري"   : "Khaled Al-Omari",
      role: isAr ? "صاحب شركة — جدة"               : "Business Owner — Jeddah",
      text: isAr ? "الباقة المجانية كافية لاحتياجاتي كمؤسسة صغيرة." : "The free plan is enough for my small business needs.",
      plan: "lite",
    },
  ];

  return (
    <section className="py-12">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="grid gap-4 md:grid-cols-3 lg:gap-6">
          {testimonials.map((t, i) => (
            <motion.div key={i}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="rounded-[2rem] border border-slate-200/50 bg-white p-6 dark:border-white/10 dark:bg-dark-card"
            >
              <div className="mb-3 flex gap-1">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Star key={j} size={14} weight="fill" className="text-gold" />
                ))}
              </div>
              <p className="text-sm leading-relaxed text-ink-muted dark:text-gray-400">{t.text}</p>
              <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 dark:border-white/10">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-royal/5 text-sm font-bold text-royal dark:bg-royal/20 dark:text-gold">
                  {t.name[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink dark:text-gray-100">{t.name}</div>
                  <div className="text-xs text-ink-muted dark:text-gray-400">{t.role}</div>
                </div>
                <span className={`ms-auto rounded-full px-2.5 py-1 text-[10px] font-bold ${
                  t.plan === "pro"  ? "bg-gold/10 text-gold-dark" :
                  t.plan === "ai"   ? "bg-royal/5 text-royal dark:bg-royal/20 dark:text-gold" :
                                      "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-gray-400"
                }`}>
                  {planList.find(p => p.id === t.plan)?.name}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
