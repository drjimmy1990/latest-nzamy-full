'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import Link from 'next/link';
import {
  Buildings,
  FileText,
  HandCoins,
  ShieldCheck,
  UsersThree,
  ArrowLeft,
  CalendarCheck,
  TrendUp,
  Gavel,
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

const solutions = [
  {
    icon: FileText,
    title: 'مراجعة عقود الموردين',
    desc: 'تحليل بنود العقد وتحديد مواقع الخطر قبل التوقيع',
    badge: 'فوري',
  },
  {
    icon: UsersThree,
    title: 'نزاعات الشركاء',
    desc: 'تسوية نزاعات الملكية والأرباح ومشكلات الحوكمة',
    badge: 'عالية الأولوية',
  },
  {
    icon: HandCoins,
    title: 'الاستحواذ والاندماج',
    desc: 'Due Diligence قانوني كامل + توثيق الصفقات',
    badge: 'M&A',
  },
  {
    icon: ShieldCheck,
    title: 'حماية الملكية الفكرية',
    desc: 'تسجيل العلامات التجارية + حقوق الاختراع + حقوق النشر',
    badge: 'IP',
  },
  {
    icon: TrendUp,
    title: 'الامتثال التنظيمي',
    desc: 'متوافق مع هيئة السوق المالية (CMA) وهيئة الزكاة والضريبة (ZATCA)',
    badge: 'إلزامي',
  },
  {
    icon: Gavel,
    title: 'التقاضي التجاري',
    desc: 'تمثيل احترافي أمام المحاكم التجارية ومحاكم الاستئناف',
    badge: 'قضائي',
  },
];

const plans = [
  {
    name: 'الأساسية',
    price: '٢,٤٩٩',
    period: 'شهرياً',
    perks: [
      'مراجعة ٣ عقود شهرياً',
      'استشارة قانونية شهرية',
      'تنبيهات الامتثال التلقائية',
    ],
    cta: 'ابدأ',
    highlight: false,
  },
  {
    name: 'المؤسسية',
    price: '٥,٩٩٩',
    period: 'شهرياً',
    perks: [
      'عقود غير محدودة',
      'مستشار قانوني مخصص',
      'داشبورد الامتثال المتكامل',
      'تقارير مخاطر شهرية',
    ],
    cta: 'اختر المؤسسية',
    highlight: true,
  },
];

export default function CorporateServicePage() {
  return (
    <main className="min-h-[100dvh] bg-surface pt-24 pb-20" dir="rtl" lang="ar">

      {/* ── Hero ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 grid grid-cols-1 lg:grid-cols-[60%_40%] gap-12 items-center min-h-[56vh]">
        <div className="space-y-7">
          <FadeUp>
            <span className="inline-flex items-center gap-2 text-xs font-semibold tracking-widest uppercase text-gold px-3 py-1 rounded-full border border-gold/30 bg-gold/5">
              خدمات الشركات B2B
            </span>
          </FadeUp>
          <FadeUp delay={0.07}>
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-bold tracking-tight leading-[1.1] text-ink" style={{ fontFamily: 'var(--font-brand)' }}>
              حماية قانونية
              <br />
              <span className="text-royal">تتناسب مع حجم مؤسستك.</span>
            </h1>
          </FadeUp>
          <FadeUp delay={0.12}>
            <p className="text-ink-muted text-lg leading-relaxed max-w-[50ch]">
              من العقود والعمالة حتى الامتثال التنظيمي — تغطية قانونية مؤسسية شاملة دون تكلفة توظيف مستشار штатного.
            </p>
          </FadeUp>
          <FadeUp delay={0.18}>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/book"
                className="inline-flex items-center gap-2 px-6 py-3 bg-royal text-white rounded-xl text-sm font-semibold transition-all hover:-translate-y-[2px] hover:bg-royal-light active:scale-[0.98]"
              >
                طلب عرض مخصص
                <CalendarCheck size={18} weight="bold" />
              </Link>
            </div>
          </FadeUp>
        </div>

        <FadeUp delay={0.2}>
          <div className="p-8 rounded-3xl border border-slate-200 bg-white shadow-[0_20px_60px_-15px_rgba(11,61,46,0.08)]">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-royal/10 flex items-center justify-center">
                <Buildings size={22} className="text-royal" />
              </div>
              <h3 className="font-semibold text-ink">تقييم مؤسستك</h3>
            </div>
            <div className="space-y-3">
              {['الامتثال للأنظمة', 'مخاطر العقود', 'حقوق الملكية الفكرية'].map((item, i) => (
                <div key={item} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                  <span className="text-sm text-ink-muted">{item}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-royal"
                        initial={{ width: 0 }}
                        animate={{ width: `${[78, 45, 91][i]}%` }}
                        transition={{ delay: 0.8 + i * 0.2, duration: 0.8, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-xs font-mono text-royal font-semibold">{[78, 45, 91][i]}٪</span>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/ai/corp/compliance"
              className="mt-6 flex items-center justify-center gap-2 w-full py-3 bg-royal/8 text-royal text-sm font-semibold rounded-xl hover:bg-royal/15 transition-colors"
            >
              اعمل تقييماً كاملاً
            </Link>
          </div>
        </FadeUp>
      </section>

      {/* ── Solutions ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-24">
        <FadeUp>
          <h2 className="text-2xl font-bold text-ink mb-10" style={{ fontFamily: 'var(--font-brand)' }}>
            ما الذي نتولاه لشركتك؟
          </h2>
        </FadeUp>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {solutions.map((s, i) => (
            <FadeUp key={s.title} delay={i * 0.07}>
              <div className="group p-7 rounded-2xl border border-slate-200/80 bg-white hover:border-royal/25 hover:shadow-[0_8px_32px_-8px_rgba(11,61,46,0.12)] transition-all duration-300">
                <div className="flex items-start justify-between mb-5">
                  <div className="w-10 h-10 rounded-xl bg-royal/8 flex items-center justify-center group-hover:bg-royal/15 transition-colors">
                    <s.icon size={20} className="text-royal" />
                  </div>
                  <span className="text-[10px] px-2 py-0.5 bg-gold/10 text-gold-dark rounded-full font-medium">{s.badge}</span>
                </div>
                <h3 className="font-semibold text-ink text-sm mb-2">{s.title}</h3>
                <p className="text-ink-muted text-xs leading-relaxed">{s.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── Plans ── */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-24">
        <FadeUp>
          <h2 className="text-2xl font-bold text-ink mb-10" style={{ fontFamily: 'var(--font-brand)' }}>
            باقات مؤسسية واضحة
          </h2>
        </FadeUp>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl">
          {plans.map((p, i) => (
            <FadeUp key={p.name} delay={i * 0.1}>
              <div className={`p-8 rounded-2xl flex flex-col gap-6 ${p.highlight ? 'bg-royal text-white' : 'bg-white border border-slate-200'}`}>
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wider mb-2 ${p.highlight ? 'text-gold' : 'text-ink-muted'}`}>{p.name}</p>
                  <div className="flex items-baseline gap-1">
                    <span className={`text-4xl font-bold tracking-tight ${p.highlight ? 'text-white' : 'text-ink'}`} style={{ fontFamily: 'var(--font-mono)' }}>{p.price}</span>
                    <span className={`text-sm ${p.highlight ? 'text-white/60' : 'text-ink-muted'}`}>ر.س / {p.period}</span>
                  </div>
                </div>
                <ul className="space-y-2.5">
                  {p.perks.map((perk) => (
                    <li key={perk} className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${p.highlight ? 'bg-gold/20' : 'bg-royal/10'}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${p.highlight ? 'bg-gold' : 'bg-royal'}`} />
                      </div>
                      <span className={`text-sm ${p.highlight ? 'text-white/80' : 'text-ink-muted'}`}>{perk}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/book"
                  className={`mt-auto inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] ${p.highlight ? 'bg-gold text-royal hover:bg-gold-light' : 'bg-royal text-white hover:bg-royal-light'}`}
                >
                  {p.cta}
                  <ArrowLeft size={16} weight="bold" />
                </Link>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

    </main>
  );
}