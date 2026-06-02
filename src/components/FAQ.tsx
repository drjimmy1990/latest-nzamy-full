"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { CaretDown, CaretUp, Question } from "@phosphor-icons/react";
import { useTheme } from "./ThemeProvider";

const faqsAr = [
  {
    q: "هل نظامي AI يغني عن المحامي؟",
    a: "لا، نظامي AI هو ذراعك الأيمن لتسريع العمل وتوفير الجهد. لكنه لا يُلغي الحاجة للمحامي المتخصص في الترافع والقضايا المعقدة، بل هو أداة تساعدك أو تساعد محاميك."
  },
  {
    q: "كيف أحجز استشارة؟",
    a: "يمكنك حجز استشارة فورية عبر أيقونة الواتساب أسفل الشاشة، أو من خلال اختيار خدمة 'استشارات قانونية' وتحديد نوع الاستشارة: نصية، ملف صوتي، أو مكالمة فيديو."
  },
  {
    q: "ما هو ضمان الـ Escrow؟",
    a: "هو نظام مالي يضمن حقوق كلا الطرفين (العميل والمحامي). يتم الاحتفاظ بالمبلغ المالي لدينا، ولا يُصرف للمحامي إلا بعد إنجاز الخدمة المتفق عليها بالكامل."
  },
  {
    q: "هل بياناتي وعقودي محمية؟",
    a: "بكل تأكيد. جميع البيانات والعقود المرفوعة على النظام مشفرة بتقنية 256-bit SSL، وتخضع لسرية تامة ومطابقة لأنظمة حماية البيانات في المملكة."
  },
  {
    q: "كيف أختار المحامي المناسب لقضيتي؟",
    a: "يمكنك الاعتماد على 'نظامي AI' لتوجيهك آلياً إلى أفضل محامي متاح في التخصص المطلوب، أو يمكنك التصفح والاختيار بناءً على التقييمات والخبرات."
  },
  {
    q: "ما الفرق بين باقات الأفراد والشركات؟",
    a: "باقات الأفراد مصممة للاستشارات المحددة والمراجعة الفردية، بينما باقات الشركات (مثل كورب) تقدم ذكاءً اصطناعياً مخصصاً للفريق، ومراجعة عقود دورية، ومدير حساب خاص بقضايا الشركة."
  }
];

const faqsEn = [
  {
    q: "Does Nezamy AI replace a lawyer?",
    a: "No, Nezamy AI works as an advanced assistant to save time and effort. It doesn't replace specialized lawyers for complex cases or litigation."
  },
  {
    q: "How do I book a consultation?",
    a: "You can book instantly via the WhatsApp button at the screen bottom, or navigate to 'Consultations' to choose text, voice, or video formats."
  },
  {
    q: "What is the Escrow guarantee?",
    a: "It's a financial system holding funds securely. The lawyer is only paid once the agreed legal service is fully delivered and approved."
  },
  {
    q: "Are my data and contracts secure?",
    a: "Absolutely. All data is encrypted via 256-bit SSL and strictly complies with Saudi data protection and privacy regulations."
  },
  {
    q: "How to choose the right lawyer?",
    a: "You can let Nezamy AI automatically route your case to the best specialist, or browse lawyers by reviews, expertise, and specialization."
  },
  {
    q: "What's the difference between Individual and Business plans?",
    a: "Individual plans cover distinct personal cases, while Business plans (like Corp) offer team-based AI, monthly contract reviews, and a dedicated account manager."
  }
];

export default function FAQ() {
  const { lang, theme } = useTheme();
  const isAr = lang === "ar";
  const isDark = theme === "dark";
  const faqs = isAr ? faqsAr : faqsEn;

  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleFAQ = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className="relative overflow-hidden py-24 bg-surface dark:bg-dark-bg border-t border-slate-200/50 dark:border-white/5">
      <div className="mx-auto max-w-3xl px-4">
        
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/5 px-4 py-1.5 mb-4">
            <Question size={14} weight="bold" className="text-gold-dark" />
            <span className="text-xs font-bold text-gold-dark">{isAr ? "الأسئلة الشائعة" : "FAQ"}</span>
          </div>
          <h2 className={`font-brand text-3xl font-bold tracking-tight md:text-5xl ${isDark ? "text-white" : "text-royal"}`}>
            {isAr ? "لديك أسئلة؟ نحن هنا لنجيب" : "Have Questions? We Have Answers"}
          </h2>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                key={index}
                className={`overflow-hidden rounded-2xl border transition-all ${
                  isDark 
                    ? isOpen ? "border-emerald-500/30 bg-white/5" : "border-white/10 bg-dark-card hover:bg-white/5"
                    : isOpen ? "border-royal/20 bg-white shadow-sm" : "border-slate-200/50 bg-slate-50 hover:bg-white"
                }`}
              >
                <button
                  onClick={() => toggleFAQ(index)}
                  className="flex w-full items-center justify-between p-5 text-start md:p-6"
                >
                  <span className={`text-base font-bold md:text-lg ${
                    isOpen 
                      ? (isDark ? "text-emerald-400" : "text-royal") 
                      : (isDark ? "text-gray-200" : "text-ink")
                  }`}>
                    {faq.q}
                  </span>
                  <div className={`ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                    isOpen
                      ? (isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-royal/10 text-royal")
                      : (isDark ? "bg-white/5 text-gray-400" : "bg-slate-200/50 text-ink-faint")
                  }`}>
                    {isOpen ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
                  </div>
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <p className={`px-5 pb-6 text-sm leading-relaxed md:px-6 md:text-base ${isDark ? "text-gray-400" : "text-ink-muted"}`}>
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
