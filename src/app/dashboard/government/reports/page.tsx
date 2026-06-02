'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  ClipboardText, FileText, ArrowLeft, MagnifyingGlass,
  CheckCircle, Clock, Warning, Robot,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';

type ReportStatus = 'منشور' | 'مسودة' | 'قيد المراجعة';
type ReportType   = 'ربعي' | 'سنوي' | 'فوري';

const REPORTS = [
  { id: 'R-2026-Q1', title: 'تقرير الأداء الربعي الأول 2026',       period: 'يناير – مارس ٢٠٢٦',   type: 'ربعي'  as ReportType, status: 'منشور'       as ReportStatus, size: '٤.٢ MB' },
  { id: 'R-2025-AN', title: 'التقرير السنوي 2025',                   period: 'كامل العام ٢٠٢٥',      type: 'سنوي'  as ReportType, status: 'منشور'       as ReportStatus, size: '١١.٧ MB' },
  { id: 'R-2026-Q2', title: 'تقرير الأداء الربعي الثاني 2026',      period: 'أبريل – يونيو ٢٠٢٦',  type: 'ربعي'  as ReportType, status: 'مسودة'       as ReportStatus, size: '—' },
  { id: 'R-COMP-26', title: 'تقرير الامتثال — ديوان المراقبة 2026', period: 'أبريل ٢٠٢٦',           type: 'فوري'  as ReportType, status: 'قيد المراجعة' as ReportStatus, size: '٢.٨ MB' },
  { id: 'R-2025-Q4', title: 'تقرير الأداء الربعي الرابع 2025',      period: 'أكتوبر – ديسمبر ٢٠٢٥',type: 'ربعي'  as ReportType, status: 'منشور'       as ReportStatus, size: '٣.٩ MB' },
];

const STATUS_CONFIG: Record<ReportStatus, { text: string; bg: string; border: string; icon: React.ElementType }> = {
  'منشور':        { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle },
  'مسودة':        { text: 'text-slate-400',   bg: 'bg-slate-400/10',   border: 'border-slate-400/20',   icon: Clock },
  'قيد المراجعة': { text: 'text-amber-500',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   icon: Warning },
};

const TYPE_CONFIG: Record<ReportType, { text: string; bg: string; border: string }> = {
  'ربعي': { text: 'text-sky-500',    bg: 'bg-sky-500/10',    border: 'border-sky-500/20' },
  'سنوي': { text: 'text-violet-500', bg: 'bg-violet-500/10', border: 'border-violet-500/20' },
  'فوري': { text: 'text-rose-500',   bg: 'bg-rose-500/10',   border: 'border-rose-500/20' },
};

export default function GovernmentReportsPage() {
  const { isDark } = useTheme();
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState<ReportStatus | 'الكل'>('الكل');

  const card    = isDark ? 'border-white/5 bg-zinc-900/40 backdrop-blur-md' : 'border-slate-200 bg-white shadow-sm';
  const textPri = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textMuted = isDark ? 'text-zinc-400' : 'text-slate-500';

  const filtered = REPORTS.filter(r => {
    if (filter !== 'الكل' && r.status !== filter) return false;
    if (search && !r.title.includes(search)) return false;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-black ${textPri}`}>التقارير الرسمية</h1>
          <p className={`text-sm mt-0.5 ${textMuted}`}>{REPORTS.length} تقرير — {REPORTS.filter(r=>r.status==='منشور').length} منشور</p>
        </div>
        <Link href="/ai/gov/legal-opinion-drafter"
          className="flex items-center gap-2 px-4 py-2 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#0a3328] transition-colors">
          <Robot size={14} weight="fill" />
          إنشاء بالذكاء الاصطناعي
        </Link>
      </motion.div>

      {/* Filters + search */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04]' : 'border-slate-200 bg-white'}`}>
          <MagnifyingGlass size={15} className={textMuted} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بعنوان التقرير..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-zinc-100 placeholder:text-zinc-600' : 'text-slate-700 placeholder:text-slate-400'}`} />
        </div>
        <div className="flex gap-1.5">
          {(['الكل', 'منشور', 'مسودة', 'قيد المراجعة'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2 text-xs rounded-xl border font-semibold transition-all ${filter === s
                ? 'bg-[#0B3D2E] text-white border-[#0B3D2E]'
                : isDark ? 'border-white/[0.06] text-zinc-500 hover:text-zinc-300' : 'border-slate-200 text-slate-500'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Reports list */}
      <div className="space-y-2">
        {filtered.map((r, i) => {
          const sCfg = STATUS_CONFIG[r.status];
          const tCfg = TYPE_CONFIG[r.type];
          const StatusIcon = sCfg.icon;
          return (
            <motion.div key={r.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className={`group rounded-2xl border ${card} p-4 flex items-center gap-4 hover:border-[#0B3D2E]/20 transition-all`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-white/[0.06]' : 'bg-slate-100'}`}>
                <ClipboardText size={18} weight="duotone" className="text-[#0B3D2E]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold mb-0.5 ${textPri}`}>{r.title}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] px-2 py-0.5 rounded-lg border font-medium ${tCfg.bg} ${tCfg.text} ${tCfg.border}`}>
                    {r.type}
                  </span>
                  <span className={`text-xs ${textMuted}`}>{r.id} · {r.period}</span>
                  {r.size !== '—' && <span className={`text-xs ${textMuted}`}>· {r.size}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl border font-medium ${sCfg.bg} ${sCfg.text} ${sCfg.border}`}>
                  <StatusIcon size={10} weight="fill" />
                  {r.status}
                </span>
                <button className={`p-1.5 rounded-xl border transition-colors ${isDark ? 'border-white/[0.06] text-zinc-600 hover:text-zinc-300' : 'border-slate-100 text-slate-300 hover:text-slate-600'}`}>
                  <ArrowLeft size={13} />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
}
