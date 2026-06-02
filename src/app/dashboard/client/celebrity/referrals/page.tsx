"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gift, Users, CurrencyCircleDollar, TrendUp,
  CheckCircle, CaretDown, CaretUp,
  Copy, ArrowUpRight, Money, Bank, Clock, ShieldCheck
} from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

const MOCK_REFERRALS = [
  { id: "r1", name: "أحمد العنزي",    joined: "٥ أبريل ٢٠٢٦",  plan: "Shield",    commission: 149,  status: "مدفوع",  avatar: "أ" },
  { id: "r2", name: "سلمى الدوسري",   joined: "١٢ أبريل ٢٠٢٦", plan: "AI Pro",    commission: 299,  status: "مدفوع",  avatar: "س" },
  { id: "r3", name: "فيصل الشهري",    joined: "١٨ أبريل ٢٠٢٦", plan: "Free",      commission: 0,    status: "معلق",   avatar: "ف" },
  { id: "r4", name: "نورة السبيعي",   joined: "٢٢ أبريل ٢٠٢٦", plan: "Shield",    commission: 149,  status: "مدفوع",  avatar: "ن" },
  { id: "r5", name: "بدر القحطاني",   joined: "٢٥ أبريل ٢٠٢٦", plan: "Max",       commission: 499,  status: "قيد المراجعة", avatar: "ب" },
];

export default function CelebrityReferralsPage() {
  const { isDark } = useTheme();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const card = isDark
    ? "rounded-3xl border border-white/10 bg-black/40 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
    : "rounded-3xl border border-white/60 bg-white/60 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,1),0_8px_30px_rgba(0,0,0,0.04)]";

  const tp = isDark ? "text-white" : "text-zinc-900";
  const ts = isDark ? "text-zinc-400" : "text-zinc-500";

  const totalEarned = MOCK_REFERRALS.filter(r => r.status === "مدفوع").reduce((s, r) => s + r.commission, 0);
  const pendingEarned = MOCK_REFERRALS.filter(r => r.status !== "مدفوع").reduce((s, r) => s + r.commission, 0);

  const handleCopy = () => {
    navigator.clipboard.writeText("AHMED20");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusColor = (s: string) =>
    s === "مدفوع" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
    : s === "معلق" ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
    : "text-blue-500 bg-blue-500/10 border-blue-500/20";

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-4 md:p-8" dir="rtl">
      {/* VIP Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="relative">
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#D4AF37]/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 3, repeat: Infinity }} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37] text-[10px] font-bold mb-3">
              ⭐ سفير نظامي المُوثّق
            </motion.div>
            <h1 className={`text-4xl font-black tracking-tight ${isDark ? "bg-clip-text text-transparent bg-gradient-to-r from-white to-zinc-500" : "text-zinc-900"}`}>
              منصة الأرباح والإحالات
            </h1>
            <p className={`text-sm mt-2 ${ts}`}>لوحة التحكم الخاصة بك لمتابعة أرباحك وسحبها كشريك و سفير لنظامي.</p>
          </div>
          <button onClick={() => setShowWithdraw(true)} className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] px-8 py-3.5 text-black font-black text-[13px] shadow-[0_0_40px_rgba(212,175,55,0.3)] transition-all hover:scale-105 hover:shadow-[0_0_60px_rgba(212,175,55,0.5)]">
            <motion.div animate={{ x: ["-100%", "200%"] }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} className="absolute inset-0 w-1/2 bg-gradient-to-r from-transparent via-white/50 to-transparent skew-x-12" />
            <span className="relative z-10 flex items-center gap-2"><Money size={18} weight="fill" /> سحب الأرباح ({totalEarned} ر.س)</span>
          </button>
        </div>
      </motion.div>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {showWithdraw && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className={`w-full max-w-md p-6 ${card}`}>
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-lg font-black ${tp}`}>سحب الأرباح</h3>
                <button onClick={() => setShowWithdraw(false)} className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? "bg-white/10 hover:bg-white/20 text-white" : "bg-black/5 hover:bg-black/10 text-black"}`}>×</button>
              </div>
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border ${isDark ? "bg-white/5 border-white/10" : "bg-zinc-50 border-zinc-200"}`}>
                  <p className={`text-[11px] font-bold ${ts} mb-1`}>الرصيد المتاح للسحب</p>
                  <p className={`text-3xl font-black ${isDark ? "text-[#D4AF37]" : "text-amber-600"}`}>{totalEarned} <span className="text-sm font-bold">ر.س</span></p>
                </div>
                <div>
                  <label className={`block text-[11px] font-bold mb-1.5 ${ts}`}>الحساب البنكي (IBAN)</label>
                  <div className="relative">
                    <Bank size={16} className={`absolute right-3 top-3 ${ts}`} />
                    <input type="text" placeholder="SA..." defaultValue="SA12 3456 7890 1234 5678 90" className={`w-full pr-10 pl-4 py-2.5 rounded-xl border text-[13px] font-mono ${isDark ? "bg-black/50 border-white/10 text-white" : "bg-white border-slate-200 text-slate-900"} outline-none focus:border-[#D4AF37]`} />
                  </div>
                </div>
                <button className="w-full py-3 mt-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F3E5AB] text-black font-black text-[13px] hover:opacity-90">
                  تأكيد التحويل
                </button>
                <p className={`text-[10px] text-center mt-3 ${ts} flex items-center justify-center gap-1`}><ShieldCheck size={12} /> يتم معالجة التحويلات خلال ٤٨ ساعة عمل</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Code & KPI */}
        <div className="space-y-6 lg:col-span-1">
          {/* VIP Referral Code */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
            className={`relative overflow-hidden p-6 ${card}`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/10 rounded-full blur-3xl" />
            <h2 className={`text-[12px] font-bold uppercase tracking-widest mb-4 ${ts}`}>كود الخصم والإحالة</h2>
            <div className="text-center space-y-4">
              <div className={`py-4 px-6 rounded-2xl border-2 border-dashed ${isDark ? "border-[#D4AF37]/30 bg-[#D4AF37]/5" : "border-amber-300 bg-amber-50"}`}>
                <p className={`text-4xl font-black font-mono tracking-[0.2em] ${isDark ? "text-white" : "text-amber-900"}`}>AHMED20</p>
              </div>
              <button onClick={handleCopy} className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold transition-all ${copied ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30" : isDark ? "bg-white/10 hover:bg-white/20 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-900"}`}>
                {copied ? <CheckCircle size={16} weight="fill" /> : <Copy size={16} />}
                {copied ? "تم النسخ بنجاح" : "نسخ الكود"}
              </button>
            </div>
            <p className={`text-[10px] text-center mt-4 ${ts}`}>يمنح متابعيك خصم ٢٠٪ ويعطيك عمولة تصل لـ ٥٠٠ ريال</p>
          </motion.div>

          {/* KPI Grid */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="grid grid-cols-2 gap-3">
            {[
              { label: "إجمالي الإحالات",   value: MOCK_REFERRALS.length, icon: Users,                 color: isDark ? "text-white" : "text-zinc-800" },
              { label: "معلقة (ر.س)",        value: pendingEarned,          icon: Clock,                color: "text-amber-500" },
              { label: "معدل التحويل",        value: "٨٠٪",                  icon: TrendUp,              color: "text-blue-500" },
              { label: "زيارات الرابط",       value: "١,٢٤٠",                icon: ArrowUpRight,         color: isDark ? "text-zinc-400" : "text-zinc-500" },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className={`p-4 flex flex-col gap-2 ${card}`}>
                  <Icon size={18} weight="duotone" className={s.color} />
                  <p className={`text-2xl font-black font-mono ${tp}`}>{s.value}</p>
                  <p className={`text-[10px] font-bold ${ts}`}>{s.label}</p>
                </div>
              );
            })}
          </motion.div>
        </div>

        {/* Right Column: Referrals List */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}
          className={`lg:col-span-2 p-6 flex flex-col ${card}`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className={`text-lg font-black ${tp}`}>سجل الإحالات الحديثة</h2>
            <div className={`px-3 py-1 rounded-full text-[11px] font-bold ${isDark ? "bg-white/10 text-zinc-300" : "bg-slate-100 text-slate-600"}`}>
              الشهر الحالي
            </div>
          </div>
          
          <div className="space-y-3 flex-1 overflow-y-auto pr-2 custom-scrollbar">
            {MOCK_REFERRALS.map((r) => {
              const isOpen = expanded === r.id;
              return (
                <motion.div key={r.id} layout className={`rounded-2xl border transition-colors ${isDark ? "border-white/10 bg-black/20 hover:bg-white/5" : "border-slate-100 bg-white hover:bg-slate-50"}`}>
                  <button onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="w-full p-4 flex items-center gap-4 text-right">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-transparent border border-[#D4AF37]/30 text-[#D4AF37] flex items-center justify-center font-black text-[15px] flex-shrink-0">
                      {r.avatar}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[14px] font-bold ${tp}`}>{r.name}</p>
                      <p className={`text-[11px] mt-0.5 ${ts}`}>{r.joined} · {r.plan}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {r.commission > 0 && (
                        <span className={`text-[15px] font-black font-mono ${isDark ? "text-[#D4AF37]" : "text-amber-600"}`}>+{r.commission} ر.س</span>
                      )}
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${statusColor(r.status)}`}>{r.status}</span>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isDark ? "bg-white/5" : "bg-black/5"}`}>
                        {isOpen ? <CaretUp size={12} className={tp} /> : <CaretDown size={12} className={tp} />}
                      </div>
                    </div>
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className={`px-5 pb-4 pt-0 border-t mx-4 text-[12px] ${isDark ? "border-white/10 text-zinc-400" : "border-slate-100 text-slate-500"}`}>
                          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-4">
                            <div><span className="block text-[10px] mb-1 opacity-70">الباقة المشترك بها</span><strong className={tp}>{r.plan}</strong></div>
                            <div><span className="block text-[10px] mb-1 opacity-70">تاريخ التفعيل</span><strong className={tp}>{r.joined}</strong></div>
                            <div><span className="block text-[10px] mb-1 opacity-70">حالة العمولة</span><strong className={tp}>{r.status}</strong></div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
