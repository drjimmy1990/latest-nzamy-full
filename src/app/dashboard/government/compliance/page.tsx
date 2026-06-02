"use client";

import { ShieldCheck, CheckCircle, Warning, FileText, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

type ComplianceItem = {
  title: string;
  body: string;
  status: "متوافق" | "يحتاج مراجعة" | "غير متوافق";
  ref: string;
};

const ITEMS: ComplianceItem[] = [
  { title: "نظام مكافحة الفساد",       body: "الإجراءات الداخلية متوافقة مع نظام مكافحة الفساد 1439هـ",        status: "متوافق",        ref: "م/2" },
  { title: "ضوابط المناقصات",           body: "متابعة قواعد الإفصاح والشفافية في إجراءات الترسية",              status: "متوافق",        ref: "م/45" },
  { title: "حماية البيانات الشخصية",    body: "تطبيق نظام حماية البيانات الشخصية (PDPL) على الأنظمة الداخلية", status: "يحتاج مراجعة",  ref: "PDPL م/7" },
  { title: "ديوان المراقبة العامة",     body: "تقرير الأداء السنوي — الموعد النهائي خلال 45 يوماً",             status: "يحتاج مراجعة",  ref: "لائحة م/12" },
  { title: "اشتراطات نزاهة الموظفين",   body: "إقرارات الذمة المالية لكبار المسؤولين",                          status: "متوافق",        ref: "م/5" },
  { title: "إجراءات الإفصاح عن المخالفات", body: "قناة التبليغ الداخلية غير مفعّلة رسمياً بعد",               status: "غير متوافق",    ref: "م/19" },
];

const STATUS_MAP = {
  "متوافق":       { cls: "text-emerald-400 border-emerald-400/20 bg-emerald-400/10", Icon: CheckCircle },
  "يحتاج مراجعة": { cls: "text-amber-400 border-amber-400/20 bg-amber-400/10",   Icon: Warning },
  "غير متوافق":   { cls: "text-rose-400 border-rose-400/20 bg-rose-400/10",       Icon: Warning },
};

export default function GovernmentCompliancePage() {
  const { isDark } = useTheme();

  const counts = {
    pass: ITEMS.filter(i => i.status === "متوافق").length,
    warn: ITEMS.filter(i => i.status === "يحتاج مراجعة").length,
    fail: ITEMS.filter(i => i.status === "غير متوافق").length,
  };

  const textPri = isDark ? "text-white" : "text-slate-900";
  const textMuted = isDark ? "text-slate-500" : "text-slate-500";
  const cardBorder = isDark ? "border-white/10" : "border-slate-200";
  const cardBg = isDark ? "" : "bg-white shadow-sm";
  const divider = isDark ? "divide-white/5" : "divide-slate-100";
  const rowHover = isDark ? "hover:bg-white/[0.02]" : "hover:bg-slate-50";
  const btnCls = isDark
    ? "bg-white/5 border border-white/10 hover:bg-white/10 text-white"
    : "bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-800";
  const ctaBtnCls = isDark
    ? "bg-sky-400/10 border border-sky-400/20 hover:bg-sky-400/15 text-sky-400"
    : "bg-sky-50 border border-sky-200 hover:bg-sky-100 text-sky-700";

  return (
    <div className="max-w-4xl mx-auto space-y-8" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className={isDark ? "text-slate-400" : "text-slate-500"} />
          <h1 className={`text-xl font-bold tracking-tight ${textPri}`}>الامتثال القانوني</h1>
        </div>
        <Link
          href="/ai/gov/compliance-checker"
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${ctaBtnCls}`}
        >
          <ShieldCheck size={14} />
          مدقق الامتثال بالذكاء الاصطناعي
        </Link>
      </div>

      {/* KPI strip */}
      <div className={`grid grid-cols-3 divide-x divide-x-reverse ${divider} border ${cardBorder} ${cardBg} rounded-2xl overflow-hidden`}>
        <div className="px-5 py-4">
          <div className="text-2xl font-bold text-emerald-400 font-mono">{counts.pass}</div>
          <div className={`text-xs mt-0.5 ${textMuted}`}>متوافق</div>
        </div>
        <div className="px-5 py-4">
          <div className="text-2xl font-bold text-amber-400 font-mono">{counts.warn}</div>
          <div className={`text-xs mt-0.5 ${textMuted}`}>يحتاج مراجعة</div>
        </div>
        <div className="px-5 py-4">
          <div className="text-2xl font-bold text-rose-400 font-mono">{counts.fail}</div>
          <div className={`text-xs mt-0.5 ${textMuted}`}>غير متوافق</div>
        </div>
      </div>

      {/* Compliance list */}
      <div className={`${divider} divide-y rounded-2xl border ${cardBorder} ${cardBg} overflow-hidden`}>
        {ITEMS.map((item) => {
          const { cls, Icon: ItemIcon } = STATUS_MAP[item.status];
          return (
            <div key={item.title} className={`px-5 py-4 flex items-start justify-between gap-4 ${rowHover} transition-colors`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`font-medium text-sm ${textPri}`}>{item.title}</span>
                  <span className={`text-xs font-mono ${isDark ? "text-slate-600" : "text-slate-400"}`}>{item.ref}</span>
                </div>
                <div className={`text-xs mt-1 leading-relaxed ${textMuted}`}>{item.body}</div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border flex-shrink-0 ${cls}`}>
                <ItemIcon size={11} weight="bold" />
                {item.status}
              </span>
            </div>
          );
        })}
      </div>

      {/* Action */}
      <div className="flex items-center gap-3">
        <button className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${btnCls}`}>
          <FileText size={14} />
          تصدير تقرير الامتثال
        </button>
        <button className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${btnCls}`}>
          <Plus size={14} />
          إضافة بند
        </button>
      </div>
    </div>
  );
}

