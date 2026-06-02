"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Receipt, Upload, CheckCircle } from "@phosphor-icons/react";
import { BackendReadyNotice, LocalActionStatus, SectionTitle } from "./_shared";

export function InvoiceTab() {
  const [saved, setSaved] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const handleSave = () => {
    setSaved(true);
    setLocalMessage("تم حفظ إعدادات الفواتير محلياً فقط؛ إصدار فواتير حقيقي ينتظر Billing API.");
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-8">
      <BackendReadyNotice />

      <div>
        <SectionTitle>بيانات الفاتورة</SectionTitle>
        <div className="bg-white dark:bg-dark-card rounded-2xl border border-gray-100 dark:border-white/[0.06] p-5 space-y-5">
          {/* Logo on invoice */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 dark:border-white/[0.08] flex items-center justify-center">
              <Receipt size={24} className="text-zinc-400" />
            </div>
            <div>
              <button
                onClick={() => setLocalMessage("رفع شعار الفاتورة محلي فقط؛ تخزين الملفات ينتظر الباك إند.")}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-royal dark:text-[#C8A762] border border-royal/20 dark:border-[#C8A762]/20 rounded-xl hover:bg-royal/5 transition-colors"
              >
                <Upload size={14} />
                رفع شعار الفاتورة
              </button>
              <p className="text-[11px] text-zinc-400 mt-1">يظهر في أعلى كل فاتورة مُصدَرة</p>
            </div>
          </div>

          {/* Fields */}
          {[
            { label: "اسم الكيان على الفاتورة",  placeholder: "مكتب نظامي للمحاماة والاستشارات القانونية" },
            { label: "الرقم الضريبي (VAT)",         placeholder: "3XXXXXXXXXXXXXXX" },
            { label: "عنوان الفاتورة",              placeholder: "حي الملقا، طريق الأمير محمد بن سلمان، الرياض" },
            { label: "البريد الإلكتروني للفواتير",  placeholder: "invoices@nezamy.sa" },
            { label: "نص ثابت أسفل الفاتورة (اختياري)", placeholder: "شكراً لثقتكم — جميع المبالغ بالريال السعودي شاملة الضريبة" },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">{f.label}</label>
              <input
                type="text"
                placeholder={f.placeholder}
                defaultValue={f.placeholder}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-gray-50 dark:bg-dark-bg text-zinc-800 dark:text-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-royal/30 transition-colors"
              />
            </div>
          ))}
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.98, y: 1 }}
        onClick={handleSave}
        className="flex items-center gap-2 px-8 py-3 bg-royal hover:bg-royal/90 text-white rounded-xl font-semibold text-sm transition-all shadow-[0_4px_14px_-4px_rgba(11,61,46,0.4)]"
      >
        {saved && <CheckCircle size={18} weight="fill" />}
        {saved ? "تم الحفظ" : "حفظ إعدادات الفواتير"}
      </motion.button>
      <LocalActionStatus show={Boolean(localMessage)} message={localMessage ?? undefined} />
    </div>
  );
}
