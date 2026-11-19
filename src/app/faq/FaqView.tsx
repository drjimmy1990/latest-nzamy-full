"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  MagnifyingGlass,
  CaretDown,
  ChatCircle,
  WhatsappLogo,
  EnvelopeSimple,
} from "@phosphor-icons/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";
// The 17 questions, their answers and the tabs: ./faqData.ts (the operator's
// identity sentence comes from the shared legalIdentity constants there).
// The server page (./page.tsx) passes the items with the licence line from
// the admin settings already in them (faqWithLicence); faqData is the default.
import { categories, faqData, type FAQItem } from "./faqData";

export default function FaqView({ items = faqData }: { items?: readonly FAQItem[] }) {
  const { isRTL, isDark } = useTheme();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const matchCat = activeCategory === "all" || item.category === activeCategory;
      const q = isRTL ? item.questionAr : item.questionEn;
      const a = isRTL ? item.answerAr : item.answerEn;
      const matchSearch =
        search.trim() === "" ||
        q.toLowerCase().includes(search.toLowerCase()) ||
        a.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [items, search, activeCategory, isRTL]);

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      className={`min-h-screen ${isDark ? "bg-dark-bg text-white" : "bg-white text-gray-900"}`}
    >
      <Navbar />

      {/* Header */}
      <section className="bg-royal pt-28 sm:pt-32 pb-14 sm:pb-20 px-4 text-center relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(ellipse_at_bottom,_#C8A762_0%,_transparent_60%)]" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-2xl mx-auto"
        >
          <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
            <ChatCircle size={32} className="text-gold" weight="duotone" />
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-3">
            {isRTL ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
          </h1>
          <p className="text-white/70 text-base sm:text-lg mb-6 sm:mb-8">
            {isRTL
              ? "كل ما تحتاج معرفته عن نظامي في مكان واحد"
              : "Everything you need to know about Nezamy in one place"}
          </p>

          {/* Search */}
          <div className="relative max-w-lg mx-auto">
            <MagnifyingGlass
              size={20}
              className={`absolute top-1/2 -translate-y-1/2 text-gray-400 ${isRTL ? "right-4" : "left-4"}`}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isRTL ? "ابحث في الأسئلة الشائعة..." : "Search FAQs..."}
              className={`w-full py-3.5 ${isRTL ? "pr-12 pl-4" : "pl-12 pr-4"} rounded-xl bg-white dark:bg-dark-card text-gray-900 dark:text-zinc-100 placeholder-gray-400 outline-none shadow-lg text-sm`}
            />
          </div>
        </motion.div>
      </section>

      {/* Category Tabs */}
      <section className={`sticky top-0 z-30 border-b shadow-sm ${isDark ? "bg-dark-card border-white/10" : "bg-white border-gray-100"}`}>
        <div className="max-w-4xl mx-auto px-4 overflow-x-auto">
          <div className="flex gap-1 py-3 whitespace-nowrap">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setActiveCategory(cat.id); setOpenId(null); }}
                className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium transition-all ${
                  activeCategory === cat.id
                    ? "bg-royal text-white"
                    : isDark
                    ? "text-gray-400 hover:bg-white/10 hover:text-white"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {isRTL ? cat.labelAr : cat.labelEn}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ List */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20"
            >
              <ChatCircle size={48} className="text-gray-300 mx-auto mb-4" />
              <p className={`text-lg ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {isRTL ? "لا توجد نتائج مطابقة" : "No matching results found"}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className={`rounded-xl border overflow-hidden ${
                    isDark ? "bg-dark-card border-white/10" : "bg-white border-gray-100 shadow-sm"
                  }`}
                >
                  <button
                    onClick={() => setOpenId(openId === item.id ? null : item.id)}
                    className="w-full flex items-center justify-between px-5 py-4 text-start gap-4"
                    aria-expanded={openId === item.id}
                    aria-controls={`faq-answer-${item.id}`}
                  >
                    <span className={`font-semibold text-base leading-snug ${isDark ? "text-white" : "text-gray-900"}`}>
                      {isRTL ? item.questionAr : item.questionEn}
                    </span>
                    <motion.span
                      animate={{ rotate: openId === item.id ? 180 : 0 }}
                      transition={{ duration: 0.22 }}
                      className="shrink-0"
                    >
                      <CaretDown
                        size={18}
                        className={isDark ? "text-gray-400" : "text-gray-400"}
                      />
                    </motion.span>
                  </button>

                  {/* Owner 18 Nov, item 4.4: every answer is in the HTML — a closed
                      one is only `hidden` — so a visitor without JavaScript, a
                      crawler and the FAQPage JSON-LD (layout.tsx) read the same
                      words. It used to be mounted only while open. */}
                  <div
                    id={`faq-answer-${item.id}`}
                    hidden={openId !== item.id}
                    className={`px-5 pb-5 pt-1 border-t ${isDark ? "border-white/10" : "border-gray-50"}`}
                  >
                    <p className={`text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                      {isRTL ? item.answerAr : item.answerEn}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Still have questions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className={`mt-14 rounded-2xl border p-8 text-center ${
              isDark ? "bg-dark-card border-white/10" : "bg-gray-50 border-gray-100"
            }`}
          >
            <ChatCircle size={40} className="text-royal mx-auto mb-4" weight="duotone" />
            <h3 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              {isRTL ? "لا تزال لديك أسئلة؟" : "Still have questions?"}
            </h3>
            <p className={`text-sm mb-6 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {/* Was «متاح على مدار الساعة» / "available 24/7". Nothing supports
                  round-the-clock staffing; the contact page states the real
                  hours (src/app/contact/page.tsx:152). Those hours are used
                  here instead. */}
              {isRTL
                ? "فريق الدعم متاح أحد – خميس ٨ص – ١٠م، والجمعة والسبت ٩ص – ٥م"
                : "Our support team is available Sun – Thu 8am – 10pm, and Fri – Sat 9am – 5pm"}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="https://wa.me/966560655552"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-royal text-white px-6 py-3 rounded-xl font-medium text-sm hover:bg-[#0a3328] transition-colors"
              >
                <WhatsappLogo size={18} weight="fill" />
                {isRTL ? "تواصل معنا عبر واتساب" : "Message us on WhatsApp"}
              </a>
              <a
                href="mailto:support@nezamy.sa"
                className={`inline-flex items-center justify-center gap-2 border px-6 py-3 rounded-xl font-medium text-sm transition-colors ${
                  isDark
                    ? "border-white/20 text-white hover:bg-white/10"
                    : "border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}
              >
                <EnvelopeSimple size={18} />
                {isRTL ? "راسلنا" : "Email Us"}
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      <Footer />
          </div>
  );
}
