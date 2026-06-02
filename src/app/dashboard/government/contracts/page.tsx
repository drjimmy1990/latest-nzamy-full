'use client';

import { motion } from 'framer-motion';
import { useState } from 'react';
import {
  FileText, Plus, MagnifyingGlass, CheckCircle,
  Clock, Storefront, Eye, Download, ArrowLeft,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';

const CONTRACTS = [
  { id: 'C-2026-001', title: 'عقد توريد مستلزمات طبية',          vendor: 'شركة المستلزمات الصحية',   value: 850000,  status: 'ساري',       date: '٢٠٢٦/٠١/١٥', end: '٢٠٢٧/٠١/١٤' },
  { id: 'C-2026-002', title: 'عقد خدمات تقنية معلومات',           vendor: 'مجموعة الحلول التقنية',    value: 320000,  status: 'ساري',       date: '٢٠٢٦/٠٢/٠١', end: '٢٠٢٦/٠٧/٣١' },
  { id: 'C-2025-018', title: 'عقد صيانة وتشغيل المباني',          vendor: 'شركة المنشآت المتكاملة',   value: 1200000, status: 'منتهٍ',      date: '٢٠٢٥/٠١/٠١', end: '٢٠٢٥/١٢/٣١' },
  { id: 'C-2026-003', title: 'مناقصة توريد أثاث مكتبي',           vendor: '—',                        value: 0,       status: 'مناقصة',     date: '٢٠٢٦/٠٤/١٠', end: '—' },
  { id: 'C-2026-004', title: 'عقد خدمات الأمن والحراسة',          vendor: 'شركة الأمن الوطني',        value: 540000,  status: 'ساري',       date: '٢٠٢٦/٠٣/٠١', end: '٢٠٢٧/٠٢/٢٨' },
];

const STATUS_CONFIG = {
  'ساري':    { text: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle },
  'منتهٍ':  { text: 'text-slate-400',   bg: 'bg-slate-400/10',   border: 'border-slate-400/20',   icon: Clock },
  'مناقصة': { text: 'text-sky-500',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20',     icon: Storefront },
};

export default function GovernmentContractsPage() {
  const { isDark } = useTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'الكل' | 'ساري' | 'منتهٍ' | 'مناقصة'>('الكل');

  const card    = isDark ? 'border-white/5 bg-zinc-900/40 backdrop-blur-md' : 'border-slate-200 bg-white shadow-sm';
  const textPri = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textMuted = isDark ? 'text-zinc-400' : 'text-slate-500';

  const filtered = CONTRACTS.filter(c => {
    if (filter !== 'الكل' && c.status !== filter) return false;
    if (search && !c.title.includes(search) && !c.vendor.includes(search)) return false;
    return true;
  });

  const totalActive = CONTRACTS.filter(c => c.status === 'ساري').reduce((s, c) => s + c.value, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-5" dir="rtl">

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className={`text-xl font-black ${textPri}`}>العقود والاتفاقيات</h1>
          <p className={`text-sm mt-0.5 ${textMuted}`}>{CONTRACTS.length} عقد — إجمالي العقود السارية: {totalActive.toLocaleString('ar-SA')} ر.س</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#0a3328] transition-colors">
          <Plus size={14} weight="bold" />
          عقد جديد
        </button>
      </motion.div>

      {/* KPI */}
      <div className={`grid grid-cols-3 rounded-2xl border overflow-hidden ${card}`}>
        {[
          { label: 'عقد ساري', value: CONTRACTS.filter(c=>c.status==='ساري').length, color: 'text-emerald-500' },
          { label: 'مناقصات', value: CONTRACTS.filter(c=>c.status==='مناقصة').length, color: 'text-sky-500' },
          { label: 'منتهية', value: CONTRACTS.filter(c=>c.status==='منتهٍ').length, color: isDark ? 'text-zinc-400' : 'text-slate-400' },
        ].map((k, i) => (
          <div key={i} className={`px-5 py-4 text-center ${i < 2 ? `border-l ${isDark ? 'border-white/[0.08]' : 'border-slate-100'}` : ''}`}>
            <p className={`text-2xl font-black tabular-nums ${k.color}`}>{k.value}</p>
            <p className={`text-xs mt-0.5 ${textMuted}`}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div className="flex gap-3 flex-col sm:flex-row">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${isDark ? 'border-white/[0.08] bg-white/[0.04]' : 'border-slate-200 bg-white'}`}>
          <MagnifyingGlass size={15} className={textMuted} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالعنوان أو الجهة..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-zinc-100 placeholder:text-zinc-600' : 'text-slate-700 placeholder:text-slate-400'}`} />
        </div>
        <div className="flex gap-1.5">
          {(['الكل', 'ساري', 'مناقصة', 'منتهٍ'] as const).map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-2 text-xs rounded-xl border font-semibold transition-all ${filter === s
                ? 'bg-[#0B3D2E] text-white border-[#0B3D2E]'
                : isDark ? 'border-white/[0.06] text-zinc-500 hover:text-zinc-300' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Contracts list */}
      <div className="space-y-2">
        {filtered.map((c, i) => {
          const cfg = STATUS_CONFIG[c.status as keyof typeof STATUS_CONFIG];
          const StatusIcon = cfg.icon;
          return (
            <motion.div key={c.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              className={`group rounded-2xl border ${card} p-4 flex items-center gap-4 hover:border-[#0B3D2E]/20 transition-all`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-white/[0.06]' : 'bg-slate-100'}`}>
                <FileText size={18} weight="duotone" className="text-[#0B3D2E]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold mb-0.5 ${textPri}`}>{c.title}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs ${textMuted}`}>{c.id}</span>
                  {c.vendor !== '—' && <span className={`text-xs ${textMuted}`}>· {c.vendor}</span>}
                  {c.value > 0 && <span className="text-xs text-[#0B3D2E] font-bold">· {c.value.toLocaleString('ar-SA')} ر.س</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-xl border font-medium ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                  <StatusIcon size={10} weight="fill" />
                  {c.status}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className={`p-1.5 rounded-xl border ${isDark ? 'border-white/[0.06] text-zinc-600 hover:text-zinc-300' : 'border-slate-100 text-slate-300 hover:text-slate-600'}`}>
                    <Eye size={12} />
                  </button>
                  <button className={`p-1.5 rounded-xl border ${isDark ? 'border-white/[0.06] text-zinc-600 hover:text-zinc-300' : 'border-slate-100 text-slate-300 hover:text-slate-600'}`}>
                    <Download size={12} />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

    </div>
  );
}
