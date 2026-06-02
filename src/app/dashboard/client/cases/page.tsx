'use client';

import { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  Scales, CalendarBlank, ArrowUpRight, Clock,
  CheckCircle, Hourglass, PlusCircle, MagnifyingGlass,
  FileText, ChatCircle,
} from '@phosphor-icons/react';
import { NewCaseModal } from './_components/NewCaseModal';
import { normalizeDigits } from '@/utils/normalizeDigits';
import { useTheme } from '@/components/ThemeProvider';

type CaseStatus = 'active' | 'pending' | 'closed';

interface Case {
  id: string;
  title: string;
  caseNumber: string;
  lawyer: string;
  court: string;
  type: string;
  status: CaseStatus;
  nextSession: string | null;
  openedAt: string;
  lastUpdate: string;
}

const MOCK_CASES: Case[] = [
  {
    id: '1',
    title: 'قضية فصل تعسفي — ضد شركة المشاريع الرائدة',
    caseNumber: '٤٥٦٧/١٤٤٦',
    lawyer: 'محمد الزهراني',
    court: 'المحكمة العمالية — الرياض',
    type: 'عمالية',
    status: 'active',
    nextSession: '١٥ أبريل ٢٠٢٦',
    openedAt: '١ فبراير ٢٠٢٦',
    lastUpdate: 'منذ يومين',
  },
  {
    id: '2',
    title: 'نزاع عقاري — منح الأرض بحي النخيل',
    caseNumber: '٢١٣٠/١٤٤٦',
    lawyer: 'سارة العتيبي',
    court: 'المحكمة العامة — جدة',
    type: 'عقاري',
    status: 'pending',
    nextSession: null,
    openedAt: '١٠ مارس ٢٠٢٦',
    lastUpdate: 'منذ أسبوع',
  },
  {
    id: '3',
    title: 'قضية ديون تجارية — مستحقات متأخرة',
    caseNumber: '٨٩١٢/١٤٤٥',
    lawyer: 'خالد الدوسري',
    court: 'المحكمة التجارية — الدمام',
    type: 'تجارية',
    status: 'closed',
    nextSession: null,
    openedAt: '٥ يناير ٢٠٢٥',
    lastUpdate: 'مُغلقة بتاريخ ١ مارس ٢٠٢٦',
  },
];

const statusConfig: Record<CaseStatus, { label: string; lightBadge: string; darkBadge: string; icon: typeof CheckCircle }> = {
  active: { label: 'نشطة', lightBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200', darkBadge: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50', icon: Scales },
  pending: { label: 'قيد الانتظار', lightBadge: 'bg-amber-50 text-amber-700 border-amber-200', darkBadge: 'bg-amber-900/30 text-amber-400 border-amber-700/50', icon: Hourglass },
  closed: { label: 'مُغلقة', lightBadge: 'bg-slate-100 text-slate-600 border-slate-200', darkBadge: 'bg-white/5 text-gray-400 border-white/10', icon: CheckCircle },
};

function CaseCard({ c, index, isDark }: { c: Case; index: number; isDark: boolean }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const cfg = statusConfig[c.status];
  const Icon = cfg.icon;

  return (
    <motion.div
      ref={ref}
      layoutId={`case-card-${c.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ type: "spring", stiffness: 100, damping: 20, delay: index * 0.05 }}
      className={`group flex flex-col p-6 rounded-[2rem] border transition-all duration-300 h-full ${
        isDark 
          ? "bg-zinc-900/50 border-white/10 hover:bg-zinc-800/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" 
          : "bg-white border-zinc-200 hover:border-[#0B3D2E]/20 hover:shadow-lg hover:shadow-[#0B3D2E]/5"
      }`}
    >
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex-1 min-w-0">
          <p className={`font-bold text-[15px] leading-snug mb-1.5 truncate ${isDark ? "text-white" : "text-zinc-900"}`}>{c.title}</p>
          <p className={`text-xs font-mono ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>{c.caseNumber}</p>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border font-bold ${isDark ? cfg.darkBadge : cfg.lightBadge}`}>
          <Icon size={12} weight="fill" />
          {cfg.label}
        </span>
      </div>

      <div className={`grid grid-cols-2 gap-y-3 gap-x-2 text-xs mb-6 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
        <span className="truncate">المحامي: <span className={`font-medium ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{c.lawyer}</span></span>
        <span className="truncate">النوع: <span className={`font-medium ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{c.type}</span></span>
        <span className="col-span-2 truncate flex items-center gap-1.5">
          <Scales size={14} className={isDark ? "text-zinc-500" : "text-zinc-400"} />
          {c.court}
        </span>
      </div>

      <div className="mt-auto">
        {c.nextSession && (
          <div className={`flex items-center gap-2 p-3 rounded-xl mb-4 ${
            isDark ? "bg-[#C8A762]/10 border border-[#C8A762]/20" : "bg-[#C8A762]/5 border border-[#C8A762]/20"
          }`}>
            <CalendarBlank size={15} className="text-[#C8A762] flex-shrink-0" />
            <p className={`text-[12px] font-bold ${isDark ? "text-[#C8A762]" : "text-[#b5883a]"}`}>الجلسة القادمة: {c.nextSession}</p>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-dashed border-zinc-200 dark:border-white/10">
          <span className={`text-[11px] font-medium ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{c.lastUpdate}</span>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/client/messages" className={`flex items-center gap-1.5 text-[11px] font-bold transition-colors px-3 py-2 rounded-xl ${
              isDark ? "text-zinc-300 hover:text-emerald-400 hover:bg-white/5" : "text-zinc-600 hover:text-[#0B3D2E] hover:bg-zinc-50"
            }`}>
              <ChatCircle size={14} />
              رسالة
            </Link>
            <Link href={`/dashboard/client/cases/${c.id}`} className={`flex items-center gap-1.5 text-[11px] font-bold transition-colors px-3 py-2 rounded-xl ${
              isDark ? "bg-[#0B3D2E]/20 text-emerald-400 hover:bg-[#0B3D2E]/40" : "bg-[#0B3D2E]/10 text-[#0B3D2E] hover:bg-[#0B3D2E]/20"
            }`}>
              <FileText size={14} weight="fill" />
              ملف القضية
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function ClientCasesPage() {
  const { isDark } = useTheme();
  const [filter, setFilter] = useState<CaseStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showNewCase, setShowNewCase] = useState(false);

  const filtered = useMemo(() => {
    return MOCK_CASES.filter((c) => {
      const matchFilter = filter === 'all' || c.status === filter;
      const nq = normalizeDigits(search.trim().toLowerCase());
      const matchSearch = !search.trim() ||
        normalizeDigits(c.title.toLowerCase()).includes(nq) ||
        normalizeDigits(c.caseNumber).includes(nq) ||
        normalizeDigits(c.lawyer.toLowerCase()).includes(nq);
      return matchFilter && matchSearch;
    });
  }, [filter, search]);

  const counts = useMemo(() => ({
    all: MOCK_CASES.length,
    active: MOCK_CASES.filter((c) => c.status === 'active').length,
    pending: MOCK_CASES.filter((c) => c.status === 'pending').length,
    closed: MOCK_CASES.filter((c) => c.status === 'closed').length,
  }), []);

  const tabs: { key: CaseStatus | 'all'; label: string; count: number }[] = [
    { key: 'all', label: 'الكل', count: counts.all },
    { key: 'active', label: 'نشطة', count: counts.active },
    { key: 'pending', label: 'انتظار', count: counts.pending },
    { key: 'closed', label: 'مُغلقة', count: counts.closed },
  ];

  return (
    <div className={`p-6 md:p-8 max-w-[1200px] mx-auto ${isDark ? "text-white" : "text-zinc-900"}`} dir="rtl" suppressHydrationWarning>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-brand)' }}>قضاياي</h1>
          <p className={`text-sm mt-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>متابعة كاملة لكل قضاياك في مكان واحد</p>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => setShowNewCase(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#0a3328] transition-colors self-start md:self-auto"
        >
          <PlusCircle size={18} weight="bold" />
          قضية جديدة
        </motion.button>
      </div>

      {/* New Case Modal */}
      <AnimatePresence>
        {showNewCase && <NewCaseModal onClose={() => setShowNewCase(false)} />}
      </AnimatePresence>

      {/* Filters & Search */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-4 mb-8">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <MagnifyingGlass size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالعنوان، رقم القضية أو المحامي..."
            className={`w-full pr-10 pl-4 py-3 text-sm rounded-2xl border outline-none transition-all ${
              isDark 
                ? "bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-[#0B3D2E] focus:bg-zinc-900" 
                : "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/5"
            }`}
          />
        </div>
        
        {/* Status tabs */}
        <div className={`flex items-center gap-1.5 p-1.5 rounded-2xl overflow-x-auto ${isDark ? "bg-white/5" : "bg-zinc-100"}`}>
          {tabs.map((tab) => {
            const isActive = filter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
                  isActive 
                    ? isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-white text-zinc-900 shadow-sm" 
                    : isDark ? "text-zinc-400 hover:text-white hover:bg-white/5" : "text-zinc-500 hover:text-zinc-900 hover:bg-white/50"
                }`}
              >
                {isActive && (
                  <motion.div layoutId="casesTabActive" className={`absolute inset-0 rounded-xl ${isDark ? "bg-zinc-800" : "bg-white"} shadow-sm -z-10`} />
                )}
                {tab.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  isActive 
                    ? "bg-[#0B3D2E]/10 text-[#0B3D2E] dark:bg-emerald-500/20 dark:text-emerald-400" 
                    : isDark ? "bg-white/10 text-zinc-400" : "bg-zinc-200 text-zinc-500"
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cases Grid */}
      <AnimatePresence mode="popLayout">
        {filtered.length > 0 ? (
          <motion.div
            key="grid"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch"
          >
            {filtered.map((c, i) => (
              <CaseCard key={c.id} c={c} index={i} isDark={isDark} />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`flex flex-col items-center justify-center py-24 px-6 text-center rounded-[2.5rem] border border-dashed ${
              isDark ? "border-white/10 bg-white/[0.02]" : "border-zinc-200 bg-zinc-50/50"
            }`}
          >
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-5 shadow-inner ${
              isDark ? "bg-white/5 text-zinc-600" : "bg-white border border-zinc-100 text-zinc-300"
            }`}>
              <Scales size={36} weight="duotone" />
            </div>
            <p className={`text-lg font-bold mb-2 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>لا توجد قضايا مطابقة</p>
            <p className={`text-sm mb-6 max-w-sm ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
              لم نعثر على أي قضية تطابق بحثك المحدّد أو هذا الفلتر. جرب تغيير كلمات البحث أو أضف قضية جديدة.
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowNewCase(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#0a3328] transition-colors"
            >
              افتح قضية جديدة
              <ArrowUpRight size={16} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
