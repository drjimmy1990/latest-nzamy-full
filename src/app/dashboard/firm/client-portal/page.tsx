"use client";

import { motion } from "framer-motion";
import { Globe, Users, Eye, ShieldCheck, Bell, ArrowUpRight } from "@phosphor-icons/react";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";

// Client portal — allows clients to view their cases, download docs, and communicate
const PORTAL_FEATURES = [
  { icon: Eye,         label: "متابعة حالة القضية",    desc: "الموكل يرى تحديثات فورية",       color: "text-royal",       bg: "bg-royal/8" },
  { icon: ShieldCheck, label: "مشاركة المستندات",       desc: "رفع وتنزيل الأدلة بأمان",        color: "text-emerald-500", bg: "bg-emerald-500/8" },
  { icon: Bell,        label: "إشعارات تلقائية",        desc: "تنبيه بالجلسات والمستجدات",      color: "text-amber-500",   bg: "bg-amber-500/8" },
  { icon: Users,       label: "تواصل مباشر",            desc: "محادثة مع محامي القضية",          color: "text-purple-500",  bg: "bg-purple-500/8" },
];

const ACTIVE_CLIENTS = [
  { id: "1", name: "شركة الأفق للتجارة",    lastLogin: "منذ ٣٠ دقيقة", cases: 2, docs: 5 },
  { id: "2", name: "خالد محمد القحطاني",    lastLogin: "منذ ساعتين",    cases: 1, docs: 3 },
  { id: "3", name: "مجموعة الذهبي",          lastLogin: "منذ أمس",       cases: 1, docs: 2 },
  { id: "4", name: "سارة الدوسري",            lastLogin: "منذ ٤ أيام",    cases: 1, docs: 4 },
];

export default function FirmClientPortalPage() {
  const { isDark } = useTheme();
  const card = isDark
    ? "rounded-2xl border border-white/[0.06] bg-zinc-900/60"
    : "rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.06)]";

  return (
    <div className="max-w-[1100px] mx-auto space-y-6" dir="rtl">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={`text-2xl font-bold mb-1 ${isDark ? "text-white" : "text-slate-800"}`}
          style={{ fontFamily: "var(--font-brand)" }}>
          بوابة الموكلين
        </h1>
        <p className={`text-sm ${isDark ? "text-zinc-500" : "text-slate-400"}`}>
          منصة متكاملة للموكلين لمتابعة قضاياهم والتواصل مع فريقك
        </p>
      </motion.div>

      {/* Features */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {PORTAL_FEATURES.map((f, i) => {
          const Icon = f.icon;
          return (
            <motion.div key={i}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className={`${card} p-4`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.bg}`}>
                <Icon size={19} weight="duotone" className={f.color} />
              </div>
              <p className={`text-[13px] font-bold mb-0.5 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{f.label}</p>
              <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{f.desc}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Active clients */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className={card + " p-5"}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-zinc-200" : "text-slate-700"}`}>
            <Globe size={15} className="text-royal" />
            الموكلون النشطون في البوابة
          </h2>
          <Link href="/dashboard/firm/clients" className="text-xs text-royal hover:underline">كل الموكلين</Link>
        </div>
        <div className="space-y-2">
          {ACTIVE_CLIENTS.map((c, i) => (
            <motion.div key={c.id}
              initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.05 }}
              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isDark ? "border-white/[0.05] hover:bg-white/[0.03]" : "border-slate-100 hover:bg-slate-50/60"}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${isDark ? "bg-white/[0.06] text-zinc-300" : "bg-slate-100 text-slate-600"}`}>
                {c.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-[13px] font-medium truncate ${isDark ? "text-zinc-200" : "text-slate-700"}`}>{c.name}</p>
                <p className={`text-[11px] ${isDark ? "text-zinc-600" : "text-slate-400"}`}>
                  آخر دخول: {c.lastLogin} · {c.cases} قضية · {c.docs} مستند
                </p>
              </div>
              <div className={`flex items-center gap-1 text-[11px] ${isDark ? "text-zinc-700" : "text-slate-300"}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                نشط
              </div>
              <ArrowUpRight size={13} className={isDark ? "text-zinc-700" : "text-slate-300"} />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
