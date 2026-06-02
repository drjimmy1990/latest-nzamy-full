'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  Briefcase,
  Money,
  UserCircleMinus,
  FileText,
  ArrowLeft,
  CalendarCheck,
  Warning,
  CheckCircle,
  Clock,
  Shield,
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

const rights = [
  { icon: Money, title: 'مكافأة نهاية الخدمة', desc: 'احسب مكافأتك القانونية وقيّم عدالة ما قُدِّم بدقة' },
  { icon: UserCircleMinus, title: 'الفصل التعسفي', desc: 'تحليل ظروف الفصل وتحديد أحقيتك في التعويض' },
  { icon: Clock, title: 'الإجازات والبدلات', desc: 'إجازات سنوية + رواتب متأخرة + بدل سكن + انتقال' },
  { icon: FileText, title: 'مخالفات العقد', desc: 'حماية حقوقك عند تغيير بنود العقد أو تخفيض الراتب' },
  { icon: Shield, title: 'إصابات العمل', desc: 'التعويض عن الإصابات والأمراض المهنية الناجمة عن العمل' },
  { icon: Briefcase, title: 'الأنظمة الوزارية', desc: 'تتبع مستحقاتك وفق آخر تعديلات نظام العمل السعودي ١٤٤٦' },
];

const stats = [
  { value: '٩٣٪', label: 'نسبة القضايا لصالح العمال' },
  { value: '١٨ يوماً', label: 'متوسط وقت التسوية' },
  { value: '+٦٨٠', label: 'قضية عمالية مُحلّة' },
];

export default function LaborServicePage() {
  return (
    <main className="min-h-[100dvh] bg-surface pt-24 pb-20" dir="rtl" lang="ar">

      {/* ── Hero ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 grid grid-cols-1 lg:grid-cols-[55%_45%] gap-12 items-center min-h-[58vh]">
        <div className="space-y-7">
          <FadeUp>
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-gold px-3 py-1 rounded-full border border-gold/30 bg-gold/5">
              نظام العمل السعودي
            </span>
          </FadeUp>
          <FadeUp delay={0.07}>
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-tight leading-[1.1] text-ink" style={{ fontFamily: 'var(--font-brand)' }}>
              حقوقك العمالية
              <br />
              <span className="text-royal">لن تضيع بعد اليوم.</span>
            </h1>
          </FadeUp>
          <FadeUp delay={0.12}>
            <p className="text-ink-muted text-lg leading-relaxed max-w-[52ch]">
              نحلل عقد عملك وظروف نزاعك وفق آخر أحكام المحاكم العمالية — وننسّق محامياً متخصصاً في حقوق العمال خلال ٢٤ ساعة.
            </p>
          </FadeUp>
          <FadeUp delay={0.18}>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-6 py-3 bg-royal text-white rounded-xl text-sm font-semibold transition-all duration-300 hover:-translate-y-[2px] hover:bg-royal-light active:scale-[0.98]"
              >
                قيّم قضيتي مجاناً
                <CalendarCheck size={18} weight="bold" />
              </Link>
              <Link
                href="/ai/consult"
                className="inline-flex items-center gap-2 px-6 py-3 border border-slate-200 text-ink rounded-xl text-sm font-semibold transition-all duration-300 hover:border-royal/30 hover:bg-royal/5 active:scale-[0.98]"
              >
                استشر AI قانوني
              </Link>
            </div>
          </FadeUp>
        </div>

        {/* Stats column */}
        <FadeUp delay={0.22}>
          <div className="grid grid-cols-1 gap-4">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className="flex items-center gap-5 p-5 rounded-2xl border border-slate-200/80 bg-white hover:border-royal/20 transition-colors"
              >
                <span className="text-4xl font-bold text-royal tracking-tight" style={{ fontFamily: 'var(--font-mono)' }}>
                  {s.value}
                </span>
                <span className="text-ink-muted text-sm leading-snug">{s.label}</span>
              </div>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* ── Warning Banner ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-20">
        <FadeUp>
          <div className="flex items-start gap-4 p-5 rounded-2xl bg-amber-50 border border-amber-200">
            <Warning size={22} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-800 mb-1">مهلة قانونية تنتهي</p>
              <p className="text-amber-700 text-sm leading-relaxed">
                وفق نظام العمل السعودي، مدة تقادم الحقوق العمالية <strong>١٢ شهراً</strong> من تاريخ المطالبة الأولى. لا تؤجل.
              </p>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* ── Rights Grid ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-20">
        <FadeUp>
          <h2 className="text-2xl font-bold text-ink mb-10" style={{ fontFamily: 'var(--font-brand)' }}>
            الحقوق التي نساعدك في استردادها
          </h2>
        </FadeUp>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-slate-200 rounded-2xl overflow-hidden divide-y divide-x divide-slate-200 md:grid-rows-2">
          {rights.map((r, i) => (
            <FadeUp key={r.title} delay={i * 0.06}>
              <div className="group p-6 bg-white hover:bg-royal/3 transition-colors h-full">
                <div className="w-9 h-9 rounded-xl bg-royal/8 flex items-center justify-center mb-4 group-hover:bg-royal/15 transition-colors">
                  <r.icon size={18} className="text-royal" />
                </div>
                <h3 className="font-semibold text-ink text-sm mb-1.5">{r.title}</h3>
                <p className="text-ink-muted text-xs leading-relaxed">{r.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-20">
        <FadeUp>
          <div className="rounded-3xl bg-royal p-12 md:p-16 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #C8A762 0%, transparent 60%)' }} />
            <div className="relative z-[1] flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={20} className="text-gold" />
                  <span className="text-gold text-sm font-semibold">استشارة مجانية — بدون التزام</span>
                </div>
                <h2 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-brand)' }}>
                  اعرف حقوقك الآن
                </h2>
                <p className="text-white/70 text-sm max-w-[40ch]">
                  أجب على ٤ أسئلة فقط — وسيُخبرك AI قانوني بما تستحقه فوراً.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/ai/analyze-strength"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-gold text-royal font-semibold rounded-xl text-sm transition-all hover:-translate-y-[2px] hover:bg-gold-light active:scale-[0.98]"
                >
                  حلل قضيتي
                  <ArrowLeft size={18} weight="bold" />
                </Link>
                <Link
                  href="/lawyers/browse"
                  className="inline-flex items-center gap-2 px-7 py-3.5 border border-white/20 text-white rounded-xl text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  تصفح محامين عماليين
                </Link>
              </div>
            </div>
          </div>
        </FadeUp>
      </section>

    </main>
  );
}