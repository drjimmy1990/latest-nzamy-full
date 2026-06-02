'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  PenNib,
  Camera,
  Tag,
  FileText,
  ArrowLeft,
  Sparkle,
  ShieldCheck,
  Star,
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

const services = [
  {
    icon: Tag,
    title: 'حقوق النشر والملكية',
    desc: 'حماية قانونية لمحتواك الأصلي — نصوص، فيديوهات، موسيقى، تصاميم',
    tag: 'أساسية',
  },
  {
    icon: FileText,
    title: 'عقود التعاون والرعايات',
    desc: 'مراجعة وصياغة عقود Collab & Brand Deal بشروط عادلة وواضحة',
    tag: 'الأكثر طلباً',
  },
  {
    icon: ShieldCheck,
    title: 'مواجهة السرقة الأدبية',
    desc: 'ملاحقة من يسرق محتواك — إشعارات DMCA وإجراءات قانونية',
    tag: 'عاجل',
  },
  {
    icon: Camera,
    title: 'عقود وكالة المواهب',
    desc: 'مراجعة عقود الوكلاء والمديرين لحمايتك من الشروط المجحفة',
    tag: 'تفاصيل دقيقة',
  },
  {
    icon: PenNib,
    title: 'النزاعات مع المنصات',
    desc: 'إعادة الحسابات المعلّقة + الاعتراض على قرارات YouTube/TikTok/Instagram',
    tag: 'ضروري',
  },
  {
    icon: Sparkle,
    title: 'توثيق الهوية التجارية',
    desc: 'تسجيل الاسم التجاري والعلامة لحماية براند صانع المحتوى',
    tag: 'براند',
  },
];

const creators = [
  { name: 'يوتيوبرز ومدونو الفيديو' },
  { name: 'منشئو المحتوى الرقمي (TikTok / Reel)' },
  { name: 'مدوّنو البودكاست' },
  { name: 'المصوّرون والمصمّمون' },
  { name: 'كتّاب المحتوى والمدوّنون' },
];

export default function CreatorsServicePage() {
  return (
    <main className="min-h-[100dvh] bg-surface pt-24 pb-20" dir="rtl" lang="ar">

      {/* ── Hero ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 grid grid-cols-1 lg:grid-cols-[55%_45%] gap-12 items-start min-h-[55vh] pt-10">
        <div className="space-y-7">
          <FadeUp>
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-gold px-3 py-1 rounded-full border border-gold/30 bg-gold/5">
              صنّاع المحتوى والمبدعون
            </span>
          </FadeUp>
          <FadeUp delay={0.07}>
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-tight leading-[1.1] text-ink" style={{ fontFamily: 'var(--font-brand)' }}>
              محتواك ملكك.
              <br />
              <span className="text-royal">احمه بشكل صحيح.</span>
            </h1>
          </FadeUp>
          <FadeUp delay={0.12}>
            <p className="text-ink-muted text-lg leading-relaxed max-w-[50ch]">
              من عقود الماركات حتى إعادة الحساب المحذوف — حماية قانونية مخصصة لمنشئي المحتوى السعوديين.
            </p>
          </FadeUp>
          <FadeUp delay={0.17}>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-6 py-3 bg-royal text-white rounded-xl text-sm font-semibold transition-all hover:-translate-y-[2px] hover:bg-royal-light active:scale-[0.98]"
              >
                احمِ محتواي
                <ArrowLeft size={18} weight="bold" />
              </Link>
              <Link
                href="/ai/draft"
                className="inline-flex items-center gap-2 px-6 py-3 border border-slate-200 text-ink rounded-xl text-sm font-semibold transition-all hover:border-royal/30 hover:bg-royal/5 active:scale-[0.98]"
              >
                صيّغ عقد تعاون بـ AI
              </Link>
            </div>
          </FadeUp>
        </div>

        <FadeUp delay={0.2}>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-widest mb-4">من يحتاج هذه الخدمة؟</p>
            {creators.map((c, i) => (
              <motion.div
                key={c.name}
                className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-white hover:border-gold/30 hover:bg-gold/3 transition-colors cursor-default"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.07, duration: 0.4, ease: 'easeOut' }}
              >
                <Star size={16} className="text-gold flex-shrink-0" weight="fill" />
                <span className="text-sm text-ink">{c.name}</span>
              </motion.div>
            ))}
          </div>
        </FadeUp>
      </section>

      {/* ── Services ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-24">
        <FadeUp>
          <h2 className="text-2xl font-bold text-ink mb-10" style={{ fontFamily: 'var(--font-brand)' }}>
            خدماتنا لصانع المحتوى
          </h2>
        </FadeUp>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((s, i) => (
            <FadeUp key={s.title} delay={i * 0.07}>
              <div className="group p-7 rounded-2xl border border-slate-200/80 bg-white hover:border-royal/25 hover:shadow-[0_8px_28px_-8px_rgba(11,61,46,0.1)] transition-all duration-300 h-full flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-royal/8 flex items-center justify-center group-hover:bg-royal/15 transition-colors">
                    <s.icon size={20} className="text-royal" />
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-gold/10 text-gold-dark rounded-full font-medium">{s.tag}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-ink text-sm mb-1.5">{s.title}</h3>
                  <p className="text-ink-muted text-xs leading-relaxed">{s.desc}</p>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-20">
        <FadeUp>
          <div className="rounded-3xl bg-royal p-12 md:p-16 relative overflow-hidden">
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 85% 50%, #C8A762, transparent 55%)' }} />
            <div className="relative z-[1] max-w-xl">
              <h2 className="text-3xl font-bold text-white mb-3" style={{ fontFamily: 'var(--font-brand)' }}>
                محتواك يستحق حمايته
              </h2>
              <p className="text-white/70 text-sm mb-8 leading-relaxed">
                استشارة قانونية مجانية مع محامٍ متخصص في حقوق المبدعين والملكية الفكرية.
              </p>
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-gold text-royal font-semibold rounded-xl text-sm transition-all hover:-translate-y-[2px] hover:bg-gold-light active:scale-[0.98]"
              >
                احجز استشارة مجانية
                <ArrowLeft size={18} weight="bold" />
              </Link>
            </div>
          </div>
        </FadeUp>
      </section>

    </main>
  );
}
