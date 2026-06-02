'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  Gavel, Plus, MagnifyingGlass, Clock, CheckCircle,
  Hourglass, FileText, ArrowLeft,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';
import EmptyState from '@/components/ui/EmptyState';

const MOCK_CASES = [
  { id: 'GOV-001', title: 'نزاع تعاقدي مع مورد معدات طبية', type: 'تعاقدي', status: 'نشط',   date: '٢٠٢٦/٠٤/١٠', court: 'المحكمة التجارية — الرياض' },
  { id: 'GOV-002', title: 'طعن إداري في قرار تأديبي',         type: 'إداري',   status: 'معلق',  date: '٢٠٢٦/٠٣/٢٢', court: 'ديوان المظالم' },
  { id: 'GOV-003', title: 'نزاع عمالي مع موظف سابق',          type: 'عمالي',  status: 'مغلق',  date: '٢٠٢٦/٠٢/١٥', court: 'المحكمة العمالية — جدة' },
  { id: 'GOV-004', title: 'مطالبة بتعويض — مقاول مشاريع',    type: 'مدني',   status: 'نشط',   date: '٢٠٢٦/٠٤/٠٢', court: 'محكمة الاستئناف' },
];

const STATUS_CONFIG = {
  'نشط':   { icon: Clock,        text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', label: 'نشط' },
  'معلق':  { icon: Hourglass,    text: 'text-amber-500',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   label: 'معلق' },
  'مغلق':  { icon: CheckCircle,  text: 'text-slate-400',   bg: 'bg-slate-400/10',   border: 'border-slate-400/20',   label: 'مغلق' },
};

const TYPE_COLOR: Record<string, string> = {
  'تعاقدي': 'text-blue-500 bg-blue-500/10 border-blue-500/20',
  'إداري':  'text-violet-500 bg-violet-500/10 border-violet-500/20',
  'عمالي':  'text-amber-500 bg-amber-500/10 border-amber-500/20',
  'مدني':   'text-teal-500 bg-teal-500/10 border-teal-500/20',
};

export default function GovernmentCasesPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState('');

  const card    = isDark ? 'border-white/5 bg-zinc-900/40 backdrop-blur-md' : 'border-slate-200 bg-white shadow-sm';
  const textPri = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textMuted = isDark ? 'text-zinc-400' : 'text-slate-500';

  const filtered = MOCK_CASES.filter(c =>
    !search || c.title.includes(search) || c.type.includes(search)
  );

  const counts = {
    active: MOCK_CASES.filter(c => c.status === 'نشط').length,
    pending: MOCK_CASES.filter(c => c.status === 'معلق').length,
    closed: MOCK_CASES.filter(c => c.status === 'مغلق').length,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-black ${textPri}`}>القضايا والنزاعات</h1>
          <p className={`text-sm mt-0.5 ${textMuted}`}>{MOCK_CASES.length} قضية مسجّلة</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#0a3328] transition-colors">
          <Plus size={14} weight="bold" />
          نزاع جديد
        </button>
      </motion.div>

      {/* KPI strip */}
      <div className={`grid grid-cols-3 rounded-2xl border overflow-hidden ${card}`}>
        {[
          { label: 'نشطة', value: counts.active, color: 'text-emerald-500' },
          { label: 'معلقة', value: counts.pending, color: 'text-amber-500' },
          { label: 'مغلقة', value: counts.closed, color: isDark ? 'text-zinc-400' : 'text-slate-400' },
        ].map((k, i) => (
          <div key={i} className={`px-5 py-4 text-center ${i < 2 ? `border-l ${isDark ? 'border-white/[0.08]' : 'border-slate-100'}` : ''}`}>
            <p className={`text-2xl font-black tabular-nums ${k.color}`}>{k.value}</p>
            <p className={`text-xs mt-0.5 ${textMuted}`}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04]' : 'border-slate-200 bg-white'}`}>
        <MagnifyingGlass size={15} className={textMuted} />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="بحث بالعنوان أو النوع..."
          className={`flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-zinc-100 placeholder:text-zinc-600' : 'text-slate-700 placeholder:text-slate-400'}`} />
      </div>

      {/* Cases list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className={`rounded-2xl border ${card} py-2`}>
            <EmptyState
              icon={<Gavel size={28} weight="duotone" />}
              title={search ? "لا توجد نتائج للبحث" : "لا توجد قضايا مسجّلة"}
              description={search ? `لا توجد قضايا تطابق "‏${search}‏" — جرّب بحثاً آخر` : "اضغط على «نزاع جديد» لإضافة أوّل نزاع للجهة"}
              action={search ? { label: "إلغاء البحث", onClick: () => setSearch('') } : { label: "إضافة نزاع", href: '#' }}
              size="sm"
            />
          </div>
        ) : (
          filtered.map((c, i) => {
          const cfg = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG];
          const StatusIcon = cfg.icon;
          return (
            <motion.div key={c.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className={`group rounded-2xl border ${card} p-4 flex items-center gap-4 hover:border-[#0B3D2E]/20 transition-all`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[11px] px-2 py-0.5 rounded-lg border font-semibold ${TYPE_COLOR[c.type] ?? ''}`}>
                    {c.type}
                  </span>
                  <span className={`text-[11px] ${textMuted}`}>{c.id}</span>
                </div>
                <p className={`text-sm font-semibold mb-0.5 ${textPri}`}>{c.title}</p>
                <p className={`text-xs ${textMuted}`}>{c.court} · {c.date}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl border font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                  <StatusIcon size={10} weight="fill" />
                  {cfg.label}
                </span>
                <button className={`p-1.5 rounded-xl border transition-colors ${isDark ? 'border-white/[0.06] text-zinc-600 hover:text-zinc-300' : 'border-slate-100 text-slate-300 hover:text-slate-600'}`}>
                  <ArrowLeft size={13} />
                </button>
              </div>
            </motion.div>
          );
          })
        )}
      </div>

    </div>
  );
}
