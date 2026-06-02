'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChatDots, MagnifyingGlass, Calendar, Clock, CheckCircle,
  Hourglass, XCircle, Star, ArrowLeft, FileText,
  UserCircle, Gavel, Buildings,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { useTheme } from '@/components/ThemeProvider';

// ─── Mock Data ────────────────────────────────────────────────────────────────

type ConsultStatus = 'completed' | 'scheduled' | 'pending' | 'cancelled';
type ConsultType   = 'عمالي' | 'تجاري' | 'عقاري' | 'إداري';

interface Consultation {
  id: string;
  lawyerName: string;
  topic: string;
  type: ConsultType;
  status: ConsultStatus;
  date: string;
  duration: number; // minutes
  rating?: number;
  fee: number;
  summary?: string;
}

const MOCK: Consultation[] = [
  { id: 'c-1', lawyerName: 'أ. سارة المنصور',  topic: 'مراجعة عقد تأسيس الشركة',     type: 'تجاري',  status: 'completed',  date: '١٤٤٦/١٠/٠٥', duration: 45, rating: 5, fee: 750,  summary: 'تمت مراجعة العقد وتحديد البنود الإشكالية.' },
  { id: 'c-2', lawyerName: 'أ. خالد الحربي',   topic: 'نزاع مع مورّد — الشرقية',     type: 'تجاري',  status: 'completed',  date: '١٤٤٦/٠٩/٢٨', duration: 60, rating: 4, fee: 900,  summary: 'تم توضيح الحقوق القانونية وخيارات الطعن.' },
  { id: 'c-3', lawyerName: 'أ. نورة الشمري',   topic: 'فسخ عقد موظف',                 type: 'عمالي',  status: 'scheduled',  date: '١٤٤٦/١١/٠٢', duration: 30, fee: 500 },
  { id: 'c-4', lawyerName: 'أ. تركي العمر',    topic: 'استشارة إجراءات تحصيل ديون',   type: 'تجاري',  status: 'pending',    date: '١٤٤٦/١١/٠٤', duration: 0,  fee: 800 },
  { id: 'c-5', lawyerName: 'أ. محمد القحطاني', topic: 'عقد إيجار مستودعات',           type: 'عقاري',  status: 'completed',  date: '١٤٤٦/٠٩/١٢', duration: 50, rating: 5, fee: 650,  summary: 'اطلع المحامي على البنود وأوصى بتعديلات.' },
  { id: 'c-6', lawyerName: 'أ. عبدالله الغامدي',topic: 'مراجعة قرار إداري',            type: 'إداري',  status: 'cancelled',  date: '١٤٤٦/٠٩/٢٠', duration: 0,  fee: 0 },
];

const STATUS_CONFIG: Record<ConsultStatus, { label: string; icon: React.ElementType; textColor: string; bgColor: string }> = {
  completed:  { label: 'مكتملة',   icon: CheckCircle, textColor: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  scheduled:  { label: 'مجدولة',   icon: Calendar,    textColor: 'text-blue-500',    bgColor: 'bg-blue-500/10' },
  pending:    { label: 'قيد الانتظار', icon: Hourglass, textColor: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  cancelled:  { label: 'ملغاة',    icon: XCircle,     textColor: 'text-red-500',     bgColor: 'bg-red-500/10' },
};

const TYPE_OPTIONS: ConsultType[] = ['عمالي', 'تجاري', 'عقاري', 'إداري'];

// ─── KPI ─────────────────────────────────────────────────────────────────────

const KPI = [
  { label: 'إجمالي الاستشارات', value: MOCK.length, icon: ChatDots },
  { label: 'مكتملة',            value: MOCK.filter(c => c.status === 'completed').length, icon: CheckCircle },
  { label: 'قادمة',             value: MOCK.filter(c => c.status === 'scheduled').length, icon: Calendar },
  { label: 'إجمالي الأتعاب',    value: `${MOCK.filter(c=>c.status==='completed').reduce((s,c)=>s+c.fee,0).toLocaleString('ar-SA')} ر.س`, icon: FileText },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BusinessConsultationsPage() {
  const { isDark } = useTheme();
  const [search,    setSearch]    = useState('');
  const [status,    setStatus]    = useState<ConsultStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ConsultType | 'all'>('all');

  const card      = isDark ? 'border-white/[0.08] bg-[#161b22]' : 'border-slate-200 bg-white shadow-sm';
  const textPri   = isDark ? 'text-zinc-100' : 'text-slate-900';
  const textMuted = isDark ? 'text-zinc-400'  : 'text-slate-500';
  const input     = isDark
    ? 'bg-white/[0.04] border-white/[0.06] text-zinc-100 placeholder:text-zinc-600'
    : 'bg-white border-slate-200 text-slate-700 placeholder:text-slate-400';

  const filtered = MOCK.filter(c => {
    if (status !== 'all'     && c.status !== status)      return false;
    if (typeFilter !== 'all' && c.type !== typeFilter)    return false;
    if (search && !c.topic.includes(search) && !c.lawyerName.includes(search)) return false;
    return true;
  });

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className={`text-xl font-black ${textPri}`}>الاستشارات القانونية</h1>
          <p className={`text-sm mt-0.5 ${textMuted}`}>سجل استشارات الشركة مع المستشارين القانونيين</p>
        </div>
        <Link href="/dashboard/client/consultation/new"
          className="flex items-center gap-2 px-4 py-2 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold hover:bg-[#0a3328] transition-colors">
          <ChatDots size={15} />
          استشارة جديدة
        </Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {KPI.map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i, duration: 0.35 }}
              className={`p-4 rounded-2xl border text-center ${card}`}>
              <Icon size={18} className="text-[#0B3D2E] mx-auto mb-2" weight="fill" />
              <p className={`text-xl font-black tabular-nums ${textPri}`}>{k.value}</p>
              <p className={`text-xs mt-0.5 ${textMuted}`}>{k.label}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className={`flex items-center gap-2 flex-1 px-3 py-2.5 rounded-xl border ${input}`}>
          <MagnifyingGlass size={15} className={textMuted} />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالموضوع أو المحامي..."
            className={`flex-1 bg-transparent text-sm outline-none ${isDark ? 'text-zinc-100 placeholder:text-zinc-600' : 'text-slate-700 placeholder:text-slate-400'}`}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'completed', 'scheduled', 'pending', 'cancelled'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-2 text-xs rounded-xl border font-semibold transition-all ${status === s
                ? 'bg-[#0B3D2E] text-white border-[#0B3D2E]'
                : isDark ? 'border-white/[0.06] text-zinc-500 hover:text-zinc-300' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
              {s === 'all' ? 'الكل' : STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button onClick={() => setTypeFilter('all')}
          className={`px-3 py-1.5 text-xs rounded-xl border font-medium transition-all ${typeFilter === 'all'
            ? 'bg-[#C8A762]/20 text-[#C8A762] border-[#C8A762]/30'
            : isDark ? 'border-white/[0.06] text-zinc-600 hover:text-zinc-400' : 'border-slate-100 text-slate-400 hover:text-slate-600'}`}>
          الكل
        </button>
        {TYPE_OPTIONS.map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 text-xs rounded-xl border font-medium transition-all ${typeFilter === t
              ? 'bg-[#C8A762]/20 text-[#C8A762] border-[#C8A762]/30'
              : isDark ? 'border-white/[0.06] text-zinc-600 hover:text-zinc-400' : 'border-slate-100 text-slate-400 hover:text-slate-600'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className={`flex flex-col items-center justify-center py-16 gap-3 rounded-2xl border ${card}`}>
          <ChatDots size={32} className={textMuted} />
          <p className={`text-sm ${textMuted}`}>لا توجد استشارات مطابقة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((c, i) => {
            const cfg = STATUS_CONFIG[c.status];
            const StatusIcon = cfg.icon;
            return (
              <motion.div key={c.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.3 }}
                className={`rounded-2xl border ${card} p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg font-semibold ${cfg.bgColor} ${cfg.textColor}`}>
                        <StatusIcon size={10} weight="fill" />
                        {cfg.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${isDark ? 'bg-white/[0.04] border border-white/[0.06] text-zinc-400' : 'bg-slate-50 border border-slate-100 text-slate-500'}`}>
                        {c.type}
                      </span>
                    </div>
                    <p className={`font-bold text-sm mb-1 ${textPri}`}>{c.topic}</p>
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center gap-1 text-xs ${textMuted}`}>
                        <UserCircle size={11} className="text-[#0B3D2E]" weight="fill" />
                        {c.lawyerName}
                      </span>
                      <span className={`flex items-center gap-1 text-xs ${textMuted}`}>
                        <Calendar size={11} />
                        {c.date}
                      </span>
                      {c.duration > 0 && (
                        <span className={`flex items-center gap-1 text-xs ${textMuted}`}>
                          <Clock size={11} />
                          {c.duration} د
                        </span>
                      )}
                    </div>
                    {c.summary && (
                      <p className={`mt-2 text-xs leading-relaxed p-2.5 rounded-xl ${isDark ? 'bg-white/[0.03] text-zinc-500' : 'bg-slate-50 text-slate-500'}`}>
                        {c.summary}
                      </p>
                    )}
                  </div>
                  <div className="text-left flex-shrink-0">
                    {c.fee > 0 && (
                      <p className={`font-black text-sm text-[#0B3D2E] tabular-nums`}>
                        {c.fee.toLocaleString('ar-SA')} ر.س
                      </p>
                    )}
                    {c.rating && (
                      <div className="flex items-center gap-0.5 justify-end mt-1">
                        {[1,2,3,4,5].map(n => (
                          <Star key={n} size={10} weight={c.rating! >= n ? 'fill' : 'regular'}
                            className={c.rating! >= n ? 'text-[#C8A762]' : isDark ? 'text-zinc-700' : 'text-slate-200'} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

    </div>
  );
}
