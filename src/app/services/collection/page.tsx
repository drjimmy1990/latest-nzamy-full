'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  Money,
  MagnifyingGlass,
  Handshake,
  Clock,
  ArrowLeft,
  CalendarCheck,
  ArrowDown,
  CheckCircle,
} from '@phosphor-icons/react';

const FadeUp = ({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.52, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
};

const approaches = [
  {
    icon: MagnifyingGlass,
    step: '01',
    title: 'تحليل الديون والمستحقات',
    desc: 'مراجعة قانونية كاملة لمستحقاتك: فواتير + عقود + ضمانات',
  },
  {
    icon: Handshake,
    step: '02',
    title: 'التسوية الودية أولاً',
    desc: 'محاولة التسوية دون محاكم — توفير وقت ومال بمفاوضة احترافية',
  },
  {
    icon: Clock,
    step: '03',
    title: 'التقاضي إذا لزم',
    desc: 'رفع دعوى فورية عند الرفض — مع تمثيل كامل أمام المحكمة',
  },
  {
    icon: Money,
    step: '04',
    title: 'التحصيل الفعلي',
    desc: 'متابعة تنفيذ الحكم واسترداد المبلغ — لا نُغلق الملف إلا بعد التحصيل',
  },
];

const types = [
  'فواتير تجارية متأخرة',
  'قروض وسندات إذنية',
  'إيجارات متأخرة',
  'مستحقات مقاولين',
  'ضمانات بنكية',
  'شيكات مرتجعة',
];

export default function CollectionServicePage() {
  return (
    <main className="min-h-[100dvh] bg-surface pt-24 pb-20" dir="rtl" lang="ar">

      {/* ── Hero ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center min-h-[55vh]">
        <div className="space-y-7">
          <FadeUp>
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-gold px-3 py-1 rounded-full border border-gold/30 bg-gold/5">
              تحصيل الديون وتسوية النزاعات
            </span>
          </FadeUp>
          <FadeUp delay={0.07}>
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-tight leading-[1.1] text-ink" style={{ fontFamily: 'var(--font-brand)' }}>
              أموالك تعود إليك
              <br />
              <span className="text-royal">بلا تعقيد.</span>
            </h1>
          </FadeUp>
          <FadeUp delay={0.12}>
            <p className="text-ink-muted text-lg leading-relaxed max-w-[50ch]">
              نبدأ بالتسوية الودية لتوفير وقتك — وإذا رفض المدين، نرفع الدعوى فوراً ونتولى التنفيذ حتى آخر ريال.
            </p>
          </FadeUp>
          <FadeUp delay={0.17}>
            <div className="flex flex-wrap gap-3 items-center pt-2">
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-6 py-3 bg-royal text-white rounded-xl text-sm font-semibold transition-all hover:-translate-y-[2px] hover:bg-royal-light active:scale-[0.98]"
              >
                قيّم الدين مجاناً
                <CalendarCheck size={18} weight="bold" />
              </Link>
              <div className="flex items-center gap-2 text-ink-muted text-sm">
                <ArrowDown size={18} className="text-green-600" />
                <span>عمولة فقط عند النجاح</span>
              </div>
            </div>
          </FadeUp>
        </div>

        {/* Metric column */}
        <FadeUp delay={0.2}>
          <div className="space-y-4">
            <div className="p-7 rounded-2xl bg-royal text-white relative overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 10%, #C8A762, transparent 60%)' }} />
              <p className="text-white/60 text-sm mb-1">نسبة التحصيل الناجح</p>
              <p className="text-6xl font-bold tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>٨٧٪</p>
              <p className="text-white/60 text-xs mt-2">من إجمالي الملفات المسلّمة في آخر ١٢ شهراً</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl border border-slate-200 bg-white">
                <p className="text-2xl font-bold text-ink tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>٢٣ يوماً</p>
                <p className="text-ink-muted text-xs mt-1">متوسط وقت التسوية الودية</p>
              </div>
              <div className="p-5 rounded-2xl border border-slate-200 bg-white">
                <p className="text-2xl font-bold text-ink tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>+١,٢٠٠</p>
                <p className="text-ink-muted text-xs mt-1">ملف دين تم إغلاقه</p>
              </div>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* ── Approach ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-24">
        <FadeUp>
          <h2 className="text-2xl font-bold text-ink mb-12" style={{ fontFamily: 'var(--font-brand)' }}>
            كيف نعمل على ملفك؟
          </h2>
        </FadeUp>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {approaches.map((a, i) => (
            <FadeUp key={a.step} delay={i * 0.08}>
              <div className="p-6 rounded-2xl border border-slate-200 bg-white hover:border-royal/25 hover:shadow-[0_8px_32px_-8px_rgba(11,61,46,0.1)] transition-all duration-300 h-full flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-royal/8 flex items-center justify-center">
                    <a.icon size={20} className="text-royal" />
                  </div>
                  <span className="text-sm font-bold text-ink-faint" style={{ fontFamily: 'var(--font-mono)' }}>{a.step}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-ink text-sm mb-2">{a.title}</h3>
                  <p className="text-ink-muted text-xs leading-relaxed">{a.desc}</p>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── Types ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-20">
        <FadeUp>
          <h2 className="text-2xl font-bold text-ink mb-8" style={{ fontFamily: 'var(--font-brand)' }}>
            أنواع الديون التي نتحصّلها
          </h2>
        </FadeUp>
        <FadeUp delay={0.07}>
          <div className="flex flex-wrap gap-3">
            {types.map((type) => (
              <span key={type} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 bg-white rounded-xl text-sm text-ink hover:border-royal/30 hover:bg-royal/3 transition-colors">
                <CheckCircle size={14} className="text-royal" weight="fill" />
                {type}
              </span>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-20">
        <FadeUp>
          <div className="rounded-3xl bg-royal p-12 md:p-16 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 90% 50%, #C8A762, transparent 60%)' }} />
            <div className="relative z-[1] max-w-xl">
              <h2 className="text-3xl font-bold text-white mb-3" style={{ fontFamily: 'var(--font-brand)' }}>
                لا تترك دينك للنسيان
              </h2>
              <p className="text-white/70 text-sm mb-8 leading-relaxed">
                سلّمنا ملفك اليوم — نُقيّمه مجاناً ونبدأ إجراءات التحصيل خلال ٤٨ ساعة.
              </p>
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-gold text-royal font-semibold rounded-xl text-sm transition-all hover:-translate-y-[2px] hover:bg-gold-light active:scale-[0.98]"
              >
                ابدأ التحصيل
                <ArrowLeft size={18} weight="bold" />
              </Link>
            </div>
          </div>
        </FadeUp>
      </section>

    </main>
  );
}