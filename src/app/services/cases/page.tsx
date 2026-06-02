'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  Scales,
  Gavel,
  FileText,
  Building,
  ArrowLeft,
  CalendarCheck,
  Shield,
  Clock,
  ChatsCircle,
} from '@phosphor-icons/react';

const services = [
  {
    icon: Building,
    title: 'قضايا الشركات',
    desc: 'حل النزاعات التجارية وقضايا الشركاء والعقود',
    tag: 'B2B',
  },
  {
    icon: FileText,
    title: 'قضايا العمالية',
    desc: 'الفصل التعسفي، المكافآت، وحقوق الموظفين',
    tag: 'الأكثر طلباً',
  },
  {
    icon: Shield,
    title: 'قضايا مدنية',
    desc: 'الديون، الضرر، والنزاعات العقارية',
    tag: 'متنوعة',
  },
  {
    icon: Gavel,
    title: 'قضايا جزائية',
    desc: 'التمثيل القانوني أمام النيابة والمحاكم الجزائية',
    tag: 'إلزامي',
  },
];

const steps = [
  { icon: ChatsCircle, label: 'حجز استشارة أولية' },
  { icon: FileText, label: 'رفع مستندات القضية' },
  { icon: CalendarCheck, label: 'تعيين محامٍ متخصص' },
  { icon: Scales, label: 'متابعة حتى الحكم' },
];

const FadeUp = ({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) => {
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

export default function CasesServicePage() {
  return (
    <main
      className="min-h-[100dvh] bg-surface pt-24 pb-20"
      dir="rtl"
      lang="ar"
    >
      {/* ── Hero ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center min-h-[60vh]">
        {/* Left content */}
        <div className="space-y-7">
          <FadeUp delay={0}>
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-gold px-3 py-1 rounded-full border border-gold/30 bg-gold/5">
              تمثيل قانوني احترافي
            </span>
          </FadeUp>

          <FadeUp delay={0.07}>
            <h1 className="text-[clamp(2rem,5vw,3.6rem)] font-bold tracking-tight leading-[1.1] text-ink" style={{ fontFamily: 'var(--font-brand)' }}>
              قضيتك تستحق
              <br />
              <span className="text-royal">محامياً ملتزماً.</span>
            </h1>
          </FadeUp>

          <FadeUp delay={0.12}>
            <p className="text-ink-muted text-lg leading-relaxed max-w-[52ch]">
              من الجلسة الأولى حتى صدور الحكم — نربطك بمحامٍ متخصص في نوع قضيتك، ويتابع كل تفصيلة بشكل مباشر عبر المنصة.
            </p>
          </FadeUp>

          <FadeUp delay={0.18}>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-6 py-3 bg-royal text-white rounded-xl text-sm font-semibold transition-all duration-300 hover:-translate-y-[2px] hover:bg-royal-light active:scale-[0.98]"
              >
                احجز استشارة مجانية
                <CalendarCheck size={18} weight="bold" />
              </Link>
              <Link
                href="/lawyers/browse"
                className="inline-flex items-center gap-2 px-6 py-3 border border-slate-200 text-ink rounded-xl text-sm font-semibold transition-all duration-300 hover:border-royal/30 hover:bg-royal/5 active:scale-[0.98]"
              >
                تصفح المحامين
              </Link>
            </div>
          </FadeUp>
        </div>

        {/* Right decorative */}
        <FadeUp delay={0.22}>
          <div className="relative rounded-3xl overflow-hidden shadow-[0_30px_80px_-20px_rgba(11,61,46,0.15)]">
            <img
              src="https://picsum.photos/seed/legal-court-ksa/800/560"
              alt="قاعة المحكمة"
              className="w-full h-[400px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-royal/60 via-royal/10 to-transparent" />
            <div className="absolute bottom-6 right-6 left-6 p-5 rounded-2xl backdrop-blur-sm bg-white/10 border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gold/20 border border-gold/30 flex items-center justify-center">
                  <Scales size={20} className="text-gold" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">+٤٢٠ قضية مُغلقة</p>
                  <p className="text-white/60 text-xs">في آخر ٦ أشهر</p>
                </div>
              </div>
            </div>
          </div>
        </FadeUp>
      </section>

      {/* ── Service Types ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-24">
        <FadeUp>
          <h2 className="text-2xl font-bold text-ink mb-10" style={{ fontFamily: 'var(--font-brand)' }}>
            أنواع القضايا التي نتولاها
          </h2>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {services.map((s, i) => (
            <FadeUp key={s.title} delay={i * 0.07}>
              <div className="group p-7 rounded-2xl border border-slate-200/80 bg-white hover:border-royal/30 hover:shadow-[0_8px_32px_-8px_rgba(11,61,46,0.12)] transition-all duration-300 flex gap-5 items-start">
                <div className="w-11 h-11 rounded-xl bg-royal/8 flex items-center justify-center flex-shrink-0 group-hover:bg-royal/15 transition-colors">
                  <s.icon size={22} className="text-royal" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-ink text-base">{s.title}</h3>
                    <span className="text-[10px] px-2 py-0.5 bg-gold/10 text-gold-dark rounded-full font-medium">{s.tag}</span>
                  </div>
                  <p className="text-ink-muted text-sm leading-relaxed">{s.desc}</p>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-24">
        <FadeUp>
          <h2 className="text-2xl font-bold text-ink mb-12 text-center" style={{ fontFamily: 'var(--font-brand)' }}>
            كيف تسير القضية معنا؟
          </h2>
        </FadeUp>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {steps.map((step, i) => (
            <FadeUp key={step.label} delay={i * 0.1}>
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-royal/8 border border-royal/15 flex items-center justify-center">
                    <step.icon size={28} className="text-royal" />
                  </div>
                  <span className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-gold text-white text-xs font-bold flex items-center justify-center" style={{ fontFamily: 'var(--font-mono)' }}>
                    {i + 1}
                  </span>
                </div>
                <p className="text-sm font-medium text-ink leading-snug max-w-[12ch]">{step.label}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-24">
        <FadeUp>
          <div className="rounded-3xl bg-royal p-12 md:p-16 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, #C8A762 0%, transparent 60%)' }} />
            <div className="relative z-[1] max-w-xl">
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 leading-tight" style={{ fontFamily: 'var(--font-brand)' }}>
                ابدأ قضيتك اليوم
              </h2>
              <p className="text-white/70 text-base mb-8 leading-relaxed">
                استشارة أولية مجانية مع محامٍ متخصص — بدون التزام.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/book"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-gold text-royal font-semibold rounded-xl text-sm transition-all duration-300 hover:-translate-y-[2px] hover:bg-gold-light active:scale-[0.98]"
                >
                  احجز استشارة مجانية
                  <ArrowLeft size={18} weight="bold" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 px-7 py-3.5 border border-white/20 text-white rounded-xl text-sm font-medium transition-all hover:bg-white/10"
                >
                  العودة للرئيسية
                </Link>
              </div>
            </div>
          </div>
        </FadeUp>
      </section>
    </main>
  );
}