"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  QrCode, Copy, CheckCircle, Share, Gift,
  WhatsappLogo, ArrowUpRight, Star, Users,
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";

export default function CelebrityCodePage() {
  const { isDark } = useTheme();
  const [copied, setCopied] = useState(false);
  const CODE = "AHMED20";
  const REFERRAL_LINK = `https://nezamy.online/register?ref=${CODE}`;

  const card = isDark
    ? "rounded-2xl border border-white/[0.07] bg-zinc-900/70"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)]";
  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-500" : "text-zinc-400";

  const handleCopy = () => {
    navigator.clipboard.writeText(CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(REFERRAL_LINK);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const PERKS = [
    "خصم ٢٠٪ للعميل الجديد على أي باقة",
    "عمولة فورية عند تفعيل الباقة",
    "تتبع فوري لكل تسجيل",
    "صرف أرباح شهري تلقائي",
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-5 p-4 md:p-6" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-1">
          <QrCode size={22} weight="fill" className="text-[#C8A762]" />
          <h1 className={`text-2xl font-bold ${tp}`}>رمز الإحالة</h1>
        </div>
        <p className={`text-sm ${ts}`}>شارك رمزك وكسب عمولة على كل تسجيل</p>
      </motion.div>

      {/* Code Card */}
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.06 }}
        className={`${card} p-8 text-center`}>
        <p className={`text-[11px] font-semibold uppercase tracking-widest ${ts} mb-3`}>رمز الإحالة الخاص بك</p>
        <div className={`inline-flex items-center gap-4 px-8 py-4 rounded-2xl mb-4 ${isDark ? "bg-white/[0.05] border border-white/[0.08]" : "bg-slate-50 border border-slate-200"}`}>
          <Star size={20} weight="fill" className="text-[#C8A762]" />
          <span className={`text-3xl font-black tracking-[0.2em] ${tp}`}>{CODE}</span>
          <Star size={20} weight="fill" className="text-[#C8A762]" />
        </div>
        <p className={`text-[12px] ${ts} mb-5`}>العميل الجديد يحصل على خصم ٢٠٪ عند استخدام رمزك</p>
        <div className="flex justify-center gap-3 flex-wrap">
          <motion.button whileTap={{ scale: 0.97 }} onClick={handleCopy}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${
              copied
                ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-500"
                : "bg-[#0B3D2E] text-white hover:bg-[#0a3328]"
            }`}>
            {copied ? <CheckCircle size={14} weight="fill" /> : <Copy size={14} />}
            {copied ? "تم النسخ!" : "نسخ الرمز"}
          </motion.button>
          <motion.button whileTap={{ scale: 0.97 }} onClick={handleCopyLink}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold border transition-all ${
              isDark ? "border-white/[0.08] text-zinc-300 hover:bg-white/[0.05]" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}>
            <Share size={14} /> نسخ الرابط
          </motion.button>
        </div>
      </motion.div>

      {/* Share via WhatsApp */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className={`${card} p-4`}>
        <h2 className={`text-[13px] font-bold mb-3 ${tp}`}>شارك عبر</h2>
        <div className="flex gap-2 flex-wrap">
          <a href={`https://wa.me/?text=${encodeURIComponent(`سجّل في نظامي واستخدم رمز ${CODE} للحصول على خصم ٢٠٪! 🎉 ${REFERRAL_LINK}`)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[12px] font-bold hover:bg-emerald-500/15 transition-colors">
            <WhatsappLogo size={15} weight="fill" /> واتساب
          </a>
          <button onClick={handleCopyLink}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border transition-colors ${
              isDark ? "border-white/[0.06] text-zinc-400 hover:bg-white/[0.04]" : "border-slate-200 text-slate-500 hover:bg-slate-50"
            }`}>
            <ArrowUpRight size={13} /> نسخ الرابط المباشر
          </button>
        </div>
        <p className={`text-[11px] mt-3 ${ts}`}>{REFERRAL_LINK}</p>
      </motion.div>

      {/* Perks */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
        className={`${card} p-5`}>
        <div className="flex items-center gap-2 mb-3">
          <Gift size={16} weight="fill" className="text-[#C8A762]" />
          <h2 className={`text-[13px] font-bold ${tp}`}>مزايا برنامجك</h2>
        </div>
        <div className="space-y-2">
          {PERKS.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <CheckCircle size={14} weight="fill" className="text-emerald-500 flex-shrink-0" />
              <span className={`text-[13px] ${tp}`}>{p}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Stats mini */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className={`${card} p-4 flex items-center gap-6`}>
        <div className="flex items-center gap-2">
          <Users size={16} className={ts} />
          <span className={`text-[12px] ${ts}`}>إجمالي الإحالات: <strong className={tp}>٥</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <Gift size={16} className="text-[#C8A762]" />
          <span className={`text-[12px] ${ts}`}>العمولات المحققة: <strong className="text-emerald-500">٥٩٧ ر.س</strong></span>
        </div>
      </motion.div>

    </div>
  );
}
