"use client";

import { motion } from "framer-motion";
import { FAQItem } from "./PricingShared";
import type { FaqItem } from "@/constants/pricingData";

interface PricingFAQProps {
  isAr: boolean;
  faqList: FaqItem[];
}

export function PricingFAQ({ isAr, faqList }: PricingFAQProps) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-[860px] px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} className="mb-10 text-center"
        >
          <span className="text-sm font-medium text-gold-dark">{isAr ? "أسئلة شائعة" : "FAQ"}</span>
          <h2 className="font-brand mt-2 text-3xl font-bold text-royal dark:text-white">
            {isAr ? "أسئلة عن الاشتراكات" : "Billing Questions"}
          </h2>
        </motion.div>
        <div className="space-y-3">
          {faqList.map((faq, i) => (
            <FAQItem key={i} q={faq.q} a={faq.a} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
