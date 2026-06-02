'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  EyeSlash,
  ShareNetwork,
  CheckCircle,
  Clock,
  UsersThree,
  LockSimple,
  ClockClockwise,
  Robot,
  FileText,
  Gavel,
  ArrowsClockwise,
  SealCheck,
  Link as LinkIcon,
  Copy,
  X,
  ShieldCheck,
  ArrowCounterClockwise,
  Lightning,
} from '@phosphor-icons/react';
import { useTheme } from '@/components/ThemeProvider';

// ─── Types ────────────────────────────────────────────────────────────────────

type ShareableItemType = 'task' | 'timeline' | 'document' | 'hearing' | 'update';

type TokenExpiry = '24h' | '72h' | '7d';

interface GuestToken {
  id: string;
  url: string;
  createdAt: string;
  expiresIn: TokenExpiry;
  scope: ('tasks' | 'hearings' | 'documents' | 'updates')[];
  active: boolean;
  views: number;
}

interface ShareableItem {
  id: string;
  type: ShareableItemType;
  title: string;
  status: 'done' | 'in_progress' | 'pending' | 'upcoming';
  date?: string;
  sharedWithClient: boolean;
  note?: string;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const SHAREABLE_ITEMS: ShareableItem[] = [
  {
    id: 't1',
    type: 'task',
    title: 'رفع لائحة الدعوى',
    status: 'done',
    date: '١ فبراير ٢٠٢٦',
    sharedWithClient: true,
    note: 'تم رفع اللائحة وتسجيلها بنجاح',
  },
  {
    id: 't2',
    type: 'task',
    title: 'إعداد المذكرة الجوابية',
    status: 'in_progress',
    date: '١٥ أبريل ٢٠٢٦',
    sharedWithClient: true,
  },
  {
    id: 't3',
    type: 'task',
    title: 'التفاوض مع الخصم',
    status: 'pending',
    sharedWithClient: false,
    note: 'داخلي — لا تشارك مع العميل',
  },
  {
    id: 'h1',
    type: 'hearing',
    title: 'جلسة الاستماع الأولى',
    status: 'done',
    date: '٢٠ مارس ٢٠٢٦',
    sharedWithClient: true,
    note: 'تمت الجلسة — القاضي طلب مذكرة إضافية',
  },
  {
    id: 'h2',
    type: 'hearing',
    title: 'جلسة المرافعة النهائية',
    status: 'upcoming',
    date: '٢٢ مايو ٢٠٢٦',
    sharedWithClient: true,
  },
  {
    id: 'd1',
    type: 'document',
    title: 'صورة عقد العمل المُقدَّم',
    status: 'done',
    date: '١٠ فبراير ٢٠٢٦',
    sharedWithClient: true,
  },
  {
    id: 'u1',
    type: 'update',
    title: 'تحديث: قبول الدعوى من المحكمة',
    status: 'done',
    date: '٥ مارس ٢٠٢٦',
    sharedWithClient: true,
  },
  {
    id: 'u2',
    type: 'update',
    title: 'ملاحظة داخلية — استراتيجية المرافعة',
    status: 'in_progress',
    sharedWithClient: false,
    note: 'سري — لا تُرسَل للعميل',
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<ShareableItemType, { icon: typeof CheckCircle; label: string; color: string }> = {
  task: { icon: CheckCircle, label: 'مهمة', color: 'text-blue-600' },
  timeline: { icon: ClockClockwise, label: 'جدول زمني', color: 'text-purple-600' },
  document: { icon: FileText, label: 'مستند', color: 'text-amber-600' },
  hearing: { icon: Gavel, label: 'جلسة', color: 'text-royal' },
  update: { icon: ArrowsClockwise, label: 'تحديث', color: 'text-emerald-600' },
};

const STATUS_CONFIG: Record<ShareableItem['status'], { label: string; dot: string }> = {
  done: { label: 'مكتملة', dot: 'bg-emerald-500' },
  in_progress: { label: 'جارية', dot: 'bg-blue-500' },
  pending: { label: 'معلّقة', dot: 'bg-slate-400' },
  upcoming: { label: 'قادمة', dot: 'bg-amber-500' },
};

// ─── Item Row ────────────────────────────────────────────────────────────────

function ItemRow({ item, onToggle }: { item: ShareableItem; onToggle: (id: string) => void }) {
  const type = TYPE_CONFIG[item.type];
  const status = STATUS_CONFIG[item.status];
  const Icon = type.icon;

  return (
    <motion.div
      layout
      className={`flex items-center gap-4 px-5 py-4 rounded-xl border transition-all ${
        item.sharedWithClient
          ? 'border-emerald-200 bg-emerald-50/50'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-white border border-slate-200`}>
        <Icon size={17} className={type.color} weight={item.status === 'done' ? 'fill' : 'regular'} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink truncate">{item.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          {item.date && <span className="text-[11px] text-ink-faint">· {item.date}</span>}
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${type.color} bg-white border border-slate-200`}>{type.label}</span>
        </div>
        {item.note && <p className="text-[11px] text-ink-muted mt-1 italic">{item.note}</p>}
      </div>

      <button
        onClick={() => onToggle(item.id)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
          item.sharedWithClient
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-200'
            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
        }`}
      >
        {item.sharedWithClient ? (
          <><Eye size={13} weight="fill" /> مشارك</>
        ) : (
          <><EyeSlash size={13} /> مخفي</>
        )}
      </button>
    </motion.div>
  );
}

// ─── Client View Preview ──────────────────────────────────────────────────────

function ClientViewPreview({ items }: { items: ShareableItem[] }) {
  const visible = items.filter((i) => i.sharedWithClient);

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
      {/* Mock browser chrome */}
      <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="flex-1 mx-3 py-1 px-3 rounded-lg bg-slate-100 text-[10px] text-slate-500 font-mono">
          نظامي · داشبورد العميل / قضاياي
        </div>
        <UsersThree size={14} className="text-slate-400" />
      </div>

      {/* Preview content */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <SealCheck size={16} className="text-royal" weight="fill" />
          <span className="text-sm font-bold text-ink">تحديثات القضية — ما يراه العميل</span>
          <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">
            {visible.length} عنصر مرئي
          </span>
        </div>

        {visible.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-3 text-center">
            <LockSimple size={22} className="text-ink-faint" />
            <p className="text-xs text-ink-muted">لم تشارك أي شيء مع العميل بعد</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visible.map((item) => {
              const type = TYPE_CONFIG[item.type];
              const status = STATUS_CONFIG[item.status];
              const Icon = type.icon;
              return (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200">
                  <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <Icon size={13} className={type.color} weight={item.status === 'done' ? 'fill' : 'regular'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-ink truncate">{item.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      <span className="text-[10px] text-ink-muted">{status.label}</span>
                      {item.date && <span className="text-[10px] text-ink-faint">· {item.date}</span>}
                    </div>
                  </div>
                  {item.status === 'done' && <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" weight="fill" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Guest Token Panel ───────────────────────────────────────────────────────────

const EXPIRY_LABELS: Record<TokenExpiry, string> = {
  '24h': '٢٤ ساعة',
  '72h': '٣ أيام',
  '7d':  '٧ أيام',
};

const SCOPE_OPTS: { key: GuestToken['scope'][number]; label: string }[] = [
  { key: 'tasks',     label: 'المهام' },
  { key: 'hearings',  label: 'الجلسات' },
  { key: 'documents', label: 'المستندات' },
  { key: 'updates',   label: 'التحديثات' },
];

function GuestTokenPanel({ isDark }: { isDark: boolean }) {
  const [token,    setToken]    = useState<GuestToken | null>(null);
  const [expiry,   setExpiry]   = useState<TokenExpiry>('72h');
  const [scope,    setScope]    = useState<GuestToken['scope']>(['tasks', 'hearings', 'updates']);
  const [copied,   setCopied]   = useState(false);
  const [creating, setCreating] = useState(false);

  const toggleScope = (s: GuestToken['scope'][number]) =>
    setScope(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const generateToken = async () => {
    setCreating(true);
    await new Promise(r => setTimeout(r, 900)); // simulate
    const tok: GuestToken = {
      id: Math.random().toString(36).slice(2, 10),
      url: `https://nzamy.sa/guest/case/1/${Math.random().toString(36).slice(2, 14)}`,
      createdAt: 'الآن',
      expiresIn: expiry,
      scope,
      active: true,
      views: 0,
    };
    setToken(tok);
    setCreating(false);
  };

  const copyUrl = () => {
    if (!token) return;
    navigator.clipboard.writeText(token.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revoke = () => setToken(null);

  const card = isDark
    ? 'rounded-2xl border border-white/[0.06] bg-zinc-900/60'
    : 'rounded-2xl border border-slate-100 bg-white shadow-sm';

  return (
    <div className={`${card} p-4 space-y-4`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
          isDark ? 'bg-teal-500/10' : 'bg-teal-50'
        }`}>
          <LinkIcon size={15} className="text-teal-500" weight="fill" />
        </div>
        <div>
          <p className={`text-[13px] font-bold ${isDark ? 'text-zinc-100' : 'text-slate-800'}`}>رابط مشاركة مؤقت</p>
          <p className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>Guest Access Token — مخصص وبمدة محددة</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!token ? (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {/* Expiry selector */}
            <div>
              <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>مدة الرابط</p>
              <div className={`flex gap-1 p-0.5 rounded-xl ${isDark ? 'bg-zinc-800' : 'bg-slate-100'}`}>
                {(['24h', '72h', '7d'] as TokenExpiry[]).map(e => (
                  <button key={e} onClick={() => setExpiry(e)}
                    className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                      expiry === e
                        ? isDark ? 'bg-zinc-700 text-white' : 'bg-white text-[#0B3D2E] shadow-sm'
                        : isDark ? 'text-zinc-500' : 'text-slate-400'
                    }`}>{EXPIRY_LABELS[e]}</button>
                ))}
              </div>
            </div>

            {/* Scope */}
            <div>
              <p className={`text-[10px] font-black uppercase tracking-wider mb-2 ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>نطاق الوصول (قراءة فقط)</p>
              <div className="flex flex-wrap gap-1.5">
                {SCOPE_OPTS.map(s => (
                  <button key={s.key} onClick={() => toggleScope(s.key)}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${
                      scope.includes(s.key)
                        ? 'bg-teal-500/10 text-teal-500 border-teal-500/30'
                        : isDark ? 'border-white/[0.07] text-zinc-600' : 'border-slate-200 text-slate-400'
                    }`}>{s.label}</button>
                ))}
              </div>
            </div>

            {/* Generate btn */}
            <button onClick={generateToken} disabled={scope.length === 0 || creating}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-500 text-white text-[12px] font-bold hover:bg-teal-600 transition-colors disabled:opacity-50">
              {creating ? (
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
                  <ArrowCounterClockwise size={13} />
                </motion.span>
              ) : <Lightning size={13} weight="fill" />}
              {creating ? 'جاري الإنشاء...' : 'إنشاء رابط مؤقت'}
            </button>

            <div className={`flex items-start gap-2 p-2.5 rounded-xl ${isDark ? 'bg-white/[0.03] border border-white/[0.06]' : 'bg-slate-50 border border-slate-100'}`}>
              <ShieldCheck size={12} className="text-teal-500 flex-shrink-0 mt-0.5" />
              <p className={`text-[10px] leading-relaxed ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>
                الرابط ينتهي تلقائياً بعد المدة المحددة — لا يتيح التعديل أو التحميل
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div key="token" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            {/* Active badge */}
            <div className="flex items-center gap-2">
              <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.8 }}
                className="w-2 h-2 rounded-full bg-teal-400" />
              <span className={`text-[11px] font-bold text-teal-500`}>رابط نشط — منتهي خلال {EXPIRY_LABELS[token.expiresIn]}</span>
            </div>

            {/* URL display */}
            <div className={`rounded-xl border p-3 ${
              isDark ? 'border-white/[0.08] bg-zinc-800' : 'border-slate-200 bg-slate-50'
            }`}>
              <p className={`text-[10px] font-mono break-all leading-relaxed mb-2 ${
                isDark ? 'text-zinc-400' : 'text-slate-500'
              }`}>{token.url}</p>
              <button onClick={copyUrl}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                  copied
                    ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                    : isDark ? 'bg-white/[0.06] text-zinc-300' : 'bg-white text-slate-600 border border-slate-200'
                }`}>
                {copied ? <CheckCircle size={12} weight="fill" /> : <Copy size={12} />}
                {copied ? 'تم النسخ' : 'نسخ الرابط'}
              </button>
            </div>

            {/* Scope display */}
            <div className="flex flex-wrap gap-1">
              {token.scope.map(s => (
                <span key={s} className="px-2 py-0.5 rounded-lg bg-teal-500/10 text-teal-500 text-[9px] font-bold border border-teal-500/20">
                  {SCOPE_OPTS.find(o => o.key === s)?.label}
                </span>
              ))}
              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold ${
                isDark ? 'bg-white/[0.05] text-zinc-500' : 'bg-slate-100 text-slate-400'
              }`}>قراءة فقط</span>
            </div>

            {/* Revoke */}
            <button onClick={revoke}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                isDark ? 'border-red-500/20 text-red-400 hover:bg-red-500/10' : 'border-red-200 text-red-500 hover:bg-red-50'
              }`}>
              <X size={12} weight="bold" />إلغاء الرابط فوراً
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LawyerCaseSharingPage({ caseId = '1' }: { caseId?: string }) {
  const { isDark } = useTheme();
  const [items, setItems] = useState<ShareableItem[]>(SHAREABLE_ITEMS);

  const toggle = (id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, sharedWithClient: !item.sharedWithClient } : item))
    );
  };

  const sharedCount = items.filter((i) => i.sharedWithClient).length;
  const totalCount = items.length;

  const typeGroups: Record<ShareableItemType, ShareableItem[]> = {
    task: items.filter((i) => i.type === 'task'),
    hearing: items.filter((i) => i.type === 'hearing'),
    document: items.filter((i) => i.type === 'document'),
    update: items.filter((i) => i.type === 'update'),
    timeline: items.filter((i) => i.type === 'timeline'),
  };

  return (
    <div className="p-6 md:p-8 max-w-[1300px] mx-auto" dir="rtl">

      {/* Header */}
      <div className="flex items-start justify-between gap-5 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShareNetwork size={20} className="text-royal" weight="fill" />
            <h1 className="text-xl font-bold text-ink" style={{ fontFamily: 'var(--font-brand)' }}>
              إدارة مشاركة القضية مع العميل
            </h1>
          </div>
          <p className="text-ink-muted text-sm">اختر ما يراه العميل من مهام وجلسات وتحديثات — التحديث فوري</p>
        </div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold ${sharedCount > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
          <Eye size={15} weight={sharedCount > 0 ? 'fill' : 'regular'} />
          {sharedCount} / {totalCount} مشارك مع العميل
        </div>
      </div>

      {/* Live sync badge */}
      <motion.div
        animate={{ opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2.5, repeat: Infinity }}
        className="flex items-center gap-2 text-xs text-emerald-600 mb-6 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl w-fit"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        مزامنة فورية — التغيير يظهر عند العميل فوراً
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-8">

        {/* ── Left: Lawyer Control Panel ── */}
        <div className="space-y-6">

          {/* Tasks */}
          {typeGroups.task.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={16} className="text-blue-600" />
                <h2 className="text-sm font-bold text-ink">المهام ({typeGroups.task.length})</h2>
              </div>
              <div className="space-y-2">
                {typeGroups.task.map((item) => <ItemRow key={item.id} item={item} onToggle={toggle} />)}
              </div>
            </section>
          )}

          {/* Hearings */}
          {typeGroups.hearing.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Gavel size={16} className="text-royal" />
                <h2 className="text-sm font-bold text-ink">الجلسات ({typeGroups.hearing.length})</h2>
              </div>
              <div className="space-y-2">
                {typeGroups.hearing.map((item) => <ItemRow key={item.id} item={item} onToggle={toggle} />)}
              </div>
            </section>
          )}

          {/* Documents */}
          {typeGroups.document.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-amber-600" />
                <h2 className="text-sm font-bold text-ink">المستندات ({typeGroups.document.length})</h2>
              </div>
              <div className="space-y-2">
                {typeGroups.document.map((item) => <ItemRow key={item.id} item={item} onToggle={toggle} />)}
              </div>
            </section>
          )}

          {/* Updates */}
          {typeGroups.update.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <ArrowsClockwise size={16} className="text-emerald-600" />
                <h2 className="text-sm font-bold text-ink">التحديثات ({typeGroups.update.length})</h2>
              </div>
              <div className="space-y-2">
                {typeGroups.update.map((item) => <ItemRow key={item.id} item={item} onToggle={toggle} />)}
              </div>
            </section>
          )}
        </div>

        {/* ── Right: Guest Token + Live Client View ── */}
        <div className="xl:sticky xl:top-6 xl:self-start space-y-4">

          {/* Guest Access Token */}
          <GuestTokenPanel isDark={isDark} />

          <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${
            isDark ? 'text-zinc-600' : 'text-slate-400'
          }`}>
            <UsersThree size={14} />
            معاينة كما يراه العميل الآن
          </div>
          <ClientViewPreview items={items} />

          {/* AI suggestion */}
          <div className="mt-4 p-4 rounded-xl border border-royal/20 bg-royal/5">
            <div className="flex items-start gap-3">
              <Robot size={16} className="text-royal flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-ink mb-1">اقتراح نظامي AI</p>
                <p className="text-[11px] text-ink-muted leading-relaxed">
                  "ملاحظة داخلية — استراتيجية المرافعة" مخفية. جيد — المعلومات الاستراتيجية يُفضّل إبقاؤها داخلية دائماً.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
