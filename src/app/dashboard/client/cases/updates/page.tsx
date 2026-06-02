'use client';

import { useRef } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  Clock,
  Gavel,
  FileText,
  ArrowsClockwise,
  CalendarBlank,
  SealCheck,
  Robot,
  Eye,
  ArrowLeft,
} from '@phosphor-icons/react';

type ItemType = 'task' | 'hearing' | 'document' | 'update';

interface SharedItem {
  id: string;
  type: ItemType;
  title: string;
  status: 'done' | 'in_progress' | 'pending' | 'upcoming';
  date?: string;
  note?: string;
  lawyerName: string;
}

const SHARED_FROM_LAWYER: SharedItem[] = [
  {
    id: 't1',
    type: 'task',
    title: 'رفع لائحة الدعوى',
    status: 'done',
    date: '١ فبراير ٢٠٢٦',
    note: 'تم رفع اللائحة وتسجيلها بنجاح',
    lawyerName: 'م. فيصل الغامدي',
  },
  {
    id: 't2',
    type: 'task',
    title: 'إعداد المذكرة الجوابية',
    status: 'in_progress',
    date: '١٥ أبريل ٢٠٢٦',
    lawyerName: 'م. فيصل الغامدي',
  },
  {
    id: 'h1',
    type: 'hearing',
    title: 'جلسة الاستماع الأولى',
    status: 'done',
    date: '٢٠ مارس ٢٠٢٦',
    note: 'تمت الجلسة — القاضي طلب مذكرة إضافية',
    lawyerName: 'م. فيصل الغامدي',
  },
  {
    id: 'h2',
    type: 'hearing',
    title: 'جلسة المرافعة النهائية',
    status: 'upcoming',
    date: '٢٢ مايو ٢٠٢٦',
    lawyerName: 'م. فيصل الغامدي',
  },
  {
    id: 'd1',
    type: 'document',
    title: 'صورة عقد العمل المُقدَّم',
    status: 'done',
    date: '١٠ فبراير ٢٠٢٦',
    lawyerName: 'م. فيصل الغامدي',
  },
  {
    id: 'u1',
    type: 'update',
    title: 'تحديث: قبول الدعوى من المحكمة',
    status: 'done',
    date: '٥ مارس ٢٠٢٦',
    lawyerName: 'م. فيصل الغامدي',
  },
];

const TYPE_CONFIG: Record<ItemType, { icon: typeof CheckCircle; label: string; iconColor: string; bg: string }> = {
  task: { icon: CheckCircle, label: 'مهمة', iconColor: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
  hearing: { icon: Gavel, label: 'جلسة', iconColor: 'text-royal', bg: 'bg-royal/5 border-royal/20' },
  document: { icon: FileText, label: 'مستند', iconColor: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
  update: { icon: ArrowsClockwise, label: 'تحديث', iconColor: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
};

const STATUS_CONFIG: Record<SharedItem['status'], { label: string; dot: string; badge: string }> = {
  done: { label: 'مكتملة', dot: 'bg-emerald-500', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  in_progress: { label: 'جارية', dot: 'bg-blue-500', badge: 'text-blue-700 bg-blue-50 border-blue-200' },
  pending: { label: 'معلّقة', dot: 'bg-slate-400', badge: 'text-slate-600 bg-slate-50 border-slate-200' },
  upcoming: { label: 'قادمة', dot: 'bg-amber-500', badge: 'text-amber-700 bg-amber-50 border-amber-200' },
};

// Overall progress calculation
const progressSteps = SHARED_FROM_LAWYER;
const doneCount = progressSteps.filter((i) => i.status === 'done').length;
const progressPct = Math.round((doneCount / progressSteps.length) * 100);

function SharedItemCard({ item, index }: { item: SharedItem; index: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const type = TYPE_CONFIG[item.type];
  const status = STATUS_CONFIG[item.status];
  const Icon = type.icon;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`flex items-start gap-4 p-4 rounded-2xl border bg-white hover:shadow-[0_4px_18px_-6px_rgba(11,61,46,0.1)] transition-all duration-200`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${type.bg}`}>
        <Icon size={16} className={type.iconColor} weight={item.status === 'done' ? 'fill' : 'regular'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-ink text-sm">{item.title}</p>
          <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full border font-medium ${status.badge}`}>
            {status.label}
          </span>
        </div>
        {item.note && <p className="text-xs text-ink-muted mt-1 leading-relaxed">{item.note}</p>}
        <div className="flex items-center gap-3 mt-2 text-[11px] text-ink-faint">
          <span className={`px-1.5 py-0.5 rounded text-[10px] ${type.bg} ${type.iconColor} font-medium`}>{type.label}</span>
          {item.date && <span className="flex items-center gap-1"><CalendarBlank size={10} /> {item.date}</span>}
          <span className="flex items-center gap-1"><SealCheck size={10} className="text-royal" /> {item.lawyerName}</span>
        </div>
      </div>
      {item.status === 'done' && (
        <CheckCircle size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" weight="fill" />
      )}
    </motion.div>
  );
}

export default function ClientCaseUpdatesPage() {
  // Group by type
  const groups: Partial<Record<ItemType, SharedItem[]>> = {};
  for (const item of SHARED_FROM_LAWYER) {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type]!.push(item);
  }

  return (
    <div className="p-6 md:p-8 max-w-[900px] mx-auto" dir="rtl">

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <Eye size={18} className="text-royal" weight="fill" />
          <h1 className="text-xl font-bold text-ink" style={{ fontFamily: 'var(--font-brand)' }}>تحديثات قضيتي</h1>
        </div>
        <p className="text-ink-muted text-sm">كل ما شاركه محاميك معك — مباشرة وفوري</p>
      </div>

      {/* Progress bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-2xl border border-slate-200 bg-white mb-6"
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-ink">تقدّم القضية</p>
            <p className="text-xs text-ink-muted mt-0.5">{doneCount} من {progressSteps.length} خطوة مكتملة</p>
          </div>
          <span className="text-2xl font-bold text-royal" style={{ fontFamily: 'var(--font-mono)' }}>{progressPct}٪</span>
        </div>
        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 1, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="h-full rounded-full bg-gradient-to-l from-royal to-royal-light"
          />
        </div>
      </motion.div>

      {/* Upcoming alert */}
      {SHARED_FROM_LAWYER.some((i) => i.status === 'upcoming') && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-3 p-4 mb-6 rounded-xl bg-amber-50 border border-amber-200"
        >
          <Gavel size={16} className="text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <strong>جلسة قادمة:</strong> جلسة المرافعة النهائية — ٢٢ مايو ٢٠٢٦
          </p>
          <button className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1">
            تفاصيل <ArrowLeft size={12} />
          </button>
        </motion.div>
      )}

      {/* Grouped items */}
      <div className="space-y-8">
        {(Object.entries(groups) as [ItemType, SharedItem[]][]).map(([type, typeItems]) => {
          const cfg = TYPE_CONFIG[type];
          const TypeIcon = cfg.icon;
          return (
            <section key={type}>
              <div className="flex items-center gap-2 mb-4">
                <TypeIcon size={16} className={cfg.iconColor} />
                <h2 className="text-sm font-bold text-ink">{cfg.label === 'مهمة' ? 'المهام' : cfg.label === 'جلسة' ? 'الجلسات' : cfg.label === 'مستند' ? 'المستندات' : 'التحديثات'}</h2>
                <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full font-medium">{typeItems.length}</span>
              </div>
              <div className="space-y-3">
                {typeItems.map((item, i) => <SharedItemCard key={item.id} item={item} index={i} />)}
              </div>
            </section>
          );
        })}
      </div>

      {/* AI nudge */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="mt-10 p-5 rounded-2xl border border-royal/20 bg-royal/5 flex items-start gap-4"
      >
        <div className="w-9 h-9 rounded-xl bg-royal/15 flex items-center justify-center flex-shrink-0">
          <Robot size={18} className="text-royal" />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink mb-1">هل لديك سؤال عن مجريات قضيتك؟</p>
          <p className="text-xs text-ink-muted mb-3 leading-relaxed">
            المستشار القانوني AI يشرح لك كل خطوة بلغة مبسّطة.
          </p>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-royal text-white text-xs font-semibold rounded-xl hover:bg-royal-light transition-all hover:-translate-y-[1px]">
            اسأل عن قضيتي
            <ArrowLeft size={13} />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
