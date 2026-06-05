'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import Link from 'next/link';
import { SkeletonList } from '../_components/DashboardSkeleton';
import {
  FileText, Pen, CheckCircle, Clock, WarningCircle, PlusCircle, MagnifyingGlass,
  ArrowUpRight, FolderOpen, CalendarBlank, ArrowRight, ClockClockwise, SealCheck,
  UserCircle, DotOutline, ArrowDown, Eye, PencilSimple, X, Robot,
} from '@phosphor-icons/react';
import { listClientWorkflowRequests } from '@/lib/clientWorkflowRepository';
import type { WorkflowRequest } from '@/lib/workflowStore';
import { useTheme } from '@/components/ThemeProvider';
import { useUser } from '@/hooks/useUser';

type ContractStatus = 'active' | 'pending_signature' | 'expired' | 'draft';

interface ActivityEvent {
  id: string;
  type: 'created' | 'signed' | 'viewed' | 'expired' | 'revised' | 'ai_analyzed' | 'sent';
  actor: string;
  actorRole: 'client' | 'lawyer' | 'system' | 'ai';
  message: string;
  date: string;
  contractId: string;
}

interface Contract {
  id: string;
  title: string;
  party: string;
  type: string;
  status: ContractStatus;
  signedAt: string | null;
  expiresAt: string | null;
  value: string | null;
}


const activityTypeConfig: Record<ActivityEvent['type'], { icon: typeof CheckCircle; color: string; bg: string; darkColor: string; darkBg: string }> = {
  created: { icon: PlusCircle, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', darkColor: 'text-blue-400', darkBg: 'bg-blue-900/30 border-blue-700/50' },
  signed: { icon: SealCheck, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', darkColor: 'text-emerald-400', darkBg: 'bg-emerald-900/30 border-emerald-700/50' },
  viewed: { icon: Eye, color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', darkColor: 'text-zinc-400', darkBg: 'bg-white/5 border-white/10' },
  expired: { icon: WarningCircle, color: 'text-red-500', bg: 'bg-red-50 border-red-200', darkColor: 'text-red-400', darkBg: 'bg-red-900/30 border-red-700/50' },
  revised: { icon: PencilSimple, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', darkColor: 'text-amber-400', darkBg: 'bg-amber-900/30 border-amber-700/50' },
  ai_analyzed: { icon: Robot, color: 'text-[#0B3D2E]', bg: 'bg-[#0B3D2E]/5 border-[#0B3D2E]/20', darkColor: 'text-emerald-400', darkBg: 'bg-[#0B3D2E]/50 border-emerald-500/30' },
  sent: { icon: ArrowRight, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200', darkColor: 'text-purple-400', darkBg: 'bg-purple-900/30 border-purple-700/50' },
};

const actorRoleColors: Record<ActivityEvent['actorRole'], { light: string; dark: string }> = {
  client: { light: 'bg-emerald-100 text-emerald-700', dark: 'bg-emerald-900/40 text-emerald-400' },
  lawyer: { light: 'bg-blue-100 text-blue-700', dark: 'bg-blue-900/40 text-blue-400' },
  system: { light: 'bg-slate-100 text-slate-600', dark: 'bg-white/10 text-zinc-400' },
  ai: { light: 'bg-[#0B3D2E]/10 text-[#0B3D2E]', dark: 'bg-emerald-500/20 text-emerald-400' },
};

const statusConfig: Record<ContractStatus, { label: string; lightBadge: string; darkBadge: string; icon: typeof CheckCircle }> = {
  active: { label: 'ساري', lightBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200', darkBadge: 'bg-emerald-900/30 text-emerald-400 border-emerald-700/50', icon: CheckCircle },
  pending_signature: { label: 'بانتظار التوقيع', lightBadge: 'bg-amber-50 text-amber-700 border-amber-200', darkBadge: 'bg-amber-900/30 text-amber-400 border-amber-700/50', icon: Pen },
  expired: { label: 'منتهي', lightBadge: 'bg-red-50 text-red-600 border-red-200', darkBadge: 'bg-red-900/30 text-red-400 border-red-700/50', icon: WarningCircle },
  draft: { label: 'مسودة', lightBadge: 'bg-slate-100 text-slate-600 border-slate-200', darkBadge: 'bg-white/5 text-gray-400 border-white/10', icon: FileText },
};

function ActivityTimeline({ events, isDark }: { events: ActivityEvent[]; isDark: boolean }) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center py-10 gap-3 text-center">
        <ClockClockwise size={28} className={isDark ? "text-zinc-600" : "text-zinc-300"} />
        <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>لا يوجد سجل نشاط لهذا العقد</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className={`absolute right-4 top-0 bottom-0 w-px ${isDark ? "bg-white/10" : "bg-zinc-200"}`} />

      <div className="space-y-3 pr-12">
        {events.map((event, i) => {
          const cfg = activityTypeConfig[event.type];
          const Icon = cfg.icon;
          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="relative flex items-start gap-4 py-1"
            >
              {/* Icon */}
              <div className={`absolute -right-[2.85rem] w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${isDark ? cfg.darkBg : cfg.bg}`}>
                <Icon size={14} className={isDark ? cfg.darkColor : cfg.color} weight="fill" />
              </div>

              {/* Box */}
              <div className={`flex-1 min-w-0 border rounded-xl px-4 py-3 transition-colors ${
                isDark ? "bg-zinc-900/50 border-white/5 hover:bg-zinc-800" : "bg-white border-zinc-100 hover:border-zinc-200"
              }`}>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className={`text-[13px] leading-snug font-medium ${isDark ? "text-zinc-200" : "text-zinc-800"}`}>{event.message}</p>
                  <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold ${isDark ? actorRoleColors[event.actorRole].dark : actorRoleColors[event.actorRole].light}`}>
                    {event.actor}
                  </span>
                </div>
                <p className={`text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-400"}`}>{event.date}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function ContractCard({ c, isSelected, onClick, index, isDark }: { c: Contract; isSelected: boolean; onClick: () => void; index: number; isDark: boolean }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const cfg = statusConfig[c.status];
  const StatusIcon = cfg.icon;

  return (
    <motion.div
      ref={ref}
      layoutId={`contract-${c.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 100, damping: 20 }}
      onClick={onClick}
      className={`group p-5 rounded-2xl border cursor-pointer transition-all duration-300 ${
        isSelected
          ? isDark 
            ? 'bg-[#0B3D2E]/20 border-[#0B3D2E] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' 
            : 'border-[#0B3D2E]/40 bg-[#0B3D2E]/5 shadow-[0_0_0_2px_rgba(11,61,46,0.12)]'
          : isDark
            ? 'bg-zinc-900/50 border-white/10 hover:bg-zinc-800/80 hover:border-white/20'
            : 'border-zinc-200 bg-white hover:border-[#0B3D2E]/20 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isSelected 
              ? isDark ? 'bg-[#0B3D2E]/40' : 'bg-[#0B3D2E]/10' 
              : isDark ? 'bg-white/5' : 'bg-[#0B3D2E]/5'
          }`}>
            <FileText size={18} weight={isSelected ? "fill" : "duotone"} className={isDark ? "text-emerald-400" : "text-[#0B3D2E]"} />
          </div>
          <p className={`font-bold text-[14px] truncate ${isDark ? "text-white" : "text-zinc-900"}`}>{c.title}</p>
        </div>
        <span className={`flex-shrink-0 inline-flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full border font-bold ${isDark ? cfg.darkBadge : cfg.lightBadge}`}>
          <StatusIcon size={12} weight="fill" />
          {cfg.label}
        </span>
      </div>
      <div className={`flex items-center justify-between text-xs font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
        <span>{c.party}</span>
        {c.expiresAt && (
          <span className={`flex items-center gap-1 ${c.status === 'expired' ? isDark ? 'text-red-400' : 'text-red-500' : ''}`}>
            <CalendarBlank size={12} />
            {c.expiresAt}
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default function ClientContractsPage() {
  const { isDark } = useTheme();
  const user = useUser();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ContractStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>('1');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const toContract = (request: WorkflowRequest): Contract => ({
      id: request.id,
      title: request.title,
      party: request.requester.name || 'العميل',
      type: String(request.metadata?.contractType ?? 'مسودة AI'),
      status: 'draft',
      signedAt: null,
      expiresAt: null,
      value: request.payment.amount ? `${request.payment.amount} ر.س` : null,
    });
    const toActivity = (request: WorkflowRequest): ActivityEvent => ({
      id: `act-${request.id}`,
      type: 'created',
      actor: 'نظامي AI',
      actorRole: 'ai',
      message: `تم إنشاء مسودة: ${request.title}`,
      date: request.createdAt || '',
      contractId: request.id,
    });
    listClientWorkflowRequests({ requesterUserId: user.userId })
      .then((requests) => {
        const drafts = requests.filter((r) => r.type === 'ai_draft');
        const mapped = drafts.map(toContract);
        const activities = drafts.map(toActivity);
        setContracts(mapped);
        setActivityLog(activities);
        if (mapped.length) setSelectedId(mapped[0]?.id ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user.userId]);

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      const matchFilter = filter === 'all' || c.status === filter;
      const matchSearch = c.title.includes(search) || c.party.includes(search);
      return matchFilter && matchSearch;
    });
  }, [contracts, filter, search]);

  // Fix stale state bug: if the selected contract is no longer in the filtered list, deselect it.
  useEffect(() => {
    if (selectedId && !filtered.find(c => c.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  const selectedContract = contracts.find((c) => c.id === selectedId) ?? null;
  const selectedActivity = activityLog.filter((e) => e.contractId === selectedId);

  const tabs: { key: ContractStatus | 'all'; label: string }[] = [
    { key: 'all', label: 'الكل' },
    { key: 'active', label: 'سارية' },
    { key: 'pending_signature', label: 'انتظار' },
    { key: 'expired', label: 'منتهية' },
    { key: 'draft', label: 'مسودات' },
  ];

  if (loading) return <div className="p-6 md:p-8 max-w-[1300px] mx-auto" dir="rtl"><SkeletonList count={4} /></div>;

  return (
    <div className={`p-6 md:p-8 max-w-[1300px] mx-auto ${isDark ? "text-white" : "text-zinc-900"}`} dir="rtl" suppressHydrationWarning>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight" style={{ fontFamily: 'var(--font-brand)' }}>عقودي</h1>
          <p className={`text-sm mt-1.5 ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>متابعة العقود + سجل كامل لكل إجراء</p>
        </div>
        <Link
          href="/ai/contract-drafter"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0B3D2E] text-white rounded-xl text-sm font-bold shadow-md hover:bg-[#0a3328] transition-colors self-start md:self-auto"
        >
          <PlusCircle size={18} weight="bold" />
          محترف العقود لايت
        </Link>
      </div>

      {/* Pending signature alert */}
      {contracts.some((c) => c.status === 'pending_signature') && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-4 p-5 mb-8 rounded-2xl border shadow-sm ${
            isDark ? "bg-amber-900/20 border-amber-500/30 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isDark ? "bg-amber-500/20" : "bg-amber-200"}`}>
            <Pen size={18} className={isDark ? "text-amber-400" : "text-amber-700"} weight="fill" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">عقد بانتظار توقيعك</p>
            <p className={`text-xs mt-0.5 ${isDark ? "text-amber-400/80" : "text-amber-700/80"}`}>يوجد لديك عقد بانتظار توقيعك. يرجى المراجعة والتوقيع.</p>
          </div>
          <button className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-colors ${
            isDark ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300" : "bg-amber-200 hover:bg-amber-300 text-amber-800"
          }`}>
            عرض <ArrowUpRight size={14} weight="bold" />
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6">

        {/* ── Left: Contract List ── */}
        <div>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <div className="relative flex-1">
              <MagnifyingGlass size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 ${isDark ? "text-zinc-500" : "text-zinc-400"}`} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث بالعنوان أو الطرف الآخر…"
                className={`w-full pr-10 pl-4 py-3 text-sm rounded-2xl border outline-none transition-all ${
                  isDark 
                    ? "bg-zinc-900/50 border-white/10 text-white placeholder:text-zinc-600 focus:border-[#0B3D2E]" 
                    : "bg-white border-zinc-200 text-zinc-900 placeholder:text-zinc-400 focus:border-[#0B3D2E] focus:ring-4 focus:ring-[#0B3D2E]/5"
                }`}
              />
            </div>
            <div className={`flex items-center gap-1 p-1.5 rounded-2xl overflow-x-auto ${isDark ? "bg-white/5" : "bg-zinc-100"}`}>
              {tabs.map((tab) => {
                const isActive = filter === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setFilter(tab.key)}
                    className={`relative px-4 py-2 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap ${
                      isActive 
                        ? isDark ? "bg-zinc-800 text-white shadow-sm" : "bg-white text-zinc-900 shadow-sm" 
                        : isDark ? "text-zinc-400 hover:text-white" : "text-zinc-500 hover:text-zinc-900"
                    }`}
                  >
                    {isActive && <motion.div layoutId="contractTabActive" className={`absolute inset-0 rounded-xl ${isDark ? "bg-zinc-800" : "bg-white"} shadow-sm -z-10`} />}
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Contracts */}
          <AnimatePresence mode="wait">
            {filtered.length > 0 ? (
              <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                {filtered.map((c, i) => (
                  <ContractCard
                    key={c.id} c={c} index={i}
                    isSelected={selectedId === c.id}
                    onClick={() => setSelectedId(c.id === selectedId ? null : c.id)}
                    isDark={isDark}
                  />
                ))}
              </motion.div>
            ) : (
              <motion.div key="empty" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} 
                className={`flex flex-col items-center py-20 px-5 gap-4 text-center rounded-[2.5rem] border border-dashed ${isDark ? "border-white/10 bg-white/[0.02]" : "border-zinc-200 bg-zinc-50/50"}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-inner ${isDark ? "bg-white/5 text-zinc-600" : "bg-white border border-zinc-100 text-zinc-300"}`}>
                  <FolderOpen size={32} weight="duotone" />
                </div>
                <div>
                  <p className={`text-lg font-bold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>لا توجد عقود</p>
                  <p className={`text-sm ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>لم نعثر على عقود تطابق بحثك أو الفلتر المحدد.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right: Activity Log ── */}
        <div className="lg:sticky lg:top-8 lg:self-start">
          <AnimatePresence mode="wait">
            {selectedContract ? (
              <motion.div
                key={selectedContract.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.3, type: "spring", stiffness: 100, damping: 20 }}
                className={`rounded-[2rem] border overflow-hidden shadow-lg ${isDark ? "bg-zinc-900/80 border-white/10 backdrop-blur-xl" : "bg-white border-zinc-200"}`}
              >
                {/* Header */}
                <div className={`p-6 border-b ${isDark ? "border-white/10 bg-white/5" : "border-zinc-100 bg-zinc-50/50"}`}>
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <span className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 block ${isDark ? "text-emerald-400" : "text-[#0B3D2E]"}`}>تفاصيل العقد</span>
                      <h3 className={`font-black text-lg leading-snug ${isDark ? "text-white" : "text-zinc-900"}`}>{selectedContract.title}</h3>
                    </div>
                    <button
                      onClick={() => setSelectedId(null)}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${isDark ? "text-zinc-400 hover:text-white hover:bg-white/10" : "text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"}`}
                    >
                      <X size={16} weight="bold" />
                    </button>
                  </div>

                  {/* Contract meta */}
                  <div className={`grid grid-cols-2 gap-3 text-[13px] font-medium ${isDark ? "text-zinc-400" : "text-zinc-500"}`}>
                    {selectedContract.value && (
                      <div className={`col-span-2 flex items-center justify-between py-2.5 border-b ${isDark ? "border-white/5" : "border-zinc-100"}`}>
                        <span>قيمة العقد</span>
                        <span className={`font-mono font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>{selectedContract.value}</span>
                      </div>
                    )}
                    {selectedContract.expiresAt && (
                      <div className="col-span-2 flex items-center justify-between py-2">
                        <span className="flex items-center gap-1.5"><CalendarBlank size={14} /> تاريخ الانتهاء</span>
                        <span className={selectedContract.status === 'expired' ? 'text-red-500 font-bold' : isDark ? 'text-white' : 'text-zinc-900'}>{selectedContract.expiresAt}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                {selectedContract.status === 'pending_signature' && (
                  <div className={`px-6 py-4 border-b ${isDark ? "bg-amber-900/20 border-white/5" : "bg-amber-50 border-amber-100"}`}>
                    <button className="w-full flex items-center justify-center gap-2 py-3 bg-amber-600 text-white rounded-xl text-[13px] font-bold shadow-md hover:bg-amber-700 transition-colors">
                      <Pen size={16} weight="fill" />
                      وقّع العقد الآن
                    </button>
                  </div>
                )}

                {/* Timeline */}
                <div className="p-6 h-[400px] overflow-y-auto custom-scrollbar">
                  <div className="flex items-center gap-2 mb-6">
                    <ClockClockwise size={18} className={isDark ? "text-emerald-400" : "text-[#0B3D2E]"} weight="bold" />
                    <span className={`text-[13px] font-bold ${isDark ? "text-white" : "text-zinc-900"}`}>سجل الإجراءات ({selectedActivity.length})</span>
                  </div>
                  <ActivityTimeline events={selectedActivity} isDark={isDark} />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`rounded-[2rem] border border-dashed p-10 text-center flex flex-col items-center justify-center h-[500px] ${
                  isDark ? "border-white/10 bg-white/[0.02]" : "border-zinc-200 bg-zinc-50/50"
                }`}
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDark ? "bg-white/5 text-zinc-600" : "bg-white border text-zinc-300"}`}>
                  <ClockClockwise size={28} weight="duotone" />
                </div>
                <p className={`text-sm font-bold mb-1 ${isDark ? "text-zinc-300" : "text-zinc-700"}`}>اختر عقداً</p>
                <p className={`text-xs ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>سيظهر هنا سجل النشاط الكامل للعقد المحدد</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
