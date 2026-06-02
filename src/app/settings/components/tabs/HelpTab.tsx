"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Desktop, DeviceMobile, Plus, Trash, WarningCircle, CheckCircle, Sun, Moon, ArrowSquareOut, Download, BookOpen, Headset, Question } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import { Toggle, SectionTitle, ToggleRow } from "./_shared";

// ── Tab 6: Help ─────────────────────────────────────────────────────
export function HelpTab() {
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMsg, setTicketMsg] = useState("");
  const [priority, setPriority] = useState("medium");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
    setTicketSubject("");
    setTicketMsg("");
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: <BookOpen size={24} weight="fill" />, title: "مركز المساعدة", desc: "مقالات وأدلة مفصلة", color: "text-royal bg-royal/10 dark:text-emerald-400 dark:bg-emerald-400/10" },
          { icon: <Headset size={24} weight="fill" />, title: "تواصل مع الدعم", desc: "فريقنا متاح ٢٤/٧", color: "text-gold bg-gold/10" },
          { icon: <Question size={24} weight="fill" />, title: "الأسئلة الشائعة", desc: "أجوبة للأسئلة الأكثر طرحاً", color: "text-purple-400 bg-purple-400/10" },
        ].map((card) => (
          <button
            key={card.title}
            className="flex flex-col items-center gap-3 p-5 bg-white dark:bg-dark-card border border-gray-100 dark:border-gray-800 rounded-2xl hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-md transition-all text-center"
          >
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${card.color}`}>
              {card.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{card.title}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{card.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div>
        <SectionTitle>إرسال تذكرة دعم</SectionTitle>
        <form onSubmit={handleSubmit} className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-gray-800 p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الموضوع</label>
            <input
              type="text"
              placeholder="وصف موجز للمشكلة"
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/40 focus:border-royal transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الرسالة</label>
            <textarea
              rows={4}
              placeholder="اشرح مشكلتك بالتفصيل..."
              value={ticketMsg}
              onChange={(e) => setTicketMsg(e.target.value)}
              required
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/40 focus:border-royal transition-colors resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">الأولوية</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-dark-bg text-gray-800 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/40 focus:border-royal transition-colors"
            >
              <option value="low">منخفضة</option>
              <option value="medium">متوسطة</option>
              <option value="high">عالية</option>
              <option value="urgent">عاجلة</option>
            </select>
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 bg-royal hover:bg-royal/90 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
          >
            {submitted ? <CheckCircle size={16} weight="fill" /> : null}
            {submitted ? "تم الإرسال!" : "إرسال التذكرة"}
          </button>
        </form>
      </div>
    </div>
  );
}

