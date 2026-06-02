"use client";
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, CheckCircle, Warning, Buildings, DownloadSimple } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

type Item = { title: string; body: string; status: "متوافق" | "يحتاج مراجعة" | "غير متوافق"; source: string };
const ITEMS: Item[] = [
  { title: "تسجيل في المركز الوطني للقطاع غير الربحي", body: "رقم التسجيل مفعّل ومُحدَّث",                  status: "متوافق",       source: "NCNP" },
  { title: "تقرير الشفافية السنوي",                     body: "تقرير 2025 مقدّم في الموعد المحدد",           status: "متوافق",       source: "م/14" },
  { title: "لوائح الحوكمة الداخلية",                    body: "مجلس الإدارة يحتاج اجتماعاً ربعياً معلقاً",   status: "يحتاج مراجعة", source: "م/7" },
  { title: "امتثال حملات التبرع",                       body: "الحملات مسجّلة ومصرّح بها من وزارة الموارد",   status: "متوافق",       source: "م/22" },
  { title: "قواعد مكافحة غسل الأموال",                  body: "تقرير العناية الواجبة لم يُقدَّم للنصف الأول", status: "غير متوافق",   source: "FATF" },
  { title: "سجل المستفيدين الفعليين",                   body: "السجل محدَّث بالكامل",                        status: "متوافق",       source: "م/6" },
];

export default function NGOCompliancePage() {
  const { isDark } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const pass = ITEMS.filter(i => i.status === "متوافق").length;
  const warn = ITEMS.filter(i => i.status === "يحتاج مراجعة").length;
  const fail = ITEMS.filter(i => i.status === "غير متوافق").length;

  const bg   = isDark ? "bg-zinc-950" : "bg-slate-50";
  const card = `rounded-2xl border ${isDark ? "bg-zinc-900/40 border-white/5" : "bg-white border-slate-200"}`;
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const div  = isDark ? "divide-white/5" : "divide-slate-100";

  const STATUS_CONF = {
    "متوافق":       { cls: "text-emerald-500 border-emerald-500/20 bg-emerald-500/10", Icon: CheckCircle },
    "يحتاج مراجعة": { cls: "text-amber-500 border-amber-500/20 bg-amber-500/10",   Icon: Warning },
    "غير متوافق":   { cls: "text-rose-500 border-rose-500/20 bg-rose-500/10",       Icon: Warning },
  };

  return (
    <div className={`${bg} min-h-[100dvh] pb-20`} dir="rtl">
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isDark ? "bg-teal-500/10" : "bg-teal-50"}`}>
              <ShieldCheck size={22} weight="duotone" className={isDark ? "text-teal-400" : "text-teal-600"} />
            </div>
            <div>
              <h1 className={`text-lg font-black ${isDark ? "text-white" : "text-gray-900"}`}>الامتثال والحوكمة</h1>
              <p className={`text-xs ${muted}`}>{pass} متوافق · {warn} يحتاج مراجعة · {fail} غير متوافق</p>
            </div>
          </div>
          <Link href="/ai/ngo/governance-checker"
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/20 text-teal-400" : "bg-teal-50 border border-teal-200 hover:bg-teal-100 text-teal-700"}`}>
            <Buildings size={14} /> مدقق الحوكمة بالذكاء الاصطناعي
          </Link>
        </div>

        {/* KPI */}
        <div className={`grid grid-cols-3 ${card} overflow-hidden shadow-sm divide-x divide-x-reverse ${div}`}>
          {[
            { label: "متوافق",        val: pass, color: "text-emerald-500" },
            { label: "يحتاج مراجعة", val: warn, color: "text-amber-500" },
            { label: "غير متوافق",   val: fail, color: "text-rose-500" },
          ].map((k, i) => (
            <div key={i} className="px-5 py-4">
              <div className={`text-2xl font-black font-mono ${k.color}`}>{k.val}</div>
              <div className={`text-xs mt-0.5 ${muted}`}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Items */}
        <div className={`${card} overflow-hidden shadow-sm`}>
          <div className={`divide-y ${div}`}>
            {ITEMS.map((item, i) => {
              const { cls, Icon } = STATUS_CONF[item.status];
              return (
                <motion.div key={item.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.07 }}
                  className={`px-5 py-4 flex items-start justify-between gap-4 transition ${isDark ? "hover:bg-white/[0.02]" : "hover:bg-gray-50"}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold text-sm ${isDark ? "text-gray-200" : "text-gray-800"}`}>{item.title}</span>
                      <span className={`text-[10px] font-mono font-bold ${isDark ? "text-[#C8A762]" : "text-amber-600"}`}>{item.source}</span>
                    </div>
                    <p className={`text-xs mt-1 ${muted}`}>{item.body}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border font-bold shrink-0 ${cls}`}>
                    <Icon size={11} weight="fill" /> {item.status}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        <button className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition ${isDark ? "bg-white/5 border border-white/10 hover:bg-white/10 text-gray-300" : "bg-gray-100 border border-gray-200 hover:bg-gray-200 text-gray-600"}`}>
          <DownloadSimple size={14} /> تصدير تقرير الحوكمة
        </button>
      </div>
    </div>
  );
}
